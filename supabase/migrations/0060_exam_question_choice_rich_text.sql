-- ตัวเลือก (answer choices) become rich text (Plate.js JSON) too — image and
-- KaTeX formula insertion, same as โจทย์ in migration 0050. Applies to
-- multiple_choice only (true_false choices are a fixed ถูก/ผิด Select, never
-- user-authored; short_answer has no choices). label stays as an
-- app-derived plaintext copy (same [สูตร]/[รูปภาพ] placeholder derivation
-- promptToPlainText already does for prompt) rather than being replaced, so
-- the exam-bank preview list and validation logic don't need a Plate
-- renderer for a one-line summary. Pre-existing choices get an empty
-- label_json default, not backfilled from label — same tradeoff 0050 made.

alter table exam_question_choices
  add column label_json jsonb not null default '[{"type":"p","children":[{"text":""}]}]'::jsonb;

-- exam_question_choices_for_attempt is an explicit column allowlist (0047) —
-- the live exam-taking client won't receive label_json unless it's listed
-- here too (same reasoning as 0050's exam_questions_for_attempt update).
-- label_json is appended last, not inserted after label — CREATE OR REPLACE
-- VIEW can only add columns at the end, never reorder existing ones.
create or replace view exam_question_choices_for_attempt with (security_barrier) as
  select id, question_id, label, position, label_json
  from exam_question_choices;

-- Choice images reuse the existing exam-question-images bucket and its
-- ${question_id}/${uuid}.${ext} path/RLS policies from migration 0050 as-is
-- — a choice belongs to a question, so no new bucket or policy is needed.
