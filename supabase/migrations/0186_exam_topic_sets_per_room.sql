-- ชุดหัวข้อการสอบ ต่อวิชา × ห้อง — grill decision, 2026-11-21.
--   * a topic set belongs to ONE teaching_assignment (subject × classroom × year); one set per assignment
--   * exam_topic_sets.no_exam = "ไม่มีการสอบ" for that room: needs no approval, can't be turned on once a
--     session uses the set, and no session can be opened on it
--   * dept_head / dept_director: their own sets are born 'approved' (set by the server, not the client)
--     and stay approved when topics change (unless a session already uses the set — still locked)
--   * a session opened on a room-scoped set may target only that room
--   * existing sets are split: one copy (topics + approval state) per assignment of the teacher+subject;
--     a session is re-pointed to the copy of its first target's assignment

alter table exam_topic_sets
  add column teaching_assignment_id uuid references teaching_assignments on delete cascade,
  add column no_exam boolean not null default false;

-- ---------------------------------------------------------------- backfill
alter table exam_topic_set_topics disable trigger exam_topic_set_topics_scope;
-- copies must not fail on topics that no longer fit the subject (the originals were checked when added)
alter table exam_topic_set_topics disable trigger exam_topic_set_topics_check;
alter table exam_sessions disable trigger exam_sessions_topic_set_guard;

do $$
declare
  s record;
  a record;
  v_first boolean;
  v_new uuid;
begin
  perform _exam_approval_bypass(true);
  for s in select * from exam_topic_sets loop
    v_first := true;
    for a in
      select id from teaching_assignments
      where teacher_id = s.teacher_id and subject_id = s.subject_id
      order by academic_year desc, id
    loop
      if v_first then
        update exam_topic_sets set teaching_assignment_id = a.id where id = s.id;
        v_first := false;
      else
        insert into exam_topic_sets
          (teacher_id, subject_id, teaching_assignment_id, approval_status, approval_note, approved_by, approved_at, created_at)
        values
          (s.teacher_id, s.subject_id, a.id, s.approval_status, s.approval_note, s.approved_by, s.approved_at, s.created_at)
        returning id into v_new;
        insert into exam_topic_set_topics (set_id, topic_id)
          select v_new, topic_id from exam_topic_set_topics where set_id = s.id;
      end if;
    end loop;
  end loop;
  perform _exam_approval_bypass(false);
end $$;

update exam_sessions es
set topic_set_id = ts.id
from (
  select distinct on (session_id) session_id, teaching_assignment_id
  from exam_session_targets
  order by session_id, teaching_assignment_id
) t
join exam_topic_sets ts on ts.teaching_assignment_id = t.teaching_assignment_id
where t.session_id = es.id
  and ts.teacher_id = es.teacher_id and ts.subject_id = es.subject_id
  and ts.id <> es.topic_set_id;

alter table exam_topic_set_topics enable trigger exam_topic_set_topics_scope;
alter table exam_topic_set_topics enable trigger exam_topic_set_topics_check;
alter table exam_sessions enable trigger exam_sessions_topic_set_guard;

create unique index exam_topic_sets_assignment_uq on exam_topic_sets (teaching_assignment_id)
  where teaching_assignment_id is not null;

-- ---------------------------------------------------------------- guards

create or replace function is_exam_self_approver() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_roles
    where profile_id = auth.uid() and role in ('dept_head', 'dept_director'))
$$;

create or replace function exam_topic_sets_guard() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.teacher_id, new.subject_id) is distinct from (old.teacher_id, old.subject_id) then
    raise exception 'เปลี่ยนเจ้าของหรือวิชาของชุดหัวข้อไม่ได้';
  end if;
  if tg_op = 'UPDATE' then
    if old.teaching_assignment_id is not null
       and new.teaching_assignment_id is distinct from old.teaching_assignment_id then
      raise exception 'เปลี่ยนห้องของชุดหัวข้อไม่ได้';
    end if;
    if new.no_exam and not old.no_exam
       and exists (select 1 from exam_sessions where topic_set_id = new.id) then
      raise exception 'มีห้องสอบแล้ว ตั้งเป็นไม่มีการสอบไม่ได้';
    end if;
  end if;
  if new.teaching_assignment_id is not null and not exists (
    select 1 from teaching_assignments ta
    where ta.id = new.teaching_assignment_id and ta.teacher_id = new.teacher_id and ta.subject_id = new.subject_id
  ) then
    raise exception 'ห้องนี้ไม่ใช่วิชาที่คุณสอน';
  end if;
  if coalesce(current_setting('helix.exam_approval', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if is_exam_self_approver() then
      new.approval_status := 'approved';
      new.approved_by := auth.uid();
      new.approved_at := now();
    else
      new.approval_status := 'draft';
      new.approved_by := null;
      new.approved_at := null;
    end if;
    new.approval_note := null;
  elsif (new.approval_status, new.approval_note, new.approved_by, new.approved_at)
        is distinct from (old.approval_status, old.approval_note, old.approved_by, old.approved_at) then
    raise exception 'สถานะอนุมัติเปลี่ยนได้ผ่านการส่งขออนุมัติ/อนุมัติเท่านั้น';
  end if;
  return new;
end $$;

-- Same as 0183, but a head's own approved set stays approved when its topics change.
create or replace function exam_topic_set_scope_changed() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.set_id, old.set_id);
  v_status exam_approval_status;
begin
  select approval_status into v_status from exam_topic_sets where id = v_id;
  if not found then
    return null;
  end if;
  if exists (select 1 from exam_sessions where topic_set_id = v_id) then
    raise exception 'มีห้องสอบใช้ชุดหัวข้อนี้แล้ว แก้ไขไม่ได้';
  end if;
  if v_status = 'pending' then
    raise exception 'ชุดหัวข้อกำลังรออนุมัติ แก้ไขไม่ได้';
  end if;
  if v_status = 'approved' and not is_exam_self_approver() then
    perform _exam_approval_bypass(true);
    update exam_topic_sets
      set approval_status = 'draft', approval_note = null, approved_by = null, approved_at = null
      where id = v_id;
    perform _exam_approval_bypass(false);
  end if;
  return null;
end $$;

-- 0183 body + the set must not be "ไม่มีการสอบ".
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
    where id = new.topic_set_id and approval_status = 'approved' and not no_exam
      and teacher_id = new.teacher_id and subject_id = new.subject_id
  ) then
    raise exception 'เลือกชุดหัวข้อที่อนุมัติแล้วของวิชานี้ก่อนเปิดสอบ';
  end if;
  return new;
end $$;

create or replace function check_exam_target_matches_set() returns trigger
  language plpgsql as $$
declare
  v_ta uuid := (
    select ts.teaching_assignment_id from exam_sessions es
      join exam_topic_sets ts on ts.id = es.topic_set_id
    where es.id = new.session_id);
begin
  if v_ta is not null and new.teaching_assignment_id <> v_ta then
    raise exception 'ชุดหัวข้อนี้ใช้เปิดสอบได้เฉพาะห้องของชุดนั้น';
  end if;
  return new;
end $$;
create trigger exam_session_targets_set_check before insert on exam_session_targets
  for each row execute function check_exam_target_matches_set();

-- "ไม่มีการสอบ" sets need no topics to be usable; a topic-less set can't be submitted for approval (unchanged).
