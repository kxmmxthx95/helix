-- Verifies 0181 against a real project; every write rolls back. NOT run in CI —
-- execute manually after applying 0181 (needs a subject with a fitting plan topic and any profile).
begin;
do $$
declare
  v_subject uuid; v_topic uuid; v_user uuid; v_s uuid;
begin
  select sj.id, pt.id into strict v_subject, v_topic
    from plan_topics pt join subjects sj on plan_topic_fits_subject(pt.id, sj.id) limit 1;
  select id into strict v_user from profiles limit 1;

  -- a forged 'approved' on insert is reset to draft
  insert into exam_sessions (subject_id, teacher_id, title, opens_at, closes_at, approval_status)
    values (v_subject, v_user, 't', now(), now() + interval '1 day', 'approved') returning id into v_s;
  if (select approval_status from exam_sessions where id = v_s) <> 'draft' then
    raise exception 'insert kept a forged approval_status';
  end if;

  -- direct status change is refused
  begin
    update exam_sessions set approval_status = 'approved' where id = v_s;
    raise exception 'direct approval_status update was accepted';
  exception when raise_exception then
    if sqlerrm like 'direct%' then raise; end if;
  end;

  -- topic must fit the subject
  begin
    insert into exam_session_topics (session_id, topic_id)
      select v_s, pt.id from plan_topics pt where not plan_topic_fits_subject(pt.id, v_subject) limit 1;
    if found then raise exception 'topic from another subject was accepted'; end if;
  exception when raise_exception then
    if sqlerrm like 'topic from%' then raise; end if;
  end;

  -- edit after approval (no attempts) sends it back to pending
  insert into exam_session_topics (session_id, topic_id) values (v_s, v_topic);
  perform _exam_approval_bypass(true);
  update exam_sessions set approval_status = 'approved' where id = v_s;
  perform _exam_approval_bypass(false);
  update exam_sessions set closes_at = closes_at + interval '1 day' where id = v_s;
  if (select approval_status from exam_sessions where id = v_s) <> 'pending' then
    raise exception 'approved session stayed approved after a scope edit';
  end if;
end $$;
rollback;
