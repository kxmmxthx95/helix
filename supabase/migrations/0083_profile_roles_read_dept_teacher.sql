-- Teachers must see the roles of colleagues in their own department, otherwise
-- useProfiles({ role: "teacher" }) drops every other teacher and the timetable
-- shows "—" instead of their names. Read only; writes stay super_admin.

create or replace function is_teacher() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from profile_roles where profile_id = auth.uid() and role = 'teacher')
$$;

drop policy profile_roles_read_dept on profile_roles;
create policy profile_roles_read_dept on profile_roles
  for select to authenticated using (
    (is_teacher() or is_dept_head() or is_org_wide())
    and exists (
      select 1 from profiles p
      where p.id = profile_roles.profile_id
        and (is_org_wide() or (p.department_id is not null and p.department_id = auth_department()))
    )
  );
