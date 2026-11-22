-- Students (and guardians) see where they sit: their own seat row, plus the rooms of sessions they may read.
-- Write policies untouched. Other students' seats stay invisible.
create policy exam_session_seats_read_own on exam_session_seats
  for select to authenticated using (
    student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );

create policy exam_session_rooms_read_student on exam_session_rooms
  for select to authenticated using (can_read_exam_session(session_id));

-- Physical room names (rooms is department-scoped; a student's department may differ from the room's).
create policy rooms_read_exam on rooms
  for select to authenticated using (
    exists (select 1 from exam_session_rooms r where r.room_id = rooms.id and can_read_exam_session(r.session_id))
  );
