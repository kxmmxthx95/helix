-- Staff time clock: self-service clock in/out + "ขอออกนอกโรงเรียน" (leave
-- premises, approval-required). Everyone except student/parent — which
-- roles are actually enabled is a school-wide toggle, not a role check
-- baked into RLS, so it can change without a migration (grill decision,
-- 2026-08-13). Leave/vacation tracking is explicitly out of scope — this is
-- just clock events, not an HR leave system.

alter table school_settings add column time_tracking_roles app_role[] not null default '{}';

-- Per-department work-start time + geofence — both null (unset) means the
-- department hasn't configured this yet, so clock-in/out is unrestricted
-- there (fail-open, not fail-closed). Client-side GPS is not a real
-- security boundary (same caveat as the role checks in src/lib/roles.ts) —
-- this only filters honest mistakes, not someone deliberately spoofing
-- their location.
alter table department_settings
  add column work_start_time time,
  add column checkin_lat double precision,
  add column checkin_lng double precision,
  add column checkin_radius_m int,
  add constraint department_settings_geofence_check check (
    (checkin_lat is null) = (checkin_lng is null) and (checkin_lat is null) = (checkin_radius_m is null)
  );

-- ------------------------------------------------------------- time_clock_records
-- One row per person per day — mirrors attendance_records (0026). lat/lng
-- captured per event (not just pass/fail) so a manager can review a
-- suspicious entry later; recorded_by lets the UI show "บันทึกแทนโดย X" when
-- it differs from profile_id (manager correcting a GPS-blocked day, see
-- check_time_clock_self_edit() below).
create table time_clock_records (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles on delete restrict,
  date           date not null,
  clock_in_time  timestamptz,
  clock_in_lat   double precision,
  clock_in_lng   double precision,
  clock_out_time timestamptz,
  clock_out_lat  double precision,
  clock_out_lng  double precision,
  recorded_by    uuid not null references profiles on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (profile_id, date)
);

create index time_clock_records_profile_date_idx on time_clock_records (profile_id, date);

create trigger time_clock_records_touch before update on time_clock_records
  for each row execute function touch_updated_at();
create trigger time_clock_records_audit
  after insert or update or delete on time_clock_records
  for each row execute function log_audit();

alter table time_clock_records enable row level security;

-- Coarse access: own row, or can_manage() scoped to the target's department
-- (or org-wide) — same shape as can_write_teaching_assignment() (0030).
create policy time_clock_records_rw on time_clock_records
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

-- Fine-grained invariant on top of the RLS above: the row's own owner may
-- fill in a still-null clock_in_time/clock_out_time (first clock-in, first
-- clock-out) but can never change a value they already set — only a manager
-- (can_manage()) can correct an already-recorded time (grill decision:
-- self-edit would let someone quietly erase being late).
create or replace function check_time_clock_self_edit() returns trigger
  language plpgsql as $$
begin
  if can_manage() then
    return new;
  end if;
  if (old.clock_in_time is not null and new.clock_in_time is distinct from old.clock_in_time)
    or (old.clock_out_time is not null and new.clock_out_time is distinct from old.clock_out_time) then
    raise exception 'cannot edit an already-recorded clock time — ask a manager to correct it';
  end if;
  return new;
end $$;

create trigger time_clock_records_self_edit_check before update on time_clock_records
  for each row execute function check_time_clock_self_edit();

-- ------------------------------------------------------------- premises_exit_requests
-- "ขอออกนอกโรงเรียน" — approval requested async (grill decision: the app
-- can't physically stop someone from leaving, so blocking submission on
-- approval would just be friction with no real effect — see conversation).
-- Multiple per day allowed (no unique constraint), each with its own
-- return_time the requester confirms themselves.
create type premises_exit_status as enum ('pending', 'approved', 'rejected');

create table premises_exit_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles on delete restrict,
  date         date not null,
  reason       text not null,
  exit_time    timestamptz not null,
  exit_lat     double precision,
  exit_lng     double precision,
  return_time  timestamptz,
  status       premises_exit_status not null default 'pending',
  approved_by  uuid references profiles on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index premises_exit_requests_profile_date_idx on premises_exit_requests (profile_id, date);

create trigger premises_exit_requests_touch before update on premises_exit_requests
  for each row execute function touch_updated_at();
create trigger premises_exit_requests_audit
  after insert or update or delete on premises_exit_requests
  for each row execute function log_audit();

alter table premises_exit_requests enable row level security;

create policy premises_exit_requests_rw on premises_exit_requests
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

-- Same self-edit shape as time_clock_records: the requester may only fill
-- in a still-null return_time themselves. Everything else (status,
-- approved_by/at, reason, exit_time) is manager-only.
create or replace function check_premises_exit_self_edit() returns trigger
  language plpgsql as $$
begin
  if can_manage() then
    return new;
  end if;
  if new.status is distinct from old.status
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.reason is distinct from old.reason
    or new.exit_time is distinct from old.exit_time
    or (old.return_time is not null and new.return_time is distinct from old.return_time) then
    raise exception 'you may only confirm your own return time — ask a manager for any other change';
  end if;
  return new;
end $$;

create trigger premises_exit_requests_self_edit_check before update on premises_exit_requests
  for each row execute function check_premises_exit_self_edit();
