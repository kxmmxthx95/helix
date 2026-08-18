-- Auto-calculated ร/มส — grill decision, 2026-08-18. Was pure manual
-- override (0030); teachers wanted it derived from data they already
-- record elsewhere instead of typed by hand every time.
--
-- มส (attendance < 80%) takes priority over ร (missing collect work) when
-- both apply — failing attendance is the more serious status. Needs >= 5
-- marked periods before attendance counts at all, so a fresh term with only
-- a couple of check-ins doesn't false-positive to มส. The existing manual
-- student_grade_status row, when present, still wins over both (teachers
-- keep an escape hatch — e.g. excusing a sick student) — that table's
-- meaning doesn't change, this just adds an auto-computed fallback for when
-- no row exists.
--
-- "ครบ" for a collect item: has an assignment_submissions row when the item
-- requires_submission, otherwise has a student_item_scores row (an
-- in-class item has no submission concept at all — a typed score is what
-- "done" means there). Any one missing item is enough for ร (no partial
-- threshold, grill decision).

create or replace function attendance_rate(
  p_teaching_assignment_id uuid,
  p_student_id uuid
) returns table(marked int, rate numeric) language sql stable as $$
  select
    count(*)::int,
    case when count(*) = 0 then null
      else count(*) filter (where par.status in ('present', 'late', 'leave'))::numeric / count(*)
    end
  from period_attendance_records par
  join schedule_entries se on se.id = par.schedule_entry_id
  where se.teaching_assignment_id = p_teaching_assignment_id
    and par.student_id = p_student_id
$$;

create or replace function computed_grade_status(
  p_teaching_assignment_id uuid,
  p_student_id uuid
) returns text language sql stable as $$
  select case
    when (select marked from attendance_rate(p_teaching_assignment_id, p_student_id)) >= 5
      and (select rate from attendance_rate(p_teaching_assignment_id, p_student_id)) < 0.8
      then 'มส'
    when exists (
      select 1 from score_items si
      where si.teaching_assignment_id = p_teaching_assignment_id
        and si.kind = 'collect'
        and not exists (
          select 1 from assignment_submissions sub
          where sub.score_item_id = si.id and sub.student_id = p_student_id
        )
        and not exists (
          select 1 from student_item_scores sis
          where sis.score_item_id = si.id and sis.student_id = p_student_id
        )
    ) then 'ร'
    else null
  end
$$;

-- Resolved status for a roster: manual override (student_grade_status) when
-- present, else the computed value. One row per (teaching_assignment,
-- student) that has either an override or a non-null computed status —
-- callers wanting "every roster student" left-join this against the roster
-- app-side, same as they already do with student_grade_status today.
create or replace view resolved_grade_status as
select
  ta.id as teaching_assignment_id,
  s.id as student_id,
  coalesce(gs.status, computed_grade_status(ta.id, s.id)) as status,
  gs.status is not null as is_manual
from teaching_assignments ta
join student_classroom_enrollments sce on sce.classroom_id = ta.classroom_id and sce.academic_year = ta.academic_year
join students s on s.id = sce.student_id
left join student_grade_status gs on gs.teaching_assignment_id = ta.id and gs.student_id = s.id
where coalesce(gs.status, computed_grade_status(ta.id, s.id)) is not null;
