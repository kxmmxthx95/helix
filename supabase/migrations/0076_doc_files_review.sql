-- ตรวจเอกสารที่ครูอัปโหลดในแท็บเอกสาร (doc_files): same approve / send-back flow as doc_task_files (0073).

alter table doc_files
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'returned')),
  add column review_note   text,
  add column reviewed_by   uuid references profiles on delete set null,
  add column reviewed_at   timestamptz;

-- Reviewers (can_review_teacher) must see the file and open it from Storage even
-- when they don't teach the subject. Extra permissive policies; existing ones stay.
create policy doc_files_review_read on doc_files
  for select to authenticated using (can_review_teacher(uploaded_by));

create policy subject_documents_review_read on storage.objects
  for select to authenticated using (
    bucket_id = 'subject-documents'
    and exists (
      select 1 from doc_files f where f.file_path = name and can_review_teacher(f.uploaded_by)
    )
  );

-- Reviewers only ever touch the review columns, through this function.
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

  update doc_files
    set review_status = p_status,
        review_note = nullif(btrim(p_note), ''),
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_file_id;
end
$$;

grant execute on function review_doc_file(uuid, text, text) to authenticated;
