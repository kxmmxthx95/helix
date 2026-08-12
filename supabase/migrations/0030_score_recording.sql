-- ระบบบันทึกคะแนน — grill decision, 2026-08-12. Records คะแนนเก็บ/คะแนนสอบ
-- per teaching_assignment (subject × classroom × year × term), builds on the
-- score_collect_pct/score_exam_pct/grading_method scaffolding already added
-- in 0004/0023. Out of scope: converting to ปพ.5/transcript output, KG
-- (uses kg_assessment_topics instead — a different assessment model).
--
-- Both คะแนนเก็บ and คะแนนสอบ share one mechanism: score_items (a teacher's
-- own line items, e.g. "ใบงาน 1") + student_item_scores. teaching_assignments
-- .split_exam_items toggles whether the exam side is itemized (teacher makes
-- their own กลางภาค/ปลายภาค items) or collapsed to a single app-managed item
-- — no separate "single exam score" column, same table either way.
--
-- Score ratio override chain (a teacher's own assignment can override the
-- subject's curriculum default, which overrides the department default):
-- teaching_assignments.score_collect_pct/exam_pct → curriculum_subjects (0004)
-- → department_settings (0004).
--
-- 0-4/ร/มส grade-band conversion stays app-code-only per the 0004 grill
-- decision this migration doesn't relitigate — this migration only stores
-- raw scores + the ร/มส override flag.

alter table teaching_assignments
  add column score_collect_pct int,
  add column score_exam_pct int,
  add column split_exam_items boolean not null default false,
  add constraint teaching_assignments_score_pct_check check (
    (score_collect_pct is null) = (score_exam_pct is null)
    and (score_collect_pct is null or score_collect_pct + score_exam_pct = 100)
  );

create type score_item_kind as enum ('collect', 'exam');

-- ------------------------------------------------------------------ score_items
-- A teacher's own line items for one assignment. max_score is informational
-- (checked against student_item_scores.score, not against the assignment's
-- pct target) — items summing to the pct target is enforced app-side as a
-- warning only (grill decision), not a DB constraint, since items are
-- normally added gradually through the term.
create table score_items (
  id                      uuid primary key default gen_random_uuid(),
  teaching_assignment_id  uuid not null references teaching_assignments on delete cascade,
  kind                    score_item_kind not null,
  label                   text not null,
  max_score               numeric(6,2) not null check (max_score > 0),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index score_items_assignment_idx on score_items (teaching_assignment_id);

create trigger score_items_touch before update on score_items
  for each row execute function touch_updated_at();
create trigger score_items_audit after insert or update or delete on score_items
  for each row execute function log_audit();

-- ------------------------------------------------------------ student_item_scores
create table student_item_scores (
  id             uuid primary key default gen_random_uuid(),
  score_item_id  uuid not null references score_items on delete cascade,
  student_id     uuid not null references students on delete restrict,
  score          numeric(6,2) not null check (score >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (score_item_id, student_id)
);

create index student_item_scores_student_idx on student_item_scores (student_id);

create trigger student_item_scores_touch before update on student_item_scores
  for each row execute function touch_updated_at();
create trigger student_item_scores_audit
  after insert or update or delete on student_item_scores
  for each row execute function log_audit();

-- ------------------------------------------------------------ student_grade_status
-- ร (รอผล) / มส (ไม่มีสิทธิ์สอบ) — teacher-set override on top of a graded
-- assignment. Presence of a row = override active; deleting the row goes
-- back to a normally-computed grade. Doesn't touch/clear raw item scores.
create table student_grade_status (
  teaching_assignment_id  uuid not null references teaching_assignments on delete cascade,
  student_id              uuid not null references students on delete restrict,
  status                  text not null check (status in ('ร', 'มส')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (teaching_assignment_id, student_id)
);

create trigger student_grade_status_touch before update on student_grade_status
  for each row execute function touch_updated_at();
create trigger student_grade_status_audit
  after insert or update or delete on student_grade_status
  for each row execute function log_audit();

-- ------------------------------------------------------- student_pass_fail_scores
-- The entire grade for a grading_method='pass_fail' assignment (ผ่าน/ไม่ผ่าน)
-- — no score_items/numeric grade involved at all for these assignments.
create table student_pass_fail_scores (
  teaching_assignment_id  uuid not null references teaching_assignments on delete cascade,
  student_id              uuid not null references students on delete restrict,
  passed                  boolean not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (teaching_assignment_id, student_id)
);

create trigger student_pass_fail_scores_touch before update on student_pass_fail_scores
  for each row execute function touch_updated_at();
create trigger student_pass_fail_scores_audit
  after insert or update or delete on student_pass_fail_scores
  for each row execute function log_audit();

-- --------------------------------------------------------------------- helpers

-- Read: org-wide + the assignment's department + the assignment's own
-- teacher + the enrolled student themselves/their guardians (same
-- self/guardian shape as classroom_homeroom_teachers_read, 0017).
create or replace function can_read_teaching_assignment(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from teaching_assignments ta
    where ta.id = p_id
      and (
        is_org_wide()
        or ta.classroom_id in (
          select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
          where gl.department_id = auth_department()
        )
        or ta.teacher_id = auth.uid()
        or exists (
          select 1 from student_classroom_enrollments sce
          join students s on s.id = sce.student_id
          where sce.classroom_id = ta.classroom_id
            and sce.academic_year = ta.academic_year
            and (
              s.profile_id = auth.uid()
              or s.id in (select student_id from guardianships where parent_id = auth.uid())
            )
        )
      )
  )
$$;

-- Write: the assignment's own teacher, or can_manage() scoped to their
-- department, or org-wide — same shape as teaching_assignments_write (0017),
-- plus the assigned teacher themselves (narrower than behavior_records —
-- grades are subject-specific, not "any teacher", grill decision).
create or replace function can_write_teaching_assignment(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from teaching_assignments ta
    where ta.id = p_id
      and (
        ta.teacher_id = auth.uid()
        or (can_manage() and (
          is_org_wide()
          or ta.classroom_id in (
            select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
            where gl.department_id = auth_department()
          )
        ))
      )
  )
$$;

-- Official record → locks with the term, unlike attendance/behavior (which
-- deliberately stay open forever). Same department+year+term resolution as
-- check_teaching_assignment_academic_term (0018), via the assignment's
-- teacher's department. No academic_terms row at all also counts as locked
-- (nothing configured to write against yet). For a non-SEC assignment
-- (ta.term is null) this matches ALL of that department+year's term rows
-- (term1/term2/summer) and requires every one of them unlocked — same "any
-- locked row blocks" rule 0018 uses for the term-is-null case, not just
-- "at least one open row exists".
create or replace function teaching_assignment_term_open(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select
    count(*) > 0
    and count(*) filter (where t.status in ('locked', 'archived')) = 0
  from teaching_assignments ta
  join profiles p on p.id = ta.teacher_id
  join academic_terms t on t.department_id = p.department_id
    and t.academic_year = ta.academic_year
    and (ta.term is null or t.term_type = (case ta.term when 1 then 'term1' else 'term2' end)::term_type)
  where ta.id = p_id
$$;

-- ------------------------------------------------------------------- RLS: score_items

alter table score_items enable row level security;

create policy score_items_read on score_items
  for select to authenticated using (can_read_teaching_assignment(teaching_assignment_id));
create policy score_items_write on score_items
  for all to authenticated
  using (can_write_teaching_assignment(teaching_assignment_id))
  with check (can_write_teaching_assignment(teaching_assignment_id));

create or replace function check_score_items_term_lock() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  if not teaching_assignment_term_open(new.teaching_assignment_id) then
    raise exception 'academic term for this teaching assignment is locked/archived or not configured';
  end if;
  return new;
end $$;

create trigger score_items_term_lock_check
  before insert or update on score_items
  for each row execute function check_score_items_term_lock();

-- --------------------------------------------------------- RLS: student_item_scores

alter table student_item_scores enable row level security;

create policy student_item_scores_read on student_item_scores
  for select to authenticated using (
    exists (
      select 1 from score_items si
      where si.id = student_item_scores.score_item_id
        and can_read_teaching_assignment(si.teaching_assignment_id)
    )
  );
create policy student_item_scores_write on student_item_scores
  for all to authenticated
  using (
    exists (
      select 1 from score_items si
      where si.id = student_item_scores.score_item_id
        and can_write_teaching_assignment(si.teaching_assignment_id)
    )
  )
  with check (
    exists (
      select 1 from score_items si
      where si.id = student_item_scores.score_item_id
        and can_write_teaching_assignment(si.teaching_assignment_id)
    )
  );

-- Term-lock + "score can't exceed the item's own max_score" in one trigger
-- (both fire on the same insert/update).
create or replace function check_student_item_scores_write() returns trigger
  language plpgsql as $$
declare
  ta_id uuid;
  item_max numeric;
begin
  if tg_op = 'DELETE' then return old; end if;
  select teaching_assignment_id, max_score into ta_id, item_max
    from score_items where id = new.score_item_id;
  if not teaching_assignment_term_open(ta_id) then
    raise exception 'academic term for this teaching assignment is locked/archived or not configured';
  end if;
  if new.score > item_max then
    raise exception 'score % exceeds item max %', new.score, item_max;
  end if;
  return new;
end $$;

create trigger student_item_scores_write_check
  before insert or update on student_item_scores
  for each row execute function check_student_item_scores_write();

-- ------------------------------------------------- RLS: student_grade_status / pass_fail
-- Same shape for both — direct teaching_assignment_id column, no join needed.

alter table student_grade_status enable row level security;
alter table student_pass_fail_scores enable row level security;

create policy student_grade_status_read on student_grade_status
  for select to authenticated using (can_read_teaching_assignment(teaching_assignment_id));
create policy student_grade_status_write on student_grade_status
  for all to authenticated
  using (can_write_teaching_assignment(teaching_assignment_id))
  with check (can_write_teaching_assignment(teaching_assignment_id));

create policy student_pass_fail_scores_read on student_pass_fail_scores
  for select to authenticated using (can_read_teaching_assignment(teaching_assignment_id));
create policy student_pass_fail_scores_write on student_pass_fail_scores
  for all to authenticated
  using (can_write_teaching_assignment(teaching_assignment_id))
  with check (can_write_teaching_assignment(teaching_assignment_id));

create or replace function check_teaching_assignment_child_term_lock() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  if not teaching_assignment_term_open(new.teaching_assignment_id) then
    raise exception 'academic term for this teaching assignment is locked/archived or not configured';
  end if;
  return new;
end $$;

create trigger student_grade_status_term_lock_check
  before insert or update on student_grade_status
  for each row execute function check_teaching_assignment_child_term_lock();
create trigger student_pass_fail_scores_term_lock_check
  before insert or update on student_pass_fail_scores
  for each row execute function check_teaching_assignment_child_term_lock();
