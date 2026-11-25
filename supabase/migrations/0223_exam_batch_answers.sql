-- Exam answers are kept on the student's device and synced in batches (save_exam_answers, ~every minute) and
-- once more with the final submit, instead of one write per tap (answer saves averaged ~4s under a full-room load).
-- Same checks as the per-row policy: own attempt, still in_progress, this browser session holds it (strict mode).
-- Trust boundary: only questions in the attempt's own question_order are written, a choice must belong to its
-- question (otherwise stored as unanswered), short answers are capped.
-- Rollback: drop save_exam_answers, drop the 2-arg submit_exam_attempt and recreate the 1-arg body from 0132.

create or replace function _write_exam_answers(p_attempt_id uuid, p_answers jsonb) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_order uuid[];
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then return; end if;
  select question_order into v_order from exam_attempts where id = p_attempt_id;
  insert into exam_attempt_answers (attempt_id, question_id, choice_id, short_answer, answered_at)
  select p_attempt_id, a.question_id, c.id, left(a.short_answer, 2000), now()
  from jsonb_to_recordset(p_answers) as a(question_id uuid, choice_id uuid, short_answer text)
  left join exam_question_choices c on c.id = a.choice_id and c.question_id = a.question_id
  where a.question_id = any (v_order)
  on conflict (attempt_id, question_id) do update
    set choice_id = excluded.choice_id, short_answer = excluded.short_answer, answered_at = excluded.answered_at;
end $$;
revoke all on function _write_exam_answers(uuid, jsonb) from public, authenticated, anon;

create or replace function _check_exam_attempt_writable(p_attempt_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from exam_attempts where id = p_attempt_id
      and student_id in (select id from students where profile_id = auth.uid())
      and status = 'in_progress'
  ) then
    raise exception 'attempt not found, not yours, or already submitted';
  end if;
  if not exam_attempt_held(p_attempt_id) then
    raise exception 'การสอบนี้กำลังใช้งานในอุปกรณ์อื่น';
  end if;
end $$;
revoke all on function _check_exam_attempt_writable(uuid) from public, authenticated, anon;

create or replace function save_exam_answers(p_attempt_id uuid, p_answers jsonb) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform _check_exam_attempt_writable(p_attempt_id);
  perform _write_exam_answers(p_attempt_id, p_answers);
end $$;

-- Replaces the 1-arg version (a second overload would make a 1-arg call ambiguous).
drop function submit_exam_attempt(uuid);
create or replace function submit_exam_attempt(p_attempt_id uuid, p_answers jsonb default null) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform _check_exam_attempt_writable(p_attempt_id);
  perform _write_exam_answers(p_attempt_id, p_answers);
  update exam_attempts set status = 'submitted', submitted_at = now() where id = p_attempt_id;
  perform grade_exam_attempt(p_attempt_id);
end $$;

grant execute on function save_exam_answers(uuid, jsonb) to authenticated;
grant execute on function submit_exam_attempt(uuid, jsonb) to authenticated;
