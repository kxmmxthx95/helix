-- "student_id in (select id from students where profile_id = auth.uid())" inside a policy runs the
-- subselect through students_read RLS: its volatile helpers (is_org_wide, auth_department,
-- cover_sees_student, a guardianships subplan) are evaluated first, so the planner cannot use the
-- profile_id index and seq-scans every student on each query (~550 ms of a 690 ms read).
-- _my_student_id() is security definer (skips that RLS) and hits the unique profile_id index.
-- profile_id is unique, so "= _my_student_id()" matches exactly the same rows.
do $$
declare
  p record;
  pat constant text := '(\S+)\s+IN\s+\(\s*SELECT\s+students\.id\s+FROM\s+students\s+WHERE\s+\(students\.profile_id\s+=\s+auth\.uid\(\)\)\)';
  q text;
  c text;
  stmt text;
  n int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check from pg_policies
    where schemaname = 'public' and (coalesce(qual, '') || coalesce(with_check, '')) ~* pat
  loop
    q := regexp_replace(p.qual, pat, '\1 = _my_student_id()', 'gi');
    c := regexp_replace(p.with_check, pat, '\1 = _my_student_id()', 'gi');
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then stmt := stmt || ' using (' || q || ')'; end if;
    if c is not null then stmt := stmt || ' with check (' || c || ')'; end if;
    execute stmt;
    n := n + 1;
  end loop;
  raise notice 'rewrote % policies', n;
end $$;
