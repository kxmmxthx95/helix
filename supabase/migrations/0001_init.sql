-- Helix v1 schema: departments, profiles, students, audit log.
-- Isolation rule: everyone below director sees only their own department.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- roles
create type app_role as enum (
  'super_admin',    -- ผู้ดูแลระบบสูงสุด
  'director',       -- ผู้อำนวยการสูงสุด
  'dept_head',      -- ผู้อำนวยการแผนก
  'academic_head',  -- หัวหน้าวิชาการ
  'teacher',        -- ครูผู้สอน
  'staff',          -- เจ้าหน้าที่
  'student',        -- นักเรียน
  'parent'          -- ผู้ปกครอง
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
-- One row per auth user. department_id is null only for org-wide roles.
create table profiles (
  id             uuid primary key references auth.users on delete cascade,
  role           app_role not null,
  department_id  uuid references departments on delete restrict,
  full_name      text not null,
  email          text,
  phone          text,
  line_user_id   text unique,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint dept_required_for_scoped_roles check (
    role in ('super_admin', 'director', 'parent') or department_id is not null
  )
);

create index profiles_department_idx on profiles (department_id);
create index profiles_role_idx on profiles (role);

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
  id          bigserial primary key,
  actor_id    uuid references profiles on delete set null,
  actor_role  app_role not null,
  action      text not null,           -- INSERT | UPDATE | DELETE
  table_name  text not null,
  record_id   text not null,
  changes     jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_created_idx on audit_logs (created_at desc);
create index audit_logs_actor_idx on audit_logs (actor_id);

-- ------------------------------------------------------------- helpers
-- SECURITY DEFINER so RLS policies can read profiles without recursing
-- into the policies defined on profiles itself.
create or replace function auth_role() returns app_role
  language sql stable security definer set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create or replace function auth_department() returns uuid
  language sql stable security definer set search_path = public
as $$ select department_id from profiles where id = auth.uid() $$;

-- Sees every department.
create or replace function is_org_wide() returns boolean
  language sql stable security definer set search_path = public
as $$ select auth_role() in ('super_admin', 'director') $$;

-- May create/edit users and roster rows within their scope.
create or replace function can_manage() returns boolean
  language sql stable security definer set search_path = public
as $$ select auth_role() in ('super_admin', 'director', 'dept_head', 'academic_head') $$;

-- -------------------------------------------------------- audit trigger
-- Students and parents are deliberately not logged (grill decision Q21).
create or replace function log_audit() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  actor_role app_role := auth_role();
  rec_id text;
begin
  if actor_role is null or actor_role in ('student', 'parent') then
    return coalesce(new, old);
  end if;

  rec_id := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'));

  insert into audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
  values (
    auth.uid(), actor_role, tg_op, tg_table_name, rec_id,
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

-- --------------------------------------------------------- updated_at
create or replace function touch_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger students_touch before update on students
  for each row execute function touch_updated_at();
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------------ RLS
alter table departments   enable row level security;
alter table profiles      enable row level security;
alter table students      enable row level security;
alter table guardianships enable row level security;
alter table audit_logs    enable row level security;

-- departments: readable by all signed-in users, written by org-wide roles.
create policy departments_read on departments
  for select to authenticated using (true);
create policy departments_write on departments
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

-- profiles: always your own row; otherwise department-scoped.
create policy profiles_read_self on profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_read_scope on profiles
  for select to authenticated
  using (is_org_wide() or (department_id is not null and department_id = auth_department()));
create policy profiles_update_self on profiles
  for update to authenticated using (id = auth.uid())
  -- Self-edit must not become a privilege escalation.
  with check (id = auth.uid() and role = auth_role() and department_id is not distinct from auth_department());
create policy profiles_manage on profiles
  for all to authenticated
  using (can_manage() and (is_org_wide() or department_id = auth_department()))
  with check (can_manage() and (is_org_wide() or department_id = auth_department()));

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
