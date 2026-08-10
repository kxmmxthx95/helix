-- แผนการสอน: teacher breaks a teaching_assignment's content into sequential
-- units (สัปดาห์ที่ 1-20 / คาบที่ 1-40 — teacher picks the granularity, no
-- fixed count enforced). "Current unit" for a given session is derived, not
-- stored: the lowest unit_no with completed_at still null — a queue, not a
-- calendar/date mapping, so holidays/absences never desync it (grill
-- decision). completed_on_plan records whether the teacher actually covered
-- it as planned that day.

create table teaching_plan_units (
  id                     uuid primary key default gen_random_uuid(),
  teaching_assignment_id uuid not null references teaching_assignments on delete cascade,
  unit_no                int not null check (unit_no > 0),
  title                  text not null,
  description            text,
  completed_at           timestamptz,
  completed_on_plan      boolean,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (teaching_assignment_id, unit_no),
  check ((completed_at is null) = (completed_on_plan is null))
);

create index teaching_plan_units_assignment_idx on teaching_plan_units (teaching_assignment_id);

create trigger teaching_plan_units_touch before update on teaching_plan_units
  for each row execute function touch_updated_at();

-- Not sensitive the way grades/timetable are — a teacher's own lesson
-- breakdown, no audit trigger (same tier as subjects/learning_areas).

-- is_org_wide()/can_manage() (0001) include staff (ธุรการ) — right for
-- roster/timetable admin, wrong here: lesson content isn't something a
-- registrar needs to read or edit. Academic-only variants, scoped to this
-- feature (grill decision).
create or replace function is_org_wide_academic() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid() and role in ('super_admin', 'director')
  )
$$;

create or replace function can_manage_academic() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid() and role in ('super_admin', 'director', 'dept_head')
  )
$$;

-- Marking a unit taught (completed_at/completed_on_plan) is the teacher's
-- own attestation of what happened in their classroom — even a dept_head
-- with can_manage_academic() write access below may edit unit content but
-- must not check the box on a teacher's behalf (grill decision). RLS can't
-- express a column-level split, so this is a trigger, not a second policy.
create or replace function check_teaching_plan_unit_mark_taught() returns trigger
  language plpgsql as $$
declare
  v_teacher_id uuid;
begin
  if new.completed_at is distinct from old.completed_at
     or new.completed_on_plan is distinct from old.completed_on_plan then
    select teacher_id into v_teacher_id from teaching_assignments where id = new.teaching_assignment_id;
    if v_teacher_id is distinct from auth.uid() then
      raise exception 'only the assigned teacher may mark a plan unit taught';
    end if;
  end if;
  return new;
end $$;

create trigger teaching_plan_units_mark_taught_check
  before update on teaching_plan_units
  for each row execute function check_teaching_plan_unit_mark_taught();

alter table teaching_plan_units enable row level security;

-- read: org-wide (minus staff) + whole department, same shape as
-- teaching_assignments_read otherwise — a lesson plan isn't sensitive the
-- way a grade is, so the department-match branch still isn't role-filtered
-- (a student/parent whose department_id matches can read it too, same as
-- the timetable — grill decision).
create policy teaching_plan_units_read on teaching_plan_units
  for select to authenticated using (
    is_org_wide_academic()
    or teaching_assignment_id in (
      select ta.id from teaching_assignments ta
      join classrooms c on c.id = ta.classroom_id
      join grade_levels gl on gl.id = c.grade_level_id
      where gl.department_id = auth_department()
    )
  );

-- write: the assigned teacher themselves, or can_manage_academic() scoped to
-- the assignment's department — a teacher plans their own lessons without
-- waiting on a dept_head, same carve-out shape used nowhere else yet but
-- necessary here since teaching_assignments_write is can_manage()-only.
create policy teaching_plan_units_write on teaching_plan_units
  for all to authenticated
  using (
    teaching_assignment_id in (select id from teaching_assignments where teacher_id = auth.uid())
    or (
      can_manage_academic() and teaching_assignment_id in (
        select ta.id from teaching_assignments ta
        join classrooms c on c.id = ta.classroom_id
        join grade_levels gl on gl.id = c.grade_level_id
        where is_org_wide_academic() or gl.department_id = auth_department()
      )
    )
  )
  with check (
    teaching_assignment_id in (select id from teaching_assignments where teacher_id = auth.uid())
    or (
      can_manage_academic() and teaching_assignment_id in (
        select ta.id from teaching_assignments ta
        join classrooms c on c.id = ta.classroom_id
        join grade_levels gl on gl.id = c.grade_level_id
        where is_org_wide_academic() or gl.department_id = auth_department()
      )
    )
  );
