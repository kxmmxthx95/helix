-- Starting an attempt failed for every student ("new row violates row-level security policy"): the client does
-- INSERT ... RETURNING, so exam_attempts_read is checked against the new row, but can_read_exam_attempt() is a
-- stable security-definer function whose snapshot cannot see the row being inserted. Check the row's own
-- student_id directly first (also cheaper: no per-row function call for the student's own rows).
-- Rollback: recreate the policy with using (can_read_exam_attempt(id)).
drop policy exam_attempts_read on exam_attempts;
create policy exam_attempts_read on exam_attempts
  for select to authenticated
  using (
    student_id in (select id from students where profile_id = auth.uid())
    or can_read_exam_attempt(id)
  );
