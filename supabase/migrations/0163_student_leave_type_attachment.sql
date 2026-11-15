-- Student leave: ประเภทการลา + ไฟล์แนบ, same lookup (leave_types) and private
-- bucket (leave-attachments) as staff leave (0033). Nullable columns so old
-- rows stay valid; the form makes leave_type_id required.
alter table student_leave_requests
  add column leave_type_id uuid references leave_types on delete restrict,
  add column attachment_path text;

-- Same rule as check_leave_attachment_required() (0034). Insert-only: edits
-- to these columns are blocked below.
create or replace function check_student_leave_attachment_required() returns trigger
  language plpgsql as $$
declare
  threshold int;
begin
  select requires_attachment_after_days into threshold from leave_types where id = new.leave_type_id;
  if threshold is not null and (new.end_date - new.start_date + 1) > threshold and new.attachment_path is null then
    raise exception 'ลาต่อเนื่องเกิน % วัน ต้องแนบเอกสารประกอบ', threshold;
  end if;
  return new;
end $$;

create trigger student_leave_requests_attachment_check before insert on student_leave_requests
  for each row execute function check_student_leave_attachment_required();

-- Freeze the new columns too (body otherwise as 0035).
create or replace function check_student_leave_self_edit() returns trigger
  language plpgsql as $$
begin
  if new.submitted_by is distinct from old.submitted_by
    or new.student_id is distinct from old.student_id
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.reason is distinct from old.reason
    or new.leave_type_id is distinct from old.leave_type_id
    or new.attachment_path is distinct from old.attachment_path then
    raise exception 'ขอเปลี่ยนแปลงข้อมูลนี้ไม่ได้ ต้องยื่นคำขอใหม่';
  end if;

  if old.submitted_by = auth.uid() then
    if not (old.status = 'pending' and new.status = 'cancelled') then
      raise exception 'ยกเลิกได้เฉพาะตอนยังรออนุมัติเท่านั้น';
    end if;
  elsif new.status is distinct from old.status
    and not (old.status = 'pending' and new.status in ('approved', 'rejected')) then
    raise exception 'เปลี่ยนสถานะได้เฉพาะจากรออนุมัติเท่านั้น';
  end if;
  return new;
end $$;

-- Approvers (homeroom / dept) read the attachment through the request row:
-- the subquery runs under the caller's RLS, so it matches exactly who may see
-- the request. Submitter write/read already covered by 0033's folder policies
-- (object path is `${auth.uid()}/...`).
create policy leave_attachments_read_student on storage.objects
  for select to authenticated using (
    bucket_id = 'leave-attachments'
    and exists (select 1 from student_leave_requests r where r.attachment_path = name)
  );
