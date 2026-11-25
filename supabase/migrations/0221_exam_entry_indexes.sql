-- Mass exam entry hung: can_read_exam_question() runs per question/choice row under RLS and looked up
-- exam_session_questions / practice_set_questions by question_id with no usable index (seq scan per call),
-- and its in_progress-attempt branch could only use the single-column exam_attempts indexes.
-- Rollback: drop the three indexes.
create index if not exists exam_session_questions_question_idx on exam_session_questions (question_id);
create index if not exists practice_set_questions_question_idx on practice_set_questions (question_id);
create index if not exists exam_attempts_student_session_open_idx on exam_attempts (student_id, session_id) where status = 'in_progress';
