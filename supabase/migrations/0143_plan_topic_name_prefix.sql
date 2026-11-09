-- Subject names carry suffixes (พื้นฐาน/เพิ่มเติม); match ผังการเรียน by name prefix.
create or replace function check_teaching_plan_slot() returns trigger
  language plpgsql as $$
declare
  rec            teaching_plan_slots;
  v_subject_id   uuid;
  v_classroom_id uuid;
  v_grade        uuid;
  v_year         int;
  v_term         int;
  v_dept         uuid;
  locked_count   int;
begin
  rec := coalesce(new, old);

  select ta.subject_id, ta.classroom_id, ta.academic_year, ta.term
    into v_subject_id, v_classroom_id, v_year, v_term
    from teaching_assignments ta where ta.id = rec.teaching_assignment_id;
  select gl.department_id, gl.id into v_dept, v_grade
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where c.id = v_classroom_id;

  if tg_op <> 'DELETE' then
    if not exists (
      select 1 from schedule_entries se
      where se.teaching_assignment_id = rec.teaching_assignment_id
        and se.period_no = rec.period_no
        and se.day_of_week = extract(isodow from rec.slot_date)::int
    ) then
      raise exception 'no schedule_entries period for assignment on % period %', rec.slot_date, rec.period_no;
    end if;
    -- ผังการเรียน is independent of subjects (0088): match by name prefix within the
    -- department ("คณิตศาสตร์พื้นฐาน" ~ "คณิตศาสตร์"), lessons of the classroom's grade level.
    if rec.topic_id is not null and not exists (
      select 1 from plan_topics pt
        join plan_lessons pl on pl.id = pt.lesson_id
        join plan_subjects ps on ps.id = pl.subject_id
        join subjects s on s.id = v_subject_id
      where pt.id = rec.topic_id
        and pl.grade_level_id = v_grade
        and ps.department_id = v_dept
        and btrim(s.name_th) like ps.name || '%'
    ) then
      raise exception 'topic is not in the ผังการเรียน of the assignment''s subject and grade';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.completed_at is not null and new.completed_at is not null
     and new.topic_id is distinct from old.topic_id then
    raise exception 'reopen the taught slot before changing its topic';
  end if;
  -- v_subject_id null = the assignment itself is being cascade-deleted: let it through.
  if tg_op = 'DELETE' and old.completed_at is not null and v_subject_id is not null then
    raise exception 'reopen the taught slot before deleting it';
  end if;

  select count(*) filter (where status in ('locked', 'archived')) into locked_count
    from academic_terms
    where department_id = v_dept and academic_year = v_year
      and (v_term is null or term_type = (case v_term when 1 then 'term1' else 'term2' end)::term_type);
  if locked_count > 0 then
    raise exception 'academic term for department %, year % is locked/archived', v_dept, v_year;
  end if;

  return coalesce(new, old);
end $$;
