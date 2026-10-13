-- เอกสาร — grill decision, 2026-10-13. วิชา -> ระดับชั้น -> เนื้อหาหลัก ->
-- เนื้อหาย่อย -> ไฟล์. Own catalog (doc_*), deliberately separate from
-- practice_lessons/practice_topics (0056): those hang off a subject only,
-- these also need a grade level. Not scoped to academic year. No draft
-- state — an uploaded file is visible immediately.
--
-- Write: can_write_exam_subject (teacher of the subject / manager).
-- Read: writers + students/guardians whose current classroom studies the
-- subject AND is in the lesson's grade level.

create table doc_lessons (
  id              uuid primary key default gen_random_uuid(),
  subject_id      uuid not null references subjects on delete cascade,
  grade_level_id  uuid not null references grade_levels on delete cascade,
  name            text not null,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index doc_lessons_scope_idx on doc_lessons (subject_id, grade_level_id, sort_order);

create table doc_topics (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references doc_lessons on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index doc_topics_lesson_idx on doc_topics (lesson_id, sort_order);

create table doc_files (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references doc_topics on delete cascade,
  title        text not null,
  description  text,
  file_path    text not null, -- object path in the private 'subject-documents' bucket: `${topic_id}/...`
  file_name    text not null, -- original filename, for display
  mime_type    text not null,
  size_bytes   bigint not null,
  uploaded_by  uuid not null references profiles on delete restrict,
  created_at   timestamptz not null default now()
);

create index doc_files_topic_idx on doc_files (topic_id, created_at);
create unique index doc_files_path_idx on doc_files (file_path);

create trigger doc_lessons_touch before update on doc_lessons
  for each row execute function touch_updated_at();
create trigger doc_topics_touch before update on doc_topics
  for each row execute function touch_updated_at();
create trigger doc_lessons_audit after insert or update or delete on doc_lessons
  for each row execute function log_audit();
create trigger doc_topics_audit after insert or update or delete on doc_topics
  for each row execute function log_audit();
create trigger doc_files_audit after insert or update or delete on doc_files
  for each row execute function log_audit();

-- ------------------------------------------------------------------- helpers
create or replace function can_read_doc_lesson(p_subject_id uuid, p_grade_level_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_exam_subject(p_subject_id)
    or exists (
      select 1
      from students s
      join lateral (
        select classroom_id, academic_year from student_classroom_enrollments sce
        where sce.student_id = s.id order by sce.created_at desc limit 1
      ) cur on true
      join classrooms c on c.id = cur.classroom_id and c.grade_level_id = p_grade_level_id
      join teaching_assignments ta
        on ta.classroom_id = cur.classroom_id and ta.academic_year = cur.academic_year
        and ta.subject_id = p_subject_id
      where s.profile_id = auth.uid() or s.id in (select student_id from guardianships where parent_id = auth.uid())
    )
$$;

create or replace function can_read_doc_topic(p_topic_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from doc_topics t join doc_lessons l on l.id = t.lesson_id
    where t.id = p_topic_id and can_read_doc_lesson(l.subject_id, l.grade_level_id)
  )
$$;

create or replace function can_write_doc_topic(p_topic_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from doc_topics t join doc_lessons l on l.id = t.lesson_id
    where t.id = p_topic_id and can_write_exam_subject(l.subject_id)
  )
$$;

-- Storage object name -> topic id; null when the first folder isn't a uuid,
-- so the policies never raise a cast error.
create or replace function doc_topic_of_path(p_name text) returns uuid
  language sql immutable
as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (storage.foldername(p_name))[1]::uuid end
$$;

-- --------------------------------------------------------------------- RLS
alter table doc_lessons enable row level security;
alter table doc_topics enable row level security;
alter table doc_files enable row level security;

create policy doc_lessons_read on doc_lessons
  for select to authenticated using (can_read_doc_lesson(subject_id, grade_level_id));
create policy doc_lessons_write on doc_lessons
  for all to authenticated
  using (can_write_exam_subject(subject_id))
  with check (can_write_exam_subject(subject_id));

create policy doc_topics_read on doc_topics
  for select to authenticated using (can_read_doc_topic(id));
create policy doc_topics_write on doc_topics
  for all to authenticated
  using (can_write_doc_topic(id))
  with check (
    exists (select 1 from doc_lessons l where l.id = doc_topics.lesson_id and can_write_exam_subject(l.subject_id))
  );

create policy doc_files_read on doc_files
  for select to authenticated using (can_read_doc_topic(topic_id));
create policy doc_files_write on doc_files
  for all to authenticated
  using (can_write_doc_topic(topic_id))
  with check (can_write_doc_topic(topic_id) and uploaded_by = auth.uid());

-- ------------------------------------------------------------------- bucket
-- Private, 20 MB per file, document/image types only (enforced server-side).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'subject-documents', 'subject-documents', false, 20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif'
  ]
)
on conflict (id) do nothing;

create policy subject_documents_read on storage.objects
  for select to authenticated using (
    bucket_id = 'subject-documents' and can_read_doc_topic(doc_topic_of_path(name))
  );
create policy subject_documents_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'subject-documents' and can_write_doc_topic(doc_topic_of_path(name))
  );
create policy subject_documents_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'subject-documents' and can_write_doc_topic(doc_topic_of_path(name))
  );
