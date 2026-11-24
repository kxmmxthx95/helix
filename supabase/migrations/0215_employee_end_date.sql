-- สถานะบุคลากร: วันที่มีผล + หยุดเช็คชื่อหลังวันสุดท้ายของการทำงาน.
--   * employee_status_history.effective_date: วันที่ลาออก/สิ้นสุดการจ้างมีผล (ย้อนหลัง/ล่วงหน้าได้)
--   * employee_positions.end_date: วันสุดท้ายของการทำงาน, set เมื่อสถานะ resigned/terminated, ล้างเมื่อกลับมาทำงาน
--   * profiles.is_active ปิดเมื่อถึง end_date (ทันทีถ้าไม่ใช่วันในอนาคต; ไม่งั้น cron รายวัน)
--   * staff_attendance_status: วันหลัง end_date ไม่นับ, วันก่อนหน้ายังคำนวณต่อ (ประวัติเช็คชื่อไม่หาย)

alter table employee_status_history add column effective_date date not null default current_date;
alter table employee_positions add column end_date date;

create or replace function sync_employee_status() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_ended boolean := new.status in ('resigned', 'terminated');
begin
  insert into employee_positions (profile_id, employee_status, end_date)
  values (new.profile_id, new.status, case when v_ended then new.effective_date end)
  on conflict (profile_id) do update
    set employee_status = excluded.employee_status, end_date = excluded.end_date, updated_at = now();

  update profiles
    set is_active = case
      when v_ended then new.effective_date >= current_date
      else new.status in ('active', 'onboarding')
    end
    where id = new.profile_id;

  return new;
end $$;

-- resigned/terminated ที่ลงวันที่ล่วงหน้า: ปิดบัญชีเมื่อพ้นวันสุดท้าย
create or replace function apply_employee_end_dates() returns void
  language sql security definer set search_path = public
as $$
  update profiles p set is_active = false
  from employee_positions ep
  where ep.profile_id = p.id and ep.end_date < current_date and p.is_active;
$$;
select cron.schedule('employee-end-dates', '5 17 * * *', $$select apply_employee_end_dates();$$);

-- ข้อมูลเดิม: resigned/terminated ที่มีอยู่ใช้วันที่บันทึกล่าสุดเป็นวันสุดท้าย
update employee_positions ep set end_date = (
  select h.created_at::date from employee_status_history h
  where h.profile_id = ep.profile_id order by h.created_at desc limit 1
) where ep.employee_status in ('resigned', 'terminated');

drop function staff_attendance_status(date, date);
create function staff_attendance_status(p_start date, p_end date)
returns table (
  profile_id      uuid,
  department_id   uuid,
  date            date,
  status          attendance_status,
  clock_in_time   timestamptz,
  clock_out_time  timestamptz,
  overridden      boolean,
  override_reason text
)
language sql stable security definer set search_path = public
as $$
  with eligible_profiles as (
    select distinct p.id as profile_id, p.department_id
    from profiles p
    left join employee_positions ep0 on ep0.profile_id = p.id
    join profile_roles pr on pr.profile_id = p.id
    cross join school_settings ss
    where ss.id = 1
      and (p.is_active or ep0.end_date is not null)
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
    where wd.date <= coalesce((select end_date from employee_positions x where x.profile_id = ep.profile_id), 'infinity'::date)
      and not exists (
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
      when ov.status is not null then ov.status
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
    tc.clock_out_time,
    ov.status is not null as overridden,
    ov.reason as override_reason
  from candidates c
  left join staff_attendance_overrides ov on ov.profile_id = c.profile_id and ov.date = c.date
  left join time_clock_records tc on tc.profile_id = c.profile_id and tc.date = c.date
  left join department_settings ds on ds.department_id = c.department_id
  left join leave_requests lr on lr.profile_id = c.profile_id
    and lr.status = 'approved'
    and c.date between lr.start_date and lr.end_date
  order by c.date, c.profile_id;
$$;

grant execute on function staff_attendance_status(date, date) to authenticated;
