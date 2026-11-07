-- Cash top-up: the cashier enters their PIN once and the top-up screen stays unlocked for one hour
-- (fixed, counted from the correct PIN — not extended by use). The proof lives on the server:
-- cashier_pins.unlocked_until. pos_topup_cash no longer takes a PIN; it refuses unless the caller is unlocked,
-- so a client can neither skip the check nor need to hold the PIN in memory for an hour.
-- The 5-wrong-tries -> 15-minute lock still applies, now to cashier_pin_unlock (via _pin_verify).

alter table cashier_pins add column unlocked_until timestamptz;

create or replace function cashier_pin_unlock(p_pin text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  pin jsonb;
  until_ timestamptz;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  if p_pin is null or p_pin !~ '^\d{6}$' then raise exception 'PIN ต้องเป็นตัวเลข 6 หลัก'; end if;
  -- A wrong PIN is returned, not raised: raising would roll back the failed-attempt counter.
  pin := _pin_verify(p_pin);
  if pin ->> 'status' <> 'ok' then return pin || jsonb_build_object('ok', false); end if;
  until_ := now() + interval '1 hour';
  update cashier_pins set unlocked_until = until_ where profile_id = auth.uid();
  return jsonb_build_object('ok', true, 'unlocked_until', until_);
end $$;

create or replace function cashier_pin_lock() returns void
  language sql security definer set search_path = public as $$
  update cashier_pins set unlocked_until = null where profile_id = auth.uid()
$$;

create or replace function cashier_pin_status() returns jsonb
  language sql stable security definer set search_path = public as $$
  select case when can_pos() then jsonb_build_object(
    'has_pin', exists (select 1 from cashier_pins where profile_id = auth.uid()),
    'locked_until', (select locked_until from cashier_pins where profile_id = auth.uid() and locked_until > now()),
    'unlocked_until', (select unlocked_until from cashier_pins where profile_id = auth.uid() and unlocked_until > now())
  ) end
$$;

drop function pos_topup_cash(text, uuid, numeric, uuid, text, uuid);
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
    select * into c from student_cards where student_id = sid and status <> 'replaced';
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

revoke execute on function cashier_pin_unlock(text), cashier_pin_lock(), pos_topup_cash(text, uuid, numeric, uuid, uuid) from public, anon;
grant execute on function cashier_pin_unlock(text), cashier_pin_lock(), pos_topup_cash(text, uuid, numeric, uuid, uuid) to authenticated;
