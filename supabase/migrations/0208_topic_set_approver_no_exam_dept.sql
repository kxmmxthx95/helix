-- A "ไม่มีสอบ" set has no topics, so 0183's topic-based department match found no approver and the set
-- reached only directors. Also match the set's own subject department (subjects.department_id).
create or replace function is_topic_set_approver(p_set uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
      select 1 from profile_roles
      where profile_id = auth.uid() and role in ('super_admin', 'director'))
    or (
      exists (
        select 1 from profile_roles
        where profile_id = auth.uid() and role in ('dept_head', 'dept_director'))
      and (
        exists (
          select 1
          from exam_topic_set_topics t
            join plan_topics pt on pt.id = t.topic_id
            join plan_lessons pl on pl.id = pt.lesson_id
            join plan_subjects ps on ps.id = pl.subject_id
          where t.set_id = p_set and ps.department_id = auth_department())
        or exists (
          select 1 from exam_topic_sets s join subjects sub on sub.id = s.subject_id
          where s.id = p_set and sub.department_id = auth_department())
      )
    )
$$;
