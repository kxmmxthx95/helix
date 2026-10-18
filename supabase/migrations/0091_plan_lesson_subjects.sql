-- ผังการเรียน: tag a บทเรียน with related catalog subjects (รหัสวิชา from subjects).
-- Deleting a subject (or lesson) drops its tags.
create table plan_lesson_subjects (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references plan_lessons on delete cascade,
  subject_id uuid not null references subjects on delete cascade,
  created_at timestamptz not null default now(),
  unique (lesson_id, subject_id)
);
create index plan_lesson_subjects_lesson_idx on plan_lesson_subjects (lesson_id);

alter table plan_lesson_subjects enable row level security;

create policy plan_lesson_subjects_read on plan_lesson_subjects
  for select to authenticated using (lesson_id in (select id from plan_lessons));
-- subject_id in (select id from subjects) = the tagger must be able to read that subject (subjects_read, 0007).
create policy plan_lesson_subjects_write on plan_lesson_subjects
  for all to authenticated
  using (can_manage_academic() and lesson_id in (select id from plan_lessons))
  with check (
    can_manage_academic()
    and lesson_id in (select id from plan_lessons)
    and subject_id in (select id from subjects)
  );
