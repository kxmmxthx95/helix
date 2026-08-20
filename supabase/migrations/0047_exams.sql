-- ระบบสร้างข้อสอบ + จัดสอบออนไลน์ — grill decision, 2026-08-20. Two-entity
-- split: a question bank owned by the subject (any teacher teaching that
-- subject can add/reuse questions), separate from an "opening" (exam_sessions)
-- that a teacher runs against their own classroom(s) by hand-picking bank
-- questions. Mirrors the score_items/teaching_assignments shape (0017/0030)
-- rather than inventing a new ownership model.
--
-- Question types: multiple_choice, true_false, short_answer — all
-- auto-graded (exact/case-insensitive match for short_answer). No essay/
-- manual-grading queue in this version.
--
-- Out of scope (grill decision): per-question timer (session has one
-- duration_minutes for the whole paper), random N-from-bank draw (teacher
-- always hand-picks a fixed set, only shuffle order per attempt), tab-lock/
-- fullscreen enforcement (only logs blur/visibility events for the teacher
-- to review after the fact).

create type exam_question_type as enum ('multiple_choice', 'true_false', 'short_answer');

-- ------------------------------------------------------------- exam_questions
-- The bank. Owned by subject, not by one teacher — see can_write_exam_subject
-- below. correct_answer holds the short_answer key (trimmed,
-- case-insensitive match at grading time); multiple_choice/true_false use
-- exam_question_choices instead and leave this null.
create table exam_questions (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null references subjects on delete cascade,
  question_type  exam_question_type not null,
  prompt         text not null,
  correct_answer text,
  points         numeric(6,2) not null default 1 check (points > 0),
  created_by     uuid not null references profiles on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((question_type = 'short_answer') = (correct_answer is not null))
);

create index exam_questions_subject_idx on exam_questions (subject_id);

create trigger exam_questions_touch before update on exam_questions
  for each row execute function touch_updated_at();
create trigger exam_questions_audit after insert or update or delete on exam_questions
  for each row execute function log_audit();

-- ------------------------------------------------------ exam_question_choices
-- multiple_choice (2+ rows) / true_false (exactly the 2 rows "ถูก"/"ผิด") —
-- one row per option, is_correct marks the key. Plain table over a jsonb
-- array to match every other structured-data table in this app (score_items
-- etc — jsonb here is audit_logs/webhook-payload only, see 0001/0040).
create table exam_question_choices (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references exam_questions on delete cascade,
  label        text not null,
  is_correct   boolean not null default false,
  position     int not null default 0
);

create index exam_question_choices_question_idx on exam_question_choices (question_id);

-- Exactly one correct choice per question — matches the single-answer MC/TF
-- shape this version supports (no multi-select).
create unique index exam_question_choices_one_correct_idx on exam_question_choices (question_id)
  where is_correct;

-- ---------------------------------------------------------------- exam_sessions
-- One "opening" of a set of bank questions. Owned by the teacher who created
-- it (session_teacher_id), not by a single teaching_assignment — targets are
-- a separate join table (exam_session_targets) so one session can cover
-- several of that teacher's own classrooms at once (grill decision).
create table exam_sessions (
  id                 uuid primary key default gen_random_uuid(),
  subject_id         uuid not null references subjects on delete cascade,
  teacher_id         uuid not null references profiles on delete restrict,
  title              text not null,
  opens_at           timestamptz not null,
  closes_at          timestamptz not null,
  -- Per-attempt countdown starting at first open, separate from the
  -- opens_at/closes_at window. Null = no countdown, only the window applies.
  duration_minutes   int check (duration_minutes is null or duration_minutes > 0),
  max_attempts       int not null default 1 check (max_attempts > 0),
  shuffle_questions  boolean not null default true,
  shuffle_choices    boolean not null default true,
  -- Mirrors a score_item into score_items/student_item_scores on grading
  -- (see sync_exam_attempt_to_gradebook below) — off by default, teacher
  -- opts in per session.
  sync_to_gradebook  boolean not null default false,
  gradebook_item_id  uuid references score_items on delete set null,
  -- Teacher-flipped, not automatic on closes_at — students only see their
  -- own answer key/correct answers once this is true (grill decision).
  review_released    boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (closes_at > opens_at)
);

create index exam_sessions_subject_idx on exam_sessions (subject_id);
create index exam_sessions_teacher_idx on exam_sessions (teacher_id);

create trigger exam_sessions_touch before update on exam_sessions
  for each row execute function touch_updated_at();
create trigger exam_sessions_audit after insert or update or delete on exam_sessions
  for each row execute function log_audit();

-- ----------------------------------------------------------- exam_session_targets
-- Which of the teacher's own teaching_assignments (i.e. which classrooms)
-- this session is open to.
create table exam_session_targets (
  session_id              uuid not null references exam_sessions on delete cascade,
  teaching_assignment_id  uuid not null references teaching_assignments on delete cascade,
  primary key (session_id, teaching_assignment_id)
);

-- ---------------------------------------------------------- exam_session_questions
-- Which bank questions this session uses, in what order, and at what point
-- value — points overrides exam_questions.points for this session only
-- (grill decision: adjustable when picked into a session).
create table exam_session_questions (
  session_id   uuid not null references exam_sessions on delete cascade,
  question_id  uuid not null references exam_questions on delete restrict,
  position     int not null,
  points       numeric(6,2) not null check (points > 0),
  primary key (session_id, question_id)
);

create index exam_session_questions_session_idx on exam_session_questions (session_id, position);

-- ------------------------------------------------------------------ exam_attempts
create type exam_attempt_status as enum ('in_progress', 'submitted');

create table exam_attempts (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references exam_sessions on delete cascade,
  student_id    uuid not null references students on delete restrict,
  attempt_no    int not null default 1,
  -- Server-stamped on first open — the duration_minutes countdown anchors to
  -- this, never to a client-reported time (grill decision: resumable after a
  -- dropped connection without resetting or extending the clock).
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  status        exam_attempt_status not null default 'in_progress',
  -- Per-attempt shuffle order, generated once at start and reused on every
  -- resume so a refresh doesn't re-shuffle mid-attempt.
  question_order uuid[] not null default '{}',
  score         numeric(7,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (session_id, student_id, attempt_no)
);

create index exam_attempts_session_idx on exam_attempts (session_id);
create index exam_attempts_student_idx on exam_attempts (student_id);

create trigger exam_attempts_touch before update on exam_attempts
  for each row execute function touch_updated_at();
create trigger exam_attempts_audit after insert or update or delete on exam_attempts
  for each row execute function log_audit();

-- ------------------------------------------------------------ exam_attempt_answers
-- One row per question per attempt, upserted on every answer change
-- (autosave — grill decision: resumable after a dropped connection without
-- losing already-answered questions). is_correct/points_awarded are filled
-- in by grade_exam_attempt() at submit time, null while in progress.
create table exam_attempt_answers (
  attempt_id      uuid not null references exam_attempts on delete cascade,
  question_id     uuid not null references exam_questions on delete restrict,
  choice_id       uuid references exam_question_choices on delete set null,
  short_answer    text,
  is_correct      boolean,
  points_awarded  numeric(6,2),
  answered_at     timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- ------------------------------------------------------------- exam_attempt_events
-- Tab-switch/blur log for the teacher to review — no client-side lockdown or
-- auto-penalty in this version, just a timestamped trail (grill decision).
create type exam_attempt_event_type as enum ('blur', 'visibility_hidden');

create table exam_attempt_events (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references exam_attempts on delete cascade,
  event_type  exam_attempt_event_type not null,
  at          timestamptz not null default now()
);

create index exam_attempt_events_attempt_idx on exam_attempt_events (attempt_id);

-- --------------------------------------------------------------------- helpers

-- Bank write: any teacher currently assigned to teach this subject (any
-- classroom/year), or a manager in that subject's department — same
-- can_manage()+department shape as can_write_teaching_assignment (0030), but
-- keyed on subject_id directly since the bank isn't per-teaching_assignment.
create or replace function can_write_exam_subject(p_subject_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from teaching_assignments ta
    where ta.subject_id = p_subject_id and ta.teacher_id = auth.uid()
  ) or (
    can_manage() and (
      is_org_wide()
      or exists (
        select 1 from curriculum_subjects cs
        join grade_levels gl on gl.id = cs.grade_level_id
        where cs.subject_id = p_subject_id and gl.department_id = auth_department()
      )
    )
  )
$$;

-- Bank read: teachers/managers who can write it. Students/guardians do NOT
-- get blanket subject access (that would leak every other question in the
-- bank, correct answers included, the moment they're enrolled in a class
-- being taught the subject) — see can_read_exam_question below for their
-- narrow, review_released-gated path instead.
create or replace function can_read_exam_subject(p_subject_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_exam_subject(p_subject_id)
$$;

-- A student/guardian may read one bank question via either of two paths:
-- (a) they have an exam_attempt in progress on a session that includes this
-- question — needed to render the exam itself while taking it — or (b) the
-- session has review_released on, for after-the-fact review. Both paths
-- still require the session to actually target their classroom (via the
-- attempt's own student_id / the session-targets join). Teachers/managers
-- fall back to the normal bank grant. correct_answer/is_correct stay
-- readable under path (a) too — the client must not render them until
-- submit; see the exam-taking hook's field allowlist.
create or replace function can_read_exam_question(p_question_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_exam_subject((select subject_id from exam_questions where id = p_question_id))
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
$$;

-- Session write: the session's own teacher, or a manager scoped to the
-- subject's department — same shape as can_write_teaching_assignment.
create or replace function can_write_exam_session(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from exam_sessions es
    where es.id = p_id
      and (
        es.teacher_id = auth.uid()
        or (can_manage() and (
          is_org_wide()
          or exists (
            select 1 from curriculum_subjects cs
            join grade_levels gl on gl.id = cs.grade_level_id
            where cs.subject_id = es.subject_id and gl.department_id = auth_department()
          )
        ))
      )
  )
$$;

-- Session read: can_write_exam_session, plus any student/guardian whose
-- classroom is a target of this session.
create or replace function can_read_exam_session(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_exam_session(p_id) or exists (
    select 1 from exam_session_targets est
    join teaching_assignments ta on ta.id = est.teaching_assignment_id
    join student_classroom_enrollments sce
      on sce.classroom_id = ta.classroom_id and sce.academic_year = ta.academic_year
    join students s on s.id = sce.student_id
    where est.session_id = p_id
      and (
        s.profile_id = auth.uid()
        or s.id in (select student_id from guardianships where parent_id = auth.uid())
      )
  )
$$;

-- A signed-in student may only ever see/write their own attempts; a teacher
-- who can write the session may read (grading) but not write student
-- answers directly (submission_write below allows the student's own writes,
-- teacher writes go through review_released/gradebook sync instead).
create or replace function can_read_exam_attempt(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from exam_attempts ea
    where ea.id = p_id
      and (
        can_write_exam_session(ea.session_id)
        or ea.student_id in (select id from students where profile_id = auth.uid())
        or ea.student_id in (select student_id from guardianships where parent_id = auth.uid())
      )
  )
$$;

create or replace function can_write_exam_attempt(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from exam_attempts ea
    where ea.id = p_id and ea.student_id in (select id from students where profile_id = auth.uid())
  )
$$;

-- ----------------------------------------------------------------- grading

-- Grades every answered question for one attempt, stamps points_awarded/
-- is_correct on exam_attempt_answers, totals into exam_attempts.score, and
-- (if the session opted in) mirrors the total into the gradebook via
-- sync_exam_attempt_to_gradebook. security definer so it isn't blocked by
-- the student's own (narrower) RLS grants on exam_questions/choices —
-- callable only via submit_exam_attempt below, never directly (revoked from
-- authenticated at the bottom of this block).
create or replace function grade_exam_attempt(p_attempt_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_session_id uuid;
  v_total numeric(7,2);
begin
  select session_id into v_session_id from exam_attempts where id = p_attempt_id;

  update exam_attempt_answers eaa set
    is_correct = case
      when q.question_type = 'short_answer' then
        lower(trim(eaa.short_answer)) = lower(trim(q.correct_answer))
      else
        exists (select 1 from exam_question_choices c
          where c.id = eaa.choice_id and c.is_correct)
    end
  from exam_questions q
  where eaa.question_id = q.id and eaa.attempt_id = p_attempt_id;

  update exam_attempt_answers eaa set
    points_awarded = case when eaa.is_correct then esq.points else 0 end
  from exam_session_questions esq
  where esq.session_id = v_session_id and esq.question_id = eaa.question_id
    and eaa.attempt_id = p_attempt_id;

  select coalesce(sum(points_awarded), 0) into v_total
    from exam_attempt_answers where attempt_id = p_attempt_id;

  update exam_attempts set score = v_total where id = p_attempt_id;

  perform sync_exam_attempt_to_gradebook(p_attempt_id);
end $$;

-- Upserts the attempt's score into student_item_scores against the
-- session's gradebook_item_id (creating the score_item on first sync) when
-- sync_to_gradebook is on. No-op otherwise. Reuses the score_items/
-- teaching_assignment_id mechanism as-is (0030) rather than a parallel
-- gradebook path — the exam session picks ONE of its targets as the
-- teaching_assignment the gradebook line lands under (the student's own
-- target), since score_items is per-teaching_assignment.
create or replace function sync_exam_attempt_to_gradebook(p_attempt_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_session exam_sessions%rowtype;
  v_student_id uuid;
  v_score numeric(7,2);
  v_max numeric(7,2);
  v_ta_id uuid;
  v_item_id uuid;
begin
  select es.* into v_session from exam_attempts ea join exam_sessions es on es.id = ea.session_id
    where ea.id = p_attempt_id;
  if not v_session.sync_to_gradebook then return; end if;

  select student_id, score into v_student_id, v_score from exam_attempts where id = p_attempt_id;

  select ta.id into v_ta_id
    from exam_session_targets est
    join teaching_assignments ta on ta.id = est.teaching_assignment_id
    join student_classroom_enrollments sce
      on sce.classroom_id = ta.classroom_id and sce.academic_year = ta.academic_year
    where est.session_id = v_session.id and sce.student_id = v_student_id
    limit 1;
  if v_ta_id is null then return; end if;

  -- score_items/student_item_scores both reject writes against a
  -- locked/archived/unconfigured term (see check_score_items_term_lock,
  -- check_student_item_scores_write, 0030) — a submit must never fail just
  -- because the gradebook side can't currently accept the score, so skip the
  -- sync silently rather than let that exception bubble out of
  -- submit_exam_attempt and abort the whole grading transaction.
  if not teaching_assignment_term_open(v_ta_id) then return; end if;

  v_item_id := v_session.gradebook_item_id;
  if v_item_id is null then
    select coalesce(sum(points), 0) into v_max from exam_session_questions where session_id = v_session.id;
    insert into score_items (teaching_assignment_id, kind, label, max_score)
      values (v_ta_id, 'exam', v_session.title, greatest(v_max, 0.01))
      returning id into v_item_id;
    update exam_sessions set gradebook_item_id = v_item_id where id = v_session.id;
  end if;

  insert into student_item_scores (score_item_id, student_id, score)
    values (v_item_id, v_student_id, v_score)
    on conflict (score_item_id, student_id) do update set score = excluded.score;
end $$;

-- Student-facing submit RPC — stamps submitted_at/status then grades.
-- Security definer so it can call the grading helpers above regardless of
-- the student's own RLS grants on exam_questions.
create or replace function submit_exam_attempt(p_attempt_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from exam_attempts where id = p_attempt_id
      and student_id in (select id from students where profile_id = auth.uid())
      and status = 'in_progress'
  ) then
    raise exception 'attempt not found, not yours, or already submitted';
  end if;

  update exam_attempts set status = 'submitted', submitted_at = now() where id = p_attempt_id;
  perform grade_exam_attempt(p_attempt_id);
end $$;

revoke all on function grade_exam_attempt(uuid) from public, authenticated, anon;
revoke all on function sync_exam_attempt_to_gradebook(uuid) from public, authenticated, anon;
grant execute on function submit_exam_attempt(uuid) to authenticated;

-- --------------------------------------------------------- answer-safe views
-- exam_questions/exam_question_choices RLS is row-level only — a student
-- mid-attempt legitimately gets read access to the row (see
-- can_read_exam_question path (a) above) so the exam renders, but that means
-- correct_answer/is_correct would otherwise sit right there in the network
-- response for anyone opening devtools during the exam. The exam-taking
-- client reads through these views instead of the base tables; grading
-- itself goes through grade_exam_attempt (security definer, reads the base
-- tables directly, unaffected). security_barrier keeps Postgres from
-- pushing a filter that could still leak the column via row visibility
-- side-channels.
create view exam_questions_for_attempt with (security_barrier) as
  select id, subject_id, question_type, prompt, points, created_by, created_at, updated_at
  from exam_questions;

create view exam_question_choices_for_attempt with (security_barrier) as
  select id, question_id, label, position
  from exam_question_choices;

grant select on exam_questions_for_attempt to authenticated;
grant select on exam_question_choices_for_attempt to authenticated;

-- --------------------------------------------------------------------- RLS

alter table exam_questions enable row level security;
alter table exam_question_choices enable row level security;
alter table exam_sessions enable row level security;
alter table exam_session_targets enable row level security;
alter table exam_session_questions enable row level security;
alter table exam_attempts enable row level security;
alter table exam_attempt_answers enable row level security;
alter table exam_attempt_events enable row level security;

create policy exam_questions_read on exam_questions
  for select to authenticated using (can_read_exam_question(id));
create policy exam_questions_write on exam_questions
  for all to authenticated
  using (can_write_exam_subject(subject_id))
  with check (can_write_exam_subject(subject_id));

create policy exam_question_choices_read on exam_question_choices
  for select to authenticated using (can_read_exam_question(question_id));
create policy exam_question_choices_write on exam_question_choices
  for all to authenticated
  using (exists (select 1 from exam_questions q where q.id = exam_question_choices.question_id
    and can_write_exam_subject(q.subject_id)))
  with check (exists (select 1 from exam_questions q where q.id = exam_question_choices.question_id
    and can_write_exam_subject(q.subject_id)));

create policy exam_sessions_read on exam_sessions
  for select to authenticated using (can_read_exam_session(id));
create policy exam_sessions_write on exam_sessions
  for all to authenticated using (can_write_exam_session(id)) with check (
    subject_id is not null and (
      teacher_id = auth.uid() or (can_manage() and (
        is_org_wide() or exists (
          select 1 from curriculum_subjects cs join grade_levels gl on gl.id = cs.grade_level_id
          where cs.subject_id = exam_sessions.subject_id and gl.department_id = auth_department()
        )
      ))
    )
  );

create policy exam_session_targets_read on exam_session_targets
  for select to authenticated using (can_read_exam_session(session_id));
create policy exam_session_targets_write on exam_session_targets
  for all to authenticated
  using (can_write_exam_session(session_id))
  with check (can_write_exam_session(session_id) and can_write_teaching_assignment(teaching_assignment_id));

create policy exam_session_questions_read on exam_session_questions
  for select to authenticated using (can_read_exam_session(session_id));
create policy exam_session_questions_write on exam_session_questions
  for all to authenticated
  using (can_write_exam_session(session_id))
  with check (can_write_exam_session(session_id));

create policy exam_attempts_read on exam_attempts
  for select to authenticated using (can_read_exam_attempt(id));
-- Insert only — a student starting their own attempt on a session they're a
-- target of, within the open window. No student-facing UPDATE policy at
-- all: status/submitted_at/score only ever change via submit_exam_attempt
-- (security definer, bypasses RLS), so a direct client update can't forge a
-- submission or score even if the student already holds the row's id.
create policy exam_attempts_insert on exam_attempts
  for insert to authenticated
  with check (
    student_id in (select id from students where profile_id = auth.uid())
    and can_read_exam_session(session_id)
    and now() between (select opens_at from exam_sessions where id = session_id)
      and (select closes_at from exam_sessions where id = session_id)
  );

create policy exam_attempt_answers_read on exam_attempt_answers
  for select to authenticated using (
    exists (select 1 from exam_attempts ea where ea.id = exam_attempt_answers.attempt_id
      and can_read_exam_attempt(ea.id))
  );
-- A student can only autosave into their own still-in-progress attempt.
create policy exam_attempt_answers_write on exam_attempt_answers
  for all to authenticated
  using (
    exists (select 1 from exam_attempts ea where ea.id = exam_attempt_answers.attempt_id
      and can_write_exam_attempt(ea.id))
  )
  with check (
    exists (select 1 from exam_attempts ea where ea.id = exam_attempt_answers.attempt_id
      and can_write_exam_attempt(ea.id) and ea.status = 'in_progress')
  );

create policy exam_attempt_events_read on exam_attempt_events
  for select to authenticated using (
    exists (select 1 from exam_attempts ea where ea.id = exam_attempt_events.attempt_id
      and can_read_exam_attempt(ea.id))
  );
create policy exam_attempt_events_write on exam_attempt_events
  for insert to authenticated with check (
    exists (select 1 from exam_attempts ea where ea.id = exam_attempt_events.attempt_id
      and can_write_exam_attempt(ea.id))
  );
