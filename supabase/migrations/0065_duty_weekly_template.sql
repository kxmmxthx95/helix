-- เวรหมุนเวียนแบบตารางรายสัปดาห์ (grill decision 2026-09-01): "จัดตารางเวร"
-- for a 'rotating' duty point no longer means picking one calendar date at a
-- time — it sets who's on duty per weekday (อาทิตย์-เสาร์, all 7 days), and
-- that repeats every week. Any number of staff per point per weekday, same
-- as the old per-date model. No duty_assignments row exists for a normal
-- (non-overridden) day — see expandWeeklyTemplateAssignments() in
-- useDutyRoster.ts, which fills those back in on the client, same pattern as
-- fixed-mode duty points (0064). 'fixed' mode is untouched by this.
create table duty_weekly_template (
  id             uuid primary key default gen_random_uuid(),
  duty_point_id  uuid not null references duty_points on delete cascade,
  weekday        smallint not null check (weekday between 0 and 6), -- 0=อาทิตย์ .. 6=เสาร์, matches JS Date#getDay()
  staff_id       uuid not null references profiles on delete restrict,
  created_by     uuid not null references profiles on delete restrict,
  created_at     timestamptz not null default now(),
  unique (duty_point_id, weekday, staff_id)
);

create index duty_weekly_template_point_idx on duty_weekly_template (duty_point_id, weekday);

alter table duty_weekly_template enable row level security;

-- Same self-or-manager shape as duty_assignments_read (0063) — a template
-- row is schedule info for the staff on it, not a public lookup like
-- duty_points itself.
create policy duty_weekly_template_read on duty_weekly_template
  for select to authenticated using (
    staff_id = auth.uid()
    or (can_manage() and (is_org_wide() or staff_id in (
      select id from profiles where department_id = auth_department()
    )))
  );
create policy duty_weekly_template_write on duty_weekly_template
  for all to authenticated using (
    can_manage() and (is_org_wide() or staff_id in (
      select id from profiles where department_id = auth_department()
    ))
  ) with check (
    can_manage() and (is_org_wide() or staff_id in (
      select id from profiles where department_id = auth_department()
    ))
  );

create trigger duty_weekly_template_audit after insert or delete on duty_weekly_template
  for each row execute function log_audit();
