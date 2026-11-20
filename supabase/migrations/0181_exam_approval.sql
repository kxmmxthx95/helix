-- อนุมัติสอบ — grill decision, 2026-11-19.
-- A session must cover ≥1 ผังการเรียน topic and be approved before students
-- can see or start it.
--   * statuses: draft -> pending -> approved | rejected (rejected -> pending again)
--   * approvers: dept_head/dept_director of a department owning one of the
--     session's plan topics; director/super_admin for any session; never the
--     session's own teacher
--   * status only moves via submit_exam_session()/decide_exam_session() (or the
--     auto-reset below) — a guard trigger rejects direct writes to the
--     approval columns, including a forged 'approved' on insert
--   * editing an approved session (time/duration/attempts, topics, questions)
--     before anyone has started it sends it back to pending; topics are
--     frozen once an attempt exists
--   * sessions that exist today are migrated to 'approved'

create type exam_approval_status as enum ('draft', 'pending', 'approved', 'rejected');

alter table exam_sessions
  add column approval_status exam_approval_status not null default 'draft',
  add column approval_note   text,
  add column approved_by     uuid references profiles on delete set null,
  add column approved_at     timestamptz;

update exam_sessions set approval_status = 'approved';

create table exam_session_topics (
  session_id uuid not null references exam_sessions on delete cascade,
  topic_id   uuid not null references plan_topics on delete restrict,
  primary key (session_id, topic_id)
);
create index exam_session_topics_topic_idx on exam_session_topics (topic_id);

-- ---------------------------------------------------------------- helpers

-- Role/department check only — the "not your own session" rule lives in
-- decide_exam_session so approvers can still *read* their own sessions.
create or replace function is_exam_approver(p_id uuid) returns boolean
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
        from exam_session_topics est
          join plan_topics pt on pt.id = est.topic_id
          join plan_lessons pl on pl.id = pt.lesson_id
          join plan_subjects ps on ps.id = pl.subject_id
        where est.session_id = p_id and ps.department_id = auth_department())
    )
$$;

-- Students/guardians only see approved sessions; approvers read what they decide.
create or replace function can_read_exam_session(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select can_write_exam_session(p_id) or is_exam_approver(p_id) or exists (
    select 1 from exam_sessions es
    join exam_session_targets est on est.session_id = es.id
    join teaching_assignments ta on ta.id = est.teaching_assignment_id
    join student_classroom_enrollments sce
      on sce.classroom_id = ta.classroom_id and sce.academic_year = ta.academic_year
    join students s on s.id = sce.student_id
    where es.id = p_id and es.approval_status = 'approved'
      and (
        s.profile_id = auth.uid()
        or s.id in (select student_id from guardianships where parent_id = auth.uid())
      )
  )
$$;

create or replace function exam_session_approved(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from exam_sessions where id = p_id and approval_status = 'approved')
$$;

-- 0174 body + approvers may read the questions (key included) of sessions they review.
create or replace function can_read_exam_question(p_question_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
      select 1 from exam_questions q
      where q.id = p_question_id and can_write_bank_row(q.subject_id, q.plan_topic_id))
    or exists (
      select 1 from exam_session_questions esq
      where esq.question_id = p_question_id and is_exam_approver(esq.session_id))
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

-- Starting an attempt needs an approved session (0132 + approval).
drop policy exam_attempts_insert on exam_attempts;
create policy exam_attempts_insert on exam_attempts
  for insert to authenticated
  with check (
    student_id in (select id from students where profile_id = auth.uid())
    and can_read_exam_session(session_id)
    and exam_session_approved(session_id)
    and exam_code_cleared(session_id)
    and now() between (select opens_at from exam_sessions where id = session_id)
      and (select closes_at from exam_sessions where id = session_id)
  );

-- ------------------------------------------------------------ topics table

alter table exam_session_topics enable row level security;
create policy exam_session_topics_read on exam_session_topics
  for select to authenticated using (can_read_exam_session(session_id));
create policy exam_session_topics_write on exam_session_topics
  for all to authenticated
  using (can_write_exam_session(session_id))
  with check (can_write_exam_session(session_id));

create or replace function check_exam_session_topic() returns trigger
  language plpgsql as $$
begin
  if not plan_topic_fits_subject(new.topic_id, (select subject_id from exam_sessions where id = new.session_id)) then
    raise exception 'หัวข้อนี้ไม่อยู่ในผังการเรียนของวิชาที่จัดสอบ';
  end if;
  return new;
end $$;
create trigger exam_session_topics_check before insert or update on exam_session_topics
  for each row execute function check_exam_session_topic();

-- ------------------------------------------------------- approval guards

-- Transaction-local switch the RPCs / reset trigger flip so the guard below lets them through.
create or replace function _exam_approval_bypass(p_on boolean) returns void
  language sql as $$ select set_config('helix.exam_approval', case when p_on then '1' else '' end, true) $$;
revoke all on function _exam_approval_bypass(boolean) from public, authenticated, anon;

create or replace function exam_sessions_approval_guard() returns trigger
  language plpgsql as $$
begin
  if coalesce(current_setting('helix.exam_approval', true), '') = '1' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.approval_status := 'draft';
    new.approval_note := null;
    new.approved_by := null;
    new.approved_at := null;
    return new;
  end if;

  if (new.approval_status, new.approval_note, new.approved_by, new.approved_at)
     is distinct from (old.approval_status, old.approval_note, old.approved_by, old.approved_at) then
    raise exception 'สถานะอนุมัติเปลี่ยนได้ผ่านการส่งขออนุมัติ/อนุมัติเท่านั้น';
  end if;

  -- Approved scope edited before anyone started: back to pending.
  if old.approval_status = 'approved'
     and (new.opens_at, new.closes_at, new.duration_minutes, new.max_attempts)
         is distinct from (old.opens_at, old.closes_at, old.duration_minutes, old.max_attempts)
     and not exists (select 1 from exam_attempts where session_id = old.id) then
    new.approval_status := 'pending';
    new.approval_note := null;
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end $$;
create trigger exam_sessions_approval_guard before insert or update on exam_sessions
  for each row execute function exam_sessions_approval_guard();

-- Topic / question set edits: frozen topics once started, approved -> pending otherwise.
create or replace function exam_session_scope_changed() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.session_id, old.session_id);
begin
  if not exists (select 1 from exam_sessions where id = v_id) then
    return null; -- session itself is being deleted
  end if;
  if exists (select 1 from exam_attempts where session_id = v_id) then
    if tg_table_name = 'exam_session_topics' then
      raise exception 'รอบสอบเริ่มแล้ว แก้ไขหัวข้อการสอบไม่ได้';
    end if;
    return null;
  end if;
  perform _exam_approval_bypass(true);
  update exam_sessions
    set approval_status = 'pending', approval_note = null, approved_by = null, approved_at = null
    where id = v_id and approval_status = 'approved';
  perform _exam_approval_bypass(false);
  return null;
end $$;
create trigger exam_session_topics_scope after insert or update or delete on exam_session_topics
  for each row execute function exam_session_scope_changed();
create trigger exam_session_questions_scope after insert or update or delete on exam_session_questions
  for each row execute function exam_session_scope_changed();

-- ------------------------------------------------------------------ RPCs

create or replace function submit_exam_session(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from exam_sessions
    where id = p_id and teacher_id = auth.uid() and approval_status in ('draft', 'rejected')
  ) then
    raise exception 'ส่งขออนุมัติไม่ได้: ไม่ใช่รอบสอบของคุณ หรือส่งไปแล้ว';
  end if;
  if not exists (select 1 from exam_session_topics where session_id = p_id) then
    raise exception 'เลือกหัวข้อการสอบอย่างน้อย 1 หัวข้อก่อนส่งขออนุมัติ';
  end if;
  if not exists (select 1 from exam_session_questions where session_id = p_id) then
    raise exception 'เลือกข้อสอบอย่างน้อย 1 ข้อก่อนส่งขออนุมัติ';
  end if;
  perform _exam_approval_bypass(true);
  update exam_sessions
    set approval_status = 'pending', approval_note = null, approved_by = null, approved_at = null
    where id = p_id;
  perform _exam_approval_bypass(false);
end $$;

create or replace function decide_exam_session(p_id uuid, p_approve boolean, p_note text default null) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_exam_approver(p_id) then raise exception 'ไม่มีสิทธิ์อนุมัติ'; end if;
  if exists (select 1 from exam_sessions where id = p_id and teacher_id = auth.uid()) then
    raise exception 'อนุมัติรอบสอบของตัวเองไม่ได้';
  end if;
  if not exists (select 1 from exam_sessions where id = p_id and approval_status = 'pending') then
    raise exception 'รอบสอบนี้ไม่ได้อยู่ในสถานะรออนุมัติ';
  end if;
  if not p_approve and btrim(coalesce(p_note, '')) = '' then
    raise exception 'ใส่เหตุผลที่ไม่อนุมัติ';
  end if;
  perform _exam_approval_bypass(true);
  update exam_sessions
    set approval_status = case when p_approve then 'approved' else 'rejected' end::exam_approval_status,
        approval_note = nullif(btrim(coalesce(p_note, '')), ''),
        approved_by = auth.uid(),
        approved_at = now()
    where id = p_id;
  perform _exam_approval_bypass(false);
end $$;

-- Sessions the caller may decide on (never their own), newest first.
create or replace function exam_approval_queue() returns setof exam_sessions
  language sql stable security definer set search_path = public as $$
  select es.* from exam_sessions es
  where es.approval_status <> 'draft' and es.teacher_id <> auth.uid() and is_exam_approver(es.id)
  order by es.updated_at desc
$$;

grant execute on function submit_exam_session(uuid) to authenticated;
grant execute on function decide_exam_session(uuid, boolean, text) to authenticated;
grant execute on function exam_approval_queue() to authenticated;

-- --------------------------------------------------------- LINE notifications
-- pending -> approvers (dept_head/dept_director of the topics' departments,
-- directors if none); approved/rejected -> the session's teacher.

create or replace function notify_exam_status() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if new.approval_status = old.approval_status then return new; end if;

  if new.approval_status = 'pending' then
    select trim(coalesce(prefix, '') || first_name || ' ' || last_name) into v_name from profiles where id = new.teacher_id;
    insert into line_notifications (profile_id, message)
    select distinct pr.profile_id,
      v_name || ' ส่งขออนุมัติสอบ "' || new.title || '" รออนุมัติ'
    from profile_roles pr
      join profiles p on p.id = pr.profile_id
    where pr.role in ('dept_head', 'dept_director') and p.is_active and pr.profile_id <> new.teacher_id
      and p.department_id in (
        select ps.department_id
        from exam_session_topics est
          join plan_topics pt on pt.id = est.topic_id
          join plan_lessons pl on pl.id = pt.lesson_id
          join plan_subjects ps on ps.id = pl.subject_id
        where est.session_id = new.id);
    if not found then
      insert into line_notifications (profile_id, message)
      select distinct pr.profile_id, v_name || ' ส่งขออนุมัติสอบ "' || new.title || '" รออนุมัติ'
      from profile_roles pr join profiles p on p.id = pr.profile_id
      where pr.role = 'director' and p.is_active and pr.profile_id <> new.teacher_id;
    end if;
  elsif new.approval_status = 'approved' then
    insert into line_notifications (profile_id, message)
      values (new.teacher_id, 'การสอบ "' || new.title || '" อนุมัติแล้ว');
  elsif new.approval_status = 'rejected' then
    insert into line_notifications (profile_id, message)
      values (new.teacher_id, 'การสอบ "' || new.title || '" ไม่อนุมัติ เหตุผล: ' || coalesce(new.approval_note, '-'));
  end if;
  return new;
end $$;
create trigger exam_sessions_notify_status after update of approval_status on exam_sessions
  for each row execute function notify_exam_status();
