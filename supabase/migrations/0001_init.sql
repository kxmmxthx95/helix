-- Helix v1 schema: departments, profiles, students, audit log.
-- Isolation rule: everyone below director/staff sees only their own department.
-- Roles are many-to-many (profile_roles) — one person can hold several roles
-- at once (e.g. teacher + dept_head/หัวหน้าฝ่ายวิชาการ), each always scoped to
-- the person's single home department (grill decision, 2026-08-07).
--
-- Login identity (grill decision): auth.users.email is never a real inbox.
-- Students sign in with student_code, everyone else with phone — the client
-- and the invite-user/reset-password Edge Functions construct a synthetic
-- address (<id>@students.helix.internal / <id>@staff.helix.internal) and use
-- Supabase's normal email+password auth underneath. profiles.email is just a
-- contact field. See supabase/functions/_shared/auth-domains.ts.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- roles
-- "หัวหน้า..." job titles (วิชาการ, งบประมาณ, กิจการนักเรียน, ...) are not
-- separate roles — they're all dept_head with a position_title attached, since
-- they carry identical permissions and only differ in display label.
create type app_role as enum (
  'super_admin', -- ผู้ดูแลระบบสูงสุด   (org-wide)
  'director',    -- ผู้บริหารสูงสุด      (org-wide)
  'staff',       -- ธุรการ              (org-wide)
  'dept_head',   -- ผู้บริหาร/หัวหน้างานระดับแผนก (แผนกตัวเอง; see position_titles)
  'teacher',     -- ครูผู้สอน            (แผนกตัวเอง)
  'student',     -- นักเรียน             (แผนกตัวเอง)
  'parent'       -- ผู้ปกครอง            (ลูกตัวเอง)
);

create type student_status as enum ('studying', 'transferred', 'graduated', 'dropped');

-- ---------------------------------------------------------- departments
create table departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------- profiles
-- One row per auth user. department_id is the person's single home
-- department — null only for org-wide roles (super_admin/director/staff)
-- and parents. Role itself lives in profile_roles, not here.
create table profiles (
  id             uuid primary key references auth.users on delete cascade,
  department_id  uuid references departments on delete restrict,
  prefix         text, -- คำนำหน้า: นาย/นาง/นางสาว/ฯลฯ — free text, not an enum (short, rarely-changing list)
  first_name     text not null,
  last_name      text not null,
  email          text, -- contact email only — never the login identity, see auth notes below
  phone          text,
  national_id    text unique,
  date_of_birth  date,
  line_user_id   text unique,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index profiles_department_idx on profiles (department_id);

-- ------------------------------------------------------- position_titles
-- Job-title labels for dept_head rows (หัวหน้าฝ่ายวิชาการ, หัวหน้างบประมาณ, ...).
-- A lookup table, not an enum, because this list keeps growing in practice —
-- adding a title is an insert, not a migration.
create table position_titles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

insert into position_titles (code, name) values
  ('dept_lead',            'ผู้บริหารแผนก'),
  ('academic_head',        'หัวหน้าฝ่ายวิชาการ'),
  ('student_affairs_head', 'หัวหน้ากิจการนักเรียน'),
  ('budget_head',          'หัวหน้างบประมาณ'),
  ('general_affairs_head', 'หัวหน้างานทั่วไป'),
  ('hr_head',              'หัวหน้างานบุคคล');

-- --------------------------------------------------------- profile_roles
-- Many-to-many: a profile can hold several roles, and several dept_head rows
-- at once (one per position_title — e.g. teacher who is both หัวหน้าฝ่ายวิชาการ
-- and หัวหน้ากิจการนักเรียน). position_title_id is required exactly when
-- role = 'dept_head' and meaningless otherwise.
create table profile_roles (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references profiles on delete cascade,
  role               app_role not null,
  position_title_id  uuid references position_titles on delete restrict,
  created_at         timestamptz not null default now(),
  constraint position_title_iff_dept_head
    check ((role = 'dept_head') = (position_title_id is not null))
);

create index profile_roles_profile_idx on profile_roles (profile_id);
create index profile_roles_role_idx on profile_roles (role);
-- Partial unique indexes instead of one UNIQUE(profile_id, role, position_title_id):
-- NULLs don't collide in a plain unique constraint, so without these a person
-- could pick up duplicate non-titled rows (e.g. two bare 'teacher' rows).
create unique index profile_roles_unique_untitled on profile_roles (profile_id, role)
  where position_title_id is null;
create unique index profile_roles_unique_titled on profile_roles (profile_id, role, position_title_id)
  where position_title_id is not null;

-- A dept-scoped role only makes sense if the person actually has a home
-- department. ponytail: only checked on insert/update of profile_roles — if
-- someone later nulls profiles.department_id out from under an existing
-- dept_head/teacher/student row, that's not caught here. Add a mirror trigger
-- on profiles if that turns out to happen in practice.
create or replace function check_profile_role_dept() returns trigger
  language plpgsql as $$
declare
  dept uuid;
begin
  if new.role in ('dept_head', 'teacher', 'student') then
    select department_id into dept from profiles where id = new.profile_id;
    if dept is null then
      raise exception 'role % requires profile % to have a department', new.role, new.profile_id;
    end if;
  end if;
  return new;
end $$;

create trigger profile_roles_dept_check before insert or update on profile_roles
  for each row execute function check_profile_role_dept();

-- ------------------------------------------------------------- students
create table students (
  id             uuid primary key default gen_random_uuid(),
  student_code   text not null unique,
  national_id    text unique,
  first_name     text not null,
  last_name      text not null,
  department_id  uuid not null references departments on delete restrict,
  class_level    text,
  status         student_status not null default 'studying',
  -- Optional link to a login; a roster row can exist before an account does.
  profile_id     uuid unique references profiles on delete set null,
  guardian_name  text,
  guardian_phone text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index students_department_idx on students (department_id);
create index students_status_idx on students (status);
-- Backs the roster search box (name / code, case-insensitive).
create index students_search_idx on students
  using gin (to_tsvector('simple', first_name || ' ' || last_name || ' ' || student_code));

-- --------------------------------------------------- parent ↔ student
create table guardianships (
  parent_id   uuid not null references profiles on delete cascade,
  student_id  uuid not null references students on delete cascade,
  primary key (parent_id, student_id)
);

-- ----------------------------------------------------------- audit log
create table audit_logs (
  id           bigserial primary key,
  actor_id     uuid references profiles on delete set null,
  actor_roles  app_role[] not null, -- snapshot of every role held at action time
  action       text not null,      -- INSERT | UPDATE | DELETE
  table_name   text not null,
  record_id    text not null,
  changes      jsonb,
  created_at   timestamptz not null default now()
);

create index audit_logs_created_idx on audit_logs (created_at desc);
create index audit_logs_actor_idx on audit_logs (actor_id);

-- ------------------------------------------------ password reset attempts
-- Self-service reset (login_id + national_id + date_of_birth) is checked by
-- the reset-password Edge Function using the service-role key — it never
-- goes through RLS, so this table has no policies at all and is simply
-- unreachable from the anon/authenticated client roles.
create table password_reset_attempts (
  login_id          text primary key,
  attempt_count     int not null default 0,
  first_attempt_at  timestamptz not null default now()
);

-- ------------------------------------------------------------- helpers
-- SECURITY DEFINER so RLS policies can read profiles/profile_roles without
-- recursing into the policies defined on those tables.
create or replace function auth_department() returns uuid
  language sql stable security definer set search_path = public
as $$ select department_id from profiles where id = auth.uid() $$;

-- Sees every department.
create or replace function is_org_wide() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid() and role in ('super_admin', 'director', 'staff')
  )
$$;

-- May create/edit roster rows within their scope, and view the audit trail.
-- Does NOT cover managing user accounts — see can_manage_users() below.
create or replace function can_manage() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid() and role in ('super_admin', 'director', 'staff', 'dept_head')
  )
$$;

-- May create and edit user accounts (profiles + profile_roles). Deliberately
-- narrower than can_manage() — user administration is super_admin-only, even
-- though director/staff/dept_head can still manage the roster (grill decision).
create or replace function can_manage_users() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid() and role = 'super_admin'
  )
$$;

-- -------------------------------------------------------- audit trigger
-- Students and parents are deliberately not logged (grill decision Q21).
-- With multi-role, that only holds if EVERY role the actor holds is one of
-- the excluded ones.
create or replace function log_audit() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  actor_roles app_role[] := (
    select coalesce(array_agg(role), '{}') from profile_roles where profile_id = auth.uid()
  );
  rec_id text;
begin
  if auth.uid() is null or actor_roles = '{}' or actor_roles <@ array['student', 'parent']::app_role[] then
    return coalesce(new, old);
  end if;

  rec_id := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'));

  insert into audit_logs (actor_id, actor_roles, action, table_name, record_id, changes)
  values (
    auth.uid(), actor_roles, tg_op, tg_table_name, rec_id,
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'DELETE' then jsonb_build_object('old', to_jsonb(old))
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    end
  );

  return coalesce(new, old);
end $$;

create trigger students_audit after insert or update or delete on students
  for each row execute function log_audit();
create trigger profiles_audit after insert or update or delete on profiles
  for each row execute function log_audit();
-- Role assignment is itself a sensitive management action — audit it too.
create trigger profile_roles_audit after insert or update or delete on profile_roles
  for each row execute function log_audit();

-- --------------------------------------------------------- updated_at
create or replace function touch_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger students_touch before update on students
  for each row execute function touch_updated_at();
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------------ RLS
alter table departments             enable row level security;
alter table profiles                enable row level security;
alter table position_titles         enable row level security;
alter table profile_roles           enable row level security;
alter table students                enable row level security;
alter table guardianships           enable row level security;
alter table audit_logs              enable row level security;
-- No policies at all — service-role only (see table comment above).
alter table password_reset_attempts enable row level security;

-- departments: readable by all signed-in users, written by org-wide roles.
create policy departments_read on departments
  for select to authenticated using (true);
create policy departments_write on departments
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

-- position_titles: reference data, same shape as departments.
create policy position_titles_read on position_titles
  for select to authenticated using (true);
create policy position_titles_write on position_titles
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

-- profiles: always your own row; otherwise department-scoped.
create policy profiles_read_self on profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_read_scope on profiles
  for select to authenticated
  using (is_org_wide() or (department_id is not null and department_id = auth_department()));
create policy profiles_update_self on profiles
  for update to authenticated using (id = auth.uid())
  -- Self-edit must not change which department you're scoped to. Role
  -- escalation is blocked separately — role now lives in profile_roles,
  -- which has no self-service write policy at all.
  with check (id = auth.uid() and department_id is not distinct from auth_department());
-- User administration (create/edit accounts, assign roles) is super_admin-
-- only — narrower than can_manage(), which still covers roster + audit for
-- director/staff/dept_head. super_admin is always org-wide, so no separate
-- department check is needed here.
create policy profiles_manage on profiles
  for all to authenticated
  using (can_manage_users())
  with check (can_manage_users());

-- profile_roles: everyone reads their own roles; super_admin reads/assigns
-- everyone's. No self-service write policy anywhere — granting yourself a
-- role is never allowed, not even for super_admin's own row.
create policy profile_roles_read_self on profile_roles
  for select to authenticated using (profile_id = auth.uid());
create policy profile_roles_read_scope on profile_roles
  for select to authenticated using (can_manage_users());
create policy profile_roles_manage on profile_roles
  for all to authenticated
  using (can_manage_users())
  with check (can_manage_users());

-- students: staff see their department; students see themselves; parents see their children.
create policy students_read on students
  for select to authenticated using (
    is_org_wide()
    or department_id = auth_department()
    or profile_id = auth.uid()
    or exists (
      select 1 from guardianships g
      where g.student_id = students.id and g.parent_id = auth.uid()
    )
  );
create policy students_manage on students
  for all to authenticated
  using (can_manage() and (is_org_wide() or department_id = auth_department()))
  with check (can_manage() and (is_org_wide() or department_id = auth_department()));

-- guardianships: parents read their own links; managers maintain them.
create policy guardianships_read on guardianships
  for select to authenticated using (parent_id = auth.uid() or can_manage());
create policy guardianships_manage on guardianships
  for all to authenticated using (can_manage()) with check (can_manage());

-- audit_logs: read-only, and only for roles that are themselves audited.
create policy audit_logs_read on audit_logs
  for select to authenticated using (
    is_org_wide()
    or (can_manage() and actor_id in (select id from profiles where department_id = auth_department()))
  );
