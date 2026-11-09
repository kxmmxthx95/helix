-- Study maps are an independent super_admin tool; no student progress/status.
begin;
create table public.study_map_library (
  id text primary key check (id = 'forest'),
  theme text not null default 'forest' check (theme = 'forest'),
  name text not null check (char_length(btrim(name)) between 1 and 100)
);
insert into public.study_map_library (id, theme, name) values ('forest', 'forest', 'ป่าแห่งจินตนาการ');
create table public.study_map_assignments (
  plan_subject_id uuid not null references public.plan_subjects(id) on delete cascade,
  grade_level_id uuid not null references public.grade_levels(id) on delete cascade,
  map_id text not null references public.study_map_library(id),
  primary key (plan_subject_id, grade_level_id)
);
-- Reject grade/subject combinations across departments even for administrators.
create or replace function public.validate_study_map_assignment() returns trigger
language plpgsql set search_path = public as $$
begin
  -- BEFORE triggers run before RLS WITH CHECK; deny without querying hidden parents.
  if not public.can_manage_users() then
    raise insufficient_privilege using message = 'Study maps require super_admin';
  end if;
  if not exists (
    select 1 from public.plan_subjects s join public.grade_levels g on g.department_id = s.department_id
    where s.id = new.plan_subject_id and g.id = new.grade_level_id
  ) then
    raise exception 'Subject and grade must belong to the same department';
  end if;
  return new;
end;
$$;
create trigger study_map_assignment_scope before insert or update on public.study_map_assignments
for each row execute function public.validate_study_map_assignment();
alter table public.study_map_library enable row level security;
alter table public.study_map_assignments enable row level security;
revoke all on public.study_map_library, public.study_map_assignments from anon, authenticated;
grant select on public.study_map_library to authenticated;
grant update (name) on public.study_map_library to authenticated;
grant select, insert, update, delete on public.study_map_assignments to authenticated;
create policy study_map_library_read on public.study_map_library for select to authenticated using (public.can_manage_users());
create policy study_map_library_rename on public.study_map_library for update to authenticated using (public.can_manage_users()) with check (public.can_manage_users());
create policy study_map_assignment_admin on public.study_map_assignments for all to authenticated using (public.can_manage_users()) with check (public.can_manage_users());
commit;
