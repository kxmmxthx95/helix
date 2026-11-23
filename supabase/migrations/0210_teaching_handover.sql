-- ส่งต่อภาระงานเมื่อครูย้ายออก — grill decision, 2026-11-23.
--   * work stays on the teaching_assignments row (plan slots, timetable, scores hang off it); a handover only
--     changes its teacher_id, so nothing is copied and taught-marks stay as they were
--   * teaching_assignment_teachers = who taught the row when (append-only history, written by a trigger)
--   * handover_teaching_assignments() = the one manager-only entry point:
--       - effective date: default today, may be back-dated, never future; used for the history only
--       - topic sets of the row follow it (one set per assignment, the new teacher must be able to use it);
--         sessions not yet closed move too when every room/set of the session goes to the same new teacher
--       - a รวมแผน group split across teachers is unlinked; a locked/archived term is rejected by the
--         existing term-lock trigger; a receiver who already teaches the same subject × room is rejected
--       - undo = hand over again (a same-day back-and-forth leaves no zero-length history row)

-- ------------------------------------------------------------------ history
create table teaching_assignment_teachers (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references teaching_assignments on delete cascade,
  teacher_id    uuid not null references profiles on delete restrict,
  from_date     date not null,
  to_date       date,
  check (to_date is null or to_date >= from_date)
);
create index teaching_assignment_teachers_assignment_idx on teaching_assignment_teachers (assignment_id);
create index teaching_assignment_teachers_teacher_idx on teaching_assignment_teachers (teacher_id);
create unique index teaching_assignment_teachers_one_open on teaching_assignment_teachers (assignment_id)
  where to_date is null;

insert into teaching_assignment_teachers (assignment_id, teacher_id, from_date)
select id, teacher_id, created_at::date from teaching_assignments where teacher_id is not null;

alter table teaching_assignment_teachers enable row level security;
-- readable by whoever can read the assignment (RLS of teaching_assignments applies inside the subquery)
create policy teaching_assignment_teachers_read on teaching_assignment_teachers
  for select to authenticated using (
    exists (select 1 from teaching_assignments ta where ta.id = assignment_id)
  );

create or replace function log_teaching_assignment_teacher() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_on date := coalesce(nullif(current_setting('helix.handover_date', true), '')::date, current_date);
begin
  if tg_op = 'UPDATE' then
    if new.teacher_id is not distinct from old.teacher_id then return null; end if;
    -- a row opened on the same day it is closed has no length: drop it
    delete from teaching_assignment_teachers
      where assignment_id = new.id and to_date is null and from_date >= v_on;
    update teaching_assignment_teachers set to_date = v_on
      where assignment_id = new.id and to_date is null;
    -- handed straight back: reopen the row that was just closed instead of leaving two adjacent rows
    if new.teacher_id is not null then
      update teaching_assignment_teachers set to_date = null
        where id = (select id from teaching_assignment_teachers
                    where assignment_id = new.id and teacher_id = new.teacher_id and to_date = v_on
                    order by from_date desc limit 1);
      if found then return null; end if;
    end if;
  end if;
  if new.teacher_id is not null then
    insert into teaching_assignment_teachers (assignment_id, teacher_id, from_date)
      values (new.id, new.teacher_id, v_on);
  end if;
  return null;
end $$;
create trigger teaching_assignments_teacher_history
  after insert or update of teacher_id on teaching_assignments
  for each row execute function log_teaching_assignment_teacher();

-- ------------------------------------------------- topic set owner follows the row
-- 0186 guard + a transaction-local bypass for the handover RPC (the set is 1:1 with its assignment).
create or replace function exam_topic_sets_guard() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.teacher_id, new.subject_id) is distinct from (old.teacher_id, old.subject_id)
     and coalesce(current_setting('helix.handover', true), '') <> '1' then
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

-- ---------------------------------------------------------------------- RPC
-- p_items: [{"assignment_id": uuid, "to_teacher": uuid}, ...]. All-or-nothing.
create or replace function handover_teaching_assignments(p_items jsonb, p_effective date default current_date)
  returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  it         record;
  ta         teaching_assignments;
  v_moved    jsonb := '[]'::jsonb;
  v_sets     int := 0;
  v_sess     int := 0;
  v_left     int := 0;
  v_unlinked int := 0;
  v_n        int;
begin
  if auth.uid() is null or not can_manage() then raise exception 'ไม่มีสิทธิ์ส่งต่อภาระงาน'; end if;
  if p_effective is null or p_effective > current_date then
    raise exception 'วันที่มีผลต้องไม่เกินวันนี้';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ไม่มีรายการให้ส่งต่อ';
  end if;

  perform set_config('helix.handover_date', p_effective::text, true);
  perform set_config('helix.handover', '1', true);

  for it in
    select (e->>'assignment_id')::uuid as aid, (e->>'to_teacher')::uuid as tid
    from jsonb_array_elements(p_items) e
  loop
    select * into ta from teaching_assignments where id = it.aid for update;
    if not found then raise exception 'ไม่พบภาระงาน'; end if;
    if ta.teacher_id is null then raise exception 'ภาระงานนี้ไม่มีครูผู้สอน'; end if;
    if not can_write_teaching_assignment(it.aid) then raise exception 'ไม่มีสิทธิ์ส่งต่อภาระงานนี้'; end if;
    if it.tid is null or it.tid = ta.teacher_id then raise exception 'เลือกครูผู้รับที่ไม่ใช่ครูเดิม'; end if;
    if not exists (select 1 from profiles where id = it.tid and is_active) then
      raise exception 'ครูผู้รับไม่ได้อยู่ในสถานะใช้งาน';
    end if;
    if exists (select 1 from teaching_assignment_teachers where assignment_id = it.aid and from_date > p_effective) then
      raise exception 'วันที่มีผลต้องไม่ก่อนการส่งต่อครั้งก่อนของภาระงานนี้';
    end if;

    begin
      update teaching_assignments set teacher_id = it.tid where id = it.aid;
    exception when unique_violation then
      raise exception 'ครูผู้รับสอนวิชา/ห้องนี้อยู่แล้ว เลือกครูผู้รับคนอื่น';
    end;
    update exam_topic_sets set teacher_id = it.tid where teaching_assignment_id = it.aid;
    get diagnostics v_n = row_count;
    v_sets := v_sets + v_n;
    v_moved := v_moved || jsonb_build_array(jsonb_build_object('aid', it.aid, 'old_t', ta.teacher_id, 'new_t', it.tid));
  end loop;

  -- รวมแผน: a group whose rows no longer share one teacher is unlinked on the rows that moved
  with m as (select * from jsonb_to_recordset(v_moved) as x(aid uuid, old_t uuid, new_t uuid)),
  split as (
    select plan_group_id from teaching_assignments
    where plan_group_id in (select plan_group_id from teaching_assignments where id in (select aid from m))
    group by plan_group_id having count(distinct teacher_id) > 1
  )
  update teaching_assignments set plan_group_id = null
    where id in (select aid from m) and plan_group_id in (select plan_group_id from split);
  get diagnostics v_unlinked = row_count;
  -- a group of one is no group
  update teaching_assignments set plan_group_id = null
    where plan_group_id in (select plan_group_id from teaching_assignments
                            where plan_group_id is not null group by 1 having count(*) = 1);

  -- sessions not closed yet follow the row when all their rooms/sets go to the same receiver
  with m as (select * from jsonb_to_recordset(v_moved) as x(aid uuid, old_t uuid, new_t uuid)),
  inv as (
    select es.id as sid, es.teacher_id as owner, r.aid
    from exam_sessions es
    join lateral (
      select teaching_assignment_id as aid from exam_session_targets where session_id = es.id
      union
      select ts.teaching_assignment_id from exam_session_sets ess
        join exam_topic_sets ts on ts.id = ess.topic_set_id
        where ess.session_id = es.id and ts.teaching_assignment_id is not null
    ) r on true
    where (es.closes_at is null or es.closes_at > now())
      and es.teacher_id in (select old_t from m)
  ),
  verdict as (
    select inv.sid, bool_and(m.aid is not null) and count(distinct m.new_t) = 1 as ok, min(m.new_t::text)::uuid as new_t
    from inv left join m on m.aid = inv.aid and m.old_t = inv.owner
    group by inv.sid
  ),
  moved as (
    update exam_sessions es set teacher_id = v.new_t
      from verdict v where v.sid = es.id and v.ok
    returning es.id
  )
  select (select count(*) from moved), (select count(*) from verdict where not ok) into v_sess, v_left;

  perform set_config('helix.handover', '', true);
  perform set_config('helix.handover_date', '', true);

  return jsonb_build_object(
    'moved', jsonb_array_length(v_moved),
    'topic_sets', v_sets,
    'sessions_moved', v_sess,
    'sessions_left', v_left,
    'plans_unlinked', v_unlinked
  );
end $$;
revoke all on function handover_teaching_assignments(jsonb, date) from public, anon;
grant execute on function handover_teaching_assignments(jsonb, date) to authenticated;
