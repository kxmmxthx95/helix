-- หัวข้อการสอบ = a submission, not a per-room singleton (grill decision, 2026-11-22):
--   * every "ส่งหัวข้อ" / "ไม่มีสอบ" makes a NEW set for subject × room, carrying the exam it is for
--     (exam_type, round) — so a subject can be examined many times (midterm 1, final, quiz…)
--   * each approved set opens at most one room (the app hides sets a room already uses); used sets stay locked
--   * teachers withdraw (delete) their own sets that are not approved yet; heads also their own approved ones;
--     a set a room uses cannot go (FK restrict)
-- Supersedes the per-room uniqueness of 0186 and the edit/cancel no-exam RPCs of 0189–0191 (left in place, unused).

drop index exam_topic_sets_assignment_uq;

alter table exam_topic_sets
  add column exam_type text,
  add column round int check (round is null or round > 0);

-- Sets that already opened a room carry that room's exam.
update exam_topic_sets ts
set exam_type = es.exam_type, round = es.round
from (select distinct on (topic_set_id) topic_set_id, exam_type, round from exam_sessions order by topic_set_id, created_at) es
where es.topic_set_id = ts.id;

-- "ไม่มีสอบ" for one exam: a no_exam set, pending for approval (heads: approved at once).
create or replace function submit_no_exam_set(p_assignment uuid, p_exam_type text, p_round int default null) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_ta teaching_assignments%rowtype;
  v_id uuid;
  v_self boolean := is_exam_self_approver();
begin
  select * into v_ta from teaching_assignments where id = p_assignment and teacher_id = auth.uid();
  if not found then raise exception 'ห้องนี้ไม่ใช่วิชาที่คุณสอน'; end if;
  perform _exam_approval_bypass(true);
  insert into exam_topic_sets (teacher_id, subject_id, teaching_assignment_id, no_exam, exam_type, round, approval_status)
    values (auth.uid(), v_ta.subject_id, v_ta.id, true, nullif(btrim(p_exam_type), ''), p_round, 'draft')
    returning id into v_id;
  -- a status change (not an insert) is what notifies the approvers
  update exam_topic_sets
    set approval_status = case when v_self then 'approved' else 'pending' end::exam_approval_status,
        approved_by = case when v_self then auth.uid() end,
        approved_at = case when v_self then now() end
    where id = v_id;
  perform _exam_approval_bypass(false);
  return v_id;
end $$;

grant execute on function submit_no_exam_set(uuid, text, int) to authenticated;

drop policy exam_topic_sets_delete on exam_topic_sets;
create policy exam_topic_sets_delete on exam_topic_sets
  for delete to authenticated
  using (teacher_id = auth.uid() and (approval_status <> 'approved' or is_exam_self_approver()));
