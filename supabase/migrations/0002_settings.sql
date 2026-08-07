-- System settings: one global school_settings singleton (header branding,
-- academic year) plus one department_settings row per department (semester
-- dates). Department settings are 100% independent — a dept_head edits only
-- their own row, never another department's (grill decision).

-- ------------------------------------------------------- school_settings
-- Singleton table: id is pinned to 1, so there is exactly one row, ever.
create table school_settings (
  id            smallint primary key default 1 check (id = 1),
  name_th       text not null default '',
  name_en       text,
  logo_path     text, -- object path in the school-assets storage bucket
  academic_year int not null default (extract(year from now())::int + 543), -- พ.ศ.
  updated_at    timestamptz not null default now()
);

insert into school_settings (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------- department_settings
create table department_settings (
  department_id   uuid primary key references departments on delete cascade,
  semester1_start date,
  semester1_end   date,
  semester2_start date,
  semester2_end   date,
  updated_at      timestamptz not null default now()
);

-- Every department always has a settings row, so the client only ever
-- updates — never has to branch on insert-vs-update or race an upsert.
insert into department_settings (department_id)
  select id from departments
  on conflict (department_id) do nothing;

-- security definer: department_settings has no INSERT policy (clients never
-- create rows directly), so the trigger needs to bypass RLS to seed one.
create or replace function seed_department_settings() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into department_settings (department_id) values (new.id);
  return new;
end $$;

create trigger departments_seed_settings after insert on departments
  for each row execute function seed_department_settings();

create trigger school_settings_touch before update on school_settings
  for each row execute function touch_updated_at();
create trigger department_settings_touch before update on department_settings
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------------ RLS
alter table school_settings      enable row level security;
alter table department_settings  enable row level security;

-- school_settings: readable by anyone signed in (renders in document
-- headers app-wide); writable only by org-wide roles.
create policy school_settings_read on school_settings
  for select to authenticated using (true);
create policy school_settings_write on school_settings
  for update to authenticated using (is_org_wide()) with check (is_org_wide());

-- department_settings: read/write scoped to your own department, same shape
-- as students_manage — org-wide roles see/edit every department.
create policy department_settings_read on department_settings
  for select to authenticated
  using (is_org_wide() or department_id = auth_department());
create policy department_settings_write on department_settings
  for update to authenticated
  using (can_manage() and (is_org_wide() or department_id = auth_department()))
  with check (can_manage() and (is_org_wide() or department_id = auth_department()));

-- ------------------------------------------------------------ storage
-- Public bucket: the logo needs to render in printed/exported document
-- headers, not just inside authenticated app views.
insert into storage.buckets (id, name, public)
values ('school-assets', 'school-assets', true)
on conflict (id) do nothing;

create policy school_assets_read on storage.objects
  for select using (bucket_id = 'school-assets');
create policy school_assets_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'school-assets' and is_org_wide());
create policy school_assets_update on storage.objects
  for update to authenticated
  using (bucket_id = 'school-assets' and is_org_wide())
  with check (bucket_id = 'school-assets' and is_org_wide());
create policy school_assets_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'school-assets' and is_org_wide());
