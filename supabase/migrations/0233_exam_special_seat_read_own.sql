-- A student (or their guardian) may read their own special seat (พิเศษ N), like exam_session_seats_read_own (0205/0226),
-- so the exam card can show it. Everyone else still needs can_write_exam_session.
create policy exam_session_special_seats_read_own on exam_session_special_seats
  for select to authenticated using (
    student_id = _my_student_id()
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );
