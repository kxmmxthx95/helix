-- Physical rooms (ห้อง 305, ห้องแล็บ) a schedule entry can be held in —
-- distinct from `classrooms` (ม.1/1, a group of students).
-- Per-department master data, same RLS shape as period_definitions (0019).
-- Soft delete via is_active: past entries may still reference a retired room.
create table rooms (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments on delete restrict,
  name          text not null check (length(btrim(name)) > 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (department_id, name)
);

create index rooms_department_idx on rooms (department_id);

alter table rooms enable row level security;

create policy rooms_read on rooms
  for select to authenticated
  using (is_org_wide() or department_id = auth_department());

create policy rooms_write on rooms
  for all to authenticated
  using (can_manage() and (is_org_wide() or department_id = auth_department()))
  with check (can_manage() and (is_org_wide() or department_id = auth_department()));

-- Optional: legacy entries and incremental scheduling leave it null, and a
-- null room never conflicts.
alter table schedule_entries add column room_id uuid references rooms on delete restrict;
create index schedule_entries_room_idx on schedule_entries (room_id) where room_id is not null;

-- check_schedule_entry (0031) + room checks: the room must belong to the
-- assignment's department, and may not be double-booked at the same
-- day+period+year+term unless both rows share a group_id (เรียนรวม/แบ่งคาบ).
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
  v_grade          uuid;
  v_period_type    text;
  v_room_dept      uuid;
  total_count      int;
  locked_count     int;
  conflict_id      uuid;
begin
  rec := coalesce(new, old);

  select ta.teacher_id, ta.classroom_id, ta.group_id, ta.academic_year, ta.term
    into v_teacher_id, v_classroom_id, v_group_id, v_academic_year, v_term
    from teaching_assignments ta where ta.id = rec.teaching_assignment_id;

  select c.grade_level_id, gl.department_id into v_grade, v_dept
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where c.id = v_classroom_id;

  if tg_op in ('INSERT', 'UPDATE') then
    select period_type into v_period_type
      from period_definitions
      where department_id = v_dept and day_of_week = rec.day_of_week and period_no = rec.period_no
        and (grade_level_id = v_grade or grade_level_id is null)
      order by grade_level_id nulls last
      limit 1;

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

    if rec.room_id is not null then
      select department_id into v_room_dept from rooms where id = rec.room_id;
      if v_room_dept is distinct from v_dept then
        raise exception 'room % belongs to a different department than the assignment', rec.room_id;
      end if;

      select se.id into conflict_id
        from schedule_entries se
        join teaching_assignments ta2 on ta2.id = se.teaching_assignment_id
        where se.id <> new.id
          and se.room_id = rec.room_id
          and se.day_of_week = rec.day_of_week
          and se.period_no = rec.period_no
          and ta2.academic_year = v_academic_year
          and ta2.term is not distinct from v_term
          and not (v_group_id is not null and ta2.group_id = v_group_id)
        limit 1;

      if conflict_id is not null then
        raise exception 'room conflict: room already booked on day %, period %', rec.day_of_week, rec.period_no;
      end if;
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
