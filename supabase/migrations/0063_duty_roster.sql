-- Daily duty roster (เวรประจำวัน) — teachers assigned to supervision points
-- (เวรประตู, เวรโรงอาหาร, ...) per day. New domain, no prior art in this
-- codebase (grill decision, 2026-08-31): school-wide duty points, admin
-- managed; one point can hold any number of staff on a given day; one-way
-- transfer (not a mutual swap) needs the target's accept THEN can_manage()'s
-- approval before it takes effect.

-- ------------------------------------------------------------------ duty_points
-- Lookup table, admin-managed like leave_types/salary_grades — see Settings.tsx.
create table duty_points (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table duty_points enable row level security;

create policy duty_points_read on duty_points
  for select to authenticated using (true);
create policy duty_points_write on duty_points
  for all to authenticated using (can_manage()) with check (can_manage());

create trigger duty_points_touch before update on duty_points
  for each row execute function touch_updated_at();
create trigger duty_points_audit after insert or update or delete on duty_points
  for each row execute function log_audit();

-- -------------------------------------------------------------- duty_assignments
-- One row per (point, staff, day) — many staff can share a point on the same
-- day, so this is not unique per (point, day) alone.
create table duty_assignments (
  id             uuid primary key default gen_random_uuid(),
  duty_point_id  uuid not null references duty_points on delete restrict,
  staff_id       uuid not null references profiles on delete restrict,
  date           date not null,
  created_by     uuid not null references profiles on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (duty_point_id, staff_id, date)
);

create index duty_assignments_date_idx on duty_assignments (date);
create index duty_assignments_staff_idx on duty_assignments (staff_id, date);

alter table duty_assignments enable row level security;

-- Same shape as leave_requests_rw (0033): own row, or can_manage() scoped to
-- the target's department (or org-wide).
create policy duty_assignments_read on duty_assignments
  for select to authenticated using (
    staff_id = auth.uid()
    or (can_manage() and (is_org_wide() or staff_id in (
      select id from profiles where department_id = auth_department()
    )))
  );
create policy duty_assignments_write on duty_assignments
  for all to authenticated using (
    can_manage() and (is_org_wide() or staff_id in (
      select id from profiles where department_id = auth_department()
    ))
  ) with check (
    can_manage() and (is_org_wide() or staff_id in (
      select id from profiles where department_id = auth_department()
    ))
  );

create trigger duty_assignments_touch before update on duty_assignments
  for each row execute function touch_updated_at();
create trigger duty_assignments_audit after insert or update or delete on duty_assignments
  for each row execute function log_audit();

-- LINE-notify the assignee — reuses the line_notifications queue (0040),
-- drained by the same 5-minute cron already running for grade notices.
create or replace function notify_duty_assignment() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_point_name text;
begin
  select name into v_point_name from duty_points where id = new.duty_point_id;
  insert into line_notifications (profile_id, message)
  values (new.staff_id, 'คุณได้รับมอบหมายเวร ' || v_point_name || ' วันที่ ' || to_char(new.date, 'DD/MM/YYYY'));
  return new;
end $$;

create trigger duty_assignments_notify after insert on duty_assignments
  for each row execute function notify_duty_assignment();

-- --------------------------------------------------------- duty_transfer_requests
-- One-way hand-off (grill decision): the requester gives their own duty away,
-- no reciprocal duty comes back. Two approvals required — target accepts,
-- then can_manage() confirms — same "coarse RLS + fine trigger" split as
-- check_leave_self_edit (0033): RLS below is deliberately coarse, the actual
-- who-can-move-which-status rules live in check_duty_transfer_transition().
create type duty_transfer_status as enum (
  'pending_target', 'pending_admin', 'approved', 'rejected_by_target', 'rejected_by_admin', 'cancelled'
);

-- duty_point_id/date are copied from the referenced assignment at insert
-- time (see check_duty_transfer_insert below) rather than joined on read.
-- The target only ever has row access to duty_transfer_requests, never to
-- duty_assignments itself (that table's RLS is self-or-manager, and the
-- target is neither) — without this denormalization "เวรของฉัน" would have
-- no way to show what duty an incoming offer is even for.
create table duty_transfer_requests (
  id               uuid primary key default gen_random_uuid(),
  assignment_id    uuid not null references duty_assignments on delete cascade,
  requester_id     uuid not null references profiles on delete restrict,
  target_staff_id  uuid not null references profiles on delete restrict,
  duty_point_id    uuid not null references duty_points on delete restrict,
  date             date not null,
  status           duty_transfer_status not null default 'pending_target',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (target_staff_id <> requester_id)
);

create index duty_transfer_requests_assignment_idx on duty_transfer_requests (assignment_id);
create index duty_transfer_requests_target_idx on duty_transfer_requests (target_staff_id, status);

-- At most one open (not yet decided) request per assignment at a time —
-- stops a requester from spamming multiple targets for the same duty.
create unique index duty_transfer_requests_one_open_idx on duty_transfer_requests (assignment_id)
  where status in ('pending_target', 'pending_admin');

alter table duty_transfer_requests enable row level security;

create policy duty_transfer_requests_read on duty_transfer_requests
  for select to authenticated using (
    requester_id = auth.uid()
    or target_staff_id = auth.uid()
    or (can_manage() and (is_org_wide() or requester_id in (
      select id from profiles where department_id = auth_department()
    )))
  );
create policy duty_transfer_requests_insert on duty_transfer_requests
  for insert to authenticated with check (requester_id = auth.uid());
create policy duty_transfer_requests_update on duty_transfer_requests
  for update to authenticated using (
    requester_id = auth.uid() or target_staff_id = auth.uid() or can_manage()
  ) with check (
    requester_id = auth.uid() or target_staff_id = auth.uid() or can_manage()
  );

-- A request can only be opened for a duty that is actually yours right now
-- — and this is also where duty_point_id/date get copied onto the row
-- (see table comment above), so it doubles as the ownership check.
create or replace function check_duty_transfer_insert() returns trigger
  language plpgsql as $$
declare
  v_staff_id uuid;
begin
  select staff_id, duty_point_id, date into v_staff_id, new.duty_point_id, new.date
  from duty_assignments where id = new.assignment_id;

  if v_staff_id is distinct from new.requester_id then
    raise exception 'เวรนี้ไม่ได้เป็นของคุณ';
  end if;

  return new;
end $$;

create trigger duty_transfer_requests_insert_check before insert on duty_transfer_requests
  for each row execute function check_duty_transfer_insert();

-- Legal transitions: target accepts/declines a pending offer; the requester
-- may withdraw before the target has acted; can_manage() gives the final
-- word once the target has accepted. Nothing else is allowed.
create or replace function check_duty_transfer_transition() returns trigger
  language plpgsql as $$
begin
  if new.assignment_id is distinct from old.assignment_id
    or new.requester_id is distinct from old.requester_id
    or new.target_staff_id is distinct from old.target_staff_id
    or new.duty_point_id is distinct from old.duty_point_id
    or new.date is distinct from old.date then
    raise exception 'แก้ไขข้อมูลคำขอเดิมไม่ได้ ยกเลิกแล้วขอใหม่แทน';
  end if;

  if old.status = 'pending_target' and new.target_staff_id = auth.uid()
    and new.status in ('pending_admin', 'rejected_by_target') then
    return new;
  end if;

  if old.status = 'pending_target' and new.requester_id = auth.uid() and new.status = 'cancelled' then
    return new;
  end if;

  if old.status = 'pending_admin' and can_manage() and new.status in ('approved', 'rejected_by_admin') then
    return new;
  end if;

  raise exception 'เปลี่ยนสถานะคำขอโอนเวรแบบนี้ไม่ได้';
end $$;

create trigger duty_transfer_requests_transition_check before update on duty_transfer_requests
  for each row execute function check_duty_transfer_transition();

-- Effect of a final decision: 'approved' actually swaps the assignment over
-- to the target; every terminal state (incl. rejections) notifies the
-- requester. security definer because line_notifications denies all client
-- access (0040), and because a dept_head approver's own write scope on
-- duty_assignments may not cover the target's department.
create or replace function apply_duty_transfer_decision() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_point_name text;
begin
  if new.status not in ('approved', 'rejected_by_target', 'rejected_by_admin') then
    return new;
  end if;

  if new.status = 'approved' then
    update duty_assignments set staff_id = new.target_staff_id, updated_at = now() where id = new.assignment_id;
  end if;

  select name into v_point_name from duty_points where id = new.duty_point_id;

  insert into line_notifications (profile_id, message)
  values (
    new.requester_id,
    case new.status
      when 'approved' then 'คำขอโอนเวร ' || v_point_name || ' วันที่ ' || to_char(new.date, 'DD/MM/YYYY') || ' ได้รับอนุมัติแล้ว'
      when 'rejected_by_target' then 'คำขอโอนเวร ' || v_point_name || ' วันที่ ' || to_char(new.date, 'DD/MM/YYYY') || ' ถูกปฏิเสธ'
      else 'คำขอโอนเวร ' || v_point_name || ' วันที่ ' || to_char(new.date, 'DD/MM/YYYY') || ' ไม่ได้รับอนุมัติจากแอดมิน'
    end
  );

  return new;
end $$;

create trigger duty_transfer_requests_apply_decision after update on duty_transfer_requests
  for each row execute function apply_duty_transfer_decision();

-- LINE-notify the target as soon as a request comes in — they act on it
-- from "เวรของฉัน" in the app, this is just the nudge.
create or replace function notify_duty_transfer_target() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_point_name text;
begin
  select name into v_point_name from duty_points where id = new.duty_point_id;

  insert into line_notifications (profile_id, message)
  values (
    new.target_staff_id,
    'มีคำขอให้คุณรับเวรแทน: ' || v_point_name || ' วันที่ ' || to_char(new.date, 'DD/MM/YYYY') || ' กรุณายืนยันในระบบ'
  );

  return new;
end $$;

create trigger duty_transfer_requests_notify_target after insert on duty_transfer_requests
  for each row execute function notify_duty_transfer_target();

create trigger duty_transfer_requests_touch before update on duty_transfer_requests
  for each row execute function touch_updated_at();
create trigger duty_transfer_requests_audit after insert or update or delete on duty_transfer_requests
  for each row execute function log_audit();
