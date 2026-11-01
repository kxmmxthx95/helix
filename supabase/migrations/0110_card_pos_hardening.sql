-- Two gaps found reviewing 0107/0108.
--
-- 1. Idempotent sale / cash top-up. If the response to pos_sale is lost after
--    the server committed, a retry charged the student twice. The client now
--    sends a client_tx_id (one uuid per intent, reused on retry); a repeat of
--    the same id by the same cashier returns the original result instead of
--    inserting again. A repeat with a different amount is refused, not guessed.
--
-- 2. Who froze the card. A parent could unfreeze a card the school had frozen
--    (lost / disputed) because both used status = 'frozen'. frozen_by records
--    the side, set by trigger from is_org_wide() so no caller can claim 'school'.
--    A parent may only lift their own freeze; org-wide may lift either.

alter table card_transactions add column client_tx_id uuid;
create unique index card_transactions_client_tx_idx on card_transactions (client_tx_id) where client_tx_id is not null;

drop function pos_sale(text, numeric, uuid);
create or replace function pos_sale(
  p_card_uid text, p_amount numeric, p_terminal_id uuid default null, p_client_tx_id uuid default null
) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
  lim numeric;
  bal numeric;
  tx uuid;
  prior card_transactions;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  perform _check_amount(p_amount, 1, 500);
  perform _check_terminal(p_terminal_id);
  select * into c from student_cards where card_uid = btrim(p_card_uid);
  if not found then raise exception 'ไม่พบบัตรนี้ในระบบ'; end if;
  if c.status = 'frozen' then raise exception 'บัตรนี้ถูกระงับการใช้งาน'; end if;
  if c.status <> 'active' then raise exception 'บัตรนี้ถูกแทนที่ด้วยบัตรใหม่แล้ว'; end if;

  lim := _wallet_lock(c.student_id);
  if p_client_tx_id is not null then
    select * into prior from card_transactions where client_tx_id = p_client_tx_id;
    if found then
      if prior.recorded_by <> auth.uid() or prior.student_id <> c.student_id or prior.type <> 'sale' or -prior.amount <> p_amount then
        raise exception 'รายการนี้ถูกบันทึกไปแล้วด้วยข้อมูลที่ต่างกัน — ตรวจที่ "รายการวันนี้" ก่อนทำซ้ำ';
      end if;
      return jsonb_build_object('ok', true, 'tx_id', prior.id, 'amount', p_amount, 'balance', _wallet_balance(c.student_id), 'replayed', true);
    end if;
  end if;

  bal := _wallet_balance(c.student_id);
  if bal < p_amount then raise exception 'ยอดคงเหลือไม่พอ (เหลือ % บาท)', bal; end if;
  if lim is not null and _spent_today(c.student_id) + p_amount > lim then
    raise exception 'เกินวงเงินใช้จ่ายต่อวัน (% บาท)', lim;
  end if;

  insert into card_transactions (student_id, card_id, type, amount, terminal_id, recorded_by, client_tx_id)
  values (c.student_id, c.id, 'sale', -p_amount, p_terminal_id, auth.uid(), p_client_tx_id)
  returning id into tx;
  return jsonb_build_object('ok', true, 'tx_id', tx, 'amount', p_amount, 'balance', bal - p_amount);
end $$;

drop function pos_topup_cash(text, uuid, numeric, uuid, text);
create or replace function pos_topup_cash(
  p_card_uid text, p_student_id uuid, p_amount numeric, p_terminal_id uuid, p_pin text, p_client_tx_id uuid default null
) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
  sid uuid;
  pin jsonb;
  bal numeric;
  tx uuid;
  prior card_transactions;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  perform _check_amount(p_amount, 20, 5000);
  perform _check_terminal(p_terminal_id);
  if p_pin is null or p_pin !~ '^\d{6}$' then raise exception 'PIN ต้องเป็นตัวเลข 6 หลัก'; end if;

  if p_card_uid is not null then
    select * into c from student_cards where card_uid = btrim(p_card_uid);
    if not found then raise exception 'ไม่พบบัตรนี้ในระบบ'; end if;
    if c.status = 'replaced' then raise exception 'บัตรนี้ถูกแทนที่ด้วยบัตรใหม่แล้ว'; end if;
    sid := c.student_id;
  elsif p_student_id is not null and is_org_wide() then
    sid := p_student_id;
    select * into c from student_cards where student_id = sid and status <> 'replaced';
  else
    raise exception 'ต้องระบุบัตร';
  end if;

  pin := _pin_verify(p_pin);
  if pin ->> 'status' <> 'ok' then
    return pin || jsonb_build_object('ok', false);
  end if;

  perform _wallet_lock(sid);
  if p_client_tx_id is not null then
    select * into prior from card_transactions where client_tx_id = p_client_tx_id;
    if found then
      if prior.recorded_by <> auth.uid() or prior.student_id <> sid or prior.type <> 'topup_cash' or prior.amount <> p_amount then
        raise exception 'รายการนี้ถูกบันทึกไปแล้วด้วยข้อมูลที่ต่างกัน — ตรวจที่ "รายการวันนี้" ก่อนทำซ้ำ';
      end if;
      return jsonb_build_object('ok', true, 'tx_id', prior.id, 'amount', p_amount, 'balance', _wallet_balance(sid), 'replayed', true);
    end if;
  end if;

  insert into card_transactions (student_id, card_id, type, amount, terminal_id, recorded_by, client_tx_id)
  values (sid, c.id, 'topup_cash', p_amount, p_terminal_id, auth.uid(), p_client_tx_id)
  returning id into tx;
  bal := _wallet_balance(sid);
  return jsonb_build_object('ok', true, 'tx_id', tx, 'amount', p_amount, 'balance', bal);
end $$;

revoke execute on function pos_sale(text, numeric, uuid, uuid), pos_topup_cash(text, uuid, numeric, uuid, text, uuid) from public, anon;
grant execute on function pos_sale(text, numeric, uuid, uuid), pos_topup_cash(text, uuid, numeric, uuid, text, uuid) to authenticated;

-- ------------------------------------------------------------ freeze owner
alter table student_cards add column frozen_by text check (frozen_by in ('parent', 'school'));
-- Any card already frozen before this migration was frozen by the school (only org-wide could reach it before 0108 shipped).
update student_cards set frozen_by = 'school' where status = 'frozen';

create or replace function set_card_frozen_by() returns trigger
  language plpgsql as $$
begin
  if new.status <> 'frozen' then
    new.frozen_by := null;
  elsif old.status is distinct from 'frozen' then
    new.frozen_by := case when is_org_wide() then 'school' else 'parent' end;
  end if;
  return new;
end $$;
create trigger student_cards_frozen_by before update on student_cards
  for each row execute function set_card_frozen_by();

create or replace function card_parent_set_frozen(p_student_id uuid, p_frozen boolean) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
begin
  if not (_is_guardian(p_student_id) or is_org_wide()) then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into c from student_cards where student_id = p_student_id and status <> 'replaced' for update;
  if not found then raise exception 'นักเรียนยังไม่มีบัตร'; end if;
  if not p_frozen and c.frozen_by = 'school' and not is_org_wide() then
    raise exception 'บัตรนี้ถูกระงับโดยโรงเรียน — ติดต่อฝ่ายการเงินเพื่อปลดระงับ';
  end if;
  update student_cards set status = case when p_frozen then 'frozen' else 'active' end where id = c.id;
end $$;

create or replace function card_portal_summary(p_student_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not _can_view_student(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  return jsonb_build_object(
    'balance', _wallet_balance(p_student_id),
    'daily_limit', (select daily_limit from student_wallets where student_id = p_student_id),
    'spent_today', _spent_today(p_student_id),
    'card_status', (select status from student_cards where student_id = p_student_id and status <> 'replaced'),
    'card_frozen_by', (select frozen_by from student_cards where student_id = p_student_id and status <> 'replaced')
  );
end $$;
