-- 0164 matched ผังการเรียน subject by exact name, but the client (usePlanTopics) offers
-- topics by name prefix ("ฟิสิกส์เพิ่มเติม" ~ ผัง "ฟิสิกส์"), so those placements were
-- rejected. Match by prefix here too.

create or replace function check_teaching_plan_slot_topic() returns trigger
  language plpgsql as $$
declare
  rec          teaching_plan_slot_topics;
  s            teaching_plan_slots;
  v_subject_id uuid;
  v_grade      uuid;
  v_dept       uuid;
begin
  rec := coalesce(new, old);
  select * into s from teaching_plan_slots where id = rec.slot_id;
  if not found then return coalesce(new, old); end if; -- slot cascade-deleting

  if s.completed_at is not null then
    raise exception 'reopen the taught slot before changing its topics';
  end if;

  if tg_op <> 'DELETE' then
    select ta.subject_id, gl.id, gl.department_id into v_subject_id, v_grade, v_dept
      from teaching_assignments ta
      join classrooms c on c.id = ta.classroom_id
      join grade_levels gl on gl.id = c.grade_level_id
      where ta.id = s.teaching_assignment_id;
    if not exists (
      select 1 from plan_topics pt
        join plan_lessons pl on pl.id = pt.lesson_id
        join plan_subjects ps on ps.id = pl.subject_id
        join subjects sj on sj.id = v_subject_id
      where pt.id = rec.topic_id
        and pl.grade_level_id = v_grade
        and ps.department_id = v_dept
        and starts_with(btrim(sj.name_th), btrim(ps.name))
    ) then
      raise exception 'topic is not in the ผังการเรียน of the assignment''s subject and grade';
    end if;
  end if;

  -- Touch the slot so its trigger enforces the locked/archived-term freeze.
  update teaching_plan_slots set updated_at = now() where id = rec.slot_id;
  return coalesce(new, old);
end $$;
