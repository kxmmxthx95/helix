-- A teaching period can hold several ผังการเรียน topics. teaching_plan_slots.topic_id
-- (0142) moves to a join table; the slot row stays one-per-period and keeps the
-- taught-state, so "taught" still applies to the whole period.

create table teaching_plan_slot_topics (
  slot_id  uuid not null references teaching_plan_slots on delete cascade,
  topic_id uuid not null references plan_topics on delete cascade,
  position smallint not null default 0,
  primary key (slot_id, topic_id)
);
create index teaching_plan_slot_topics_topic_idx on teaching_plan_slot_topics (topic_id);

insert into teaching_plan_slot_topics (slot_id, topic_id)
  select id, topic_id from teaching_plan_slots where topic_id is not null;

-- The 0142 trigger referenced topic_id; replace it before dropping the column.
drop trigger teaching_plan_slots_check on teaching_plan_slots;
alter table teaching_plan_slots drop column topic_id;

create or replace function check_teaching_plan_slot() returns trigger
  language plpgsql as $$
declare
  rec            teaching_plan_slots;
  v_subject_id   uuid;
  v_classroom_id uuid;
  v_year         int;
  v_term         int;
  v_dept         uuid;
  locked_count   int;
begin
  rec := coalesce(new, old);

  select ta.subject_id, ta.classroom_id, ta.academic_year, ta.term
    into v_subject_id, v_classroom_id, v_year, v_term
    from teaching_assignments ta where ta.id = rec.teaching_assignment_id;
  select gl.department_id into v_dept
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where c.id = v_classroom_id;

  if tg_op <> 'DELETE' and not exists (
    select 1 from schedule_entries se
    where se.teaching_assignment_id = rec.teaching_assignment_id
      and se.period_no = rec.period_no
      and se.day_of_week = extract(isodow from rec.slot_date)::int
  ) then
    raise exception 'no schedule_entries period for assignment on % period %', rec.slot_date, rec.period_no;
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

-- Topic integrity: from the matching ผังการเรียน subject/grade (by name within the
-- department, as 0142), and a taught slot's topics are frozen until reopened.
create or replace function check_teaching_plan_slot_topic() returns trigger
  language plpgsql as $$
declare
  rec          teaching_plan_slot_topics;
  s            teaching_plan_slots;
  v_subject_id uuid;
  v_grade      uuid;
  v_dept       uuid;
begin
  rec := coalesce(new, old);
  select * into s from teaching_plan_slots where id = rec.slot_id;
  if not found then return coalesce(new, old); end if; -- slot cascade-deleting

  if s.completed_at is not null then
    raise exception 'reopen the taught slot before changing its topics';
  end if;

  if tg_op <> 'DELETE' then
    select ta.subject_id, gl.id, gl.department_id into v_subject_id, v_grade, v_dept
      from teaching_assignments ta
      join classrooms c on c.id = ta.classroom_id
      join grade_levels gl on gl.id = c.grade_level_id
      where ta.id = s.teaching_assignment_id;
    if not exists (
      select 1 from plan_topics pt
        join plan_lessons pl on pl.id = pt.lesson_id
        join plan_subjects ps on ps.id = pl.subject_id
        join subjects sj on sj.id = v_subject_id
      where pt.id = rec.topic_id
        and pl.grade_level_id = v_grade
        and ps.department_id = v_dept
        and btrim(ps.name) = btrim(sj.name_th)
    ) then
      raise exception 'topic is not in the ผังการเรียน of the assignment''s subject and grade';
    end if;
  end if;

  -- Touch the slot so its trigger enforces the locked/archived-term freeze.
  update teaching_plan_slots set updated_at = now() where id = rec.slot_id;
  return coalesce(new, old);
end $$;

create trigger teaching_plan_slot_topics_check
  before insert or update or delete on teaching_plan_slot_topics
  for each row execute function check_teaching_plan_slot_topic();

alter table teaching_plan_slot_topics enable row level security;

create policy teaching_plan_slot_topics_read on teaching_plan_slot_topics
  for select to authenticated using (slot_id in (select id from teaching_plan_slots));

create policy teaching_plan_slot_topics_write on teaching_plan_slot_topics
  for all to authenticated
  using (slot_id in (select id from teaching_plan_slots where teaching_assignment_id in
    (select id from teaching_assignments where teacher_id = auth.uid())))
  with check (slot_id in (select id from teaching_plan_slots where teaching_assignment_id in
    (select id from teaching_assignments where teacher_id = auth.uid())));
