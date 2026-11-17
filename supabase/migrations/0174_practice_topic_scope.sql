-- แบบฝึกหัด ไม่ผูกรายวิชา — grill decision, 2026-11-17 (follow-up to 0173).
-- A practice set / its questions may hang off a ผังการเรียน topic alone
-- (subject_id null):
--  * write: a teacher or manager of the topic's department (is_org_wide sees all)
--  * read:  those writers, plus students/guardians whose child's current
--           classroom is of the topic's lesson grade
--  * one teacher-curated set per topic (the topic page is the set)
-- Subject-scoped rows (exam bank, self-serve sets, pre-0174 sets) keep their
-- old rules unchanged.

alter table exam_questions alter column subject_id drop not null;
alter table exam_questions add column plan_topic_id uuid references plan_topics on delete restrict;
alter table exam_questions add constraint exam_questions_scope_check
  check (subject_id is not null or plan_topic_id is not null);
create index exam_questions_plan_topic_idx on exam_questions (plan_topic_id) where plan_topic_id is not null;

alter table practice_sets alter column subject_id drop not null;
alter table practice_sets add constraint practice_sets_scope_check
  check (subject_id is not null or topic_id is not null);
create unique index practice_sets_one_curated_per_topic
  on practice_sets (topic_id) where is_teacher_curated and topic_id is not null;

create or replace function check_practice_set_topic() returns trigger
  language plpgsql as $$
begin
  if new.topic_id is not null and new.subject_id is not null
     and not plan_topic_fits_subject(new.topic_id, new.subject_id) then
    raise exception 'topic is not in the ผังการเรียน of the practice set''s subject';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- helpers

create or replace function can_write_plan_topic(p_topic_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select (can_manage() or exists (
            select 1 from profile_roles where profile_id = auth.uid() and role = 'teacher'))
    and exists (
      select 1
      from plan_topics pt
        join plan_lessons pl on pl.id = pt.lesson_id
        join plan_subjects ps on ps.id = pl.subject_id
      where pt.id = p_topic_id
        and (is_org_wide() or ps.department_id = auth_department())
    )
$$;

-- subject-scoped row (old rule) or topic-scoped row (new rule).
create or replace function can_write_bank_row(p_subject_id uuid, p_topic_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select (p_subject_id is not null and can_write_exam_subject(p_subject_id))
      or (p_topic_id is not null and can_write_plan_topic(p_topic_id))
$$;

-- Student (self or guardian's child) currently in a classroom of this grade.
create or replace function my_student_in_grade_any(p_grade_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from students s
    join lateral (
      select classroom_id from student_classroom_enrollments sce
      where sce.student_id = s.id order by sce.created_at desc limit 1
    ) cur on true
    join classrooms c on c.id = cur.classroom_id and c.grade_level_id = p_grade_id
    where s.profile_id = auth.uid() or s.id in (select student_id from guardianships where parent_id = auth.uid())
  )
$$;

create or replace function can_write_practice_set(p_set_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from practice_sets ps
    where ps.id = p_set_id and can_write_bank_row(ps.subject_id, ps.topic_id)
  )
$$;

create or replace function can_read_practice_set(p_set_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from practice_sets ps
    where ps.id = p_set_id
      and (
        can_write_bank_row(ps.subject_id, ps.topic_id)
        or (
          ps.subject_id is not null
          and can_read_practice_subject(ps.subject_id)
          and (
            ps.topic_id is null
            or my_student_in_grade(
              (select pl.grade_level_id from plan_topics pt join plan_lessons pl on pl.id = pt.lesson_id where pt.id = ps.topic_id),
              ps.subject_id)
          )
        )
        or (
          ps.subject_id is null
          and my_student_in_grade_any(
            (select pl.grade_level_id from plan_topics pt join plan_lessons pl on pl.id = pt.lesson_id where pt.id = ps.topic_id))
        )
      )
  )
$$;

-- Students read a question when it sits in a practice set they can read
-- (practice reveals the key per question by design, 0053).
create or replace function can_read_exam_question(p_question_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
      select 1 from exam_questions q
      where q.id = p_question_id and can_write_bank_row(q.subject_id, q.plan_topic_id))
    or exists (
      select 1
      from exam_session_questions esq
      join exam_attempts ea on ea.session_id = esq.session_id
      where esq.question_id = p_question_id
        and ea.status = 'in_progress'
        and ea.student_id in (
          select id from students where profile_id = auth.uid()
          union select student_id from guardianships where parent_id = auth.uid()
        )
    )
    or exists (
      select 1
      from exam_session_questions esq
      join exam_sessions es on es.id = esq.session_id and es.review_released
      join exam_session_targets est on est.session_id = es.id
      join teaching_assignments ta on ta.id = est.teaching_assignment_id
      join student_classroom_enrollments sce
        on sce.classroom_id = ta.classroom_id and sce.academic_year = ta.academic_year
      join students s on s.id = sce.student_id
      where esq.question_id = p_question_id
        and (
          s.profile_id = auth.uid()
          or s.id in (select student_id from guardianships where parent_id = auth.uid())
        )
    )
    or exists (
      select 1 from practice_set_questions psq
      where psq.question_id = p_question_id and can_read_practice_set(psq.set_id)
    )
$$;

-- ---------------------------------------------------------------- policies

drop policy exam_questions_write on exam_questions;
create policy exam_questions_write on exam_questions
  for all to authenticated
  using (can_write_bank_row(subject_id, plan_topic_id))
  with check (can_write_bank_row(subject_id, plan_topic_id));

drop policy exam_question_choices_write on exam_question_choices;
create policy exam_question_choices_write on exam_question_choices
  for all to authenticated
  using (exists (select 1 from exam_questions q where q.id = exam_question_choices.question_id
    and can_write_bank_row(q.subject_id, q.plan_topic_id)))
  with check (exists (select 1 from exam_questions q where q.id = exam_question_choices.question_id
    and can_write_bank_row(q.subject_id, q.plan_topic_id)));

drop policy exam_question_images_write on storage.objects;
create policy exam_question_images_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'exam-question-images' and exists (
      select 1 from exam_questions q
      where q.id = (storage.foldername(name))[1]::uuid
        and can_write_bank_row(q.subject_id, q.plan_topic_id)
    )
  );
drop policy exam_question_images_delete on storage.objects;
create policy exam_question_images_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'exam-question-images' and exists (
      select 1 from exam_questions q
      where q.id = (storage.foldername(name))[1]::uuid
        and can_write_bank_row(q.subject_id, q.plan_topic_id)
    )
  );

drop policy practice_sets_write on practice_sets;
create policy practice_sets_write on practice_sets
  for insert to authenticated with check (
    can_write_bank_row(subject_id, topic_id)
    or (not is_teacher_curated and subject_id is not null and created_by = auth.uid() and can_read_practice_subject(subject_id))
  );
drop policy practice_sets_update on practice_sets;
create policy practice_sets_update on practice_sets
  for update to authenticated
  using (can_write_bank_row(subject_id, topic_id)) with check (can_write_bank_row(subject_id, topic_id));
drop policy practice_sets_delete on practice_sets;
create policy practice_sets_delete on practice_sets
  for delete to authenticated using (can_write_bank_row(subject_id, topic_id));

drop policy practice_set_questions_write on practice_set_questions;
create policy practice_set_questions_write on practice_set_questions
  for all to authenticated
  using (exists (select 1 from practice_sets ps where ps.id = practice_set_questions.set_id
    and (can_write_bank_row(ps.subject_id, ps.topic_id) or ps.created_by = auth.uid())))
  with check (exists (select 1 from practice_sets ps where ps.id = practice_set_questions.set_id
    and (can_write_bank_row(ps.subject_id, ps.topic_id) or ps.created_by = auth.uid())));
