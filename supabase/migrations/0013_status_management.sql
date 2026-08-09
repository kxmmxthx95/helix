-- "จัดการสถานภาพ" hub: annual grade promotion, homeroom (ห้องเรียน) placement,
-- and bulk status changes. Org-wide only (super_admin/director/staff) — not
-- dept_head, narrower than the usual can_manage() scope (grill decision,
-- 2026-08-08). Promotion and bulk status changes act directly on the
-- existing students table (grade_level_id / status), already covered by
-- students_manage RLS and students_audit — nothing new needed there.
--
-- Rooms are a new concept: a classroom (e.g. "ม.1/1") is a durable slot per
-- grade level, reused every year and never recreated — admins add/retire
-- rooms as headcount changes, they don't rebuild the set annually. Which
-- student sits in which room *is* tracked per year, as history rather than a
-- mutable pointer — same shape as student_cohort_enrollments (0005).

-- ------------------------------------------------------------- classrooms
create table classrooms (
  id             uuid primary key default gen_random_uuid(),
  grade_level_id uuid not null references grade_levels on delete restrict,
  name           text not null, -- "1", "2" — displayed as "<grade name>/<name>"
  is_active      boolean not null default true, -- soft delete: past enrollments may still reference a retired room
  created_at     timestamptz not null default now(),
  unique (grade_level_id, name)
);

create index classrooms_grade_level_idx on classrooms (grade_level_id);

-- ----------------------------------------------- student_classroom_enrollments
-- History, not a mutable pointer — reassigning a student inserts a new row
-- rather than overwriting the old one, so past years' room rosters stay
-- intact. "Current" placement for a given year = latest row per student.
create table student_classroom_enrollments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students on delete cascade,
  classroom_id  uuid not null references classrooms on delete restrict,
  academic_year int not null, -- พ.ศ. — which year this placement applies to
  created_at    timestamptz not null default now()
);

create index student_classroom_enrollments_student_idx
  on student_classroom_enrollments (student_id, academic_year, created_at desc);
create index student_classroom_enrollments_classroom_idx on student_classroom_enrollments (classroom_id);

-- classroom_id's department (via grade_levels) must match the student's own
-- department — same bug class as check_enrollment_department() in 0005.
create or replace function check_classroom_enrollment_department() returns trigger
  language plpgsql as $$
declare
  student_dept uuid;
  classroom_dept uuid;
begin
  select department_id into student_dept from students where id = new.student_id;
  select gl.department_id into classroom_dept
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where c.id = new.classroom_id;
  if student_dept is distinct from classroom_dept then
    raise exception 'classroom % belongs to a different department than student %', new.classroom_id, new.student_id;
  end if;
  return new;
end $$;

create trigger student_classroom_enrollments_department_check
  before insert or update on student_classroom_enrollments
  for each row execute function check_classroom_enrollment_department();

-- Sensitive — same audit rationale as student_cohort_enrollments (0005).
create trigger student_classroom_enrollments_audit
  after insert or update or delete on student_classroom_enrollments
  for each row execute function log_audit();

-- ------------------------------------------------------------------ RLS
alter table classrooms enable row level security;
alter table student_classroom_enrollments enable row level security;

-- classrooms: readable by anyone signed in (same shape as grade_levels),
-- written by org-wide roles only.
create policy classrooms_read on classrooms
  for select to authenticated using (true);
create policy classrooms_write on classrooms
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

-- student_classroom_enrollments: department-scoped read (plus self/guardian),
-- org-wide-only write — narrower than student_cohort_enrollments, which lets
-- dept_head write within their own department.
create policy student_classroom_enrollments_read on student_classroom_enrollments
  for select to authenticated using (
    is_org_wide()
    or classroom_id in (
      select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
      where gl.department_id = auth_department()
    )
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );
create policy student_classroom_enrollments_write on student_classroom_enrollments
  for all to authenticated using (is_org_wide()) with check (is_org_wide());
