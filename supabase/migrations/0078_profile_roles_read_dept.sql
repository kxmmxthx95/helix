-- dept_head / org-wide readers must see the roles of people in their own department,
-- otherwise useProfiles({ role }) sees every other teacher as role-less and drops them
-- (แท็บภาพรวม เอกสารการสอน listed only the head themself). Read only; writes stay super_admin.

create policy profile_roles_read_dept on profile_roles
  for select to authenticated using (
    (is_dept_head() or is_org_wide())
    and exists (
      select 1 from profiles p
      where p.id = profile_roles.profile_id
        and (is_org_wide() or (p.department_id is not null and p.department_id = auth_department()))
    )
  );
