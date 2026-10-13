-- ไฟล์เอกสารผูกกับเนื้อหาหลักโดยตรง: เนื้อหาย่อยเลิกใช้ใน UI.
-- doc_topics / doc_files.topic_id are kept (nullable) so existing rows and
-- storage paths (`${topic_id}/...`) stay valid; new uploads use `${lesson_id}/...`.

alter table doc_files add column lesson_id uuid references doc_lessons on delete cascade;
update doc_files f set lesson_id = t.lesson_id from doc_topics t where t.id = f.topic_id;
alter table doc_files alter column lesson_id set not null;
alter table doc_files alter column topic_id drop not null;
create index doc_files_lesson_idx on doc_files (lesson_id, created_at);

create or replace function can_read_doc_lesson_id(p_lesson_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from doc_lessons l
    where l.id = p_lesson_id and can_read_doc_lesson(l.subject_id, l.grade_level_id)
  )
$$;

create or replace function can_write_doc_lesson_id(p_lesson_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from doc_lessons l where l.id = p_lesson_id and can_write_exam_subject(l.subject_id)
  )
$$;

drop policy doc_files_read on doc_files;
drop policy doc_files_write on doc_files;
create policy doc_files_read on doc_files
  for select to authenticated using (can_read_doc_lesson_id(lesson_id));
create policy doc_files_write on doc_files
  for all to authenticated
  using (can_write_doc_lesson_id(lesson_id))
  with check (can_write_doc_lesson_id(lesson_id) and uploaded_by = auth.uid());

-- Storage: first folder is a lesson id (new) or a topic id (legacy).
drop policy subject_documents_read on storage.objects;
drop policy subject_documents_insert on storage.objects;
drop policy subject_documents_delete on storage.objects;
create policy subject_documents_read on storage.objects
  for select to authenticated using (
    bucket_id = 'subject-documents'
    and (can_read_doc_lesson_id(doc_topic_of_path(name)) or can_read_doc_topic(doc_topic_of_path(name)))
  );
create policy subject_documents_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'subject-documents'
    and (can_write_doc_lesson_id(doc_topic_of_path(name)) or can_write_doc_topic(doc_topic_of_path(name)))
  );
create policy subject_documents_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'subject-documents'
    and (can_write_doc_lesson_id(doc_topic_of_path(name)) or can_write_doc_topic(doc_topic_of_path(name)))
  );
