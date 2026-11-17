-- แบบฝึกหัด อิงหัวข้อจากผังการเรียน — grill decision, 2026-11-17.
-- practice_sets.topic_id now points at plan_topics (0088) instead of the
-- practice-only catalog (practice_lessons/practice_topics, 0056), which is
-- dropped: one source of truth, edited only from ผังการเรียน.
--
--  * Old sets: topic name is copied into title (display fallback), topic_id
--    cleared — no fuzzy matching against the plan.
--  * A set's grade level = grade level of its topic's lesson. Students see
--    a topic'd set only when their current classroom's grade matches; sets
--    without a topic (old / self-serve) stay visible to every classroom
--    studying the subject, as before.
--  * on delete restrict: a plan topic/lesson that has practice sets cannot
--    be deleted (protects the bank and students' attempts).

-- ---------------------------------------------------------------- migrate

update practice_sets ps
   set title = pt.name
  from practice_topics pt
 where ps.topic_id = pt.id and ps.title is null;

alter table practice_sets drop constraint practice_sets_topic_id_fkey;
update practice_sets set topic_id = null;
alter table practice_sets
  add constraint practice_sets_topic_id_fkey foreign key (topic_id) references plan_topics on delete restrict;

drop table practice_topics;
drop table practice_lessons;

-- ---------------------------------------------------------------- helpers

-- Same subject<->plan lesson rule as check_teaching_plan_slot_topic (0171),
-- minus the grade (a practice set is per subject; the grade comes from the
-- topic): the plan subject's name is a prefix of the subject name within the
-- lesson grade's department, or the lesson is tagged with the subject.
create or replace function plan_topic_fits_subject(p_topic_id uuid, p_subject_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from plan_topics pt
      join plan_lessons pl on pl.id = pt.lesson_id
      join grade_levels gl on gl.id = pl.grade_level_id
      join plan_subjects ps on ps.id = pl.subject_id
      join subjects sj on sj.id = p_subject_id
    where pt.id = p_topic_id
      and (
        (ps.department_id = gl.department_id and starts_with(btrim(sj.name_th), btrim(ps.name)))
        or exists (select 1 from plan_lesson_subjects pls where pls.lesson_id = pl.id and pls.subject_id = p_subject_id)
      )
  )
$$;

create or replace function check_practice_set_topic() returns trigger
  language plpgsql as $$
begin
  if new.topic_id is not null and not plan_topic_fits_subject(new.topic_id, new.subject_id) then
    raise exception 'topic is not in the ผังการเรียน of the practice set''s subject';
  end if;
  return new;
end $$;

create trigger practice_sets_check_topic
  before insert or update of topic_id, subject_id on practice_sets
  for each row execute function check_practice_set_topic();

-- Student (self, or a guardian's child) currently in a classroom of this
-- grade that studies the subject. Mirrors can_read_practice_subject (0053).
create or replace function my_student_in_grade(p_grade_id uuid, p_subject_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from students s
    join lateral (
      select classroom_id, academic_year from student_classroom_enrollments sce
      where sce.student_id = s.id order by sce.created_at desc limit 1
    ) cur on true
    join classrooms c on c.id = cur.classroom_id and c.grade_level_id = p_grade_id
    join teaching_assignments ta
      on ta.classroom_id = cur.classroom_id and ta.academic_year = cur.academic_year
      and ta.subject_id = p_subject_id
    where s.profile_id = auth.uid() or s.id in (select student_id from guardianships where parent_id = auth.uid())
  )
$$;

create or replace function can_read_practice_set(p_set_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from practice_sets ps
    where ps.id = p_set_id
      and (
        can_write_practice_subject(ps.subject_id)
        or (
          can_read_practice_subject(ps.subject_id)
          and (
            ps.topic_id is null
            or my_student_in_grade(
              (select pl.grade_level_id from plan_topics pt join plan_lessons pl on pl.id = pt.lesson_id where pt.id = ps.topic_id),
              ps.subject_id)
          )
        )
      )
  )
$$;

drop policy practice_sets_read on practice_sets;
create policy practice_sets_read on practice_sets
  for select to authenticated using (can_read_practice_set(id));
