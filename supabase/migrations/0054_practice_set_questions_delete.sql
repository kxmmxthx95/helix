-- practice_set_questions_write (0053) only covered insert — the create-set
-- flow now creates an empty shell first and adds questions afterward
-- (mirrors exam_sessions' two-step flow), which needs delete too so the
-- "replace whole question list" edit (delete-then-reinsert) can run.

drop policy practice_set_questions_write on practice_set_questions;

create policy practice_set_questions_write on practice_set_questions
  for all to authenticated
  using (
    exists (
      select 1 from practice_sets ps where ps.id = practice_set_questions.set_id
        and (can_write_practice_subject(ps.subject_id) or ps.created_by = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from practice_sets ps where ps.id = practice_set_questions.set_id
        and (can_write_practice_subject(ps.subject_id) or ps.created_by = auth.uid())
    )
  );
