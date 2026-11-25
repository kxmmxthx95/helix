-- Verifies 0216 against a real project; every write rolls back. NOT run in CI —
-- execute manually after applying 0216 (needs a student with a login, one exam session, one exam question).
begin;
do $$
declare
  v_student uuid; v_owner uuid; v_other uuid; v_session uuid; v_q uuid; v_att uuid;
  v_key jsonb;

begin
  select id, profile_id into strict v_student, v_owner from students where profile_id is not null limit 1;
  select id into strict v_other from profiles where id <> v_owner limit 1;
  select id into strict v_session from exam_sessions limit 1;
  select id into strict v_q from exam_questions limit 1;

  insert into exam_attempts (session_id, student_id, attempt_no, status, question_order, submitted_at)
    values (v_session, v_student, 99, 'in_progress', array[v_q], null) returning id into v_att;
  update exam_sessions set review_released = true where id = v_session;

  -- 1) owner, released, but still in progress -> refused
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  begin
    perform exam_review_key(v_att);
    raise exception 'key returned for an in-progress attempt';
  exception when raise_exception then
    if sqlerrm like 'key returned%' then raise; end if;
  end;

  -- 2) submitted + released + owner -> key for the attempt's questions
  update exam_attempts set status = 'submitted', submitted_at = now() where id = v_att;
  v_key := exam_review_key(v_att);
  if jsonb_array_length(v_key) <> 1 then raise exception 'expected 1 key row, got %', v_key; end if;

  -- 3) someone else -> refused
  perform set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  begin
    perform exam_review_key(v_att);
    raise exception 'key returned to an unrelated user';
  exception when raise_exception then
    if sqlerrm like 'key returned%' then raise; end if;
  end;

  -- 4) owner, review not released -> refused
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  update exam_sessions set review_released = false where id = v_session;
  begin
    perform exam_review_key(v_att);
    raise exception 'key returned before review was released';
  exception when raise_exception then
    if sqlerrm like 'key returned%' then raise; end if;
  end;
end $$;
rollback;
