-- Core HR: employee profile (address), org structure (manager_id), job
-- position (job title + salary grade + career path), contract/agreement,
-- document management, employee status (+ history). Grill decision,
-- 2026-08-31: extends `profiles` (address) plus new satellite tables rather
-- than a separate "Employee" entity, since profiles already IS the
-- staff/teacher/dept_head/director identity table.
--
-- Sensitive fields (manager, job title, career path, status, salary,
-- contracts, documents) live in their own tables — NOT on `profiles` — so
-- they can get their own can_manage_hr()-gated RLS instead of inheriting
-- profiles_update_self, which would otherwise let anyone self-assign their
-- own manager/status/salary the same way profile_roles deliberately has no
-- self-service write policy at all.

-- --------------------------------------------------------- profiles: address
alter table profiles
  add column house_no     text,
  add column village_no   text, -- หมู่ที่
  add column alley        text, -- ตรอก/ซอย
  add column road         text,
  add column subdistrict  text, -- ตำบล/แขวง
  add column district     text, -- อำเภอ/เขต
  add column province     text,
  add column postal_code  text;

-- ------------------------------------------------------------------ enums
create type employee_status as enum ('onboarding', 'active', 'suspended', 'resigned', 'terminated');
create type contract_type as enum ('probation', 'fixed_term', 'indefinite');
create type document_category as enum ('contract', 'payslip', 'id_card', 'other');

-- ------------------------------------------------------------ salary_grades
-- Lookup table, not enum — same reasoning as position_titles/departments.
create table salary_grades (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  min_salary  numeric,
  max_salary  numeric,
  created_at  timestamptz not null default now(),
  check (min_salary is null or max_salary is null or max_salary >= min_salary)
);

-- --------------------------------------------------------- employee_positions
-- Org structure + job position + status, 1:1 with profiles. Broadly readable
-- (same scope as the profile itself) but writable only by can_manage_hr()
-- (director/super_admin) — see file header.
create table employee_positions (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null unique references profiles on delete cascade,
  manager_id         uuid references profiles on delete set null,
  job_title_id       uuid references position_titles on delete set null,
  career_path_notes  text,
  employee_status    employee_status not null default 'active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (manager_id is distinct from profile_id)
);

create index employee_positions_manager_idx on employee_positions (manager_id);

-- ------------------------------------------------------- employee_compensation
-- Split out from employee_positions (not merged) so salary stays readable by
-- only the employee themselves + can_manage_hr() — dept_head sees position
-- and status via employee_positions but never a subordinate's salary
-- (grill decision, 2026-08-31).
create table employee_compensation (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null unique references profiles on delete cascade,
  salary_grade_id  uuid references salary_grades on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------- employee_status_history
-- Insert-only audit trail of employee_status transitions. Writing a row here
-- is the only way employee_status changes — see sync_employee_status()
-- below, which is the trigger that actually updates employee_positions and
-- profiles.is_active, so the two can never drift apart.
create table employee_status_history (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles on delete cascade,
  status      employee_status not null,
  reason      text not null,
  changed_by  uuid not null references profiles on delete restrict,
  created_at  timestamptz not null default now()
);

create index employee_status_history_profile_idx on employee_status_history (profile_id, created_at desc);

-- ------------------------------------------------------------------ documents
-- Generic per-employee document store (contract scans, payslips, id cards,
-- ...) — one table + one private bucket for all categories rather than a
-- bespoke column/bucket per document type.
create table documents (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles on delete cascade,
  category     document_category not null,
  file_path    text not null, -- object path in the private 'employee-documents' bucket
  file_name    text not null, -- original filename, for display
  uploaded_by  uuid not null references profiles on delete restrict,
  created_at   timestamptz not null default now()
);

create index documents_profile_idx on documents (profile_id);

-- ------------------------------------------------------------------ contracts
create table contracts (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles on delete cascade,
  contract_type  contract_type not null,
  start_date     date not null,
  end_date       date, -- null = ไม่มีกำหนด (indefinite)
  document_id    uuid references documents on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index contracts_profile_idx on contracts (profile_id, start_date desc);

-- ------------------------------------------------------------------- helpers
-- Director + super_admin only — narrower than is_org_wide() (which also
-- includes staff/ธุรการ). Sensitive HR data (salary/contract/status/document)
-- is restricted to this smaller set (grill decision, 2026-08-31).
create or replace function can_manage_hr() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid() and role in ('super_admin', 'director')
  )
$$;

-- Keeps employee_positions.employee_status and profiles.is_active in sync
-- with the history log — see table comment above.
create or replace function sync_employee_status() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  insert into employee_positions (profile_id, employee_status)
  values (new.profile_id, new.status)
  on conflict (profile_id) do update set employee_status = excluded.employee_status, updated_at = now();

  update profiles set is_active = (new.status in ('active', 'onboarding')) where id = new.profile_id;

  return new;
end $$;

create trigger employee_status_history_sync after insert on employee_status_history
  for each row execute function sync_employee_status();

-- Every profile_roles grant of an employee-scope role gets a default
-- employee_positions row so the HR list can LEFT JOIN it without nulls —
-- covers both invite-user (Edge Function) and useUpdateProfile's role diff,
-- since both ultimately insert into profile_roles.
create or replace function ensure_employee_position() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if new.role in ('staff', 'teacher', 'dept_head', 'director') then
    insert into employee_positions (profile_id) values (new.profile_id)
    on conflict (profile_id) do nothing;
  end if;
  return new;
end $$;

create trigger profile_roles_ensure_employee_position after insert on profile_roles
  for each row execute function ensure_employee_position();

-- --------------------------------------------------------------- touch/audit
create trigger employee_positions_touch before update on employee_positions
  for each row execute function touch_updated_at();
create trigger employee_compensation_touch before update on employee_compensation
  for each row execute function touch_updated_at();
create trigger contracts_touch before update on contracts
  for each row execute function touch_updated_at();

create trigger employee_positions_audit after insert or update or delete on employee_positions
  for each row execute function log_audit();
create trigger employee_compensation_audit after insert or update or delete on employee_compensation
  for each row execute function log_audit();
create trigger contracts_audit after insert or update or delete on contracts
  for each row execute function log_audit();
create trigger documents_audit after insert or update or delete on documents
  for each row execute function log_audit();

-- ------------------------------------------------------------------ RLS
alter table salary_grades          enable row level security;
alter table employee_positions     enable row level security;
alter table employee_compensation  enable row level security;
alter table employee_status_history enable row level security;
alter table documents              enable row level security;
alter table contracts              enable row level security;

-- salary_grades: reference data, same shape as departments/position_titles.
create policy salary_grades_read on salary_grades
  for select to authenticated using (true);
create policy salary_grades_write on salary_grades
  for all to authenticated using (can_manage_hr()) with check (can_manage_hr());

-- employee_positions: own row, or anyone who could already see the target
-- profile (same scope as profiles_read_scope) — org structure is meant to be
-- browsable. Write is can_manage_hr() only.
create policy employee_positions_read on employee_positions
  for select to authenticated using (
    profile_id = auth.uid()
    or is_org_wide()
    or profile_id in (select id from profiles where department_id = auth_department())
  );
create policy employee_positions_write on employee_positions
  for all to authenticated using (can_manage_hr()) with check (can_manage_hr());

-- employee_compensation: own row or can_manage_hr() only — never a manager's
-- general department visibility (grill decision, 2026-08-31).
create policy employee_compensation_read on employee_compensation
  for select to authenticated using (profile_id = auth.uid() or can_manage_hr());
create policy employee_compensation_write on employee_compensation
  for all to authenticated using (can_manage_hr()) with check (can_manage_hr());

-- employee_status_history: same read scope as compensation (self or HR
-- admin); insert only by can_manage_hr() — no update/delete policy at all,
-- it's an immutable log.
create policy employee_status_history_read on employee_status_history
  for select to authenticated using (profile_id = auth.uid() or can_manage_hr());
create policy employee_status_history_write on employee_status_history
  for insert to authenticated with check (can_manage_hr());

-- documents / contracts: employee views their own (read-only), can_manage_hr()
-- manages everyone's.
create policy documents_read on documents
  for select to authenticated using (profile_id = auth.uid() or can_manage_hr());
create policy documents_write on documents
  for all to authenticated using (can_manage_hr()) with check (can_manage_hr());

create policy contracts_read on contracts
  for select to authenticated using (profile_id = auth.uid() or can_manage_hr());
create policy contracts_write on contracts
  for all to authenticated using (can_manage_hr()) with check (can_manage_hr());

-- ------------------------------------------------------- employee-documents
-- Private bucket, same folder-scoping convention as leave-attachments (0033):
-- path is `${profile_id}/...`. Employee reads their own folder; only
-- can_manage_hr() may write/delete (upload is an HR action, not self-service).
insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do nothing;

create policy employee_documents_read on storage.objects
  for select to authenticated using (
    bucket_id = 'employee-documents' and (
      (storage.foldername(name))[1] = auth.uid()::text or can_manage_hr()
    )
  );

create policy employee_documents_write on storage.objects
  for insert to authenticated with check (bucket_id = 'employee-documents' and can_manage_hr());

create policy employee_documents_delete on storage.objects
  for delete to authenticated using (bucket_id = 'employee-documents' and can_manage_hr());

-- --------------------------------------------------------------- backfill
-- Every current staff/teacher/dept_head/director gets a default
-- employee_positions row (status defaults to 'active', matching their
-- existing is_active=true) so the HR list join never sees nulls for them.
insert into employee_positions (profile_id)
select distinct profile_id from profile_roles where role in ('staff', 'teacher', 'dept_head', 'director')
on conflict (profile_id) do nothing;

-- General job titles, complementing the dept_head-only titles seeded in
-- 0001 (ผู้บริหารแผนก, หัวหน้าฝ่ายวิชาการ, ...) now that position_titles is used
-- for every employee's job title, not just dept_head labels.
insert into position_titles (code, name) values
  ('teacher',         'ครูผู้สอน'),
  ('admin_officer',   'เจ้าหน้าที่ธุรการ'),
  ('hr_officer',      'เจ้าหน้าที่บุคคล'),
  ('finance_officer', 'เจ้าหน้าที่การเงิน'),
  ('general_staff',   'พนักงานทั่วไป')
on conflict (code) do nothing;
