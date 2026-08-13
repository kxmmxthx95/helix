-- Student leave (ระบบการลาของนักเรียน) — separate domain from staff leave
-- (0033/0034): a parent or the student submits, the current homeroom
-- teacher (or dept_head/org-wide) approves, and approval auto-fills
-- attendance_records.status='leave' for the range (grill decision, 2026-08-13).

-- Both the RLS policies below and the auto-fill trigger need "which
-- classroom is this student in right now" — student_classroom_enrollments
-- has no direct pointer, latest row per academic_year wins (same rule
-- useClassroomRoster already applies client-side, src/hooks/useAttendance.ts).
create or replace function current_student_classroom(p_student_id uuid) returns uuid
  language sql stable security definer set search_path = public
as $$
  select classroom_id from student_classroom_enrollments
  where student_id = p_student_id
    and academic_year = (select academic_year from school_settings where id = 1)
  order by created_at desc limit 1
$$;

create type student_leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table student_leave_requests (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students on delete restrict,
  submitted_by  uuid not null references profiles on delete restrict, -- parent or the student's own profile
  start_date    date not null,
  end_date      date not null,
  days          int generated always as (end_date - start_date + 1) stored,
  reason        text not null,
  status        student_leave_status not null default 'pending',
  approved_by   uuid references profiles on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);

create index student_leave_requests_student_idx on student_leave_requests (student_id, start_date);

create trigger student_leave_requests_touch before update on student_leave_requests
  for each row execute function touch_updated_at();
create trigger student_leave_requests_audit
  after insert or update or delete on student_leave_requests
  for each row execute function log_audit();

alter table student_leave_requests enable row level security;

-- Read: same shape as attendance_records_read (0026), just resolved through
-- current_student_classroom() instead of a stored classroom_id.
create policy student_leave_requests_read on student_leave_requests
  for select to authenticated using (
    is_org_wide()
    or student_id in (
      select s.id from students s join grade_levels gl on gl.id = s.grade_level_id
      where gl.department_id = auth_department()
    )
    or current_student_classroom(student_id) in (
      select cht.classroom_id from classroom_homeroom_teachers cht where cht.teacher_id = auth.uid()
    )
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );

-- Insert: only the requester (self-student or a guardian), for a student they're actually allowed to submit for.
create policy student_leave_requests_insert on student_leave_requests
  for insert to authenticated with check (
    submitted_by = auth.uid() and (
      student_id in (select id from students where profile_id = auth.uid())
      or student_id in (select student_id from guardianships where parent_id = auth.uid())
    )
  );

-- Update: approver (homeroom teacher of the student's current room, or
-- can_manage() in dept) or the submitter themselves. Fine-grained "what they
-- may actually change" enforced by the trigger below.
create policy student_leave_requests_update on student_leave_requests
  for update to authenticated using (
    (can_manage() and (is_org_wide() or student_id in (
      select s.id from students s join grade_levels gl on gl.id = s.grade_level_id where gl.department_id = auth_department()
    )))
    or current_student_classroom(student_id) in (
      select cht.classroom_id from classroom_homeroom_teachers cht where cht.teacher_id = auth.uid()
    )
    or submitted_by = auth.uid()
  ) with check (
    (can_manage() and (is_org_wide() or student_id in (
      select s.id from students s join grade_levels gl on gl.id = s.grade_level_id where gl.department_id = auth_department()
    )))
    or current_student_classroom(student_id) in (
      select cht.classroom_id from classroom_homeroom_teachers cht where cht.teacher_id = auth.uid()
    )
    or submitted_by = auth.uid()
  );

-- submitter may only cancel-while-pending; everyone else reaching UPDATE via
-- the policy above is an approver and may only move pending -> approved/rejected.
create or replace function check_student_leave_self_edit() returns trigger
  language plpgsql as $$
begin
  if new.submitted_by is distinct from old.submitted_by
    or new.student_id is distinct from old.student_id
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.reason is distinct from old.reason then
    raise exception 'ขอเปลี่ยนแปลงข้อมูลนี้ไม่ได้ ต้องยื่นคำขอใหม่';
  end if;

  if old.submitted_by = auth.uid() then
    if not (old.status = 'pending' and new.status = 'cancelled') then
      raise exception 'ยกเลิกได้เฉพาะตอนยังรออนุมัติเท่านั้น';
    end if;
  elsif new.status is distinct from old.status
    and not (old.status = 'pending' and new.status in ('approved', 'rejected')) then
    raise exception 'เปลี่ยนสถานะได้เฉพาะจากรออนุมัติเท่านั้น';
  end if;
  return new;
end $$;

create trigger student_leave_requests_self_edit_check before update on student_leave_requests
  for each row execute function check_student_leave_self_edit();

-- Approval -> auto-fill attendance_records('leave') for every day in range,
-- skipping Sat/Sun, using the student's CURRENT classroom. security definer
-- since this is a system-triggered write, same reasoning as
-- seed_department_settings() (0002).
create or replace function sync_student_leave_to_attendance() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  d   date;
  cid uuid;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;
  cid := current_student_classroom(new.student_id);
  if cid is null then
    return new;
  end if;
  d := new.start_date;
  while d <= new.end_date loop
    if extract(dow from d) not in (0, 6) then
      insert into attendance_records (student_id, classroom_id, date, status, recorded_by)
      values (new.student_id, cid, d, 'leave', new.approved_by)
      on conflict (student_id, date) do update
        set status = 'leave', classroom_id = excluded.classroom_id, recorded_by = excluded.recorded_by;
    end if;
    d := d + 1;
  end loop;
  return new;
end $$;

create trigger student_leave_requests_sync_attendance after update on student_leave_requests
  for each row execute function sync_student_leave_to_attendance();
