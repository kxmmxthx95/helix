-- Room metadata the table shows as columns (previously only baked into the title) + an on/off switch.
-- is_enabled gates students: can_read_exam_session (also behind exam_attempts_insert) requires it.
-- Existing rooms stay on; the app creates new ones off until the teacher flips the switch.
alter table exam_sessions
  add column exam_type text,
  add column round int check (round is null or round > 0),
  add column is_enabled boolean not null default true;

-- Rooms made before this carry type/round only in the generated title.
update exam_sessions
set exam_type = substring(title from '^(สอบกลางภาค|สอบปลายภาค|สอบย่อย|สอบเก็บคะแนน)'),
    round = nullif(substring(title from 'ครั้งที่ ([0-9]+)'), '')::int
where exam_type is null;

-- 0183 body + the is_enabled gate on the student/parent branch.
create or replace function can_read_exam_session(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_exam_session(p_id) or exists (
    select 1 from exam_sessions es
    join exam_topic_sets ts on ts.id = es.topic_set_id and ts.approval_status = 'approved'
    join exam_session_targets est on est.session_id = es.id
    join teaching_assignments ta on ta.id = est.teaching_assignment_id
    join student_classroom_enrollments sce
      on sce.classroom_id = ta.classroom_id and sce.academic_year = ta.academic_year
    join students s on s.id = sce.student_id
    where es.id = p_id
      and es.is_enabled
      and (
        s.profile_id = auth.uid()
        or s.id in (select student_id from guardianships where parent_id = auth.uid())
      )
  )
$$;
