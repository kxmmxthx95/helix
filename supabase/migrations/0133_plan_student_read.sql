-- ผังการเรียน (นักเรียน): a student reads the plan lessons tagged to a subject taught in
-- their current room (same grade level, enrolment year) — same join as can_read_doc_lesson (0071).
-- plan_topics / plan_lesson_files / plan_lesson_subjects reads all go through
-- `lesson_id in (select id from plan_lessons)`, so this one policy opens them too.
-- Linked files stay behind doc_files / subject-documents RLS (approved files of the student's own subjects only).

create or replace function student_reads_plan_lesson(p_lesson_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from plan_lessons l
    join plan_lesson_subjects pls on pls.lesson_id = l.id
    join students s on s.profile_id = auth.uid()
    join lateral (
      select classroom_id, academic_year from student_classroom_enrollments sce
      where sce.student_id = s.id order by sce.created_at desc limit 1
    ) cur on true
    join classrooms c on c.id = cur.classroom_id and c.grade_level_id = l.grade_level_id
    join teaching_assignments ta
      on ta.classroom_id = c.id and ta.academic_year = cur.academic_year and ta.subject_id = pls.subject_id
    where l.id = p_lesson_id
  )
$$;

create policy plan_lessons_read_student on plan_lessons
  for select to authenticated using (student_reads_plan_lesson(id));
