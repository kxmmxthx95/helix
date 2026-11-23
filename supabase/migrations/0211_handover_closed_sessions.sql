-- ส่งต่อภาระงาน: รอบสอบที่ปิดแล้วย้ายไปครูใหม่ด้วย — grill decision, 2026-11-23.
-- Replaces handover_teaching_assignments (0210): the "not closed yet" filter on sessions is gone, so a
-- session of a handed-over row moves to the receiver whatever its dates, as long as all its rooms/sets
-- go to the same receiver. Sessions split across receivers are still left with the old owner and counted.
-- Trade-off accepted: the owner of a finished session is no longer "who ran it" (audit_logs keeps that).

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

  -- every session (closed ones too) follows the row when all its rooms/sets go to the same receiver
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
    where es.teacher_id in (select old_t from m)
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
