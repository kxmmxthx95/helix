-- Top-up history (cash + slip) of one student for the POS "ดูประวัติเติมเงิน" popup. Cashiers cannot
-- read card_transactions directly (RLS), so this mirrors pos_student_recent but top-ups only and deeper.
create or replace function pos_student_topups(p_student_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'type', t.type, 'amount', t.amount, 'created_at', t.created_at, 'voided_at', t.voided_at
    ) order by t.created_at desc)
    from (select * from card_transactions
          where student_id = p_student_id and type in ('topup_cash', 'topup_slip')
          order by created_at desc limit 100) t
  ), '[]'::jsonb);
end $$;

revoke execute on function pos_student_topups(uuid) from public, anon;
grant execute on function pos_student_topups(uuid) to authenticated;
