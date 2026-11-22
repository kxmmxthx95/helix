-- "ไม่มีสอบ" now goes through approval like a topic set (supersedes the "needs no approval" note in 0186).
--   request_exam_no_exam: teacher sets no_exam -> pending (heads: approved at once); refused when a session
--                         already uses the set or it is waiting for a decision
--   cancel_exam_no_exam : back to a normal set (draft; heads stay approved)
-- decide_exam_topic_set (0183) already approves/rejects a pending set with no topics.
-- Flipping no_exam any other way is blocked for non-heads so the request cannot be bypassed.

create or replace function request_exam_no_exam(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_self boolean := is_exam_self_approver();
begin
  if not exists (select 1 from exam_topic_sets where id = p_id and teacher_id = auth.uid()) then
    raise exception 'ไม่ใช่ชุดหัวข้อของคุณ';
  end if;
  if exists (select 1 from exam_sessions where topic_set_id = p_id) then
    raise exception 'มีห้องสอบแล้ว ตั้งเป็นไม่มีการสอบไม่ได้';
  end if;
  if exists (select 1 from exam_topic_sets where id = p_id and approval_status = 'pending') then
    raise exception 'ชุดหัวข้อกำลังรออนุมัติอยู่';
  end if;
  perform _exam_approval_bypass(true);
  update exam_topic_sets
    set no_exam = true,
        approval_status = case when v_self then 'approved' else 'pending' end::exam_approval_status,
        approval_note = null,
        approved_by = case when v_self then auth.uid() end,
        approved_at = case when v_self then now() end
    where id = p_id;
  perform _exam_approval_bypass(false);
end $$;

create or replace function cancel_exam_no_exam(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_self boolean := is_exam_self_approver();
begin
  if not exists (select 1 from exam_topic_sets where id = p_id and teacher_id = auth.uid() and no_exam) then
    raise exception 'ไม่ใช่ชุดหัวข้อไม่มีสอบของคุณ';
  end if;
  perform _exam_approval_bypass(true);
  update exam_topic_sets
    set no_exam = false,
        approval_status = case when v_self then 'approved' else 'draft' end::exam_approval_status,
        approval_note = null,
        approved_by = case when v_self then auth.uid() end,
        approved_at = case when v_self then now() end
    where id = p_id;
  perform _exam_approval_bypass(false);
end $$;

grant execute on function request_exam_no_exam(uuid) to authenticated;
grant execute on function cancel_exam_no_exam(uuid) to authenticated;

create or replace function exam_topic_sets_no_exam_guard() returns trigger
  language plpgsql as $$
begin
  if coalesce(current_setting('helix.exam_approval', true), '') = '1' or is_exam_self_approver() then
    return new;
  end if;
  if new.no_exam and (tg_op = 'INSERT' or not old.no_exam) then
    raise exception 'ตั้งเป็นไม่มีการสอบผ่านปุ่ม “ไม่มีสอบ” (ส่งขออนุมัติ) เท่านั้น';
  end if;
  if tg_op = 'UPDATE' and old.no_exam and not new.no_exam then
    raise exception 'ยกเลิกไม่มีการสอบผ่านปุ่ม “ยกเลิกไม่มีสอบ” เท่านั้น';
  end if;
  return new;
end $$;

create trigger exam_topic_sets_no_exam_guard before insert or update of no_exam on exam_topic_sets
  for each row execute function exam_topic_sets_no_exam_guard();
