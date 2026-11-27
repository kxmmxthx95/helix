-- ข้อสอบทั้งชุดในคำขอเดียว: the paper of one in-progress attempt (questions + choices, answer-safe).
-- Mass exam entry was slow because the student read exam_questions and exam_question_choices through
-- RLS, where can_read_exam_question() runs once per row: ~100 calls (20 questions + their choices) for
-- every student, each with several sub-queries, all at the same minute. This checks access ONCE (the
-- attempt is the caller's own, still in_progress) and returns the paper in one round trip. It carries
-- the same columns as exam_questions_for_attempt / exam_question_choices_for_attempt (0050, 0060): no
-- correct_answer, no is_correct. Only questions that belong to the attempt's session are returned,
-- even though question_order is written by the client.
-- Rollback: drop function exam_attempt_paper(uuid); the client falls back to the views.
create or replace function exam_attempt_paper(p_attempt_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
declare
  a exam_attempts;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบ';
  end if;

  select ea.* into a
  from exam_attempts ea
  where ea.id = p_attempt_id
    and ea.status = 'in_progress'
    and ea.student_id in (select id from students where profile_id = auth.uid());
  if a.id is null then
    raise exception 'ไม่พบการสอบที่กำลังทำ';
  end if;

  return jsonb_build_object(
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id, 'subject_id', q.subject_id, 'question_type', q.question_type,
          'prompt', q.prompt, 'points', q.points, 'prompt_json', q.prompt_json
        ) order by esq.position)
      from exam_session_questions esq
      join exam_questions q on q.id = esq.question_id
      where esq.session_id = a.session_id and q.id = any (a.question_order)
    ), '[]'::jsonb),
    'choices', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id, 'question_id', c.question_id, 'label', c.label,
          'position', c.position, 'label_json', c.label_json
        ) order by c.question_id, c.position)
      from exam_question_choices c
      where c.question_id = any (a.question_order)
        and exists (select 1 from exam_session_questions esq where esq.session_id = a.session_id and esq.question_id = c.question_id)
    ), '[]'::jsonb)
  );
end $$;

revoke all on function exam_attempt_paper(uuid) from public, anon;
grant execute on function exam_attempt_paper(uuid) to authenticated;
