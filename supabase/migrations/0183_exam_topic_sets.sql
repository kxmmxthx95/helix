-- ชุดหัวข้อการสอบ — grill decision, 2026-11-20. Replaces the per-session approval of 0181.
--   * a teacher submits a "topic set" (one subject + ≥1 ผังการเรียน topics); approvers
--     (dept_head/dept_director of a topic's department, director/super_admin, never the
--     owner) decide on the set; a session then references ONE approved set
--   * sessions have no approval state of their own: students see a session iff its set is approved
--   * set statuses: draft -> pending -> approved | rejected (rejected -> edit -> pending again);
--     approval columns only move through submit_exam_topic_set()/decide_exam_topic_set()
--   * a set is editable while draft/rejected, locked while pending, and locked once any session
--     uses it; editing an approved, unused set sends it back to draft (teacher resubmits)
--   * a session's questions must come from the set's topics
--   * every existing session gets its own set (topics + approval state copied) so nothing
--     already running changes; legacy sets with no topics stay approved and skip the question check

-- ----------------------------------------------------------------- tables

create table exam_topic_sets (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references profiles on delete cascade,
  subject_id      uuid not null references subjects on delete cascade,
  approval_status exam_approval_status not null default 'draft',
  approval_note   text,
  approved_by     uuid references profiles on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index exam_topic_sets_teacher_idx on exam_topic_sets (teacher_id);
create trigger exam_topic_sets_touch before update on exam_topic_sets
  for each row execute function touch_updated_at();

create table exam_topic_set_topics (
  set_id   uuid not null references exam_topic_sets on delete cascade,
  topic_id uuid not null references plan_topics on delete restrict,
  primary key (set_id, topic_id)
);
create index exam_topic_set_topics_topic_idx on exam_topic_set_topics (topic_id);

alter table exam_sessions add column topic_set_id uuid references exam_topic_sets on delete restrict;
create index exam_sessions_topic_set_idx on exam_sessions (topic_set_id);

-- ---------------------------------------------------------------- backfill
-- (triggers on the new tables are created after this block so the copied state is kept as-is)

create temp table _set_map as select id as session_id, gen_random_uuid() as set_id from exam_sessions;

insert into exam_topic_sets (id, teacher_id, subject_id, approval_status, approval_note, approved_by, approved_at, created_at)
  select m.set_id, es.teacher_id, es.subject_id, es.approval_status, es.approval_note, es.approved_by, es.approved_at, es.created_at
  from _set_map m join exam_sessions es on es.id = m.session_id;

insert into exam_topic_set_topics (set_id, topic_id)
  select m.set_id, est.topic_id from _set_map m join exam_session_topics est on est.session_id = m.session_id;

update exam_sessions es set topic_set_id = m.set_id from _set_map m where m.session_id = es.id;

drop table _set_map;

alter table exam_sessions alter column topic_set_id set not null;

-- ------------------------------------------------- retire the 0181 session-level flow

drop trigger exam_sessions_notify_status on exam_sessions;
drop trigger exam_sessions_approval_guard on exam_sessions;
drop trigger exam_session_questions_scope on exam_session_questions;

drop function notify_exam_status();
drop function exam_sessions_approval_guard();
drop function exam_session_scope_changed();
drop function submit_exam_session(uuid);
drop function decide_exam_session(uuid, boolean, text);
drop function exam_approval_queue();

alter table exam_sessions
  drop column approval_status,
  drop column approval_note,
  drop column approved_by,
  drop column approved_at;

-- ---------------------------------------------------------------- helpers

-- Role/department check only; "not your own set" lives in decide_exam_topic_set.
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
      and exists (
        select 1
        from exam_topic_set_topics t
          join plan_topics pt on pt.id = t.topic_id
          join plan_lessons pl on pl.id = pt.lesson_id
          join plan_subjects ps on ps.id = pl.subject_id
        where t.set_id = p_set and ps.department_id = auth_department())
    )
$$;

create or replace function can_read_topic_set(p_set uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from exam_topic_sets where id = p_set and teacher_id = auth.uid())
    or (
      is_topic_set_approver(p_set)
      and exists (select 1 from exam_topic_sets where id = p_set and approval_status <> 'draft'))
$$;

create or replace function exam_session_approved(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from exam_sessions es
      join exam_topic_sets ts on ts.id = es.topic_set_id
    where es.id = p_id and ts.approval_status = 'approved')
$$;

-- 0181 body, but a session is visible to students when its set is approved; approvers review sets, not sessions.
create or replace function can_read_exam_session(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_exam_session(p_id) or exists (
    select 1 from exam_sessions es
    join exam_topic_sets ts on ts.id = es.topic_set_id and ts.approval_status = 'approved'
    join exam_session_targets est on est.session_id = es.id
    join teaching_assignments ta on ta.id = est.teaching_assignment_id
    join student_classroom_enrollments sce
      on sce.classroom_id = ta.classroom_id and sce.academic_year = ta.academic_year
    join students s on s.id = sce.student_id
    where es.id = p_id
      and (
        s.profile_id = auth.uid()
        or s.id in (select student_id from guardianships where parent_id = auth.uid())
      )
  )
$$;

-- 0181 body minus the approver clause (approvers no longer review the paper).
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

drop function is_exam_approver(uuid);
drop table exam_session_topics;
drop function check_exam_session_topic();

-- --------------------------------------------------------------------- RLS

alter table exam_topic_sets enable row level security;
create policy exam_topic_sets_read on exam_topic_sets
  for select to authenticated using (teacher_id = auth.uid() or can_read_topic_set(id));
create policy exam_topic_sets_insert on exam_topic_sets
  for insert to authenticated with check (teacher_id = auth.uid());
create policy exam_topic_sets_update on exam_topic_sets
  for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy exam_topic_sets_delete on exam_topic_sets
  for delete to authenticated using (teacher_id = auth.uid());

alter table exam_topic_set_topics enable row level security;
create policy exam_topic_set_topics_read on exam_topic_set_topics
  for select to authenticated using (can_read_topic_set(set_id));
create policy exam_topic_set_topics_write on exam_topic_set_topics
  for all to authenticated
  using (exists (select 1 from exam_topic_sets s where s.id = set_id and s.teacher_id = auth.uid()))
  with check (exists (select 1 from exam_topic_sets s where s.id = set_id and s.teacher_id = auth.uid()));

-- ---------------------------------------------------------------- guards

-- Transaction-local switch (0181's _exam_approval_bypass) so the RPCs / reset trigger can move status.
create or replace function exam_topic_sets_guard() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.teacher_id, new.subject_id) is distinct from (old.teacher_id, old.subject_id) then
    raise exception 'เปลี่ยนเจ้าของหรือวิชาของชุดหัวข้อไม่ได้';
  end if;
  if coalesce(current_setting('helix.exam_approval', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.approval_status := 'draft';
    new.approval_note := null;
    new.approved_by := null;
    new.approved_at := null;
  elsif (new.approval_status, new.approval_note, new.approved_by, new.approved_at)
        is distinct from (old.approval_status, old.approval_note, old.approved_by, old.approved_at) then
    raise exception 'สถานะอนุมัติเปลี่ยนได้ผ่านการส่งขออนุมัติ/อนุมัติเท่านั้น';
  end if;
  return new;
end $$;
create trigger exam_topic_sets_guard before insert or update on exam_topic_sets
  for each row execute function exam_topic_sets_guard();

create or replace function check_exam_topic_set_topic() returns trigger
  language plpgsql as $$
begin
  if not plan_topic_fits_subject(new.topic_id, (select subject_id from exam_topic_sets where id = new.set_id)) then
    raise exception 'หัวข้อนี้ไม่อยู่ในผังการเรียนของวิชาของชุดหัวข้อ';
  end if;
  return new;
end $$;
create trigger exam_topic_set_topics_check before insert or update on exam_topic_set_topics
  for each row execute function check_exam_topic_set_topic();

-- Topic edits: locked once a session uses the set or while it awaits a decision; an approved, unused set goes back to draft so the teacher resubmits.
create or replace function exam_topic_set_scope_changed() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.set_id, old.set_id);
  v_status exam_approval_status;
begin
  select approval_status into v_status from exam_topic_sets where id = v_id;
  if not found then
    return null; -- the set itself is being deleted
  end if;
  if exists (select 1 from exam_sessions where topic_set_id = v_id) then
    raise exception 'มีห้องสอบใช้ชุดหัวข้อนี้แล้ว แก้ไขไม่ได้';
  end if;
  if v_status = 'pending' then
    raise exception 'ชุดหัวข้อกำลังรออนุมัติ แก้ไขไม่ได้';
  end if;
  if v_status = 'approved' then
    perform _exam_approval_bypass(true);
    update exam_topic_sets
      set approval_status = 'draft', approval_note = null, approved_by = null, approved_at = null
      where id = v_id;
    perform _exam_approval_bypass(false);
  end if;
  return null;
end $$;
create trigger exam_topic_set_topics_scope after insert or update or delete on exam_topic_set_topics
  for each row execute function exam_topic_set_scope_changed();

-- A session may only reference an approved set of its own teacher + subject, and never switch sets.
create or replace function exam_sessions_topic_set_guard() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.topic_set_id is distinct from old.topic_set_id then
      raise exception 'เปลี่ยนชุดหัวข้อของห้องสอบไม่ได้';
    end if;
    return new;
  end if;
  if not exists (
    select 1 from exam_topic_sets
    where id = new.topic_set_id and approval_status = 'approved'
      and teacher_id = new.teacher_id and subject_id = new.subject_id
  ) then
    raise exception 'เลือกชุดหัวข้อที่อนุมัติแล้วของวิชานี้ก่อนเปิดสอบ';
  end if;
  return new;
end $$;
create trigger exam_sessions_topic_set_guard before insert or update of topic_set_id on exam_sessions
  for each row execute function exam_sessions_topic_set_guard();

-- Questions must come from the set's topics (legacy sets without topics are exempt).
create or replace function check_exam_session_question_topic() returns trigger
  language plpgsql as $$
declare
  v_set uuid := (select topic_set_id from exam_sessions where id = new.session_id);
begin
  if exists (select 1 from exam_topic_set_topics where set_id = v_set)
     and not exists (
       select 1 from exam_questions q
         join exam_topic_set_topics t on t.topic_id = q.plan_topic_id and t.set_id = v_set
       where q.id = new.question_id) then
    raise exception 'ข้อสอบต้องอยู่ในหัวข้อของชุดหัวข้อที่อนุมัติ';
  end if;
  return new;
end $$;
create trigger exam_session_questions_topic_check before insert on exam_session_questions
  for each row execute function check_exam_session_question_topic();

-- ------------------------------------------------------------------ RPCs

create or replace function submit_exam_topic_set(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from exam_topic_sets
    where id = p_id and teacher_id = auth.uid() and approval_status in ('draft', 'rejected')
  ) then
    raise exception 'ส่งขออนุมัติไม่ได้: ไม่ใช่ชุดหัวข้อของคุณ หรือส่งไปแล้ว';
  end if;
  if not exists (select 1 from exam_topic_set_topics where set_id = p_id) then
    raise exception 'เลือกหัวข้อการสอบอย่างน้อย 1 หัวข้อก่อนส่งขออนุมัติ';
  end if;
  perform _exam_approval_bypass(true);
  update exam_topic_sets
    set approval_status = 'pending', approval_note = null, approved_by = null, approved_at = null
    where id = p_id;
  perform _exam_approval_bypass(false);
end $$;

create or replace function decide_exam_topic_set(p_id uuid, p_approve boolean, p_note text default null) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_topic_set_approver(p_id) then raise exception 'ไม่มีสิทธิ์อนุมัติ'; end if;
  if exists (select 1 from exam_topic_sets where id = p_id and teacher_id = auth.uid()) then
    raise exception 'อนุมัติชุดหัวข้อของตัวเองไม่ได้';
  end if;
  if not exists (select 1 from exam_topic_sets where id = p_id and approval_status = 'pending') then
    raise exception 'ชุดหัวข้อนี้ไม่ได้อยู่ในสถานะรออนุมัติ';
  end if;
  if not p_approve and btrim(coalesce(p_note, '')) = '' then
    raise exception 'ใส่เหตุผลที่ไม่อนุมัติ';
  end if;
  perform _exam_approval_bypass(true);
  update exam_topic_sets
    set approval_status = case when p_approve then 'approved' else 'rejected' end::exam_approval_status,
        approval_note = nullif(btrim(coalesce(p_note, '')), ''),
        approved_by = auth.uid(),
        approved_at = now()
    where id = p_id;
  perform _exam_approval_bypass(false);
end $$;

grant execute on function submit_exam_topic_set(uuid) to authenticated;
grant execute on function decide_exam_topic_set(uuid, boolean, text) to authenticated;

-- --------------------------------------------------------- LINE notifications
-- pending -> approvers (dept_head/dept_director of the topics' departments, directors if none);
-- approved/rejected -> the set's teacher.

create or replace function notify_exam_topic_set_status() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_subject text;
begin
  if new.approval_status = old.approval_status then return new; end if;
  select name_th into v_subject from subjects where id = new.subject_id;

  if new.approval_status = 'pending' then
    select trim(coalesce(prefix, '') || first_name || ' ' || last_name) into v_name from profiles where id = new.teacher_id;
    insert into line_notifications (profile_id, message)
    select distinct pr.profile_id,
      v_name || ' ส่งขออนุมัติหัวข้อการสอบ ' || coalesce(v_subject, '') || ' รออนุมัติ'
    from profile_roles pr
      join profiles p on p.id = pr.profile_id
    where pr.role in ('dept_head', 'dept_director') and p.is_active and pr.profile_id <> new.teacher_id
      and p.department_id in (
        select ps.department_id
        from exam_topic_set_topics t
          join plan_topics pt on pt.id = t.topic_id
          join plan_lessons pl on pl.id = pt.lesson_id
          join plan_subjects ps on ps.id = pl.subject_id
        where t.set_id = new.id);
    if not found then
      insert into line_notifications (profile_id, message)
      select distinct pr.profile_id, v_name || ' ส่งขออนุมัติหัวข้อการสอบ ' || coalesce(v_subject, '') || ' รออนุมัติ'
      from profile_roles pr join profiles p on p.id = pr.profile_id
      where pr.role = 'director' and p.is_active and pr.profile_id <> new.teacher_id;
    end if;
  elsif new.approval_status = 'approved' then
    insert into line_notifications (profile_id, message)
      values (new.teacher_id, 'หัวข้อการสอบ ' || coalesce(v_subject, '') || ' อนุมัติแล้ว เปิดสอบได้');
  elsif new.approval_status = 'rejected' then
    insert into line_notifications (profile_id, message)
      values (new.teacher_id, 'หัวข้อการสอบ ' || coalesce(v_subject, '') || ' ไม่อนุมัติ เหตุผล: ' || coalesce(new.approval_note, '-'));
  end if;
  return new;
end $$;
create trigger exam_topic_sets_notify_status after update of approval_status on exam_topic_sets
  for each row execute function notify_exam_topic_set_status();
