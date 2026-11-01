-- บัตรเติมเงิน PR 3 — รายงาน. One org-wide RPC aggregates the ledger server-side,
-- because a client-side sum over card_transactions would silently truncate at
-- PostgREST's row cap on a busy week. Days are Asia/Bangkok, [p_from, p_to] inclusive.
-- Voided rows never count toward a total; they are listed separately so a manager
-- can see who voided what. Slip top-ups have no terminal and are recorded by the
-- approving staff member, so they appear under "no terminal" and in the totals.

create or replace function card_report(p_from date, p_to date) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  t0 timestamptz;
  t1 timestamptz;
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'ช่วงวันที่ไม่ถูกต้อง';
  end if;
  t0 := p_from::timestamp at time zone 'Asia/Bangkok';
  t1 := (p_to + 1)::timestamp at time zone 'Asia/Bangkok';

  return (
    with tx as (
      select t.*, pt.name as terminal_name,
             btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as cashier_name
      from card_transactions t
      left join pos_terminals pt on pt.id = t.terminal_id
      left join profiles p on p.id = t.recorded_by
      where t.created_at >= t0 and t.created_at < t1
    ), live as (select * from tx where voided_at is null)
    select jsonb_build_object(
      'totals', (
        select jsonb_build_object(
          'sales_count', count(*) filter (where type = 'sale'),
          'sales_total', coalesce(-sum(amount) filter (where type = 'sale'), 0),
          'cash_topup_total', coalesce(sum(amount) filter (where type = 'topup_cash'), 0),
          'slip_topup_total', coalesce(sum(amount) filter (where type = 'topup_slip'), 0),
          'refund_total', coalesce(-sum(amount) filter (where type = 'refund_withdraw'), 0)
        ) from live
      ),
      'by_terminal', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.name nulls last) from (
          select terminal_id, max(terminal_name) as name,
                 count(*) filter (where type = 'sale') as sales_count,
                 coalesce(-sum(amount) filter (where type = 'sale'), 0) as sales_total,
                 coalesce(sum(amount) filter (where type = 'topup_cash'), 0) as cash_topup_total,
                 coalesce(sum(amount) filter (where type = 'topup_slip'), 0) as slip_topup_total
          from live group by terminal_id
        ) r
      ), '[]'::jsonb),
      'by_cashier', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.name) from (
          select recorded_by as profile_id, max(cashier_name) as name,
                 count(*) filter (where type = 'sale') as sales_count,
                 coalesce(-sum(amount) filter (where type = 'sale'), 0) as sales_total,
                 coalesce(sum(amount) filter (where type = 'topup_cash'), 0) as cash_topup_total
          from live group by recorded_by
        ) r
      ), '[]'::jsonb),
      'voids', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id, 'type', v.type, 'amount', v.amount, 'created_at', v.created_at,
          'voided_at', v.voided_at, 'void_reason', v.void_reason, 'cashier', v.cashier_name,
          'student_name', coalesce(s.prefix, '') || s.first_name || ' ' || s.last_name
        ) order by v.voided_at desc)
        from tx v join students s on s.id = v.student_id where v.voided_at is not null
      ), '[]'::jsonb)
    )
  );
end $$;

revoke execute on function card_report(date, date) from public, anon;
grant execute on function card_report(date, date) to authenticated;
