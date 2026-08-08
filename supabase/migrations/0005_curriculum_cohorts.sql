-- Cohort-based curriculum: a curriculum is authored once per entry cohort
-- (e.g. "มัธยมต้น รุ่นปี 2569") and stays fixed for that cohort across every
-- grade it spans (ม.1 in 2569 -> ม.2 in 2570 -> ม.3 in 2571), independent of
-- later curriculum revisions. Replaces curriculum_subjects.academic_year,
-- which modeled "current calendar year" rather than "the cohort's entry
-- year" and had no way to freeze a cohort against future edits
-- (grill decision, 2026-08-07). Applies to SEC/PRI only — KG keeps its own
-- academic_year-based learning_units/kg_assessment_topics, which don't have
-- the same "subject set frozen per cohort" problem.

-- students.class_level (free text) can't be joined against grade_levels, so
-- it's replaced with a real FK — the only reliable way to know which
-- curriculum_subjects rows currently apply to a given student.
alter table students drop column class_level;
alter table students add column grade_level_id uuid references grade_levels on delete restrict;
create index students_grade_level_idx on students (grade_level_id);

-- --------------------------------------------------------- curriculum_cohorts
create table curriculum_cohorts (
  id                   uuid primary key default gen_random_uuid(),
  department_id        uuid not null references departments on delete restrict,
  entry_grade_level_id uuid not null references grade_levels on delete restrict, -- ม.1 or ม.4, the entry point
  entry_year           int not null, -- พ.ศ. the cohort started
  name                 text not null, -- "มัธยมต้น รุ่นปี 2569"
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- One curriculum bundle per entry point per year — variants (สายวิทย์ vs
  -- สายศิลป์, English Program room vs regular) live inside the bundle via
  -- curriculum_subjects.study_plan_id, not as separate cohort rows
  -- (grill decision: option A over option B).
  unique (department_id, entry_grade_level_id, entry_year)
);

create index curriculum_cohorts_department_idx on curriculum_cohorts (department_id);
create trigger curriculum_cohorts_touch before update on curriculum_cohorts
  for each row execute function touch_updated_at();

-- entry_grade_level_id must actually belong to department_id — same shape as
-- check_curriculum_term_dept() from 0004.
create or replace function check_cohort_department() returns trigger
  language plpgsql as $$
declare
  entry_dept uuid;
begin
  select department_id into entry_dept from grade_levels where id = new.entry_grade_level_id;
  if entry_dept is distinct from new.department_id then
    raise exception 'entry_grade_level_id must belong to department_id';
  end if;
  return new;
end $$;

create trigger curriculum_cohorts_department_check before insert or update on curriculum_cohorts
  for each row execute function check_cohort_department();

alter table curriculum_cohorts enable row level security;

create policy curriculum_cohorts_read on curriculum_cohorts
  for select to authenticated using (true);
create policy curriculum_cohorts_write on curriculum_cohorts
  for all to authenticated
  using (can_manage() and (is_org_wide() or department_id = auth_department()))
  with check (can_manage() and (is_org_wide() or department_id = auth_department()));

-- ------------------------------------------------------- curriculum_subjects
-- academic_year -> cohort_id. Same dedup shape as 0004 (Q20), just keyed on
-- the cohort instead of a raw year — drop the four old partial indexes and
-- the column, then rebuild both against cohort_id.
drop index curriculum_subjects_unique_nn;
drop index curriculum_subjects_unique_ny;
drop index curriculum_subjects_unique_yn;
drop index curriculum_subjects_unique_yy;

alter table curriculum_subjects drop column academic_year;
alter table curriculum_subjects add column cohort_id uuid not null references curriculum_cohorts on delete restrict;
create index curriculum_subjects_cohort_idx on curriculum_subjects (cohort_id);

create unique index curriculum_subjects_unique_nn on curriculum_subjects
  (subject_id, grade_level_id, cohort_id)
  where term is null and study_plan_id is null;
create unique index curriculum_subjects_unique_ny on curriculum_subjects
  (subject_id, grade_level_id, study_plan_id, cohort_id)
  where term is null and study_plan_id is not null;
create unique index curriculum_subjects_unique_yn on curriculum_subjects
  (subject_id, grade_level_id, term, cohort_id)
  where term is not null and study_plan_id is null;
create unique index curriculum_subjects_unique_yy on curriculum_subjects
  (subject_id, grade_level_id, term, study_plan_id, cohort_id)
  where term is not null and study_plan_id is not null;

-- cohort_id's department must match grade_level_id's department — same bug
-- class as check_curriculum_term_dept() guards against (attaching a row to
-- the wrong department's structure).
create or replace function check_curriculum_cohort_department() returns trigger
  language plpgsql as $$
declare
  grade_dept uuid;
  cohort_dept uuid;
begin
  select department_id into grade_dept from grade_levels where id = new.grade_level_id;
  select department_id into cohort_dept from curriculum_cohorts where id = new.cohort_id;
  if grade_dept is distinct from cohort_dept then
    raise exception 'cohort % belongs to a different department than grade_level %', new.cohort_id, new.grade_level_id;
  end if;
  return new;
end $$;

create trigger curriculum_subjects_cohort_department_check before insert or update on curriculum_subjects
  for each row execute function check_curriculum_cohort_department();

-- --------------------------------------------------- student_cohort_enrollments
-- History, not a mutable pointer — a transfer or ซ้ำชั้น inserts a new row
-- rather than overwriting the old one, so past grading periods still
-- resolve to the cohort that was actually in effect then. "Current"
-- enrollment = latest row per student.
create table student_cohort_enrollments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students on delete cascade,
  cohort_id     uuid not null references curriculum_cohorts on delete restrict,
  study_plan_id uuid references study_plans on delete restrict, -- track within the cohort: สายวิทย์/สายศิลป์
  created_at    timestamptz not null default now()
);

create index student_cohort_enrollments_student_idx on student_cohort_enrollments (student_id, created_at desc);
create index student_cohort_enrollments_cohort_idx on student_cohort_enrollments (cohort_id);

-- cohort_id's department must match the student's own department — same bug
-- class as the checks above (a SEC cohort should never attach to a PRI kid).
create or replace function check_enrollment_department() returns trigger
  language plpgsql as $$
declare
  student_dept uuid;
  cohort_dept uuid;
begin
  select department_id into student_dept from students where id = new.student_id;
  select department_id into cohort_dept from curriculum_cohorts where id = new.cohort_id;
  if student_dept is distinct from cohort_dept then
    raise exception 'cohort % belongs to a different department than student %', new.cohort_id, new.student_id;
  end if;
  return new;
end $$;

create trigger student_cohort_enrollments_department_check before insert or update on student_cohort_enrollments
  for each row execute function check_enrollment_department();

-- Sensitive — feeds grading/report cards directly, same audit rationale as
-- curriculum_subjects (0004).
create trigger student_cohort_enrollments_audit after insert or update or delete on student_cohort_enrollments
  for each row execute function log_audit();

alter table student_cohort_enrollments enable row level security;

create policy student_cohort_enrollments_read on student_cohort_enrollments
  for select to authenticated using (
    is_org_wide()
    or cohort_id in (select id from curriculum_cohorts where department_id = auth_department())
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );
create policy student_cohort_enrollments_write on student_cohort_enrollments
  for all to authenticated
  using (
    can_manage()
    and (is_org_wide() or cohort_id in (select id from curriculum_cohorts where department_id = auth_department()))
  )
  with check (
    can_manage()
    and (is_org_wide() or cohort_id in (select id from curriculum_cohorts where department_id = auth_department()))
  );
