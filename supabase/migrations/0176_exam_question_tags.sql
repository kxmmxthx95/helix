-- Free-form tags on a question (แบบฝึกหัด form, "แท็ก"). Same scope as topic/difficulty
-- (0051/0052): bank-side labels for teachers, not shown to students. Rows keep the
-- default empty array, so nothing to backfill.
alter table exam_questions
  add column tags text[] not null default '{}'
  check (cardinality(tags) <= 10);
