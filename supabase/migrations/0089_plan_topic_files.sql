-- ผังการเรียน: a หัวข้อ can point at teacher-uploaded documents (doc_files).
-- Visibility of the file itself stays with doc_files / storage RLS (grill decision,
-- 2026-10-18): everyone who sees the plan sees the link row, only readers of the
-- document can resolve it.

create table plan_topic_files (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references plan_topics on delete cascade,
  doc_file_id uuid not null references doc_files on delete cascade,
  created_at  timestamptz not null default now(),
  unique (topic_id, doc_file_id)
);
create index plan_topic_files_topic_idx on plan_topic_files (topic_id);

alter table plan_topic_files enable row level security;

create policy plan_topic_files_read on plan_topic_files
  for select to authenticated using (topic_id in (select id from plan_topics));
-- doc_file_id in (select id from doc_files) = the linker must be able to read the document.
create policy plan_topic_files_write on plan_topic_files
  for all to authenticated
  using (can_manage_academic() and topic_id in (select id from plan_topics))
  with check (
    can_manage_academic()
    and topic_id in (select id from plan_topics)
    and doc_file_id in (select id from doc_files)
  );
