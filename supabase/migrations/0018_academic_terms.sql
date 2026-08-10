-- Academic Terms Config + Academic Events & Holidays (grill decision,
-- 2026-08-10). Replaces the old ad-hoc "current year" model
-- (school_settings.academic_year singleton + department_settings semester
-- date pairs) with a real per-department term entity carrying a lock
-- status, so other tables can enforce "don't edit records in a closed
-- term" instead of every future feature re-implementing that check itself.
--
-- Scope decision: only tables that literally record "this happened during
-- this term" migrate to reference academic_terms (teaching_assignments,
-- student_classroom_enrollments). curriculum_cohorts.entry_year (which
-- entry cohort, spans many years) and curriculum_subjects.term (which half
-- of the frozen per-cohort curriculum, not tied to a calendar year) are a
-- different concept each and are deliberately left alone.

create type term_type as enum ('term1', 'term2', 'summer');
create type term_status as enum ('upcoming', 'active', 'locked', 'archived');

-- ------------------------------------------------------------- academic_terms
-- Per department (KG/PRI/SEC keep independent calendars, same as the
-- department_settings semester dates this replaces — a grill decision from
-- 2026-08-07 that this table doesn't relitigate). start_date/end_date are
-- nullable — a term can be created before its dates are finalized.
create table academic_terms (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references departments on delete restrict,
  academic_year  int not null, -- พ.ศ.
  term_type      term_type not null,
  start_date     date,
  end_date       date,
  status         term_status not null default 'upcoming',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (department_id, academic_year, term_type),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create index academic_terms_department_idx on academic_terms (department_id);
-- Only one ACTIVE term per department at a time — replaces the old
-- school_settings.academic_year singleton's "there's exactly one current
-- year" guarantee, now scoped per department instead of school-wide.
create unique index academic_terms_one_active on academic_terms (department_id)
  where status = 'active';

create trigger academic_terms_touch before update on academic_terms
  for each row execute function touch_updated_at();
-- Sensitive — LOCKED status blocks writes elsewhere (see triggers below).
create trigger academic_terms_audit after insert or update or delete on academic_terms
  for each row execute function log_audit();

alter table academic_terms enable row level security;

create policy academic_terms_read on academic_terms
  for select to authenticated
  using (is_org_wide() or department_id = auth_department());

-- dept_head manages their own department's terms (dates, creating new
-- terms) but cannot themselves set status to locked/archived — closing a
-- term freezes writes across the whole department (see triggers below), so
-- that step is org-wide only, same shape as the classrooms/homeroom-teacher
-- carve-out (grill decision 2026-08-08). A side effect of expressing this as
-- a WITH CHECK on the new row: once a term IS locked/archived, a dept_head
-- can no longer write to that row at all (not even to fix a date) — only
-- org-wide can un-lock it first. That's intentional, not a bug.
create policy academic_terms_write on academic_terms
  for all to authenticated
  using (can_manage() and (is_org_wide() or department_id = auth_department()))
  with check (
    can_manage() and (is_org_wide() or department_id = auth_department())
    and (is_org_wide() or status not in ('locked', 'archived'))
  );

-- ------------------------------------------------------- data migration
-- Carry over existing semester dates as this department's term1/term2 rows
-- for the currently-configured year. There's no way to know which semester
-- was actually "current" under the old model (school_settings.academic_year
-- was just a bare year number) — term1 is assumed active, term2 upcoming;
-- an admin corrects this once if the school is actually mid-term2.
insert into academic_terms (department_id, academic_year, term_type, start_date, end_date, status)
select ds.department_id, ss.academic_year, 'term1', ds.semester1_start, ds.semester1_end, 'active'
from department_settings ds cross join school_settings ss;

insert into academic_terms (department_id, academic_year, term_type, start_date, end_date, status)
select ds.department_id, ss.academic_year, 'term2', ds.semester2_start, ds.semester2_end, 'upcoming'
from department_settings ds cross join school_settings ss;

alter table department_settings
  drop column semester1_start,
  drop column semester1_end,
  drop column semester2_start,
  drop column semester2_end;

alter table school_settings drop column academic_year;

-- ---------------------------------------------------- term-lock enforcement
-- Validates the referenced (department, academic_year[, term]) has a real
-- academic_terms row AND isn't locked/archived. Raw academic_year/term
-- columns stay as-is (not a hard FK) — a null term (PRI/KG, whose
-- curriculum doesn't split by term) logically spans both term1 and term2,
-- which a single FK column can't represent, so this checks "any row for
-- that department+year" instead of pinning to one.
create or replace function check_teaching_assignment_academic_term() returns trigger
  language plpgsql as $$
declare
  rec teaching_assignments;
  dept uuid;
  want_term_type term_type;
  total_count int;
  locked_count int;
begin
  rec := coalesce(new, old);
  select department_id into dept from profiles where id = rec.teacher_id;

  if rec.term is not null then
    want_term_type := case rec.term when 1 then 'term1' else 'term2' end;
    select count(*), count(*) filter (where status in ('locked', 'archived'))
      into total_count, locked_count
      from academic_terms
      where department_id = dept and academic_year = rec.academic_year and term_type = want_term_type;
  else
    select count(*), count(*) filter (where status in ('locked', 'archived'))
      into total_count, locked_count
      from academic_terms
      where department_id = dept and academic_year = rec.academic_year;
  end if;

  -- INSERT/UPDATE need a real term row to check against; DELETE is always
  -- allowed to proceed even against a since-deleted/never-configured term
  -- (nothing left to lock).
  if tg_op <> 'DELETE' and total_count = 0 then
    raise exception 'no academic_terms row for department %, year % — set up the academic term first', dept, rec.academic_year;
  end if;
  if locked_count > 0 then
    raise exception 'academic term for department %, year % is locked/archived', dept, rec.academic_year;
  end if;

  return coalesce(new, old);
end $$;

create trigger teaching_assignments_term_lock_check
  before insert or update or delete on teaching_assignments
  for each row execute function check_teaching_assignment_academic_term();

create or replace function check_classroom_enrollment_academic_term() returns trigger
  language plpgsql as $$
declare
  rec student_classroom_enrollments;
  dept uuid;
  total_count int;
  locked_count int;
begin
  rec := coalesce(new, old);
  select gl.department_id into dept
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where c.id = rec.classroom_id;

  select count(*), count(*) filter (where status in ('locked', 'archived'))
    into total_count, locked_count
    from academic_terms
    where department_id = dept and academic_year = rec.academic_year;

  if tg_op <> 'DELETE' and total_count = 0 then
    raise exception 'no academic_terms row for department %, year % — set up the academic term first', dept, rec.academic_year;
  end if;
  if locked_count > 0 then
    raise exception 'academic term for department %, year % is locked/archived', dept, rec.academic_year;
  end if;

  return coalesce(new, old);
end $$;

create trigger student_classroom_enrollments_term_lock_check
  before insert or update or delete on student_classroom_enrollments
  for each row execute function check_classroom_enrollment_academic_term();

-- ------------------------------------------------------------- academic_events
-- ปฏิทินกิจกรรม/วันหยุด. students_attend/staff_attend are separate flags,
-- not one "is_school_day" bool — a teacher_workday is a non-school-day for
-- students but a working day for staff, which one flag can't represent.
-- No recurrence: Thai public holidays shift date every year (lunar-calendar
-- days, in-lieu days), so a "repeat annually" rule would just be wrong most
-- years — re-entering dates yearly is normal data entry, not tech debt.
create type academic_event_type as enum (
  'holiday', 'school_event', 'exam_period', 'teacher_workday', 'suspended'
);

create table academic_events (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  event_type      academic_event_type not null,
  start_date      date not null,
  end_date        date not null,
  students_attend boolean not null default true,
  staff_attend    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date)
);

create index academic_events_dates_idx on academic_events (start_date, end_date);
create trigger academic_events_touch before update on academic_events
  for each row execute function touch_updated_at();
create trigger academic_events_audit after insert or update or delete on academic_events
  for each row execute function log_audit();

-- Which departments an event applies to — no rows = whole school (the
-- common case: holidays, emergency closures need zero setup beyond the
-- event itself). A row = scoped to that one department.
create table academic_event_departments (
  event_id       uuid not null references academic_events on delete cascade,
  department_id  uuid not null references departments on delete restrict,
  primary key (event_id, department_id)
);

alter table academic_events enable row level security;
alter table academic_event_departments enable row level security;

-- Calendar data isn't sensitive — readable by anyone signed in, same shape
-- as departments/subjects.
create policy academic_events_read on academic_events
  for select to authenticated using (true);
create policy academic_event_departments_read on academic_event_departments
  for select to authenticated using (true);

-- ponytail: a dept_head can INSERT a bare academic_events row with zero
-- department links (WITH CHECK only requires can_manage() — there's nothing
-- to scope against yet, the row doesn't exist until this statement
-- commits). That row would then *read* as whole-school per the convention
-- above, even though only org-wide is supposed to create whole-school
-- events. The UI never exposes "leave department blank" to a dept_head, so
-- this needs a deliberate raw API call to hit — not hardened further here.
-- Upgrade path if it ever matters: an AFTER trigger requiring at least one
-- academic_event_departments row before the transaction commits.
--
-- UPDATE/DELETE on an existing row IS properly scoped: USING requires
-- either org-wide, or a matching link to the caller's own department.
create policy academic_events_write on academic_events
  for all to authenticated
  using (
    is_org_wide()
    or (
      can_manage()
      and exists (
        select 1 from academic_event_departments aed
        where aed.event_id = academic_events.id and aed.department_id = auth_department()
      )
    )
  )
  with check (is_org_wide() or can_manage());

create policy academic_event_departments_write on academic_event_departments
  for all to authenticated
  using (is_org_wide() or (can_manage() and department_id = auth_department()))
  with check (is_org_wide() or (can_manage() and department_id = auth_department()));
