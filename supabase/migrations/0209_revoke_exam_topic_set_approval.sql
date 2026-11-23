-- Approver can take back an approval (approved -> pending) while no exam room uses the set.
create or replace function revoke_exam_topic_set_approval(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_topic_set_approver(p_id) then raise exception 'ไม่มีสิทธิ์ยกเลิกการอนุมัติ'; end if;
  if exists (select 1 from exam_topic_sets where id = p_id and teacher_id = auth.uid()) then
    raise exception 'ยกเลิกการอนุมัติชุดหัวข้อของตัวเองไม่ได้';
  end if;
  if not exists (select 1 from exam_topic_sets where id = p_id and approval_status = 'approved') then
    raise exception 'ชุดหัวข้อนี้ไม่ได้อยู่ในสถานะอนุมัติแล้ว';
  end if;
  if exists (select 1 from exam_session_sets where topic_set_id = p_id)
     or exists (select 1 from exam_sessions where topic_set_id = p_id) then
    raise exception 'ยกเลิกการอนุมัติไม่ได้: เปิดห้องสอบจากชุดหัวข้อนี้แล้ว';
  end if;
  perform _exam_approval_bypass(true);
  update exam_topic_sets
    set approval_status = 'pending', approval_note = null, approved_by = null, approved_at = null
    where id = p_id;
  perform _exam_approval_bypass(false);
end $$;
grant execute on function revoke_exam_topic_set_approval(uuid) to authenticated;
