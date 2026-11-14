-- บัตรเติมเงิน: หลายช่องทางต่อคน (QR ที่ระบบสร้าง / บาร์โค้ดบัตร / RFID), ผูก-ยกเลิก-ล็อกรายใบ.
--
-- * student_cards.kind: 'qr' (token ที่ระบบสร้าง) | 'barcode' | 'rfid'. Live ได้ 1 ใบต่อ (นักเรียน, ชนิด).
-- * "ล็อกโดยโรงเรียน" = status 'frozen' + frozen_by 'school' (0110) — ผู้ปกครองปลดเองไม่ได้. ไม่เพิ่มสถานะใหม่.
--   trigger เดิมตั้ง 'school' จาก is_org_wide(); ขยายเป็น _can_issue_qr เพื่อให้ผู้บริหารแผนกนับเป็นฝั่งโรงเรียนด้วย.
-- * ประวัติ: audit_logs (trigger log_audit บน student_cards) มีผู้ทำ/เวลา/สถานะเก่า-ใหม่อยู่แล้ว →
--   card_history() อ่านจากที่นั่น ไม่สร้างตารางใหม่. (การอายัดโดยผู้ปกครองไม่ถูก log_audit บันทึก — ตั้งใจเดิมของ 0001.)
-- * ที่ค้นบัตรด้วย student_id ต้องเลือกใบเดียว → _live_card(): ใบ active ก่อน, แล้วที่ผู้ปกครองระงับ, แล้วใหม่สุด.

alter table student_cards add column kind text not null default 'rfid' check (kind in ('qr', 'barcode', 'rfid'));
update student_cards set kind = 'qr' where card_uid like 'qr\_%';
alter table student_cards alter column kind drop default;
drop index student_cards_one_live;
create unique index student_cards_one_live on student_cards (student_id, kind) where status <> 'replaced';

create or replace function _live_card(p_student uuid) returns student_cards
  language sql stable security definer set search_path = public as $$
  select * from student_cards
  where student_id = p_student and status <> 'replaced'
  order by (status = 'active') desc, coalesce(frozen_by = 'parent', false) desc, created_at desc
  limit 1
$$;
revoke execute on function _live_card(uuid) from public, anon, authenticated;

create or replace function set_card_frozen_by() returns trigger
  language plpgsql as $$
begin
  if new.status <> 'frozen' then
    new.frozen_by := null;
  elsif old.status is distinct from 'frozen' then
    new.frozen_by := case when _can_issue_qr(new.student_id) then 'school' else 'parent' end;
  end if;
  return new;
end $$;

-- ------------------------------------------------ issue (system QR) — only touches the 'qr' kind
create or replace function card_issue_qr(p_student_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not _can_issue_qr(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  if not exists (select 1 from students where id = p_student_id) then raise exception 'ไม่พบนักเรียน'; end if;
  perform _wallet_lock(p_student_id);
  update student_cards set status = 'replaced' where student_id = p_student_id and kind = 'qr' and status <> 'replaced';
  insert into student_cards (student_id, card_uid, kind, created_by) values (p_student_id, _new_qr_token(), 'qr', auth.uid());
end $$;

create or replace function card_issue_qr_bulk(p_student_ids uuid[]) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  n integer := 0;
begin
  foreach sid in array p_student_ids loop
    continue when not _can_issue_qr(sid);
    continue when exists (select 1 from student_cards where student_id = sid and kind = 'qr' and status <> 'replaced');
    perform _wallet_lock(sid);
    insert into student_cards (student_id, card_uid, kind, created_by) values (sid, _new_qr_token(), 'qr', auth.uid()) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function card_my_qr(p_student_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  c student_cards;
begin
  if not _can_view_student(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into c from student_cards where student_id = p_student_id and kind = 'qr' and status <> 'replaced';
  if not found then return null; end if;
  return jsonb_build_object('token', c.card_uid, 'status', c.status, 'frozen_by', c.frozen_by);
end $$;

-- Roster column (Roster.tsx) keeps meaning "has a live system barcode".
create or replace function card_live_status() returns table (student_id uuid, status text)
  language sql stable security definer set search_path = public as $$
  select c.student_id, c.status::text
  from student_cards c
  where c.kind = 'qr' and c.status <> 'replaced' and _can_issue_qr(c.student_id)
$$;

-- ------------------------------------------------ bind a physical card (barcode / RFID)
drop function card_bind(uuid, text);
create or replace function card_bind(p_student_id uuid, p_card_uid text, p_kind text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  uid text := btrim(p_card_uid);
  c student_cards;
  nm text;
begin
  if not _can_issue_qr(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_kind is null or p_kind not in ('barcode', 'rfid') then raise exception 'ชนิดบัตรไม่ถูกต้อง'; end if;
  if uid is null or uid = '' or length(uid) > 64 then raise exception 'เลขบัตรไม่ถูกต้อง'; end if;
  if uid like 'qr\_%' then raise exception 'เลขบัตรไม่ถูกต้อง'; end if;
  if not exists (select 1 from students where id = p_student_id) then raise exception 'ไม่พบนักเรียน'; end if;
  perform _wallet_lock(p_student_id);
  select * into c from student_cards where card_uid = uid;
  if found and c.student_id <> p_student_id then
    if _can_issue_qr(c.student_id) then
      select first_name || ' ' || last_name into nm from students where id = c.student_id;
      raise exception 'บัตรนี้ผูกกับ % อยู่แล้ว', nm;
    end if;
    raise exception 'บัตรนี้ผูกกับนักเรียนคนอื่นอยู่แล้ว';
  end if;
  update student_cards set status = 'replaced'
    where student_id = p_student_id and kind = p_kind and status <> 'replaced' and card_uid <> uid;
  if c.id is not null then
    update student_cards set status = 'active', kind = p_kind where id = c.id;
  else
    insert into student_cards (student_id, card_uid, kind, created_by) values (p_student_id, uid, p_kind, auth.uid());
  end if;
end $$;

create or replace function card_revoke(p_card_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
begin
  select * into c from student_cards where id = p_card_id;
  if not found or not _can_issue_qr(c.student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  perform _wallet_lock(c.student_id);
  update student_cards set status = 'replaced' where id = c.id;
end $$;

-- Lock / unlock ONE card as the school (the trigger stamps frozen_by = 'school').
create or replace function card_set_locked(p_card_id uuid, p_locked boolean) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
begin
  select * into c from student_cards where id = p_card_id;
  if not found or not _can_issue_qr(c.student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  if c.status = 'replaced' then raise exception 'บัตรนี้ถูกยกเลิกแล้ว'; end if;
  perform _wallet_lock(c.student_id);
  update student_cards set status = case when p_locked then 'frozen' else 'active' end where id = c.id;
end $$;

-- ------------------------------------------------ parent / wallet-level freeze: every live card
create or replace function card_parent_set_frozen(p_student_id uuid, p_frozen boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not (_is_guardian(p_student_id) or is_org_wide()) then raise exception 'ไม่มีสิทธิ์'; end if;
  if not exists (select 1 from student_cards where student_id = p_student_id and status <> 'replaced') then
    raise exception 'นักเรียนยังไม่มีบัตร';
  end if;
  perform _wallet_lock(p_student_id);
  if p_frozen then
    update student_cards set status = 'frozen' where student_id = p_student_id and status = 'active';
  elsif is_org_wide() then
    update student_cards set status = 'active' where student_id = p_student_id and status = 'frozen';
  else
    update student_cards set status = 'active' where student_id = p_student_id and status = 'frozen' and frozen_by = 'parent';
    if not found and exists (select 1 from student_cards where student_id = p_student_id and status = 'frozen') then
      raise exception 'บัตรนี้ถูกระงับโดยโรงเรียน — ติดต่อฝ่ายการเงินเพื่อปลดระงับ';
    end if;
  end if;
end $$;

-- ------------------------------------------------ read models for the บัตรเติมเงิน page
-- Live cards of the students the caller may manage. Never returns the full card_uid (last 4 only).
create or replace function card_live_cards() returns table (
  id uuid, student_id uuid, kind text, status text, frozen_by text, last4 text, created_at timestamptz
)
  language sql stable security definer set search_path = public as $$
  select c.id, c.student_id, c.kind, c.status::text, c.frozen_by, right(c.card_uid, 4), c.created_at
  from student_cards c
  where c.status <> 'replaced' and _can_issue_qr(c.student_id)
$$;

create or replace function card_history(p_student_id uuid) returns table (
  at timestamptz, actor text, action text, kind text, last4 text
)
  language plpgsql stable security definer set search_path = public as $$
begin
  if not _can_issue_qr(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  return query
  select h.at, h.actor, h.action, h.kind, h.last4 from (
    select a.created_at as at,
      nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as actor,
      case
        when a.action = 'INSERT' then 'bind'
        when n ->> 'status' = 'replaced' and o ->> 'status' is distinct from 'replaced' then 'revoke'
        when n ->> 'status' = 'frozen' and o ->> 'status' is distinct from 'frozen' then 'lock'
        when n ->> 'status' = 'active' and o ->> 'status' = 'frozen' then 'unlock'
        when n ->> 'status' = 'active' and o ->> 'status' = 'replaced' then 'bind'
      end as action,
      coalesce(n ->> 'kind', case when (n ->> 'card_uid') like 'qr\_%' then 'qr' else 'rfid' end) as kind,
      right(n ->> 'card_uid', 4) as last4
    from audit_logs a
    left join profiles p on p.id = a.actor_id
    cross join lateral (select a.changes -> 'new' as n, a.changes -> 'old' as o) j
    where a.table_name = 'student_cards' and a.action in ('INSERT', 'UPDATE')
      and (a.changes -> 'new' ->> 'student_id') = p_student_id::text
  ) h
  where h.action is not null
  order by h.at desc
  limit 100;
end $$;

revoke execute on function card_bind(uuid, text, text), card_revoke(uuid), card_set_locked(uuid, boolean),
  card_live_cards(), card_history(uuid) from public, anon;
grant execute on function card_bind(uuid, text, text), card_revoke(uuid), card_set_locked(uuid, boolean),
  card_live_cards(), card_history(uuid) to authenticated;

-- ------------------------------------------------ callers that assumed one live card per student
create or replace function card_slip_approve(p_request_id uuid, p_amount numeric default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  r card_slip_requests;
  amt numeric;
  tx uuid;
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into r from card_slip_requests where id = p_request_id for update;
  if not found then raise exception 'ไม่พบคำขอ'; end if;
  if r.status <> 'pending' then raise exception 'คำขอนี้ถูกดำเนินการไปแล้ว'; end if;
  amt := coalesce(p_amount, r.amount);
  perform _check_amount(amt, 20, 5000);
  perform _wallet_lock(r.student_id);
  insert into card_transactions (student_id, card_id, type, amount, note, recorded_by)
  values (
    r.student_id,
    (_live_card(r.student_id)).id,
    'topup_slip', amt,
    'สลิปโอน ' || to_char(r.transferred_at at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI'),
    auth.uid()
  ) returning id into tx;
  update card_slip_requests
    set status = 'approved', approved_amount = amt, tx_id = tx, reviewed_by = auth.uid(), reviewed_at = now()
    where id = r.id;
  return jsonb_build_object('ok', true, 'tx_id', tx, 'balance', _wallet_balance(r.student_id));
end $$;

create or replace function card_refund_withdraw(p_student_id uuid, p_amount numeric, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  bal numeric;
  card uuid;
  tx uuid;
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  perform _check_amount(p_amount, 0.01, 1000000);
  perform _wallet_lock(p_student_id);
  bal := _wallet_balance(p_student_id);
  if p_amount > bal then raise exception 'ยอดคงเหลือไม่พอ (เหลือ % บาท)', bal; end if;
  card := (_live_card(p_student_id)).id;
  insert into card_transactions (student_id, card_id, type, amount, note, recorded_by)
  values (p_student_id, card, 'refund_withdraw', -p_amount, nullif(btrim(p_note), ''), auth.uid())
  returning id into tx;
  return jsonb_build_object('ok', true, 'tx_id', tx, 'balance', bal - p_amount);
end $$;

create or replace function pos_lookup(p_card_uid text default null, p_student_id uuid default null) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  c student_cards;
  s students;
  sid uuid;
  room text;
  lim numeric;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  if p_card_uid is not null then
    select * into c from student_cards where card_uid = btrim(p_card_uid);
    if not found then raise exception 'ไม่พบบัตรนี้ในระบบ'; end if;
    if c.status = 'replaced' then raise exception 'บัตรนี้ถูกแทนที่ด้วยบัตรใหม่แล้ว'; end if;
    sid := c.student_id;
  elsif p_student_id is not null then
    sid := p_student_id;
    c := _live_card(sid);
  else
    raise exception 'ต้องระบุบัตร';
  end if;

  select * into s from students where id = sid;
  if not found then raise exception 'ไม่พบนักเรียน'; end if;
  select gl.name || '/' || cr.name into room
    from student_classroom_enrollments e
    join classrooms cr on cr.id = e.classroom_id
    join grade_levels gl on gl.id = cr.grade_level_id
    where e.student_id = sid order by e.created_at desc limit 1;
  if room is null then select name into room from grade_levels where id = s.grade_level_id; end if;
  select daily_limit into lim from student_wallets where student_id = sid;

  return jsonb_build_object(
    'student_id', sid,
    'student_code', s.student_code,
    'name', coalesce(s.prefix, '') || s.first_name || ' ' || s.last_name,
    'avatar_path', s.avatar_path,
    'avatar_updated_at', s.updated_at,
    'classroom', room,
    'balance', _wallet_balance(sid),
    'daily_limit', lim,
    'spent_today', _spent_today(sid),
    'card_status', c.status
  );
end $$;

create or replace function pos_topup_cash(
  p_card_uid text, p_student_id uuid, p_amount numeric, p_terminal_id uuid, p_client_tx_id uuid default null
) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
  sid uuid;
  bal numeric;
  tx uuid;
  prior card_transactions;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  if not exists (select 1 from cashier_pins where profile_id = auth.uid() and unlocked_until > now()) then
    raise exception 'ต้องใส่ PIN เพื่อปลดล็อกการเติมเงินสดก่อน';
  end if;
  perform _check_amount(p_amount, 20, 5000);
  perform _check_terminal(p_terminal_id);

  if p_card_uid is not null then
    select * into c from student_cards where card_uid = btrim(p_card_uid);
    if not found then raise exception 'ไม่พบบัตรนี้ในระบบ'; end if;
    if c.status = 'replaced' then raise exception 'บัตรนี้ถูกแทนที่ด้วยบัตรใหม่แล้ว'; end if;
    sid := c.student_id;
  elsif p_student_id is not null then
    sid := p_student_id;
    c := _live_card(sid);
  else
    raise exception 'ต้องระบุบัตร';
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
  if c.status = 'frozen' then
    raise exception '%', case when c.frozen_by = 'school' then 'บัตรถูกระงับโดยโรงเรียน — ติดต่อฝ่ายการเงิน' else 'บัตรนี้ถูกระงับการใช้งาน' end;
  end if;
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

create or replace function card_portal_summary(p_student_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not _can_view_student(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  return jsonb_build_object(
    'balance', _wallet_balance(p_student_id),
    'daily_limit', (select daily_limit from student_wallets where student_id = p_student_id),
    'spent_today', _spent_today(p_student_id),
    'card_status', (_live_card(p_student_id)).status,
    'card_frozen_by', (_live_card(p_student_id)).frozen_by
  );
end $$;
