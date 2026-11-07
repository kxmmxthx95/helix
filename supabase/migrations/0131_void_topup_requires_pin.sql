-- Voiding a past top-up needs the cashier PIN, same server-side proof as cash top-up (0125): cashier_pin_unlock
-- once, valid for an hour, 5 wrong tries -> 15 min lock. Org-wide users set their own PIN the same way.
-- Rollback: restore card_void_topup from 0130.

create or replace function card_void_topup(p_tx_id uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  tx card_transactions;
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  if not exists (select 1 from cashier_pins where profile_id = auth.uid() and unlocked_until > now()) then
    raise exception 'ต้องใส่ PIN เพื่อปลดล็อกก่อนยกเลิกรายการ';
  end if;
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
