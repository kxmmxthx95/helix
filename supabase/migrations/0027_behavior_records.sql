-- คะแนนพฤติกรรม — behavior score. Every student starts each academic year
-- at STARTING_SCORE (100, see src/hooks/useBehaviorRecords.ts) and teachers
-- log individual +/- point entries against it. Unlike attendance_records
-- (0026) this is a plain event log, not one row per student per day — a
-- student can rack up several entries in one day, so no unique constraint
-- and no upsert; edits/deletes are just normal row updates, same "stays
-- open forever" ethos as attendance (no term-lock).
--
-- Read/write is wider than attendance_records (0026): any profile holding
-- role='teacher' may read/write ANY classroom's records, not just their own
-- homeroom/department — a subject teacher, hall-duty teacher, etc. can spot
-- misbehavior outside their own room and log it there. ฝ่ายบริหาร keep the
-- usual dept-scoped can_manage() path; org-wide sees everything.

create table behavior_records (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students on delete restrict,
  -- Snapshot, not derived from student_classroom_enrollments — see 0026.
  classroom_id  uuid not null references classrooms on delete restrict,
  date          date not null,
  points        int not null check (points <> 0),
  reason        text not null,
  recorded_by   uuid not null references profiles on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index behavior_records_classroom_date_idx on behavior_records (classroom_id, date);
create index behavior_records_student_idx on behavior_records (student_id);

create trigger behavior_records_touch before update on behavior_records
  for each row execute function touch_updated_at();
create trigger behavior_records_audit
  after insert or update or delete on behavior_records
  for each row execute function log_audit();

alter table behavior_records enable row level security;

create policy behavior_records_read on behavior_records
  for select to authenticated using (
    is_org_wide()
    or classroom_id in (
      select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
      where gl.department_id = auth_department()
    )
    or exists (select 1 from profile_roles where profile_id = auth.uid() and role = 'teacher')
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );

create policy behavior_records_write on behavior_records
  for all to authenticated
  using (
    (can_manage() and (
      is_org_wide()
      or classroom_id in (
        select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    ))
    or exists (select 1 from profile_roles where profile_id = auth.uid() and role = 'teacher')
  )
  with check (
    (can_manage() and (
      is_org_wide()
      or classroom_id in (
        select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    ))
    or exists (select 1 from profile_roles where profile_id = auth.uid() and role = 'teacher')
  );
