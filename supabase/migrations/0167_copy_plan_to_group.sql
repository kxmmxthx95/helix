-- "รวมแผน": copy one assignment's placed topics to the other assignments of its
-- เรียนรวม group (same group_id). One-shot, topics + order only (never taught state/notes).
-- Per target period the copy is skipped when: the target has no such schedule period,
-- the target slot is taught or already has topics, or a trigger rejects it (topic not in
-- the target's ผังการเรียน, locked term). Validity is therefore the existing triggers' —
-- mirrored client-side by copyPreview (src/lib/planSlots.ts). security invoker: RLS applies,
-- so only assignments the caller may write to are filled.

create or replace function copy_plan_to_group(p_source uuid, p_targets uuid[])
  returns table (target_id uuid, copied int, skipped int)
  language plpgsql security invoker as $$
declare
  src     teaching_assignments;
  tgt     teaching_assignments;
  t       uuid;
  s       record;
  v_slot  uuid;
  v_new   boolean;
  v_ok    int;
  n_copy  int;
  n_skip  int;
  topic   record;
begin
  select * into src from teaching_assignments where id = p_source;
  if not found or src.group_id is null then
    raise exception 'assignment is not in a เรียนรวม group';
  end if;

  foreach t in array p_targets loop
    select * into tgt from teaching_assignments where id = t;
    if not found or t = p_source or tgt.group_id is distinct from src.group_id then
      raise exception 'assignment % is not in the same group', t;
    end if;
    n_copy := 0; n_skip := 0;

    for s in
      select sl.id, sl.slot_date, sl.period_no,
             (select count(*)::int from teaching_plan_slot_topics x where x.slot_id = sl.id) as n
      from teaching_plan_slots sl
      where sl.teaching_assignment_id = p_source
        and exists (select 1 from teaching_plan_slot_topics x where x.slot_id = sl.id)
      order by sl.slot_date, sl.period_no
    loop
      select id into v_slot from teaching_plan_slots
        where teaching_assignment_id = t and slot_date = s.slot_date and period_no = s.period_no;
      v_new := v_slot is null;

      if not exists (
           select 1 from schedule_entries se
           where se.teaching_assignment_id = t and se.period_no = s.period_no
             and se.day_of_week = extract(isodow from s.slot_date)::int)
         or (not v_new and exists (
           select 1 from teaching_plan_slots y
           where y.id = v_slot and (y.completed_at is not null
             or exists (select 1 from teaching_plan_slot_topics z where z.slot_id = y.id))))
      then
        n_skip := n_skip + s.n;
        continue;
      end if;

      v_ok := 0;
      begin
        if v_new then
          insert into teaching_plan_slots (teaching_assignment_id, slot_date, period_no)
            values (t, s.slot_date, s.period_no) returning id into v_slot;
        end if;
        for topic in select topic_id, position from teaching_plan_slot_topics where slot_id = s.id order by position loop
          begin
            insert into teaching_plan_slot_topics (slot_id, topic_id, position) values (v_slot, topic.topic_id, topic.position);
            v_ok := v_ok + 1;
          exception when others then null; -- topic not valid for the target: skipped
          end;
        end loop;
        if v_ok = 0 and v_new then delete from teaching_plan_slots where id = v_slot; end if;
      exception when others then
        v_ok := 0; -- slot itself rejected (e.g. locked term)
      end;
      n_copy := n_copy + v_ok;
      n_skip := n_skip + (s.n - v_ok);
    end loop;

    target_id := t; copied := n_copy; skipped := n_skip;
    return next;
  end loop;
end $$;
