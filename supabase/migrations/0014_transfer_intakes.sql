-- "รับย้ายเข้า" (transfer-in) case tracking. Light scope (grill decision,
-- 2026-08-09): no per-subject credit transfer — placement is just
-- students.grade_level_id, already set when the profile is created on
-- Roster like any other student. This table exists only to remember
-- source_school and let staff find transfer-in students who haven't
-- been placed in a classroom / enrolled into a cohort yet — a case
-- list, not a workflow engine or state machine. Status is derived at
-- query time by joining student_classroom_enrollments /
-- student_cohort_enrollments rather than stored here, so it can't
-- drift out of sync with the real state.
--
-- Org-wide only, same scope as classrooms/student_classroom_enrollments
-- (0013) — a case always ends in a classroom assignment, which is
-- already org-wide-only, so gating the whole case at intake keeps the
-- two consistent instead of letting dept_head open a case they can't
-- finish.
create table transfer_intakes (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null unique references students on delete cascade,
  source_school text not null,
  intake_date   date not null default current_date,
  created_at    timestamptz not null default now()
);

create index transfer_intakes_student_idx on transfer_intakes (student_id);

alter table transfer_intakes enable row level security;

create policy transfer_intakes_all on transfer_intakes
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

-- Sensitive — same audit rationale as student_classroom_enrollments (0013).
create trigger transfer_intakes_audit
  after insert or update or delete on transfer_intakes
  for each row execute function log_audit();
