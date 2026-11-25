-- ดูข้อสอบที่ตัวเองทำแล้ว: เฉลยของ attempt ที่ส่งแล้ว.
-- The *_for_attempt views never carry is_correct / correct_answer, so after the teacher turns on
-- review_released a student saw ✓/✗ per question but not which choice was right. This returns the key
-- for ONE submitted attempt, and only to its own student or a guardian of that student, and only while
-- the session has review_released on. Nothing else is opened: question text still comes through
-- can_read_exam_question (review_released path, 0047); the bank tables stay closed to students.
create or replace function exam_review_key(p_attempt uuid) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
declare
  ea exam_attempts;
begin
  select * into ea from exam_attempts where id = p_attempt;
  if ea.id is null
     or ea.status <> 'submitted'
     or not exists (select 1 from exam_sessions es where es.id = ea.session_id and es.review_released)
     or not (
       ea.student_id in (select id from students where profile_id = auth.uid())
       or ea.student_id in (select student_id from guardianships where parent_id = auth.uid())
     ) then
    raise exception 'ไม่มีสิทธิ์ดูเฉลย';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'question_id', q.id,
      'correct_answer', q.correct_answer,
      'correct_choice_ids', coalesce(
        (select jsonb_agg(c.id) from exam_question_choices c where c.question_id = q.id and c.is_correct),
        '[]'::jsonb)
    ))
    from exam_questions q
    where q.id = any (ea.question_order)
  ), '[]'::jsonb);
end $$;

revoke all on function exam_review_key(uuid) from public, anon;
grant execute on function exam_review_key(uuid) to authenticated;
