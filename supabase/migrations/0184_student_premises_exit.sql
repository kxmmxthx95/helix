-- Student "ขอออกนอกโรงเรียน" (grill decision, 2026-11-20). Mirrors the staff
-- premises_exit_requests (0032/0146/0147) with two differences:
--   * the request must be approved BEFORE the student leaves (the teacher
--     approves in-app; LINE/push tells them a request is waiting)
--   * only the approver confirms the return (a student could just tap it)
-- Approver = current homeroom teacher of the student's classroom, or
-- can_manage() in the student's department / org-wide — same scope as
-- student_leave_requests (0035). Record only: attendance_records untouched.

create table student_premises_exit_requests (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references students on delete restrict,
  submitted_by         uuid not null references profiles on delete restrict,
  date                 date not null,
  reason               text not null,
  exit_time            timestamptz not null,
  planned_return_time  timestamptz,
  no_return            boolean not null default false,
  return_time          timestamptz,
  status               premises_exit_status not null default 'pending',
  approved_by          uuid references profiles on delete set null,
  approved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index student_premises_exit_requests_student_date_idx on student_premises_exit_requests (student_id, date);

create trigger student_premises_exit_requests_touch before update on student_premises_exit_requests
  for each row execute function touch_updated_at();
create trigger student_premises_exit_requests_audit
  after insert or update or delete on student_premises_exit_requests
  for each row execute function log_audit();

alter table student_premises_exit_requests enable row level security;

-- Approver scope, shared by read + update below.
create or replace function can_approve_student_exit(p_student_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select
    (can_manage() and (is_org_wide() or p_student_id in (
      select s.id from students s join grade_levels gl on gl.id = s.grade_level_id
      where gl.department_id = auth_department()
    )))
    or current_student_classroom(p_student_id) in (
      select cht.classroom_id from classroom_homeroom_teachers cht where cht.teacher_id = auth.uid()
    )
$$;

create policy student_premises_exit_requests_read on student_premises_exit_requests
  for select to authenticated using (
    can_approve_student_exit(student_id)
    or student_id in (select id from students where profile_id = auth.uid())
  );

-- Insert: the student themself, today only (Bangkok), always as a fresh pending request.
create policy student_premises_exit_requests_insert on student_premises_exit_requests
  for insert to authenticated with check (
    submitted_by = auth.uid()
    and student_id in (select id from students where profile_id = auth.uid())
    and date = (now() at time zone 'Asia/Bangkok')::date
    and status = 'pending' and approved_by is null and approved_at is null and return_time is null
  );

-- Update: approvers only (students cannot cancel or edit).
create policy student_premises_exit_requests_update on student_premises_exit_requests
  for update to authenticated
  using (can_approve_student_exit(student_id))
  with check (can_approve_student_exit(student_id));

-- Approver may only decide a pending request, or stamp the return time once
-- on an approved one. Everything the student wrote stays immutable.
create or replace function check_student_premises_exit_edit() returns trigger
  language plpgsql as $$
begin
  if new.student_id is distinct from old.student_id
    or new.submitted_by is distinct from old.submitted_by
    or new.date is distinct from old.date
    or new.reason is distinct from old.reason
    or new.exit_time is distinct from old.exit_time
    or new.planned_return_time is distinct from old.planned_return_time
    or new.no_return is distinct from old.no_return then
    raise exception 'ขอเปลี่ยนแปลงข้อมูลนี้ไม่ได้ ต้องยื่นคำขอใหม่';
  end if;
  if new.status is distinct from old.status
    and not (old.status = 'pending' and new.status in ('approved', 'rejected')) then
    raise exception 'เปลี่ยนสถานะได้เฉพาะจากรออนุมัติเท่านั้น';
  end if;
  if new.return_time is distinct from old.return_time
    and (old.return_time is not null or new.status <> 'approved' or new.no_return) then
    raise exception 'ยืนยันเวลากลับได้เฉพาะคำขอที่อนุมัติแล้วและมีกำหนดกลับ';
  end if;
  return new;
end $$;

create trigger student_premises_exit_requests_edit_check before update on student_premises_exit_requests
  for each row execute function check_student_premises_exit_edit();

-- ------------------------------------------------------------------ LINE queue
-- Same queue as 0066; the drain delivers via LINE and (0185) web push.
create or replace function notify_student_exit_submitted() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select first_name || ' ' || last_name into v_name from students where id = new.student_id;
  perform notify_student_leave_homeroom(new.student_id,
    v_name || ' ขอออกนอกโรงเรียน เวลา ' || to_char(new.exit_time at time zone 'Asia/Bangkok', 'HH24:MI') ||
      case when new.no_return then ' (ไม่กลับ)' else '' end ||
      ' เหตุผล: ' || new.reason);
  return new;
end $$;

create trigger student_premises_exit_requests_notify_submitted after insert on student_premises_exit_requests
  for each row execute function notify_student_exit_submitted();

create or replace function notify_student_exit_decision() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;
  insert into line_notifications (profile_id, message)
  values (
    new.submitted_by,
    case when new.status = 'approved'
      then 'คำขอออกนอกโรงเรียนของคุณได้รับอนุมัติแล้ว'
      else 'คำขอออกนอกโรงเรียนของคุณไม่ได้รับอนุมัติ'
    end
  );
  return new;
end $$;

create trigger student_premises_exit_requests_notify_decision after update on student_premises_exit_requests
  for each row execute function notify_student_exit_decision();
