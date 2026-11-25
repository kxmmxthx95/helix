-- An exam approver (head / director) may edit the topics of a room's already-approved set until that room opens.
-- Unchanged: the owning teacher stays locked out once a room uses the set; an opened room (opens_at passed or any
-- attempt) locks it for everyone; heads' own edits never send the set back to draft (is_exam_self_approver).

drop policy exam_topic_set_topics_write on exam_topic_set_topics;
create policy exam_topic_set_topics_write on exam_topic_set_topics for all to authenticated
  using (
    exists (select 1 from exam_topic_sets s where s.id = set_id and s.teacher_id = auth.uid())
    or is_topic_set_approver(set_id)
  )
  with check (
    exists (select 1 from exam_topic_sets s where s.id = set_id and s.teacher_id = auth.uid())
    or is_topic_set_approver(set_id)
  );

create or replace function exam_topic_set_scope_changed() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.set_id, old.set_id);
  v_status exam_approval_status;
  v_used boolean;
  v_opened boolean;
begin
  select approval_status into v_status from exam_topic_sets where id = v_id;
  if not found then
    return null; -- the set itself is being deleted
  end if;
  select
    count(*) > 0,
    coalesce(bool_or(es.opens_at is not null and es.opens_at <= now()
      or exists (select 1 from exam_attempts ea where ea.session_id = es.id)), false)
  into v_used, v_opened
  from exam_sessions es
  where es.topic_set_id = v_id
     or exists (select 1 from exam_session_sets ess where ess.session_id = es.id and ess.topic_set_id = v_id);
  if v_used and (v_opened or v_status <> 'approved' or not is_topic_set_approver(v_id)) then
    raise exception 'มีห้องสอบใช้ชุดหัวข้อนี้แล้ว แก้ไขไม่ได้';
  end if;
  if v_status = 'pending' then
    raise exception 'ชุดหัวข้อกำลังรออนุมัติ แก้ไขไม่ได้';
  end if;
  if v_status = 'approved' and not v_used and not is_exam_self_approver() then
    perform _exam_approval_bypass(true);
    update exam_topic_sets
      set approval_status = 'draft', approval_note = null, approved_by = null, approved_at = null
      where id = v_id;
    perform _exam_approval_bypass(false);
  end if;
  return null;
end $$;
