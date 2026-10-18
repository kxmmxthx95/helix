-- ผังการเรียน: a บทเรียน can also point at uploaded documents (same rules as 0089).
create table plan_lesson_files (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references plan_lessons on delete cascade,
  doc_file_id uuid not null references doc_files on delete cascade,
  created_at  timestamptz not null default now(),
  unique (lesson_id, doc_file_id)
);
create index plan_lesson_files_lesson_idx on plan_lesson_files (lesson_id);

alter table plan_lesson_files enable row level security;

create policy plan_lesson_files_read on plan_lesson_files
  for select to authenticated using (lesson_id in (select id from plan_lessons));
create policy plan_lesson_files_write on plan_lesson_files
  for all to authenticated
  using (can_manage_academic() and lesson_id in (select id from plan_lessons))
  with check (
    can_manage_academic()
    and lesson_id in (select id from plan_lessons)
    and doc_file_id in (select id from doc_files)
  );
