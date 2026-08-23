-- แบบฝึกหัด — grill decision, 2026-08-23. Separate, ungraded mode from
-- ข้อสอบ (0047): no time window, no attempt cap, not synced to the
-- gradebook, students retry freely, feedback is per-question immediately
-- (not gated behind a teacher review_released flag). Reuses the
-- exam_questions bank as-is — no separate question bank.
--
-- One shape covers both ways a set comes to exist (grill decision): a
-- teacher curates one in advance (is_teacher_curated=true, shown to every
-- classroom currently studying the subject — no per-classroom targets
-- table, unlike exam_sessions), or a student self-serves by
-- subject+topic+difficulty and the app inserts a throwaway
-- is_teacher_curated=false set of 10 random questions to hang the attempt
-- off of. Every practice_attempt always points at a practice_set either way.

create table practice_sets (
  id                 uuid primary key default gen_random_uuid(),
  subject_id         uuid not null references subjects on delete cascade,
  created_by         uuid not null references profiles on delete restrict,
  is_teacher_curated boolean not null default true,
  title              text,
  -- Self-serve filters this pull was drawn from — null on teacher-curated
  -- sets. Kept for the student's own "ฝึกอีกครั้ง" re-roll, not enforced.
  topic              text,
  difficulty         exam_question_difficulty,
  created_at         timestamptz not null default now()
);

create index practice_sets_subject_idx on practice_sets (subject_id);
create index practice_sets_created_by_idx on practice_sets (created_by);

create trigger practice_sets_audit after insert or update or delete on practice_sets
  for each row execute function log_audit();

create table practice_set_questions (
  set_id       uuid not null references practice_sets on delete cascade,
  question_id  uuid not null references exam_questions on delete restrict,
  position     int not null,
  primary key (set_id, question_id)
);

create index practice_set_questions_set_idx on practice_set_questions (set_id, position);

create type practice_attempt_status as enum ('in_progress', 'submitted');

create table practice_attempts (
  id             uuid primary key default gen_random_uuid(),
  set_id         uuid not null references practice_sets on delete cascade,
  student_id     uuid not null references students on delete restrict,
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  status         practice_attempt_status not null default 'in_progress',
  -- Per-attempt shuffle order, generated once at start and reused on resume
  -- — same resumability shape as exam_attempts (0047).
  question_order uuid[] not null default '{}',
  score          numeric(7,2),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index practice_attempts_set_idx on practice_attempts (set_id);
create index practice_attempts_student_idx on practice_attempts (student_id, created_at desc);

create trigger practice_attempts_touch before update on practice_attempts
  for each row execute function touch_updated_at();

-- One row per question per attempt. Unlike exam_attempt_answers, is_correct/
-- points_awarded are stamped immediately by grade_practice_answer (called on
-- every answer save, not just at submit) since the whole point is instant
-- per-question feedback.
create table practice_attempt_answers (
  attempt_id      uuid not null references practice_attempts on delete cascade,
  question_id     uuid not null references exam_questions on delete restrict,
  choice_id       uuid references exam_question_choices on delete set null,
  short_answer    text,
  is_correct      boolean,
  points_awarded  numeric(6,2),
  answered_at     timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- --------------------------------------------------------------------- helpers

-- Write: same grant as the exam bank (can_write_exam_subject, 0047) — any
-- teacher currently teaching the subject, or a manager scoped to its
-- department.
create or replace function can_write_practice_subject(p_subject_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_exam_subject(p_subject_id)
$$;

-- Read: can_write_practice_subject, or a student/guardian currently enrolled
-- in a classroom with a teaching_assignment for this subject (any
-- classroom — no per-set targets, grill decision: "เปิดให้ทุกห้องที่เรียน
-- วิชานี้"). "Currently enrolled" = latest student_classroom_enrollments row
-- per student, same "most recent wins" rule as useMyCurrentClassroom.
create or replace function can_read_practice_subject(p_subject_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_practice_subject(p_subject_id)
    or exists (
      select 1
      from students s
      join lateral (
        select classroom_id, academic_year from student_classroom_enrollments sce
        where sce.student_id = s.id order by sce.created_at desc limit 1
      ) cur on true
      join teaching_assignments ta
        on ta.classroom_id = cur.classroom_id and ta.academic_year = cur.academic_year
        and ta.subject_id = p_subject_id
      where s.profile_id = auth.uid() or s.id in (select student_id from guardianships where parent_id = auth.uid())
    )
$$;

create or replace function can_read_practice_set(p_set_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_read_practice_subject((select subject_id from practice_sets where id = p_set_id))
$$;

create or replace function can_write_practice_set(p_set_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_practice_subject((select subject_id from practice_sets where id = p_set_id))
$$;

create or replace function can_write_practice_attempt(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from practice_attempts pa
    where pa.id = p_id and pa.student_id in (select id from students where profile_id = auth.uid())
  )
$$;

create or replace function can_read_practice_attempt(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from practice_attempts pa
    where pa.id = p_id
      and (
        can_write_practice_attempt(pa.id)
        or can_write_practice_set(pa.set_id)
        or pa.student_id in (select student_id from guardianships where parent_id = auth.uid())
      )
  )
$$;

-- ----------------------------------------------------------------- grading

-- Grades one answer immediately (called by save_practice_answer right after
-- the upsert) — unlike grade_exam_attempt this runs per-question, not once
-- at submit, since practice reveals correct/incorrect the moment the
-- student answers. Also re-totals the attempt's running score. security
-- definer so it can read exam_questions/exam_question_choices regardless of
-- the student's own (narrower) RLS grants there.
create or replace function grade_practice_answer(p_attempt_id uuid, p_question_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update practice_attempt_answers paa set
    is_correct = case
      when q.question_type = 'short_answer' then
        paa.short_answer is not null and lower(trim(paa.short_answer)) = lower(trim(q.correct_answer))
      else
        exists (select 1 from exam_question_choices c where c.id = paa.choice_id and c.is_correct)
    end,
    points_awarded = case when (case
      when q.question_type = 'short_answer' then
        paa.short_answer is not null and lower(trim(paa.short_answer)) = lower(trim(q.correct_answer))
      else
        exists (select 1 from exam_question_choices c where c.id = paa.choice_id and c.is_correct)
    end) then q.points else 0 end
  from exam_questions q
  where paa.question_id = q.id and paa.attempt_id = p_attempt_id and paa.question_id = p_question_id;

  update practice_attempts set score = (
    select coalesce(sum(points_awarded), 0) from practice_attempt_answers where attempt_id = p_attempt_id
  ) where id = p_attempt_id;
end $$;

-- Student-facing upsert-and-grade RPC — the client never reads
-- correct_answer/is_correct off exam_questions directly, it calls this and
-- gets is_correct back on the row. security definer so it can write despite
-- the student's own narrower grants, but only into their own in_progress
-- attempt (checked explicitly, mirroring exam_attempt_answers_write's
-- using/with-check shape).
create or replace function save_practice_answer(
  p_attempt_id uuid, p_question_id uuid, p_choice_id uuid, p_short_answer text
) returns practice_attempt_answers
  language plpgsql security definer set search_path = public as $$
declare
  v_row practice_attempt_answers;
begin
  if not exists (
    select 1 from practice_attempts
    where id = p_attempt_id
      and status = 'in_progress'
      and student_id in (select id from students where profile_id = auth.uid())
  ) then
    raise exception 'attempt not found, not yours, or already submitted';
  end if;

  insert into practice_attempt_answers (attempt_id, question_id, choice_id, short_answer, answered_at)
  values (p_attempt_id, p_question_id, p_choice_id, p_short_answer, now())
  on conflict (attempt_id, question_id) do update
    set choice_id = excluded.choice_id, short_answer = excluded.short_answer, answered_at = excluded.answered_at
  returning * into v_row;

  perform grade_practice_answer(p_attempt_id, p_question_id);

  select * into v_row from practice_attempt_answers where attempt_id = p_attempt_id and question_id = p_question_id;
  return v_row;
end $$;

create or replace function submit_practice_attempt(p_attempt_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from practice_attempts where id = p_attempt_id
      and student_id in (select id from students where profile_id = auth.uid())
      and status = 'in_progress'
  ) then
    raise exception 'attempt not found, not yours, or already submitted';
  end if;

  update practice_attempts set status = 'submitted', submitted_at = now() where id = p_attempt_id;
end $$;

revoke all on function grade_practice_answer(uuid, uuid) from public, authenticated, anon;
grant execute on function save_practice_answer(uuid, uuid, uuid, text) to authenticated;
grant execute on function submit_practice_attempt(uuid) to authenticated;

-- --------------------------------------------------------------------- RLS

alter table practice_sets enable row level security;
alter table practice_set_questions enable row level security;
alter table practice_attempts enable row level security;
alter table practice_attempt_answers enable row level security;

create policy practice_sets_read on practice_sets
  for select to authenticated using (can_read_practice_subject(subject_id));
-- Insert covers both teacher-curated sets and a student's own self-serve
-- pull (created_by = auth.uid() either way — the student rolling their own
-- practice_set is the "write" for that row, not a bank-write privilege).
create policy practice_sets_write on practice_sets
  for insert to authenticated with check (
    can_write_practice_subject(subject_id)
    or (not is_teacher_curated and created_by = auth.uid() and can_read_practice_subject(subject_id))
  );
create policy practice_sets_update on practice_sets
  for update to authenticated using (can_write_practice_subject(subject_id)) with check (can_write_practice_subject(subject_id));
create policy practice_sets_delete on practice_sets
  for delete to authenticated using (can_write_practice_subject(subject_id));

create policy practice_set_questions_read on practice_set_questions
  for select to authenticated using (can_read_practice_set(set_id));
create policy practice_set_questions_write on practice_set_questions
  for insert to authenticated with check (
    exists (
      select 1 from practice_sets ps where ps.id = practice_set_questions.set_id
        and (can_write_practice_subject(ps.subject_id) or ps.created_by = auth.uid())
    )
  );

create policy practice_attempts_read on practice_attempts
  for select to authenticated using (can_read_practice_attempt(id));
create policy practice_attempts_insert on practice_attempts
  for insert to authenticated
  with check (student_id in (select id from students where profile_id = auth.uid()) and can_read_practice_set(set_id));

create policy practice_attempt_answers_read on practice_attempt_answers
  for select to authenticated using (
    exists (select 1 from practice_attempts pa where pa.id = practice_attempt_answers.attempt_id
      and can_read_practice_attempt(pa.id))
  );
