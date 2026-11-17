-- Verifies 0173 against a real project; every write rolls back. NOT run in CI —
-- execute manually after applying 0173 (needs a plan topic whose lesson fits a subject, and any profile).
begin;
do $$
declare
  v_subject uuid; v_topic uuid; v_user uuid; v_set uuid;
begin
  select sj.id, pt.id into strict v_subject, v_topic
    from plan_topics pt join plan_lessons pl on pl.id = pt.lesson_id
    join subjects sj on plan_topic_fits_subject(pt.id, sj.id)
    limit 1;
  select id into strict v_user from profiles limit 1;

  insert into practice_sets (subject_id, created_by, topic_id) values (v_subject, v_user, v_topic) returning id into v_set;

  begin
    delete from plan_topics where id = v_topic;
    raise exception 'topic with a practice set was deleted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into practice_sets (subject_id, created_by, topic_id)
      select s.id, v_user, v_topic from subjects s where not plan_topic_fits_subject(v_topic, s.id) limit 1;
    if found then raise exception 'set accepted a topic from another subject'; end if;
  exception when raise_exception then
    if sqlerrm like 'set accepted%' then raise; end if;
  end;
end $$;
rollback;

-- 0174: topic-only set + question (no subject), one curated set per topic.
begin;
do $$
declare
  v_topic uuid; v_user uuid; v_set uuid; v_q uuid;
begin
  select pt.id into strict v_topic from plan_topics pt limit 1;
  select id into strict v_user from profiles limit 1;
  insert into practice_sets (created_by, topic_id) values (v_user, v_topic) returning id into v_set;
  insert into exam_questions (plan_topic_id, question_type, prompt, created_by)
    values (v_topic, 'multiple_choice', 'x', v_user) returning id into v_q;
  begin
    insert into practice_sets (created_by, topic_id) values (v_user, v_topic);
    raise exception 'second curated set for a topic was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into exam_questions (question_type, prompt, created_by) values ('multiple_choice', 'x', v_user);
    raise exception 'question without subject or topic was accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;
