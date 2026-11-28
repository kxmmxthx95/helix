-- Students keep only their own profiles row (profiles_read_self). Names, avatars and teacher contact come from profile_directory (0241).
-- Side effect: policies that look into profiles for the student role (e.g. employee_positions) no longer match for students.
alter policy profiles_read_scope on public.profiles using (
  not is_student() and (is_org_wide() or (department_id is not null and department_id = auth_department()))
);
