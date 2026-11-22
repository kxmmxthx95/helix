-- Students (and guardians) see the topics of the topic sets behind exam rooms they may read.
-- Same gate as exam_session_sets_read: can_read_exam_session (approved, enabled, enrolled). Write policies untouched.
create policy exam_topic_set_topics_read_student on exam_topic_set_topics
  for select to authenticated using (
    exists (
      select 1 from exam_session_sets ess
      where ess.topic_set_id = exam_topic_set_topics.set_id
        and can_read_exam_session(ess.session_id)
    )
  );
