-- ชุดข้อสอบ (folders within the question bank) — grill decision, 2026-08-20.
-- A tag, not a container: one question can belong to several sets at once
-- (exam_question_sets, plain many-to-many join like profile_roles, 0001),
-- so re-tagging into a new set never duplicates the question row. Sets are
-- subject-scoped same as exam_questions — same can_write_exam_subject grant
-- covers both, no separate ownership model. Purely a bank-organization
-- layer: exam_sessions still hand-picks individual questions (0047)
-- regardless of which set(s) they're tagged into.

create table exam_sets (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references subjects on delete cascade,
  name        text not null,
  created_by  uuid not null references profiles on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index exam_sets_subject_idx on exam_sets (subject_id);

create trigger exam_sets_touch before update on exam_sets
  for each row execute function touch_updated_at();
create trigger exam_sets_audit after insert or update or delete on exam_sets
  for each row execute function log_audit();

create table exam_question_sets (
  question_id  uuid not null references exam_questions on delete cascade,
  set_id       uuid not null references exam_sets on delete cascade,
  primary key (question_id, set_id)
);

create index exam_question_sets_set_idx on exam_question_sets (set_id);

-- --------------------------------------------------------------------- RLS

alter table exam_sets enable row level security;
alter table exam_question_sets enable row level security;

-- Same grant shape as exam_questions (0047) — any teacher teaching the
-- subject, or a department manager.
create policy exam_sets_read on exam_sets
  for select to authenticated using (can_write_exam_subject(subject_id));
create policy exam_sets_write on exam_sets
  for all to authenticated
  using (can_write_exam_subject(subject_id))
  with check (can_write_exam_subject(subject_id));

create policy exam_question_sets_read on exam_question_sets
  for select to authenticated using (
    exists (select 1 from exam_sets s where s.id = exam_question_sets.set_id and can_write_exam_subject(s.subject_id))
  );
create policy exam_question_sets_write on exam_question_sets
  for all to authenticated
  using (
    exists (select 1 from exam_questions q where q.id = exam_question_sets.question_id and can_write_exam_subject(q.subject_id))
    and exists (select 1 from exam_sets s where s.id = exam_question_sets.set_id and can_write_exam_subject(s.subject_id))
  )
  with check (
    exists (select 1 from exam_questions q where q.id = exam_question_sets.question_id and can_write_exam_subject(q.subject_id))
    and exists (select 1 from exam_sets s where s.id = exam_question_sets.set_id and can_write_exam_subject(s.subject_id))
  );
