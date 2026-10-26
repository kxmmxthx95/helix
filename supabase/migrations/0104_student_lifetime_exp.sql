-- Lifetime EXP inputs for the student portal rank (docs/design/student-portal-maple.md).
-- Read-only, SECURITY INVOKER: every table is read through the caller's own RLS,
-- and rows are additionally pinned to students.profile_id = auth.uid(). There is
-- no student-id parameter, so one student can't ask about another (a guardian
-- or staff caller has no students row of their own and gets all zeros).
create or replace function student_lifetime_exp()
returns table (
  sub_on_time bigint,
  sub_late bigint,
  att_present bigint,
  att_late bigint,
  behavior_points bigint
)
language sql
stable
set search_path = public
as $$
  with me as (select id from students where profile_id = auth.uid())
  select
    (select count(*) from assignment_submissions s join score_items si on si.id = s.score_item_id
       where s.student_id in (select id from me) and (si.due_date is null or s.submitted_at::date <= si.due_date)),
    (select count(*) from assignment_submissions s join score_items si on si.id = s.score_item_id
       where s.student_id in (select id from me) and si.due_date is not null and s.submitted_at::date > si.due_date),
    (select count(*) from attendance_records where student_id in (select id from me) and status = 'present'),
    (select count(*) from attendance_records where student_id in (select id from me) and status = 'late'),
    (select coalesce(sum(points), 0)::bigint from behavior_records where student_id in (select id from me));
$$;

revoke all on function student_lifetime_exp() from public, anon;
grant execute on function student_lifetime_exp() to authenticated;
