-- ระดับความยากของข้อสอบ — bank-only metadata for the teacher's own filtering/
-- browsing; not surfaced to students (exam_questions_for_attempt view keeps
-- its explicit column list, so this stays out of the attempt-time payload).
create type exam_question_difficulty as enum ('easy', 'medium', 'hard');

alter table exam_questions
  add column difficulty exam_question_difficulty not null default 'medium';
