-- staff_attendance_status: "ขาด" only after the day has ended (Asia/Bangkok).
-- Today and future days with no clock-in and no approved leave return a null
-- status ("pending") instead of absent. Approved leave still shows 'leave'.
-- staff_daily_status (0066, digest) is intentionally unchanged.
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
      -- 'absent' only once the day is over; today/future with no clock-in is still pending (null)
      when tc.clock_in_time is null and c.date >= (now() at time zone 'Asia/Bangkok')::date then null
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
