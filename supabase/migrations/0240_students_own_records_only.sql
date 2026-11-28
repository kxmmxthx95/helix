-- Students could read other students' records through the REST API (all rows of attendance_records, period_attendance_records,
-- student_leave_requests, behavior_records, student_cohort_enrollments, and every student's student_item_scores), because the
-- "same department" / "same classroom" clauses meant for staff also matched them (and guardians saw their child's whole class's scores).
-- Staff, guardians (their own children) and covers keep exactly what they had. A student now gets only their own rows; the app already
-- filters these reads by the student's own id.

alter policy attendance_records_read on public.attendance_records using (
  (not is_student() and (
    (is_org_wide() OR (classroom_id IN ( SELECT c.id
   FROM (classrooms c
     JOIN grade_levels gl ON ((gl.id = c.grade_level_id)))
  WHERE (gl.department_id = auth_department()))) OR (classroom_id IN ( SELECT cht.classroom_id
   FROM classroom_homeroom_teachers cht
  WHERE (cht.teacher_id = auth.uid()))) OR (student_id = _my_student_id()) OR (student_id IN ( SELECT guardianships.student_id
   FROM guardianships
  WHERE (guardianships.parent_id = auth.uid()))))
  ))
  or student_id = _my_student_id()
);

alter policy period_attendance_records_read on public.period_attendance_records using (
  (not is_student() and (
    (is_org_wide() OR (schedule_entry_id IN ( SELECT se.id
   FROM (((schedule_entries se
     JOIN teaching_assignments ta ON ((ta.id = se.teaching_assignment_id)))
     JOIN classrooms c ON ((c.id = ta.classroom_id)))
     JOIN grade_levels gl ON ((gl.id = c.grade_level_id)))
  WHERE (gl.department_id = auth_department()))) OR (schedule_entry_id IN ( SELECT se.id
   FROM (schedule_entries se
     JOIN teaching_assignments ta ON ((ta.id = se.teaching_assignment_id)))
  WHERE (ta.teacher_id = auth.uid()))) OR (student_id = _my_student_id()) OR (student_id IN ( SELECT guardianships.student_id
   FROM guardianships
  WHERE (guardianships.parent_id = auth.uid()))))
  ))
  or student_id = _my_student_id()
);

alter policy student_leave_requests_read on public.student_leave_requests using (
  (not is_student() and (
    (is_org_wide() OR (student_id IN ( SELECT s.id
   FROM (students s
     JOIN grade_levels gl ON ((gl.id = s.grade_level_id)))
  WHERE (gl.department_id = auth_department()))) OR (current_student_classroom(student_id) IN ( SELECT cht.classroom_id
   FROM classroom_homeroom_teachers cht
  WHERE (cht.teacher_id = auth.uid()))) OR (student_id = _my_student_id()) OR (student_id IN ( SELECT guardianships.student_id
   FROM guardianships
  WHERE (guardianships.parent_id = auth.uid()))))
  ))
  or student_id = _my_student_id()
);

alter policy behavior_records_read on public.behavior_records using (
  (not is_student() and (
    (is_org_wide() OR (classroom_id IN ( SELECT c.id
   FROM (classrooms c
     JOIN grade_levels gl ON ((gl.id = c.grade_level_id)))
  WHERE (gl.department_id = auth_department()))) OR (EXISTS ( SELECT 1
   FROM profile_roles
  WHERE ((profile_roles.profile_id = auth.uid()) AND (profile_roles.role = 'teacher'::app_role)))) OR (student_id = _my_student_id()) OR (student_id IN ( SELECT guardianships.student_id
   FROM guardianships
  WHERE (guardianships.parent_id = auth.uid()))))
  ))
  or student_id = _my_student_id()
);

alter policy student_cohort_enrollments_read on public.student_cohort_enrollments using (
  (not is_student() and (
    (is_org_wide() OR (cohort_id IN ( SELECT curriculum_cohorts.id
   FROM curriculum_cohorts
  WHERE (curriculum_cohorts.department_id = auth_department()))) OR (student_id = _my_student_id()) OR (student_id IN ( SELECT guardianships.student_id
   FROM guardianships
  WHERE (guardianships.parent_id = auth.uid()))))
  ))
  or student_id = _my_student_id()
);

-- Scores: the old policy went through can_read_teaching_assignment(), whose last clause admits every student/guardian of the classroom.
-- Staff keep the first three clauses (org-wide, department classrooms, own assignment); students/guardians get only their own rows.
create or replace function public.can_staff_read_teaching_assignment(p_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from teaching_assignments ta
    where ta.id = p_id and not is_student() and (
      is_org_wide()
      or ta.classroom_id in (select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id where gl.department_id = auth_department())
      or ta.teacher_id = auth.uid()
    )
  )
$$;

alter policy student_item_scores_read on public.student_item_scores using (
  student_id = _my_student_id()
  or student_id in (select guardianships.student_id from guardianships where guardianships.parent_id = auth.uid())
  or exists (select 1 from score_items si where si.id = student_item_scores.score_item_id and can_staff_read_teaching_assignment(si.teaching_assignment_id))
);
