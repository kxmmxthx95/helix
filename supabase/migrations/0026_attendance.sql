-- เช็คชื่อเข้าโรงเรียน — homeroom attendance, once per student per day (not
-- per-period; that's a different, much bigger feature). Every student must
-- be explicitly marked (no implicit "present"), and edits stay open forever
-- (no term-lock, grill decision) since a teacher may need to correct a
-- forgotten day weeks later.

create type attendance_status as enum ('present', 'late', 'absent', 'leave');

create table attendance_records (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students on delete restrict,
  -- Snapshot, not derived from student_classroom_enrollments — a student can
  -- change rooms mid-year and past days must still show where they actually
  -- sat that day.
  classroom_id  uuid not null references classrooms on delete restrict,
  date          date not null,
  status        attendance_status not null,
  note          text,
  recorded_by   uuid not null references profiles on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (student_id, date)
);

create index attendance_records_classroom_date_idx on attendance_records (classroom_id, date);
create index attendance_records_student_idx on attendance_records (student_id);

create trigger attendance_records_touch before update on attendance_records
  for each row execute function touch_updated_at();
create trigger attendance_records_audit
  after insert or update or delete on attendance_records
  for each row execute function log_audit();

alter table attendance_records enable row level security;

-- read: org-wide + the classroom's department (dept_head), the classroom's
-- current homeroom teacher, the student themselves, and their guardians —
-- same shape as classroom_homeroom_teachers_read (0017).
create policy attendance_records_read on attendance_records
  for select to authenticated using (
    is_org_wide()
    or classroom_id in (
      select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
      where gl.department_id = auth_department()
    )
    or classroom_id in (
      select cht.classroom_id from classroom_homeroom_teachers cht
      where cht.teacher_id = auth.uid()
    )
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );

-- write: can_manage() scoped to their department (same shape as
-- teaching_assignments_write), plus the classroom's homeroom teacher for any
-- year they've held that room — matches the grill decision "ครูประจำชั้น +
-- ฝ่ายบริหาร".
create policy attendance_records_write on attendance_records
  for all to authenticated
  using (
    (can_manage() and (
      is_org_wide()
      or classroom_id in (
        select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    ))
    or classroom_id in (
      select cht.classroom_id from classroom_homeroom_teachers cht
      where cht.teacher_id = auth.uid()
    )
  )
  with check (
    (can_manage() and (
      is_org_wide()
      or classroom_id in (
        select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    ))
    or classroom_id in (
      select cht.classroom_id from classroom_homeroom_teachers cht
      where cht.teacher_id = auth.uid()
    )
  );
