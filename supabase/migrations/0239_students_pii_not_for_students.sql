-- A student could read every student of their department through the REST API: national_id, date of birth, health data,
-- home address, coordinates (students) and every parent's phone/email/address (student_contacts) — 181 / 336 rows for a
-- student of a 181-student department. The department-wide clause is meant for staff, so it no longer applies to the
-- `student` role. Own row (profile_id / _my_student_id()), guardians, org-wide staff, covers and staff in the department
-- keep exactly the access they had.
drop policy students_read on public.students;
create policy students_read on public.students for select to authenticated using (
  is_org_wide()
  or (department_id = auth_department() and not is_student())
  or profile_id = auth.uid()
  or exists (select 1 from guardianships g where g.student_id = students.id and g.parent_id = auth.uid())
);

drop policy student_contacts_read on public.student_contacts;
create policy student_contacts_read on public.student_contacts for select to authenticated using (
  is_org_wide()
  or (not is_student() and student_id in (select students.id from students where students.department_id = auth_department()))
  or student_id = _my_student_id()
  or student_id in (select guardianships.student_id from guardianships where guardianships.parent_id = auth.uid())
);
