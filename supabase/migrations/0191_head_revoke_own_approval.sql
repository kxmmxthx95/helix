-- A head (dept_head / dept_director) can withdraw the approval of their OWN set (approved -> draft) while no
-- session uses it, and approve it again once topics are re-picked (their own sets never wait for anyone else).
create or replace function revoke_exam_topic_set_approval(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_exam_self_approver() or not exists (
    select 1 from exam_topic_sets where id = p_id and teacher_id = auth.uid() and approval_status = 'approved'
  ) then
    raise exception 'ยกเลิกการอนุมัติไม่ได้: ไม่ใช่ชุดหัวข้อของคุณที่อนุมัติแล้ว';
  end if;
  if exists (select 1 from exam_sessions where topic_set_id = p_id) then
    raise exception 'มีห้องสอบแล้ว ยกเลิกการอนุมัติไม่ได้';
  end if;
  perform _exam_approval_bypass(true);
  update exam_topic_sets
    set approval_status = 'draft', approval_note = null, approved_by = null, approved_at = null
    where id = p_id;
  perform _exam_approval_bypass(false);
end $$;

create or replace function self_approve_exam_topic_set(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_exam_self_approver() or not exists (
    select 1 from exam_topic_sets where id = p_id and teacher_id = auth.uid() and approval_status in ('draft', 'rejected')
  ) then
    raise exception 'อนุมัติเองไม่ได้: ไม่ใช่ชุดหัวข้อร่างของคุณ';
  end if;
  if not exists (select 1 from exam_topic_set_topics where set_id = p_id)
     and not exists (select 1 from exam_topic_sets where id = p_id and no_exam) then
    raise exception 'เลือกหัวข้อการสอบอย่างน้อย 1 หัวข้อก่อน';
  end if;
  perform _exam_approval_bypass(true);
  update exam_topic_sets
    set approval_status = 'approved', approval_note = null, approved_by = auth.uid(), approved_at = now()
    where id = p_id;
  perform _exam_approval_bypass(false);
end $$;

grant execute on function revoke_exam_topic_set_approval(uuid) to authenticated;
grant execute on function self_approve_exam_topic_set(uuid) to authenticated;
