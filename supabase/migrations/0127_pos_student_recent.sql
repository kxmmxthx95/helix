-- Last 10 transactions of one student, for the POS student card. Cashiers cannot read card_transactions
-- (RLS: org-wide only), so this security-definer RPC is the only door — and it returns just time / type /
-- amount / voided flag, never who recorded it or which terminal.
create or replace function pos_student_recent(p_student_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'type', t.type, 'amount', t.amount, 'created_at', t.created_at, 'voided_at', t.voided_at
    ) order by t.created_at desc)
    from (select * from card_transactions where student_id = p_student_id order by created_at desc limit 10) t
  ), '[]'::jsonb);
end $$;

revoke execute on function pos_student_recent(uuid) from public, anon;
grant execute on function pos_student_recent(uuid) to authenticated;
