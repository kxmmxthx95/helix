-- Verifies 0183 against a real project; every write rolls back. NOT run in CI —
-- execute manually after applying 0183 (needs a subject with a fitting plan topic and any profile).
begin;
do $$
declare
  v_subject uuid; v_topic uuid; v_user uuid; v_set uuid; v_s uuid;
begin
  select sj.id, pt.id into strict v_subject, v_topic
    from plan_topics pt join subjects sj on plan_topic_fits_subject(pt.id, sj.id) limit 1;
  select id into strict v_user from profiles limit 1;

  -- a forged 'approved' on insert is reset to draft
  insert into exam_topic_sets (teacher_id, subject_id, approval_status)
    values (v_user, v_subject, 'approved') returning id into v_set;
  if (select approval_status from exam_topic_sets where id = v_set) <> 'draft' then
    raise exception 'insert kept a forged approval_status';
  end if;

  -- direct status change is refused
  begin
    update exam_topic_sets set approval_status = 'approved' where id = v_set;
    raise exception 'direct approval_status update was accepted';
  exception when raise_exception then
    if sqlerrm like 'direct%' then raise; end if;
  end;

  -- a session cannot use an unapproved set
  begin
    insert into exam_sessions (subject_id, teacher_id, title, opens_at, closes_at, topic_set_id)
      values (v_subject, v_user, 't', now(), now() + interval '1 day', v_set);
    raise exception 'session accepted an unapproved set';
  exception when raise_exception then
    if sqlerrm like 'session accepted%' then raise; end if;
  end;

  insert into exam_topic_set_topics (set_id, topic_id) values (v_set, v_topic);

  -- approve (as the RPCs would), then a session can use the set
  perform _exam_approval_bypass(true);
  update exam_topic_sets set approval_status = 'approved' where id = v_set;
  perform _exam_approval_bypass(false);
  insert into exam_sessions (subject_id, teacher_id, title, opens_at, closes_at, topic_set_id)
    values (v_subject, v_user, 't', now(), now() + interval '1 day', v_set) returning id into v_s;
  if not exam_session_approved(v_s) then raise exception 'session of an approved set not approved'; end if;

  -- a set used by a session is frozen
  begin
    delete from exam_topic_set_topics where set_id = v_set;
    raise exception 'topics of a used set were editable';
  exception when raise_exception then
    if sqlerrm like 'topics of%' then raise; end if;
  end;

  -- an approved, unused set goes back to draft when its topics change
  delete from exam_sessions where id = v_s;
  delete from exam_topic_set_topics where set_id = v_set;
  if (select approval_status from exam_topic_sets where id = v_set) <> 'draft' then
    raise exception 'approved unused set stayed approved after a topic edit';
  end if;
end $$;
rollback;
