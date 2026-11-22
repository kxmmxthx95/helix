-- แนวข้อสอบ: practice questions per exam room. Separate from exam_session_questions so max score, the approval
-- scope trigger (0181/0183) and "has questions" checks stay about real exam questions only.
create table exam_session_practice_questions (
  session_id   uuid not null references exam_sessions on delete cascade,
  question_id  uuid not null references exam_questions on delete restrict,
  position     int not null,
  primary key (session_id, question_id)
);
create index exam_session_practice_questions_session_idx on exam_session_practice_questions (session_id, position);

alter table exam_session_practice_questions enable row level security;
create policy exam_session_practice_questions_read on exam_session_practice_questions
  for select to authenticated using (can_read_exam_session(session_id));
create policy exam_session_practice_questions_write on exam_session_practice_questions
  for all to authenticated
  using (can_write_exam_session(session_id))
  with check (can_write_exam_session(session_id));

-- Practice questions must come from the room's topics, like real ones.
create trigger exam_session_practice_questions_topic_check before insert on exam_session_practice_questions
  for each row execute function check_exam_session_question_topic();

-- A question can't be both real and practice in one room: practising would reveal the real answer.
create or replace function check_exam_practice_overlap() returns trigger
  language plpgsql as $$
begin
  if exists (select 1 from exam_session_questions where session_id = new.session_id and question_id = new.question_id)
     or exists (select 1 from exam_session_practice_questions where session_id = new.session_id and question_id = new.question_id) then
    raise exception 'ข้อสอบข้อนี้อยู่ในห้องนี้แล้ว (ข้อสอบจริงกับแนวข้อสอบใช้ซ้ำกันไม่ได้)';
  end if;
  return new;
end $$;
create trigger exam_session_questions_practice_overlap before insert on exam_session_questions
  for each row execute function check_exam_practice_overlap();
create trigger exam_session_practice_questions_overlap before insert on exam_session_practice_questions
  for each row execute function check_exam_practice_overlap();

-- Practice check: no stored attempt. Returns whether the answer is right plus the key.
-- Gate: the question is a practice question of a room the caller may read.
create or replace function practice_check(p_session uuid, p_question uuid, p_choice uuid default null, p_text text default null)
  returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  q exam_questions;
  v_correct boolean;
begin
  if not can_read_exam_session(p_session)
     or not exists (select 1 from exam_session_practice_questions where session_id = p_session and question_id = p_question) then
    raise exception 'ไม่มีสิทธิ์ฝึกข้อสอบนี้';
  end if;
  select * into q from exam_questions where id = p_question;
  if q.question_type = 'short_answer' then
    v_correct := lower(trim(coalesce(p_text, ''))) = lower(trim(coalesce(q.correct_answer, '')));
    return jsonb_build_object('correct', v_correct, 'correct_answer', q.correct_answer, 'correct_choice_ids', '[]'::jsonb);
  end if;
  v_correct := exists (select 1 from exam_question_choices c where c.id = p_choice and c.question_id = p_question and c.is_correct);
  return jsonb_build_object(
    'correct', v_correct,
    'correct_answer', null,
    'correct_choice_ids', coalesce((select jsonb_agg(c.id) from exam_question_choices c where c.question_id = p_question and c.is_correct), '[]'::jsonb)
  );
end $$;
revoke all on function practice_check(uuid, uuid, uuid, text) from public, anon;
grant execute on function practice_check(uuid, uuid, uuid, text) to authenticated;
