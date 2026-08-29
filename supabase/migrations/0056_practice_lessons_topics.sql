-- บทเรียนหลัก/เนื้อหาย่อย — grill decision, 2026-08-29. Two-level catalog
-- under a subject (practice_lessons -> practice_topics), separate from
-- exam_questions.topic (freetext) — a new practice_set now hangs off one
-- practice_topics row instead of a typed title, so the create-set flow
-- becomes วิชา -> บทเรียนหลัก -> เนื้อหาย่อย with no title input (the set's
-- displayed name is the topic's name, falling back to the old title column
-- for sets created before this migration). Lessons/topics are managed from
-- their own screen (not inline in the create-set drawer) and only by
-- whoever can already write the subject's practice bank —
-- can_write_practice_subject, same grant as practice_sets itself (0053).

create table practice_lessons (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references subjects on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index practice_lessons_subject_idx on practice_lessons (subject_id, sort_order);

create trigger practice_lessons_touch before update on practice_lessons
  for each row execute function touch_updated_at();
create trigger practice_lessons_audit after insert or update or delete on practice_lessons
  for each row execute function log_audit();

create table practice_topics (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references practice_lessons on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index practice_topics_lesson_idx on practice_topics (lesson_id, sort_order);

create trigger practice_topics_touch before update on practice_topics
  for each row execute function touch_updated_at();
create trigger practice_topics_audit after insert or update or delete on practice_topics
  for each row execute function log_audit();

-- practice_sets now points at a topic instead of requiring a freetext
-- title — the create-set UI enforces "must pick a topic" client-side (no
-- DB-level not-null/check: existing curated rows predate this catalog and
-- have no topic_id to backfill, title stays as their display fallback).
-- Self-serve rows never get a topic_id either way — they keep using
-- exam_questions.topic, unrelated to this catalog.
alter table practice_sets add column topic_id uuid references practice_topics on delete restrict;

create index practice_sets_topic_idx on practice_sets (topic_id);

-- --------------------------------------------------------------------- RLS

alter table practice_lessons enable row level security;
alter table practice_topics enable row level security;

create policy practice_lessons_read on practice_lessons
  for select to authenticated using (can_read_practice_subject(subject_id));
create policy practice_lessons_write on practice_lessons
  for all to authenticated
  using (can_write_practice_subject(subject_id))
  with check (can_write_practice_subject(subject_id));

create policy practice_topics_read on practice_topics
  for select to authenticated using (
    exists (select 1 from practice_lessons l where l.id = practice_topics.lesson_id
      and can_read_practice_subject(l.subject_id))
  );
create policy practice_topics_write on practice_topics
  for all to authenticated
  using (
    exists (select 1 from practice_lessons l where l.id = practice_topics.lesson_id
      and can_write_practice_subject(l.subject_id))
  )
  with check (
    exists (select 1 from practice_lessons l where l.id = practice_topics.lesson_id
      and can_write_practice_subject(l.subject_id))
  );
