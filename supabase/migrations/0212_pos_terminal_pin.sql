-- POS sign-in by terminal PIN. Each pos_terminals row gets its own cashier account (profile_id); the PIN is
-- checked by the pos-pin edge function (service role), which counts wrong tries per terminal here:
-- 5 wrong -> locked 15 minutes. The old per-cashier PIN (cashier_pins, unlock, 1-hour proof) is gone:
-- cash top-up and void rely on the signed-in terminal account alone.
-- Rollback: restore pos_topup_cash from 0152 and card_void_topup from 0131, recreate cashier_pins from 0107/0125.

alter table pos_terminals add column profile_id uuid unique references profiles on delete set null;

create table pos_terminal_pin_attempts (
  terminal_id     uuid primary key references pos_terminals on delete cascade,
  failed_attempts int not null default 0,
  locked_until    timestamptz
);
alter table pos_terminal_pin_attempts enable row level security;
revoke all on pos_terminal_pin_attempts from anon, authenticated;

-- Turning a terminal off also suspends its account (profiles.is_active), so a live session is signed out.
create or replace function _pos_terminal_sync_active() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null then
    update profiles set is_active = new.active where id = new.profile_id;
  end if;
  return new;
end $$;
create trigger pos_terminals_sync_active after update of active on pos_terminals
  for each row when (old.active is distinct from new.active) execute function _pos_terminal_sync_active();

-- service_role only (edge function). 'ok' | 'locked'; locks the row so concurrent tries can't skip the counter.
create or replace function pos_pin_gate(p_terminal uuid) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare r pos_terminal_pin_attempts;
begin
  insert into pos_terminal_pin_attempts (terminal_id) values (p_terminal) on conflict do nothing;
  select * into r from pos_terminal_pin_attempts where terminal_id = p_terminal for update;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', r.locked_until);
  end if;
  return jsonb_build_object('status', 'ok');
end $$;

-- Call after the PIN check, inside the same flow as pos_pin_gate. A wrong PIN is returned, not raised.
create or replace function pos_pin_result(p_terminal uuid, p_ok boolean) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_ok then
    update pos_terminal_pin_attempts set failed_attempts = 0, locked_until = null where terminal_id = p_terminal;
    return jsonb_build_object('status', 'ok');
  end if;
  update pos_terminal_pin_attempts set failed_attempts = failed_attempts + 1 where terminal_id = p_terminal
    returning failed_attempts into n;
  if n >= 5 then
    update pos_terminal_pin_attempts set failed_attempts = 0, locked_until = now() + interval '15 minutes'
      where terminal_id = p_terminal;
    return jsonb_build_object('status', 'locked', 'locked_until', now() + interval '15 minutes');
  end if;
  return jsonb_build_object('status', 'bad', 'attempts_left', 5 - n);
end $$;
revoke execute on function pos_pin_gate(uuid), pos_pin_result(uuid, boolean) from public, anon, authenticated;
grant execute on function pos_pin_gate(uuid), pos_pin_result(uuid, boolean) to service_role;

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

create or replace function card_void_topup(p_tx_id uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  tx card_transactions;
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'ต้องระบุเหตุผลที่ยกเลิก'; end if;
  select * into tx from card_transactions where id = p_tx_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if tx.type not in ('topup_cash', 'topup_slip') then raise exception 'ยกเลิกได้เฉพาะรายการเติมเงิน'; end if;
  if tx.voided_at is not null then raise exception 'รายการนี้ถูกยกเลิกแล้ว'; end if;
  perform _wallet_lock(tx.student_id);
  update card_transactions set voided_at = now(), void_reason = btrim(p_reason), voided_by = auth.uid() where id = tx.id;
  update card_slip_requests set status = 'voided' where tx_id = tx.id and status = 'approved';
  return jsonb_build_object('ok', true, 'balance', _wallet_balance(tx.student_id));
end $$;

revoke execute on function pos_topup_cash(text, uuid, numeric, uuid, uuid), card_void_topup(uuid, text) from public, anon;
grant execute on function pos_topup_cash(text, uuid, numeric, uuid, uuid), card_void_topup(uuid, text) to authenticated;

drop function cashier_pin_unlock(text), cashier_pin_lock(), cashier_pin_status(), cashier_pin_set(text), cashier_pin_reset(uuid), _pin_verify(text);
drop table cashier_pins;
