-- คลังปกรายวิชา: super_admin uploads covers once, subjects bind to one later (subjects.cover_id).
-- subjects.cover_path stays the single "what to display" pointer so existing readers need no change:
-- a trigger points it at lib/<cover_id> whenever cover_id is set; a direct upload (0134 flow)
-- sets cover_id = null and cover_path = <subject id> from the client.
create table subject_cover_library (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subject_cover_library_touch before update on subject_cover_library
  for each row execute function touch_updated_at();

alter table subject_cover_library enable row level security;
create policy subject_cover_library_read on subject_cover_library
  for select to authenticated using (true);
create policy subject_cover_library_write on subject_cover_library
  for all to authenticated using (can_manage_users()) with check (can_manage_users());

-- restrict: a cover still in use can't be deleted (the UI shows the count).
alter table subjects add column cover_id uuid references subject_cover_library (id) on delete restrict;
create index subjects_cover_id_idx on subjects (cover_id);

create or replace function subjects_apply_cover_id() returns trigger
  language plpgsql as $$
begin
  if new.cover_id is not null then
    new.cover_path := 'lib/' || new.cover_id;
  end if;
  return new;
end $$;
create trigger subjects_cover_id before insert or update of cover_id on subjects
  for each row execute function subjects_apply_cover_id();

-- Replacing a library image overwrites the same object; bump bound subjects so the ?v= cache-buster changes.
create or replace function subject_cover_library_touch_subjects() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update subjects set updated_at = now() where cover_id = new.id;
  return new;
end $$;
create trigger subject_cover_library_bump after update on subject_cover_library
  for each row execute function subject_cover_library_touch_subjects();

-- Storage: lib/* is super_admin only; <subject id> objects keep the 0179 rule.
create or replace function _can_write_subject_cover(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when object_name like 'lib/%' then can_manage_users()
    else can_manage() and exists (
      select 1 from subjects s
      where s.id::text = object_name and (is_org_wide() or s.department_id = auth_department())
    )
  end;
$$;
