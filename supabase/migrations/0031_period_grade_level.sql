-- period_definitions can now optionally override the department-wide grid
-- per grade level (ม.ต้น/ม.ปลาย often ring the bell at different times).
-- grade_level_id null = department default (unchanged behavior); a row with
-- grade_level_id set only applies to that grade and wins over the default
-- row at the same day+period_no. No backfill needed — every existing row
-- stays a department-default row (grill decision, 2026-08-13).

alter table period_definitions
  add column grade_level_id uuid references grade_levels on delete cascade;

-- grade_level_id (when set) must belong to department_id — same shape as
-- check_cohort_department() (0005/0006).
create or replace function check_period_definition_grade_department() returns trigger
  language plpgsql as $$
declare
  grade_dept uuid;
begin
  if new.grade_level_id is null then
    return new;
  end if;
  select department_id into grade_dept from grade_levels where id = new.grade_level_id;
  if grade_dept is distinct from new.department_id then
    raise exception 'grade_level_id must belong to department_id';
  end if;
  return new;
end $$;

create trigger period_definitions_grade_department_check before insert or update on period_definitions
  for each row execute function check_period_definition_grade_department();

-- Replace the single (department_id, day_of_week, period_no) unique
-- constraint with two partial ones — same "_nn/_yy" shape as
-- curriculum_subjects (0005) — so a grade override can share a slot with
-- (or without) a default row.
alter table period_definitions drop constraint period_definitions_department_id_day_of_week_period_no_key;

create unique index period_definitions_unique_default on period_definitions
  (department_id, day_of_week, period_no) where grade_level_id is null;
create unique index period_definitions_unique_grade on period_definitions
  (department_id, grade_level_id, day_of_week, period_no) where grade_level_id is not null;

-- check_schedule_entry() (0019): resolve the classroom's grade level and
-- prefer a grade-specific period_definitions row over the department
-- default at the same day+period_no.
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
