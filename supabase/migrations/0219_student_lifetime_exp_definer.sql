-- student_lifetime_exp read 4 tables through their RLS (helper functions + subplans per row): ~350ms
-- per call, top app DB consumer under a classroom of students. Every row is already pinned to the
-- caller's own students row (auth.uid(), no parameter), so RLS adds nothing — run as definer.
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
security definer
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
