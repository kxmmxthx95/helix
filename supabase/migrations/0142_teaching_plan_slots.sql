-- แผนการสอนแบบปฏิทิน: a ผังการเรียน topic (plan_topics, 0088) placed into a real
-- teaching period (date + period_no) of a teaching_assignment. Reverses the
-- "queue, not calendar" call of 0020 (teaching_plan_units, kept read-only).
-- Rows are sparse: only slots that have a topic or a taught-mark exist; the
-- full slot grid is computed client-side from schedule_entries (0019) x term
-- dates minus academic_events (0018). Taught-state lives here, per slot.

create table teaching_plan_slots (
  id                     uuid primary key default gen_random_uuid(),
  teaching_assignment_id uuid not null references teaching_assignments on delete cascade,
  slot_date              date not null,
  period_no              smallint not null check (period_no > 0),
  topic_id               uuid references plan_topics on delete set null,
  completed_at           timestamptz,
  completed_on_plan      boolean,
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (teaching_assignment_id, slot_date, period_no),
  check ((completed_at is null) = (completed_on_plan is null))
);

create index teaching_plan_slots_topic_idx on teaching_plan_slots (topic_id);

create trigger teaching_plan_slots_touch before update on teaching_plan_slots
  for each row execute function touch_updated_at();

-- Integrity: slot must be a real schedule_entries period of the assignment,
-- the topic must come from the matching ผังการเรียน subject/grade, a taught slot must be
-- reopened before its topic changes (grill: "ยกเลิกการบันทึกก่อนย้าย/ลบ"),
-- and a locked/archived term freezes writes (mirrors 0018/0019).
create or replace function check_teaching_plan_slot() returns trigger
  language plpgsql as $$
declare
  rec            teaching_plan_slots;
  v_subject_id   uuid;
  v_classroom_id uuid;
  v_grade        uuid;
  v_year         int;
  v_term         int;
  v_dept         uuid;
  locked_count   int;
begin
  rec := coalesce(new, old);

  select ta.subject_id, ta.classroom_id, ta.academic_year, ta.term
    into v_subject_id, v_classroom_id, v_year, v_term
    from teaching_assignments ta where ta.id = rec.teaching_assignment_id;
  select gl.department_id, gl.id into v_dept, v_grade
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where c.id = v_classroom_id;

  if tg_op <> 'DELETE' then
    if not exists (
      select 1 from schedule_entries se
      where se.teaching_assignment_id = rec.teaching_assignment_id
        and se.period_no = rec.period_no
        and se.day_of_week = extract(isodow from rec.slot_date)::int
    ) then
      raise exception 'no schedule_entries period for assignment on % period %', rec.slot_date, rec.period_no;
    end if;
    -- ผังการเรียน is independent of subjects (0088): match by name within the
    -- department, lessons of the classroom's grade level.
    if rec.topic_id is not null and not exists (
      select 1 from plan_topics pt
        join plan_lessons pl on pl.id = pt.lesson_id
        join plan_subjects ps on ps.id = pl.subject_id
        join subjects s on s.id = v_subject_id
      where pt.id = rec.topic_id
        and pl.grade_level_id = v_grade
        and ps.department_id = v_dept
        and btrim(ps.name) = btrim(s.name_th)
    ) then
      raise exception 'topic is not in the ผังการเรียน of the assignment''s subject and grade';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.completed_at is not null and new.completed_at is not null
     and new.topic_id is distinct from old.topic_id then
    raise exception 'reopen the taught slot before changing its topic';
  end if;
  -- v_subject_id null = the assignment itself is being cascade-deleted: let it through.
  if tg_op = 'DELETE' and old.completed_at is not null and v_subject_id is not null then
    raise exception 'reopen the taught slot before deleting it';
  end if;

  select count(*) filter (where status in ('locked', 'archived')) into locked_count
    from academic_terms
    where department_id = v_dept and academic_year = v_year
      and (v_term is null or term_type = (case v_term when 1 then 'term1' else 'term2' end)::term_type);
  if locked_count > 0 then
    raise exception 'academic term for department %, year % is locked/archived', v_dept, v_year;
  end if;

  return coalesce(new, old);
end $$;

create trigger teaching_plan_slots_check
  before insert or update or delete on teaching_plan_slots
  for each row execute function check_teaching_plan_slot();

alter table teaching_plan_slots enable row level security;

-- read: same shape as teaching_plan_units_read (0020).
create policy teaching_plan_slots_read on teaching_plan_slots
  for select to authenticated using (
    is_org_wide_academic()
    or teaching_assignment_id in (
      select ta.id from teaching_assignments ta
      join classrooms c on c.id = ta.classroom_id
      join grade_levels gl on gl.id = c.grade_level_id
      where gl.department_id = auth_department()
    )
  );

-- write: the assigned teacher only — managers oversee (read-only), grill decision.
create policy teaching_plan_slots_write on teaching_plan_slots
  for all to authenticated
  using (teaching_assignment_id in (select id from teaching_assignments where teacher_id = auth.uid()))
  with check (teaching_assignment_id in (select id from teaching_assignments where teacher_id = auth.uid()));
