-- Staff leave (ระบบการลา) — phase 2 follow-up to time_clock_records (0032).
-- Deliberately unrelated to attendance_records.status='leave' (0026), which
-- is a same-day status a teacher marks for a STUDENT — no request, no
-- approval, no quota. This is a self-service request/approval workflow for
-- staff only (grill decision, 2026-08-13).

-- --------------------------------------------------------------- leave_types
-- Lookup table, not enum — schools add categories over time (ลาบวช, ลาคลอด,
-- ลาไม่รับเงินเดือน, ...), same reasoning as study_plans/learning_areas (0004).
create table leave_types (
  id                              uuid primary key default gen_random_uuid(),
  code                            text not null unique,
  name                            text not null,
  max_days_per_year               int, -- null = ไม่จำกัดโควตา
  requires_attachment_after_days  int, -- null = ไม่บังคับแนบไฟล์เลย ไม่ว่าลากี่วัน
  created_at                      timestamptz not null default now()
);

alter table leave_types enable row level security;

create policy leave_types_read on leave_types
  for select to authenticated using (true);
create policy leave_types_write on leave_types
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

-- ------------------------------------------------------------ leave_requests
-- One row per date-range request (start–end), not one row per day — the
-- normal shape of a leave form. days is a generated column so quota sums
-- are one plain SUM(days), no per-row date math needed client-side.
create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table leave_requests (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references profiles on delete restrict,
  leave_type_id    uuid not null references leave_types on delete restrict,
  start_date       date not null,
  end_date         date not null,
  days             int generated always as (end_date - start_date + 1) stored,
  reason           text not null,
  attachment_path  text, -- private bucket 'leave-attachments' — see below
  status           leave_status not null default 'pending',
  approved_by      uuid references profiles on delete set null,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date >= start_date)
);

create index leave_requests_profile_idx on leave_requests (profile_id, start_date);

create trigger leave_requests_touch before update on leave_requests
  for each row execute function touch_updated_at();
create trigger leave_requests_audit
  after insert or update or delete on leave_requests
  for each row execute function log_audit();

alter table leave_requests enable row level security;

-- Coarse access: own row, or can_manage() scoped to the target's department
-- (or org-wide) — same shape as time_clock_records_rw / premises_exit_requests_rw (0032).
create policy leave_requests_rw on leave_requests
  for all to authenticated using (
    profile_id = auth.uid()
    or (can_manage() and (is_org_wide() or profile_id in (
      select id from profiles where department_id = auth_department()
    )))
  ) with check (
    profile_id = auth.uid()
    or (can_manage() and (is_org_wide() or profile_id in (
      select id from profiles where department_id = auth_department()
    )))
  );

-- Same date range can't be claimed twice by one person — ignores
-- rejected/cancelled rows since those no longer hold a real claim on the days.
create or replace function check_leave_overlap() returns trigger
  language plpgsql as $$
begin
  if new.status in ('rejected', 'cancelled') then
    return new;
  end if;
  if exists (
    select 1 from leave_requests
    where profile_id = new.profile_id
      and id <> new.id
      and status not in ('rejected', 'cancelled')
      and daterange(start_date, end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'วันที่ลาซ้อนกับคำขอลาอื่นที่ยังไม่ถูกปฏิเสธ/ยกเลิก';
  end if;
  return new;
end $$;

create trigger leave_requests_overlap_check before insert or update on leave_requests
  for each row execute function check_leave_overlap();

-- Sick-leave-style rule: continuous leave past a type's threshold needs
-- supporting doc. Authoritative check lives here, not just in the UI.
create or replace function check_leave_attachment_required() returns trigger
  language plpgsql as $$
declare
  threshold int;
begin
  select requires_attachment_after_days into threshold from leave_types where id = new.leave_type_id;
  if threshold is not null and new.days > threshold and new.attachment_path is null then
    raise exception 'ลาต่อเนื่องเกิน % วัน ต้องแนบเอกสารประกอบ', threshold;
  end if;
  return new;
end $$;

create trigger leave_requests_attachment_check before insert or update on leave_requests
  for each row execute function check_leave_attachment_required();

-- Fine-grained invariant on top of the RLS above (same shape as
-- check_premises_exit_self_edit, 0032): the requester may attach a file at
-- any time and self-cancel a still-future request, nothing else — any other
-- change (dates, reason, leave_type, approval fields) is manager-only.
create or replace function check_leave_self_edit() returns trigger
  language plpgsql as $$
begin
  if can_manage() then
    return new;
  end if;
  if new.profile_id is distinct from old.profile_id
    or new.leave_type_id is distinct from old.leave_type_id
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.reason is distinct from old.reason
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at then
    raise exception 'ขอเปลี่ยนแปลงข้อมูลนี้ไม่ได้เอง ติดต่อหัวหน้า';
  end if;
  if new.status is distinct from old.status
    and not (old.status in ('pending', 'approved') and new.status = 'cancelled' and old.start_date > current_date) then
    raise exception 'ยกเลิกได้เฉพาะคำขอที่ยังไม่ถึงวันเริ่มลาเท่านั้น';
  end if;
  return new;
end $$;

create trigger leave_requests_self_edit_check before update on leave_requests
  for each row execute function check_leave_self_edit();

-- ------------------------------------------------------- leave-attachments
-- First PRIVATE bucket in this app — avatars/school-assets (0002/0024) are
-- both public. Object path is `${profile_id}/...` so folder-scoping mirrors
-- the leave_requests_rw predicate above exactly.
insert into storage.buckets (id, name, public)
values ('leave-attachments', 'leave-attachments', false)
on conflict (id) do nothing;

create policy leave_attachments_read on storage.objects
  for select to authenticated using (
    bucket_id = 'leave-attachments' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (can_manage() and (is_org_wide() or (storage.foldername(name))[1]::uuid in (
        select id from profiles where department_id = auth_department()
      )))
    )
  );

create policy leave_attachments_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'leave-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy leave_attachments_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'leave-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
