-- Approvers (dept_head / dept_director, directors) can mark a set in their queue "ไม่มีสอบ" — or undo it — from
-- the อนุมัติสอบ tab. Marking approves the set; undoing keeps it approved when it has topics, else sends it
-- back to draft for the teacher. Refused once a session uses the set.
create or replace function approver_set_no_exam(p_id uuid, p_no_exam boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_topic_set_approver(p_id) then raise exception 'ไม่มีสิทธิ์อนุมัติ'; end if;
  if exists (select 1 from exam_sessions where topic_set_id = p_id) then
    raise exception 'มีห้องสอบแล้ว เปลี่ยนสถานะไม่มีการสอบไม่ได้';
  end if;
  perform _exam_approval_bypass(true);
  if p_no_exam then
    update exam_topic_sets
      set no_exam = true, approval_status = 'approved', approval_note = null, approved_by = auth.uid(), approved_at = now()
      where id = p_id;
  else
    update exam_topic_sets
      set no_exam = false,
          approval_status = case when exists (select 1 from exam_topic_set_topics where set_id = p_id) then 'approved' else 'draft' end::exam_approval_status
      where id = p_id;
  end if;
  perform _exam_approval_bypass(false);
end $$;

grant execute on function approver_set_no_exam(uuid, boolean) to authenticated;
