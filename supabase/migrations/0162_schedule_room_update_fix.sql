-- Setting a room on one of two co-teachers (same classroom + slot, only one row tagged with group_id)
-- failed: every UPDATE re-ran the teacher/classroom clash check, which the untagged row can never pass.
-- check_schedule_entry (0161): teacher/classroom/period checks now run only when the entry is inserted or
-- moved; room checks run on every write, and two rows of the same classroom may share a room.
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
  v_moved          boolean;
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

  -- A pure room change (same assignment, day, period) cannot create a new teacher/classroom clash,
  -- and rows that already coexist (e.g. two co-teachers, only one tagged with group_id) must stay editable.
  v_moved := tg_op = 'INSERT' or old.teaching_assignment_id <> new.teaching_assignment_id
             or old.day_of_week <> new.day_of_week or old.period_no <> new.period_no;

  if tg_op in ('INSERT', 'UPDATE') and v_moved then
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

  if tg_op in ('INSERT', 'UPDATE') then
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
          and ta2.classroom_id <> v_classroom_id -- same students sharing a room (co-teaching) is not a double booking
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
