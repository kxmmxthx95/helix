-- Execute against the explicitly verified Helix project; all fixture writes roll back.
begin;
do $$
declare admin_id uuid; subject_id uuid; grade_id uuid; actor record; n integer; tested integer := 0;
begin
  select profile_id into strict admin_id from public.profile_roles where role='super_admin' limit 1;
  select s.id, g.id into strict subject_id, grade_id from public.plan_subjects s join public.grade_levels g on g.department_id=s.department_id limit 1;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  set local role authenticated;
  if not public.can_manage_users() then raise exception 'Admin claim setup failed'; end if;
  update public.study_map_library set name='StudyMap verification' where id='forest';
  if (select name from public.study_map_library where id='forest') <> 'StudyMap verification' then raise exception 'Rename readback failed'; end if;
  insert into public.study_map_assignments(plan_subject_id,grade_level_id,map_id) values(subject_id,grade_id,'forest') on conflict(plan_subject_id,grade_level_id) do update set map_id=excluded.map_id;
  if not exists(select 1 from public.study_map_assignments a where a.plan_subject_id=subject_id and a.grade_level_id=grade_id and map_id='forest') then raise exception 'Assignment readback failed'; end if;
  reset role;
  for actor in select distinct on(r.role) r.profile_id, r.role from public.profile_roles r where not exists(select 1 from public.profile_roles a where a.profile_id=r.profile_id and a.role='super_admin') order by r.role loop
    perform set_config('request.jwt.claim.sub',actor.profile_id::text,true);
    set local role authenticated;
    if exists(select 1 from public.study_map_library) or exists(select 1 from public.study_map_assignments) then raise exception 'Read leaked for %',actor.role; end if;
    update public.study_map_library set name='Denied' where id='forest';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Rename allowed for %',actor.role; end if;
    update public.study_map_assignments set map_id='forest';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Update allowed for %',actor.role; end if;
    delete from public.study_map_assignments where plan_subject_id=subject_id;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Delete allowed for %',actor.role; end if;
    begin
      insert into public.study_map_assignments(plan_subject_id,grade_level_id,map_id) values(subject_id,grade_id,'forest') on conflict(plan_subject_id,grade_level_id) do update set map_id=excluded.map_id;
      raise exception 'Insert allowed for %',actor.role;
    exception when insufficient_privilege then null;
    end;
    reset role;
    tested := tested+1;
    raise notice 'PASS unauthorized role %',actor.role;
  end loop;
  if tested=0 then raise exception 'No unauthorized roles tested'; end if;
  set local role anon;
  begin
    perform 1 from public.study_map_library;
    raise exception 'Anonymous library read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.study_map_assignments;
    raise exception 'Anonymous assignment read allowed';
  exception when insufficient_privilege then null; end;
  reset role;
  raise notice 'PASS admin rename + assignment readback; % non-admin roles denied; anonymous denied',tested;
end $$;
rollback;
select 'verification complete; test writes rolled back' as result;
