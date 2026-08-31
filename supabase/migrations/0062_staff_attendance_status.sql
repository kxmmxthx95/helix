-- Derived staff attendance status (มา/สาย/ขาด/ลา) — combines time_clock_records
-- (0032: clock in/out + late) and leave_requests (0033: approved leave) into
-- one attendance_status per employee per work day. Reuses attendance_status
-- (0026, student attendance) rather than a new enum — same four values mean
-- the same thing here. No new table: this is a read-only projection over
-- data that already exists, built as a function (not client-side) because an
-- upcoming KPI/payroll feature needs the same derivation from SQL too (grill
-- decision, 2026-08-31).
--
-- security definer, and deliberately NOT a plain view: profile_roles and
-- time_clock_records carry RLS narrower than employee_positions
-- (profile_roles read is self or can_manage_users(); time_clock_records read
-- is self or can_manage() scoped to department/org-wide). A plain view
-- joining them under the caller's own RLS would silently drop rows a
-- dept_head isn't allowed to see — indistinguishable from a genuine ขาด. The
-- WHERE clause below reproduces time_clock_records_rw's own USING clause
-- exactly, so this function is the only thing standing in for that RLS.
create or replace function staff_attendance_status(p_start date, p_end date)
returns table (
  profile_id      uuid,
  department_id   uuid,
  date            date,
  status          attendance_status,
  clock_in_time   timestamptz,
  clock_out_time  timestamptz
)
language sql stable security definer set search_path = public
as $$
  with eligible_profiles as (
    select distinct p.id as profile_id, p.department_id
    from profiles p
    join profile_roles pr on pr.profile_id = p.id
    cross join school_settings ss
    where ss.id = 1
      and p.is_active
      and pr.role = any(ss.time_tracking_roles)
      and (
        p.id = auth.uid()
        or (can_manage() and (is_org_wide() or p.department_id = auth_department()))
      )
  ),
  -- Work days = Mon–Fri only (grill decision: Saturday teaching schedules
  -- vary by department, so it's excluded from "expected to clock in" rather
  -- than guessed per department).
  work_days as (
    select gs::date as date
    from generate_series(p_start, p_end, interval '1 day') gs
    where extract(isodow from gs) between 1 and 5
  ),
  candidates as (
    select ep.profile_id, ep.department_id, wd.date
    from eligible_profiles ep
    cross join work_days wd
    where not exists (
      select 1 from academic_events e
      where not e.staff_attend
        and wd.date between e.start_date and e.end_date
        and (
          not exists (select 1 from academic_event_departments aed where aed.event_id = e.id)
          or exists (
            select 1 from academic_event_departments aed
            where aed.event_id = e.id and aed.department_id = ep.department_id
          )
        )
    )
  )
  select
    c.profile_id,
    c.department_id,
    c.date,
    case
      when lr.id is not null then 'leave'::attendance_status
      when tc.clock_in_time is null then 'absent'::attendance_status
      when ds.work_start_time is not null
        and (tc.clock_in_time at time zone 'Asia/Bangkok')::time > ds.work_start_time
        then 'late'::attendance_status
      else 'present'::attendance_status
    end as status,
    tc.clock_in_time,
    tc.clock_out_time
  from candidates c
  left join time_clock_records tc on tc.profile_id = c.profile_id and tc.date = c.date
  left join department_settings ds on ds.department_id = c.department_id
  left join leave_requests lr on lr.profile_id = c.profile_id
    and lr.status = 'approved'
    and c.date between lr.start_date and lr.end_date
  order by c.date, c.profile_id;
$$;

grant execute on function staff_attendance_status(date, date) to authenticated;
