-- Bug fix, 2026-08-17. teaching_assignments_write (0017) requires can_manage()
-- — a plain teacher (not dept_head+) has never been able to write their own
-- teaching_assignments row at all. useSaveAssignmentScorePct (0030) lets a
-- teacher "save" their own score_collect_pct/score_exam_pct/split_exam_items
-- from ScoreRecording.tsx, but RLS silently drops the UPDATE (0 rows
-- affected, no error — .update() without .select() never surfaces that) so
-- it looked saved until the next refresh reverted it.
--
-- Fix: let the assigned teacher through for UPDATE, but restrict them (via
-- trigger, since RLS can't do column-level checks) to just the score-ratio
-- columns — reassigning classroom/subject/teacher/etc. stays manager-only
-- through the original policy.

create policy teaching_assignments_write_own_pct on teaching_assignments
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create or replace function check_teaching_assignment_pct_only_for_teacher() returns trigger
  language plpgsql as $$
begin
  if can_manage() then return new; end if;
  -- Only the assigned teacher could reach here at all (see the policy
  -- above) — restrict them to the score-ratio columns on their own row.
  if new.teacher_id is distinct from old.teacher_id
    or new.subject_id is distinct from old.subject_id
    or new.classroom_id is distinct from old.classroom_id
    or new.academic_year is distinct from old.academic_year
    or new.term is distinct from old.term
    or new.periods_per_week is distinct from old.periods_per_week
    or new.group_id is distinct from old.group_id
  then
    raise exception 'teachers may only update their own score ratio settings';
  end if;
  return new;
end $$;

create trigger teaching_assignments_teacher_pct_only
  before update on teaching_assignments
  for each row execute function check_teaching_assignment_pct_only_for_teacher();
