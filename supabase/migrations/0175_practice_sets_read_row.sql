-- 0173/0174 pointed practice_sets_read at can_read_practice_set(id), which
-- re-queries practice_sets by id. On INSERT ... RETURNING the new row is not
-- yet visible to that inner query, so the select policy failed and every
-- insert (set create, self-serve roll) died with 42501 / HTTP 403.
-- Fix: row-based predicate evaluated on the row's own columns; the by-id
-- function (used by child tables) delegates to it.

create or replace function can_read_practice_row(p_subject_id uuid, p_topic_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_bank_row(p_subject_id, p_topic_id)
    or (
      p_subject_id is not null
      and can_read_practice_subject(p_subject_id)
      and (
        p_topic_id is null
        or my_student_in_grade(
          (select pl.grade_level_id from plan_topics pt join plan_lessons pl on pl.id = pt.lesson_id where pt.id = p_topic_id),
          p_subject_id)
      )
    )
    or (
      p_subject_id is null
      and my_student_in_grade_any(
        (select pl.grade_level_id from plan_topics pt join plan_lessons pl on pl.id = pt.lesson_id where pt.id = p_topic_id))
    )
$$;

create or replace function can_read_practice_set(p_set_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from practice_sets ps
    where ps.id = p_set_id and can_read_practice_row(ps.subject_id, ps.topic_id)
  )
$$;

drop policy practice_sets_read on practice_sets;
create policy practice_sets_read on practice_sets
  for select to authenticated using (can_read_practice_row(subject_id, topic_id));
