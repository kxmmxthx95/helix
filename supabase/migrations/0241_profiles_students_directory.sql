-- Step 1 of 2 for the student profile leak (step 2: supabase/pending/0242_profiles_students_own_row.sql, applied once the app reads
-- teacher names/contacts from this view). profile_directory exposes safe columns only: email/phone just for people who hold a
-- non-student role (the "contact your teacher" card is intentional); a student sees staff of their department plus themself, never
-- classmates; everyone else sees what profiles_read_scope already lets them see. Additive: nothing changes for the existing app.
-- The view runs with its owner's rights (security_invoker = false) on purpose: its WHERE clause is the access rule.
create view public.profile_directory with (security_invoker = false) as
select p.id, p.department_id, p.prefix, p.first_name, p.last_name, p.avatar_path, p.updated_at, p.is_active,
       p.teacher_code, p.learning_area_id,
       case when s.is_staff then p.email end as email,
       case when s.is_staff then p.phone end as phone
from public.profiles p
cross join lateral (
  select exists (select 1 from public.profile_roles r where r.profile_id = p.id and r.role <> 'student') as is_staff
) s
where auth.uid() is not null
  and (
    p.id = auth.uid()
    or ((is_org_wide() or (p.department_id is not null and p.department_id = auth_department())) and (s.is_staff or not is_student()))
  );

revoke all on public.profile_directory from public, anon;
grant select on public.profile_directory to authenticated;
