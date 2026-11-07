-- ยกเลิกการเติมเงินย้อนหลัง (org-wide). Adds who voided (voided_by), a 'voided' slip status, an org-wide-only
-- void for top-ups of any age that may leave the balance negative (a negative student cannot buy until topped up),
-- and a list RPC for the new POS tab. pos_void (cashiers: own sale/cash top-up, today, balance must cover it)
-- keeps its rules but now also records voided_by and syncs the slip. Voided slips cannot be re-approved.
-- Rollback: drop the two new functions, restore pos_void/card_report from 0107/0109, drop voided_by, restore
-- the slip constraints (only safe while no slip is 'voided').

alter table card_transactions add column voided_by uuid references profiles on delete set null;

alter table card_slip_requests
  drop constraint card_slip_requests_status_check,
  drop constraint card_slip_requests_check;
alter table card_slip_requests
  add constraint card_slip_requests_status_check check (status in ('pending', 'approved', 'rejected', 'voided')),
  add constraint card_slip_requests_check check ((status in ('approved', 'voided')) = (tx_id is not null));

create or replace function pos_void(p_tx_id uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  tx card_transactions;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'ต้องระบุเหตุผลที่ยกเลิก'; end if;
  select * into tx from card_transactions where id = p_tx_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if not is_org_wide()
    and (tx.recorded_by <> auth.uid() or tx.type not in ('sale', 'topup_cash') or tx.created_at < _bkk_day_start()) then
    raise exception 'ยกเลิกได้เฉพาะรายการขาย/เติมเงินสดของตนเองในวันนี้';
  end if;
  if tx.voided_at is not null then raise exception 'รายการนี้ถูกยกเลิกแล้ว'; end if;

  perform _wallet_lock(tx.student_id);
  if tx.amount > 0 and _wallet_balance(tx.student_id) < tx.amount then
    raise exception 'ยกเลิกไม่ได้ เพราะยอดคงเหลือไม่พอ (เงินที่เติมถูกใช้ไปแล้ว)';
  end if;
  update card_transactions set voided_at = now(), void_reason = btrim(p_reason), voided_by = auth.uid() where id = tx.id;
  update card_slip_requests set status = 'voided' where tx_id = tx.id and status = 'approved';
  return jsonb_build_object('ok', true, 'balance', _wallet_balance(tx.student_id));
end $$;

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
             btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as cashier_name,
             btrim(coalesce(vp.first_name, '') || ' ' || coalesce(vp.last_name, '')) as voider_name
      from card_transactions t
      left join pos_terminals pt on pt.id = t.terminal_id
      left join profiles p on p.id = t.recorded_by
      left join profiles vp on vp.id = t.voided_by
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
          'voided_at', v.voided_at, 'void_reason', v.void_reason, 'cashier', v.cashier_name, 'voided_by_name', nullif(v.voider_name, ''),
          'student_name', coalesce(s.prefix, '') || s.first_name || ' ' || s.last_name
        ) order by v.voided_at desc)
        from tx v join students s on s.id = v.student_id where v.voided_at is not null
      ), '[]'::jsonb)
    )
  );
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

-- Top-ups in [p_from, p_to] (Asia/Bangkok days), newest first, optionally filtered by name / student code.
create or replace function card_topup_list(p_from date, p_to date, p_q text default null) returns jsonb
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
      select t.id, t.type, t.amount, t.created_at, t.student_id, s.student_code,
             coalesce(s.prefix, '') || s.first_name || ' ' || s.last_name as student_name,
             btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as cashier,
             t.voided_at, t.void_reason,
             nullif(btrim(coalesce(vp.first_name, '') || ' ' || coalesce(vp.last_name, '')), '') as voided_by_name
      from card_transactions t
      join students s on s.id = t.student_id
      left join profiles p on p.id = t.recorded_by
      left join profiles vp on vp.id = t.voided_by
      where t.type in ('topup_cash', 'topup_slip') and t.created_at >= t0 and t.created_at < t1
        and (q is null or s.student_code = q or (s.first_name || ' ' || s.last_name) ilike '%' || q || '%')
      order by t.created_at desc limit 300
    ) r
  ), '[]'::jsonb);
end $$;

revoke execute on function card_void_topup(uuid, text), card_topup_list(date, date, text) from public, anon;
grant execute on function card_void_topup(uuid, text), card_topup_list(date, date, text) to authenticated;
