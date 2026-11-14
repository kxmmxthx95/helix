-- Sales history (one row per sale, with its product lines) for the POS "ประวัติการขาย" tab. Org-wide only.
create or replace function card_sales_list(p_from date, p_to date, p_q text default null) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  t0 timestamptz;
  t1 timestamptz;
  q text := nullif(btrim(p_q), '');
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'ช่วงวันที่ไม่ถูกต้อง';
  end if;
  t0 := p_from::timestamp at time zone 'Asia/Bangkok';
  t1 := (p_to + 1)::timestamp at time zone 'Asia/Bangkok';
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
      select t.id, -t.amount as amount, t.created_at, s.student_code,
             coalesce(s.prefix, '') || s.first_name || ' ' || s.last_name as student_name,
             btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as cashier,
             pt.name as terminal,
             t.voided_at,
             coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'price', i.price) order by i.created_at, i.name)
                       from card_sale_items i where i.tx_id = t.id), '[]'::jsonb) as items
      from card_transactions t
      join students s on s.id = t.student_id
      left join profiles p on p.id = t.recorded_by
      left join pos_terminals pt on pt.id = t.terminal_id
      where t.type = 'sale' and t.created_at >= t0 and t.created_at < t1
        and (q is null or s.student_code = q or (s.first_name || ' ' || s.last_name) ilike '%' || q || '%')
      order by t.created_at desc limit 300
    ) r
  ), '[]'::jsonb);
end $$;

revoke execute on function card_sales_list(date, date, text) from public, anon;
grant execute on function card_sales_list(date, date, text) to authenticated;
