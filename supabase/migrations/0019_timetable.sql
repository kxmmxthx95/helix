-- Timetable: period time slots (period_definitions) + actual weekly
-- schedule placement (schedule_entries) for teaching_assignments (0017).
-- day_of_week is 1(Mon)..6(Sat) — no Thai school runs Sunday classes.

-- ------------------------------------------------------------ period_definitions
-- Per-department, per-day period grid — Mon/Wed/Fri commonly differ in real
-- Thai private schools (แถวเช้าวันจันทร์ยาวกว่า, พุธบ่ายลูกเสือ, ศุกร์กิจกรรมท้ายวัน),
-- so day_of_week is part of the row rather than one shared grid (grill
-- decision). period_type distinguishes teaching slots from break/แถว/lunch
-- slots that still need a row (for display) but must never accept a
-- schedule_entries booking.
create table period_definitions (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments on delete restrict,
  day_of_week   smallint not null check (day_of_week between 1 and 6),
  period_no     smallint not null check (period_no > 0),
  period_type   text not null check (period_type in ('teaching', 'break')),
  label         text not null,
  start_time    time not null,
  end_time      time not null,
  check (end_time > start_time),
  unique (department_id, day_of_week, period_no)
);

create index period_definitions_dept_idx on period_definitions (department_id);

alter table period_definitions enable row level security;

-- Same shape as department_settings (0002): read own department, write
-- can_manage() scoped to own department — this is department operational
-- config, not school-wide reference data.
create policy period_definitions_read on period_definitions
  for select to authenticated
  using (is_org_wide() or department_id = auth_department());

create policy period_definitions_write on period_definitions
  for all to authenticated
  using (can_manage() and (is_org_wide() or department_id = auth_department()))
  with check (can_manage() and (is_org_wide() or department_id = auth_department()));

-- ---------------------------------------------------------- teaching_assignments
-- group_id tags rows that intentionally overlap at the same schedule slot:
-- เรียนรวม (one teacher, same subject, multiple classrooms at once) or
-- แบ่งคาบ (one classroom split into elective groups at once). No FK — it's
-- just a shared value the schedule_entries conflict check treats as "not a
-- real conflict" (grill decision).
alter table teaching_assignments add column group_id uuid;
create index teaching_assignments_group_idx on teaching_assignments (group_id) where group_id is not null;

-- ------------------------------------------------------------- schedule_entries
-- Weekly recurring template (no specific dates — holidays/suspensions are
-- academic_events' job, 0018) placing a teaching_assignment into a
-- day+period slot. periods_per_week is NOT enforced to match the count of
-- rows here — UI warns, doesn't block (grill decision: schools build
-- schedules incrementally).
create table schedule_entries (
  id                      uuid primary key default gen_random_uuid(),
  teaching_assignment_id  uuid not null references teaching_assignments on delete cascade,
  day_of_week             smallint not null check (day_of_week between 1 and 6),
  period_no               smallint not null check (period_no > 0),
  created_at              timestamptz not null default now(),
  unique (teaching_assignment_id, day_of_week, period_no)
);

create index schedule_entries_assignment_idx on schedule_entries (teaching_assignment_id);
create index schedule_entries_day_period_idx on schedule_entries (day_of_week, period_no);

-- Single trigger, three checks (same combined-function style as
-- check_teaching_assignment_department, 0017):
--  1. period_no must be a real 'teaching' row in period_definitions for the
--     assignment's department+day — blocks booking into lunch/แถว/break.
--  2. Conflict: same teacher OR same classroom already booked at the same
--     day+period for the same academic_year+term — UNLESS both rows share a
--     non-null group_id (เรียนรวม/แบ่งคาบ, intentional, not a conflict).
--  3. Term lock: mirrors check_teaching_assignment_academic_term (0018) —
--     blocks insert/update/delete once the underlying academic_terms row is
--     locked/archived, skip-if-missing only applies to delete.
-- Checks 1-2 only make sense for insert/update; check 3 runs on delete too.
create or replace function check_schedule_entry() returns trigger
  language plpgsql as $$
declare
  rec              schedule_entries;
  v_teacher_id     uuid;
  v_classroom_id   uuid;
  v_group_id       uuid;
  v_academic_year  int;
  v_term           int;
  v_dept           uuid;
  v_period_type    text;
  total_count      int;
  locked_count     int;
  conflict_id      uuid;
begin
  rec := coalesce(new, old);

  select ta.teacher_id, ta.classroom_id, ta.group_id, ta.academic_year, ta.term
    into v_teacher_id, v_classroom_id, v_group_id, v_academic_year, v_term
    from teaching_assignments ta where ta.id = rec.teaching_assignment_id;

  select gl.department_id into v_dept
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where c.id = v_classroom_id;

  if tg_op in ('INSERT', 'UPDATE') then
    select period_type into v_period_type
      from period_definitions
      where department_id = v_dept and day_of_week = rec.day_of_week and period_no = rec.period_no;

    if v_period_type is null then
      raise exception 'no period_definitions row for department %, day %, period %', v_dept, rec.day_of_week, rec.period_no;
    elsif v_period_type <> 'teaching' then
      raise exception 'period % on day % is a % period, not teaching', rec.period_no, rec.day_of_week, v_period_type;
    end if;

    select se.id into conflict_id
      from schedule_entries se
      join teaching_assignments ta2 on ta2.id = se.teaching_assignment_id
      where se.id <> new.id
        and se.day_of_week = rec.day_of_week
        and se.period_no = rec.period_no
        and ta2.academic_year = v_academic_year
        and ta2.term is not distinct from v_term
        and (ta2.teacher_id = v_teacher_id or ta2.classroom_id = v_classroom_id)
        and not (v_group_id is not null and ta2.group_id = v_group_id)
      limit 1;

    if conflict_id is not null then
      raise exception 'schedule conflict: teacher or classroom already booked on day %, period %', rec.day_of_week, rec.period_no;
    end if;
  end if;

  select count(*), count(*) filter (where status in ('locked', 'archived'))
    into total_count, locked_count
    from academic_terms
    where department_id = v_dept and academic_year = v_academic_year
      and (v_term is null or term_type = (case v_term when 1 then 'term1' else 'term2' end)::term_type);

  if tg_op <> 'DELETE' and total_count = 0 then
    raise exception 'no academic_terms row for department %, year % — set up the academic term first', v_dept, v_academic_year;
  end if;
  if locked_count > 0 then
    raise exception 'academic term for department %, year % is locked/archived', v_dept, v_academic_year;
  end if;

  return coalesce(new, old);
end $$;

create trigger schedule_entries_check
  before insert or update or delete on schedule_entries
  for each row execute function check_schedule_entry();

-- Sensitive — the live timetable, same audit rationale as teaching_assignments.
create trigger schedule_entries_audit
  after insert or update or delete on schedule_entries
  for each row execute function log_audit();

alter table schedule_entries enable row level security;

-- Same shape as teaching_assignments_read/write (0017), joined one level
-- further through teaching_assignment_id.
create policy schedule_entries_read on schedule_entries
  for select to authenticated using (
    is_org_wide()
    or teaching_assignment_id in (
      select ta.id from teaching_assignments ta
      join classrooms c on c.id = ta.classroom_id
      join grade_levels gl on gl.id = c.grade_level_id
      where gl.department_id = auth_department()
    )
  );

create policy schedule_entries_write on schedule_entries
  for all to authenticated
  using (
    can_manage() and (
      is_org_wide()
      or teaching_assignment_id in (
        select ta.id from teaching_assignments ta
        join classrooms c on c.id = ta.classroom_id
        join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    )
  )
  with check (
    can_manage() and (
      is_org_wide()
      or teaching_assignment_id in (
        select ta.id from teaching_assignments ta
        join classrooms c on c.id = ta.classroom_id
        join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    )
  );
