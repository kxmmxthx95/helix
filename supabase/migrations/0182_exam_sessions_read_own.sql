-- INSERT ... RETURNING (supabase-js .insert().select()) checks the new row against the SELECT policy,
-- but can_read_exam_session() is a STABLE function that cannot see the row being inserted, so a teacher
-- creating a session failed with an RLS violation. Read-own by column needs no lookup (same fix as 0175).
create policy exam_sessions_read_own on exam_sessions
  for select to authenticated using (teacher_id = auth.uid());
