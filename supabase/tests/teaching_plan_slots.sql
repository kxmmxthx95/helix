-- Verifies 0142 against a real project; every write rolls back. NOT run in CI —
-- execute manually after applying 0142 (needs one assignment with a schedule_entries row whose subject/grade has a matching ผังการเรียน topic).
begin;
do $$
declare
  a uuid; t uuid; dow int; per int; d date; s uuid; n int;
begin
  select se.teaching_assignment_id, se.day_of_week, se.period_no, pt.id
    into strict a, dow, per, t
    from schedule_entries se
    join teaching_assignments ta on ta.id = se.teaching_assignment_id
    join subjects s on s.id = ta.subject_id
    join classrooms c on c.id = ta.classroom_id
    join grade_levels gl on gl.id = c.grade_level_id
    join plan_subjects ps on ps.department_id = gl.department_id and btrim(ps.name) = btrim(s.name_th)
    join plan_lessons pl on pl.subject_id = ps.id and pl.grade_level_id = gl.id
    join plan_topics pt on pt.lesson_id = pl.id
    limit 1;
  d := date '2030-01-07' + (dow - 1); -- a Monday + (dow-1)

  insert into teaching_plan_slots (teaching_assignment_id, slot_date, period_no, topic_id)
    values (a, d, per, t) returning id into s;

  begin
    insert into teaching_plan_slots (teaching_assignment_id, slot_date, period_no) values (a, d + 1, per);
    raise exception 'slot off the weekly schedule was accepted';
  exception when raise_exception then
    if sqlerrm like 'slot off%' then raise; end if;
  end;

  begin
    update teaching_plan_slots set topic_id = (select id from plan_topics where id <> t limit 1) where id = s;
    raise exception 'foreign-subject topic accepted';
  exception when raise_exception then
    if sqlerrm like 'foreign%' then raise; end if;
  end;

  update teaching_plan_slots set completed_at = now(), completed_on_plan = true where id = s;
  begin
    delete from teaching_plan_slots where id = s;
    raise exception 'taught slot deleted without reopen';
  exception when raise_exception then
    if sqlerrm like 'taught slot%' then raise; end if;
  end;
  update teaching_plan_slots set completed_at = null, completed_on_plan = null where id = s;
  delete from teaching_plan_slots where id = s;
  select count(*) into n from teaching_plan_slots where id = s;
  if n <> 0 then raise exception 'slot not deleted after reopen'; end if;
end $$;
rollback;
