-- ผังการเรียน: free-standing content plan, วิชา -> ระดับชั้น -> บทเรียน -> หัวข้อ.
-- Deliberately independent of subjects, curriculum_subjects, teaching_assignments
-- and doc_* (grill decision, 2026-10-18).
--
-- Read:  non-student/parent staff of the same department (org-wide sees all).
-- Write: can_manage_academic() within the department.

create table plan_subjects (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments on delete cascade,
  name          text not null check (char_length(name) between 1 and 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (department_id, name)
);

create table plan_lessons (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null references plan_subjects on delete cascade,
  grade_level_id uuid not null references grade_levels on delete cascade,
  name           text not null check (char_length(name) between 1 and 200),
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index plan_lessons_scope_idx on plan_lessons (subject_id, grade_level_id, sort_order);

create table plan_topics (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references plan_lessons on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index plan_topics_lesson_idx on plan_topics (lesson_id, sort_order);

create trigger plan_subjects_touch before update on plan_subjects
  for each row execute function touch_updated_at();
create trigger plan_lessons_touch before update on plan_lessons
  for each row execute function touch_updated_at();
create trigger plan_topics_touch before update on plan_topics
  for each row execute function touch_updated_at();

create or replace function can_read_plan() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid()
      and role in ('super_admin', 'director', 'staff', 'dept_director', 'dept_head', 'teacher')
  )
$$;

-- department scope for a plan_subjects row, shared by every policy below.
create or replace function plan_in_scope(p_department_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select is_org_wide() or p_department_id = auth_department()
$$;

alter table plan_subjects enable row level security;
alter table plan_lessons enable row level security;
alter table plan_topics enable row level security;

create policy plan_subjects_read on plan_subjects
  for select to authenticated using (can_read_plan() and plan_in_scope(department_id));
create policy plan_subjects_write on plan_subjects
  for all to authenticated
  using (can_manage_academic() and plan_in_scope(department_id))
  with check (can_manage_academic() and plan_in_scope(department_id));

-- lessons/topics inherit the scope of their subject (subqueries run under the
-- caller's RLS, so plan_subjects_read already limits them).
create policy plan_lessons_read on plan_lessons
  for select to authenticated using (subject_id in (select id from plan_subjects));
create policy plan_lessons_write on plan_lessons
  for all to authenticated
  using (can_manage_academic() and subject_id in (select id from plan_subjects))
  with check (can_manage_academic() and subject_id in (select id from plan_subjects));

create policy plan_topics_read on plan_topics
  for select to authenticated using (lesson_id in (select id from plan_lessons));
create policy plan_topics_write on plan_topics
  for all to authenticated
  using (can_manage_academic() and lesson_id in (select id from plan_lessons))
  with check (can_manage_academic() and lesson_id in (select id from plan_lessons));
