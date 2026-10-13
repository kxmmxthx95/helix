-- ตรวจเอกสารที่ส่งเข้ามา: reviewers approve a submitted file or send it back with a note.
-- A task counts as submitted only while it has at least one file that isn't
-- 'returned' (derived client-side, see src/lib/docTasks.ts), so a returned
-- task goes back to pending / overdue until the teacher uploads again.

alter table doc_task_files
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'returned')),
  add column review_note   text,
  add column reviewed_by   uuid references profiles on delete set null,
  add column reviewed_at   timestamptz;

-- No UPDATE policy on doc_task_files: teachers can't edit rows, and reviewers
-- only ever touch the review columns, through this function (column-level
-- limits aren't expressible in RLS).
create or replace function review_doc_task_file(p_file_id uuid, p_status text, p_note text) returns void
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

  select teacher_id into v_teacher from doc_task_files where id = p_file_id;
  if v_teacher is null or not can_review_teacher(v_teacher) then
    raise exception 'not allowed';
  end if;

  update doc_task_files
    set review_status = p_status,
        review_note = nullif(btrim(p_note), ''),
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_file_id;
end
$$;

grant execute on function review_doc_task_file(uuid, text, text) to authenticated;
