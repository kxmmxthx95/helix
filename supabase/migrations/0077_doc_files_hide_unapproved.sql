-- แท็บเอกสาร: ไฟล์ที่ยังไม่อนุมัติ (pending/returned) นักเรียน/ผู้ปกครองมองไม่เห็น.
-- Writers of the subject + reviewers (doc_files_review_read, 0076) still see every status.

drop policy doc_files_read on doc_files;
create policy doc_files_read on doc_files
  for select to authenticated using (
    can_read_doc_lesson_id(lesson_id)
    and (review_status = 'approved' or can_write_doc_lesson_id(lesson_id))
  );

-- Storage: same rule, so an unapproved file can't be opened by a direct URL either.
drop policy subject_documents_read on storage.objects;
create policy subject_documents_read on storage.objects
  for select to authenticated using (
    bucket_id = 'subject-documents'
    and (can_read_doc_lesson_id(doc_topic_of_path(name)) or can_read_doc_topic(doc_topic_of_path(name)))
    and (
      can_write_doc_lesson_id(doc_topic_of_path(name)) or can_write_doc_topic(doc_topic_of_path(name))
      or exists (select 1 from doc_files f where f.file_path = name and f.review_status = 'approved')
    )
  );

-- Insert: a reviewer's own upload is approved on the spot; everyone else starts pending.
create or replace function doc_files_review_guard() returns trigger
  language plpgsql
as $$
begin
  if auth.uid() is null then
    return new; -- service role / migrations
  end if;
  if tg_op = 'INSERT' then
    if can_review_teacher(auth.uid()) then
      new.review_status := 'approved';
      new.review_note := null;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      new.review_status := 'pending';
      new.review_note := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  elsif (new.review_status, new.review_note, new.reviewed_by, new.reviewed_at)
        is distinct from (old.review_status, old.review_note, old.reviewed_by, old.reviewed_at)
        and coalesce(current_setting('helix.reviewing', true), '') <> '1' then
    raise exception 'review columns can only change through review_doc_file()';
  end if;
  return new;
end
$$;

create trigger doc_files_review_guard before insert or update on doc_files
  for each row execute function doc_files_review_guard();

create or replace function review_doc_file(p_file_id uuid, p_status text, p_note text) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_teacher uuid;
begin
  if p_status not in ('approved', 'returned') then
    raise exception 'invalid review status';
  end if;
  if p_status = 'returned' and coalesce(btrim(p_note), '') = '' then
    raise exception 'a note is required when returning a file';
  end if;

  select uploaded_by into v_teacher from doc_files where id = p_file_id;
  if v_teacher is null or not can_review_teacher(v_teacher) then
    raise exception 'not allowed';
  end if;

  perform set_config('helix.reviewing', '1', true);
  update doc_files
    set review_status = p_status,
        review_note = nullif(btrim(p_note), ''),
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_file_id;
  perform set_config('helix.reviewing', '', true);
end
$$;
