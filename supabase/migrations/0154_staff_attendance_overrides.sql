-- แก้สถานะการมาทำงานเอง (override): ผู้จัดการตั้ง มา/สาย/ขาด/ลา ทับค่าที่คำนวณได้
-- ต่อคน-ต่อวัน พร้อมเหตุผลบังคับ. ลบ override = กลับไปใช้ค่าคำนวณ.
-- staff_daily_status (0066, digest) ไม่แตะ.
create table staff_attendance_overrides (
  profile_id uuid not null references profiles(id) on delete cascade,
  date       date not null,
  status     attendance_status not null,
  reason     text not null check (length(btrim(reason)) > 0),
  set_by     uuid not null references profiles(id),
  set_at     timestamptz not null default now(),
  primary key (profile_id, date)
);

-- ไม่มี policy: เข้าถึงผ่านฟังก์ชัน security definer ด้านล่างเท่านั้น
alter table staff_attendance_overrides enable row level security;

create or replace function set_staff_attendance_override(
  p_profile_id uuid, p_date date, p_status attendance_status, p_reason text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not can_manage() or not exists (
    select 1 from profiles p
    where p.id = p_profile_id and (is_org_wide() or p.department_id = auth_department())
  ) then
    raise exception 'ไม่มีสิทธิ์แก้สถานะการมาทำงาน';
  end if;
  insert into staff_attendance_overrides (profile_id, date, status, reason, set_by)
  values (p_profile_id, p_date, p_status, btrim(p_reason), auth.uid())
  on conflict (profile_id, date)
  do update set status = excluded.status, reason = excluded.reason, set_by = excluded.set_by, set_at = now();
end;
$$;

create or replace function clear_staff_attendance_override(p_profile_id uuid, p_date date)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not can_manage() or not exists (
    select 1 from profiles p
    where p.id = p_profile_id and (is_org_wide() or p.department_id = auth_department())
  ) then
    raise exception 'ไม่มีสิทธิ์แก้สถานะการมาทำงาน';
  end if;
  delete from staff_attendance_overrides where profile_id = p_profile_id and date = p_date;
end;
$$;

grant execute on function set_staff_attendance_override(uuid, date, attendance_status, text) to authenticated;
grant execute on function clear_staff_attendance_override(uuid, date) to authenticated;

-- return type เปลี่ยน (เพิ่มคอลัมน์) ต้อง drop ก่อน
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
