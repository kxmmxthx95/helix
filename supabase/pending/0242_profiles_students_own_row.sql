-- Step 2 of 2 for the student profile leak. APPLY ONLY AFTER the app that reads teacher names/contacts from profile_directory
-- (usePractice: useProfilesByIds, useTeacherContact) is deployed: until then students would lose teacher names on the timetable.
-- A student could read every profile of their department through the REST API (national_id, date_of_birth, home address,
-- line_user_id, phone, email: 185 rows for a student of a 185-profile department) and, through policies that look into profiles,
-- the department's employee_positions (HR status and career notes). Students keep profiles_read_self only.
-- To apply: git mv supabase/pending/0242_profiles_students_own_row.sql supabase/migrations/ && supabase db push
alter policy profiles_read_scope on public.profiles using (
  not is_student() and (is_org_wide() or (department_id is not null and department_id = auth_department()))
);
