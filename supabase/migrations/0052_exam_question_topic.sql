-- ชื่อเนื้อหา — free-text topic tag for the teacher's own browsing/filtering,
-- same bank-only scope as difficulty (0051); null when not tagged.
alter table exam_questions
  add column topic text;
