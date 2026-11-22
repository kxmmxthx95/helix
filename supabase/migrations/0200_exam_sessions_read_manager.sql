-- A head creating a room for another teacher's approved topic set (approval drawer → "สร้างห้องสอบ")
-- got 403 on `insert ... returning`: the insert passes exam_sessions_write's WITH CHECK, but the
-- returned row is then checked against the SELECT policies. exam_sessions_read_own needs
-- teacher_id = auth.uid() (false, the room belongs to the set's teacher) and can_read_exam_session()
-- is a STABLE function that cannot see the row being inserted. Same bug class as 0182: add a read
-- policy expressed purely over the row's own columns, mirroring the manager branch of
-- can_write_exam_session() (0047).
create policy exam_sessions_read_manager on exam_sessions
  for select to authenticated using (
    can_manage() and (
      is_org_wide() or exists (
        select 1 from curriculum_subjects cs join grade_levels gl on gl.id = cs.grade_level_id
        where cs.subject_id = exam_sessions.subject_id and gl.department_id = auth_department()
      )
    )
  );
