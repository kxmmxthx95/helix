-- Open "จัดการสถานภาพ" to dept_head, scoped to their own department
-- (supersedes the org-wide-only grill decision of 0013/0014, 2026-10-13).
-- Students/grade promotion are already covered by students_manage (can_manage
-- + own department); only the three tables below were org-wide-only.

drop policy classrooms_write on classrooms;
create policy classrooms_write on classrooms
  for all to authenticated
  using (is_org_wide() or (can_manage() and grade_level_id in (
    select id from grade_levels where department_id = auth_department())))
  with check (is_org_wide() or (can_manage() and grade_level_id in (
    select id from grade_levels where department_id = auth_department())));

drop policy student_classroom_enrollments_write on student_classroom_enrollments;
create policy student_classroom_enrollments_write on student_classroom_enrollments
  for all to authenticated
  using (is_org_wide() or (can_manage() and classroom_id in (
    select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where gl.department_id = auth_department())))
  with check (is_org_wide() or (can_manage() and classroom_id in (
    select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where gl.department_id = auth_department())));

drop policy transfer_intakes_all on transfer_intakes;
create policy transfer_intakes_all on transfer_intakes
  for all to authenticated
  using (is_org_wide() or (can_manage() and student_id in (
    select id from students where department_id = auth_department())))
  with check (is_org_wide() or (can_manage() and student_id in (
    select id from students where department_id = auth_department())));
