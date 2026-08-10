-- Teacher master data (display code + home learning area), homeroom teacher
-- assignment (ครูประจำชั้น), and teaching load assignment (ครูสอนวิชาอะไรให้
-- ห้องไหน + คาบ/สัปดาห์). Teachers are not a separate table — role='teacher'
-- profiles already carry name/phone/email/department, so this only adds the
-- two columns profiles was missing (grill decision, 2026-08-09).

-- ------------------------------------------------------------------ profiles
alter table profiles
  add column teacher_code text unique,
  add column learning_area_id uuid references learning_areas on delete restrict;

create index profiles_learning_area_idx on profiles (learning_area_id);

-- learning_area_id is required iff role='teacher' — same "required for this
-- role" shape as department_id below it, so extend check_profile_role_dept()
-- instead of adding a second trigger for the same event.
create or replace function check_profile_role_dept() returns trigger
  language plpgsql as $$
declare
  dept uuid;
  area uuid;
begin
  if new.role in ('dept_head', 'teacher', 'student') then
    select department_id into dept from profiles where id = new.profile_id;
    if dept is null then
      raise exception 'role % requires profile % to have a department', new.role, new.profile_id;
    end if;
  end if;
  if new.role = 'teacher' then
    select learning_area_id into area from profiles where id = new.profile_id;
    if area is null then
      raise exception 'role teacher requires profile % to have a learning_area_id', new.profile_id;
    end if;
  end if;
  return new;
end $$;

-- ------------------------------------------------- classroom_homeroom_teachers
-- ครูประจำชั้น per room per academic year — history, not a mutable pointer,
-- same shape as student_classroom_enrollments (0013): reassigning inserts a
-- new row rather than overwriting, so past years still resolve to who
-- actually handled leave approval then. No cap on how many teachers a room
-- can have per year (most schools run 2 — หลัก + คู่ชั้น — nothing here
-- enforces that split) and deliberately no department-match check against
-- the classroom, unlike teaching_assignments below (grill decision).
create table classroom_homeroom_teachers (
  id            uuid primary key default gen_random_uuid(),
  classroom_id  uuid not null references classrooms on delete restrict,
  teacher_id    uuid not null references profiles on delete restrict,
  academic_year int not null,
  created_at    timestamptz not null default now(),
  unique (classroom_id, academic_year, teacher_id)
);

create index classroom_homeroom_teachers_classroom_idx on classroom_homeroom_teachers (classroom_id);
create index classroom_homeroom_teachers_teacher_idx on classroom_homeroom_teachers (teacher_id);

-- Sensitive — drives leave-request routing, same audit rationale as
-- student_classroom_enrollments (0013).
create trigger classroom_homeroom_teachers_audit
  after insert or update or delete on classroom_homeroom_teachers
  for each row execute function log_audit();

alter table classroom_homeroom_teachers enable row level security;

-- write: org-wide only, same scope as classrooms/student_classroom_enrollments
-- (0013) — homeroom placement stays outside the usual can_manage() dept_head
-- carve-out.
create policy classroom_homeroom_teachers_write on classroom_homeroom_teachers
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

-- read: org-wide + the room's own department, plus the student sitting in
-- that room that year and their guardians — the whole point of this table is
-- routing leave requests, so the student/parent carve-out is required, not
-- optional (same shape as student_classroom_enrollments_read).
create policy classroom_homeroom_teachers_read on classroom_homeroom_teachers
  for select to authenticated using (
    is_org_wide()
    or classroom_id in (
      select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
      where gl.department_id = auth_department()
    )
    or classroom_id in (
      select sce.classroom_id from student_classroom_enrollments sce
      join students s on s.id = sce.student_id
      where sce.academic_year = classroom_homeroom_teachers.academic_year
        and (
          s.profile_id = auth.uid()
          or s.id in (select student_id from guardianships where parent_id = auth.uid())
        )
    )
  );

-- ---------------------------------------------------------- teaching_assignments
-- ครูสอนวิชาอะไรให้ห้องไหน + คาบ/สัปดาห์ — the 3-way match (teacher, subject,
-- classroom) plus an explicit periods_per_week per row rather than reading
-- subjects.hours_per_week, because team-teaching/split-period assignments are
-- real (two teachers sharing one subject's periods for one room) and a
-- shared default can't represent that (grill decision). subject_id points at
-- the school-wide catalog directly, not curriculum_subjects — classrooms
-- don't carry a cohort_id/study_plan_id (a room can mix cohorts/tracks), so
-- there's no single curriculum_subjects row to point at; this table is a
-- scheduling concern, not a curriculum-authoring one.
create table teaching_assignments (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references profiles on delete restrict,
  subject_id        uuid not null references subjects on delete restrict,
  classroom_id      uuid not null references classrooms on delete restrict,
  academic_year     int not null,
  term              int, -- required for SEC, must be null elsewhere — see trigger below
  periods_per_week  int not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (term is null or term in (1, 2))
);

create index teaching_assignments_teacher_idx on teaching_assignments (teacher_id);
create index teaching_assignments_subject_idx on teaching_assignments (subject_id);
create index teaching_assignments_classroom_idx on teaching_assignments (classroom_id);

create trigger teaching_assignments_touch before update on teaching_assignments
  for each row execute function touch_updated_at();

-- Dedup, split by whether term is null — a plain UNIQUE on a nullable column
-- wouldn't catch duplicates since NULL never equals NULL, same problem
-- profile_roles/curriculum_subjects solve with partial indexes. A second
-- teacher CAN repeat (teacher_id differs) — that's split/team-teaching.
create unique index teaching_assignments_unique_no_term on teaching_assignments
  (teacher_id, subject_id, classroom_id, academic_year)
  where term is null;
create unique index teaching_assignments_unique_term on teaching_assignments
  (teacher_id, subject_id, classroom_id, academic_year, term)
  where term is not null;

-- term is only meaningful for SEC, same rule as check_curriculum_term_dept()
-- (0004) — resolved via the classroom's department since this table has no
-- grade_level_id directly.
create or replace function check_teaching_assignment_term() returns trigger
  language plpgsql as $$
declare
  dept_code text;
begin
  select d.code into dept_code
  from classrooms c
  join grade_levels gl on gl.id = c.grade_level_id
  join departments d on d.id = gl.department_id
  where c.id = new.classroom_id;

  if dept_code = 'SEC' and new.term is null then
    raise exception 'term is required for SEC (มัธยม) teaching assignments';
  elsif dept_code <> 'SEC' and new.term is not null then
    raise exception 'term must be null outside SEC, got department %', dept_code;
  end if;

  return new;
end $$;

create trigger teaching_assignments_term_check before insert or update on teaching_assignments
  for each row execute function check_teaching_assignment_term();

-- Teacher's department must match the classroom's department — unlike
-- classroom_homeroom_teachers, this one IS enforced (grill decision): a
-- teacher shouldn't show up on another department's timetable. subjects
-- also carry department_id since 0007 (subjects can't cross departments
-- either), so the subject is checked against the same classroom department
-- for the same reason check_curriculum_subject_department() (0007) checks it
-- against a cohort.
create or replace function check_teaching_assignment_department() returns trigger
  language plpgsql as $$
declare
  teacher_dept uuid;
  subject_dept uuid;
  classroom_dept uuid;
begin
  select department_id into teacher_dept from profiles where id = new.teacher_id;
  select department_id into subject_dept from subjects where id = new.subject_id;
  select gl.department_id into classroom_dept
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where c.id = new.classroom_id;
  if teacher_dept is distinct from classroom_dept then
    raise exception 'teacher % belongs to a different department than classroom %', new.teacher_id, new.classroom_id;
  end if;
  if subject_dept is distinct from classroom_dept then
    raise exception 'subject % belongs to a different department than classroom %', new.subject_id, new.classroom_id;
  end if;
  return new;
end $$;

create trigger teaching_assignments_department_check before insert or update on teaching_assignments
  for each row execute function check_teaching_assignment_department();

-- Sensitive — will drive grade-entry permission per classroom/subject, same
-- audit rationale as curriculum_subjects (0004).
create trigger teaching_assignments_audit
  after insert or update or delete on teaching_assignments
  for each row execute function log_audit();

alter table teaching_assignments enable row level security;

-- read: org-wide + whole department, same shape as curriculum_subjects_read
-- — a teaching schedule isn't sensitive the way a grade is.
create policy teaching_assignments_read on teaching_assignments
  for select to authenticated using (
    is_org_wide()
    or classroom_id in (
      select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
      where gl.department_id = auth_department()
    )
  );

-- write: can_manage() scoped to own department, same shape as
-- curriculum_subjects_write — dept_head runs their own department's timetable.
create policy teaching_assignments_write on teaching_assignments
  for all to authenticated
  using (
    can_manage() and (
      is_org_wide()
      or classroom_id in (
        select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    )
  )
  with check (
    can_manage() and (
      is_org_wide()
      or classroom_id in (
        select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    )
  );

-- --------------------------------------------------------- department_settings
-- Teaching-load alert thresholds — nullable, per department (a school sets
-- its own standard, not a ministry-fixed number), same shape as the
-- score_collect_pct/score_exam_pct split added in 0004.
alter table department_settings
  add column min_periods_per_week int,
  add column max_periods_per_week int,
  add constraint department_settings_periods_check check (
    min_periods_per_week is null or max_periods_per_week is null
    or min_periods_per_week <= max_periods_per_week
  );
