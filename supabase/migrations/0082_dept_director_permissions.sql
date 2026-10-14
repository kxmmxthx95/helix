-- dept_director permissions (see 0081). Everywhere dept_head already means
-- "own department" it now includes dept_director; on top of that it may manage
-- sensitive HR data (salary/contract/status/document) of its own department's
-- people — never its own record, nor a director/super_admin/another
-- dept_director (grill decision, 2026-10-14).

-- ------------------------------------------------------------ role helpers
create or replace function can_manage() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid()
      and role in ('super_admin', 'director', 'staff', 'dept_head', 'dept_director')
  )
$$;

create or replace function can_manage_academic() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid()
      and role in ('super_admin', 'director', 'dept_head', 'dept_director')
  )
$$;

-- Name kept (used by 0072/0078/0080 policies): "dept-scoped head", either kind.
create or replace function is_dept_head() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid() and role in ('dept_head', 'dept_director')
  )
$$;

create or replace function check_profile_role_dept() returns trigger
  language plpgsql as $$
declare
  dept uuid;
  area uuid;
begin
  if new.role in ('dept_head', 'dept_director', 'teacher', 'student') then
    select department_id into dept from profiles where id = new.profile_id;
    if dept is null then
      raise exception 'role % requires profile % to have a department', new.role, new.profile_id;
    end if;
  end if;
  if new.role = 'teacher' then
    select learning_area_id into area from profiles where id = new.profile_id;
    if area is null then
      raise exception 'role teacher requires profile % to have a learning_area_id', new.profile_id;
    end if;
  end if;
  return new;
end $$;

create or replace function ensure_employee_position() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if new.role in ('staff', 'teacher', 'dept_head', 'dept_director', 'director') then
    insert into employee_positions (profile_id) values (new.profile_id)
    on conflict (profile_id) do nothing;
  end if;
  return new;
end $$;

-- Daily digests (0066) go to dept_head of the department — dept_director too.
-- Patched in place rather than re-pasting the whole function.
do $$
declare
  src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p where p.proname = 'enqueue_attendance_digests';
  execute replace(src, 'pr.role = ''dept_head''', 'pr.role in (''dept_head'', ''dept_director'')');
end $$;

-- ---------------------------------------------------------------- HR scope
-- Org-level HR admins (can_manage_hr) manage anyone. A dept_director manages
-- only people in their own department, excluding themself and anyone holding
-- director/super_admin/dept_director.
create or replace function can_manage_hr_of(p_profile_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_manage_hr()
    or (
      p_profile_id is distinct from auth.uid()
      and exists (
        select 1 from profile_roles
        where profile_id = auth.uid() and role = 'dept_director'
      )
      and exists (
        select 1 from profiles p
        where p.id = p_profile_id
          and p.department_id is not null
          and p.department_id = auth_department()
      )
      and not exists (
        select 1 from profile_roles
        where profile_id = p_profile_id and role in ('super_admin', 'director', 'dept_director')
      )
    )
$$;

drop policy employee_positions_write on employee_positions;
create policy employee_positions_write on employee_positions
  for all to authenticated
  using (can_manage_hr_of(profile_id)) with check (can_manage_hr_of(profile_id));

drop policy employee_compensation_read on employee_compensation;
create policy employee_compensation_read on employee_compensation
  for select to authenticated using (profile_id = auth.uid() or can_manage_hr_of(profile_id));
drop policy employee_compensation_write on employee_compensation;
create policy employee_compensation_write on employee_compensation
  for all to authenticated
  using (can_manage_hr_of(profile_id)) with check (can_manage_hr_of(profile_id));

drop policy employee_status_history_read on employee_status_history;
create policy employee_status_history_read on employee_status_history
  for select to authenticated using (profile_id = auth.uid() or can_manage_hr_of(profile_id));
drop policy employee_status_history_write on employee_status_history;
create policy employee_status_history_write on employee_status_history
  for insert to authenticated with check (can_manage_hr_of(profile_id));

drop policy documents_read on documents;
create policy documents_read on documents
  for select to authenticated using (profile_id = auth.uid() or can_manage_hr_of(profile_id));
drop policy documents_write on documents;
create policy documents_write on documents
  for all to authenticated
  using (can_manage_hr_of(profile_id)) with check (can_manage_hr_of(profile_id));

drop policy contracts_read on contracts;
create policy contracts_read on contracts
  for select to authenticated using (profile_id = auth.uid() or can_manage_hr_of(profile_id));
drop policy contracts_write on contracts;
create policy contracts_write on contracts
  for all to authenticated
  using (can_manage_hr_of(profile_id)) with check (can_manage_hr_of(profile_id));

-- Bucket paths are `${profile_id}/...` — only cast when the folder is a uuid.
drop policy employee_documents_read on storage.objects;
create policy employee_documents_read on storage.objects
  for select to authenticated using (
    bucket_id = 'employee-documents' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
           then can_manage_hr_of(((storage.foldername(name))[1])::uuid) else false end
    )
  );
drop policy employee_documents_write on storage.objects;
create policy employee_documents_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'employee-documents'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         then can_manage_hr_of(((storage.foldername(name))[1])::uuid) else false end
  );
drop policy employee_documents_delete on storage.objects;
create policy employee_documents_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'employee-documents'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         then can_manage_hr_of(((storage.foldername(name))[1])::uuid) else false end
  );

-- ------------------------------------------------------------- data move
-- Anyone holding the old "ผู้บริหารแผนก" position title becomes a real
-- dept_director. The title row is dropped unless an employee still uses it as
-- a general job title (employee_positions.job_title_id would be nulled).
update profile_roles
  set role = 'dept_director', position_title_id = null
  where role = 'dept_head'
    and position_title_id = (select id from position_titles where code = 'dept_lead');

delete from position_titles
  where code = 'dept_lead'
    and not exists (select 1 from employee_positions where job_title_id = position_titles.id);
