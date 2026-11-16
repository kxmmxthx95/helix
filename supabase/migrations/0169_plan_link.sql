-- รวมแผน (linked plan): assignments of the SAME subject (same subject_id, hence same ผังการเรียน)
-- taught by the same teacher in different rooms can be linked via plan_group_id. Once linked,
-- topics placed / removed / cleared on one assignment are mirrored onto the others' slot rows at
-- the same date + period (rooms without that period are skipped). Each assignment keeps its own
-- slot rows, so taught-state and every existing reader stay per room.
-- Mirror never touches a mate's taught slot, nor a slot where the mate holds a topic the source
-- slot does not (diverged); failures of the mirror never block the user's own write.
-- Replaces the one-shot "copy to group" flow: copy_plan_to_group (0167/0168) is only used here
-- for the initial sync when a mate joins.

alter table teaching_assignments add column plan_group_id uuid;
create index teaching_assignments_plan_group_idx on teaching_assignments (plan_group_id) where plan_group_id is not null;

create or replace function plan_link_mates(p_assignment uuid) returns setof uuid
  language sql stable as $$
  select b.id from teaching_assignments a
    join teaching_assignments b on b.plan_group_id = a.plan_group_id and b.id <> a.id
  where a.id = p_assignment and a.plan_group_id is not null
$$;

-- Topic placed / removed on a slot -> same on mates' slots.
create or replace function mirror_slot_topic() returns trigger
  language plpgsql as $$
declare
  rec    teaching_plan_slot_topics;
  s      teaching_plan_slots;
  m      uuid;
  v_slot uuid;
  v_done timestamptz;
begin
  if pg_trigger_depth() > 1 then return null; end if; -- our own mirrored write
  rec := coalesce(new, old);
  select * into s from teaching_plan_slots where id = rec.slot_id;
  if not found then return null; end if;

  for m in select plan_link_mates(s.teaching_assignment_id) loop
    begin
      select id, completed_at into v_slot, v_done from teaching_plan_slots
        where teaching_assignment_id = m and slot_date = s.slot_date and period_no = s.period_no;
      if v_done is not null then continue; end if;

      if tg_op = 'INSERT' then
        if v_slot is not null and exists (
          select 1 from teaching_plan_slot_topics x
          where x.slot_id = v_slot
            and x.topic_id not in (select topic_id from teaching_plan_slot_topics where slot_id = s.id)
        ) then continue; end if;
        if v_slot is null then
          insert into teaching_plan_slots (teaching_assignment_id, slot_date, period_no)
            values (m, s.slot_date, s.period_no) returning id into v_slot;
        end if;
        insert into teaching_plan_slot_topics (slot_id, topic_id, position)
          values (v_slot, rec.topic_id, rec.position) on conflict do nothing;
      else
        if v_slot is null then continue; end if;
        delete from teaching_plan_slot_topics where slot_id = v_slot and topic_id = rec.topic_id;
        if not exists (select 1 from teaching_plan_slot_topics where slot_id = v_slot) then
          delete from teaching_plan_slots where id = v_slot;
        end if;
      end if;
    exception when others then null; -- no such period / topic invalid there / locked term: skip
    end;
  end loop;
  return null;
end $$;

create trigger teaching_plan_slot_topics_mirror
  after insert or delete on teaching_plan_slot_topics
  for each row execute function mirror_slot_topic();

-- Whole period cleared -> clear mates' same period (only if in sync with this one).
create or replace function mirror_slot_clear() returns trigger
  language plpgsql as $$
declare
  m uuid;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  for m in select plan_link_mates(old.teaching_assignment_id) loop
    begin
      delete from teaching_plan_slots y
        where y.teaching_assignment_id = m and y.slot_date = old.slot_date and y.period_no = old.period_no
          and y.completed_at is null
          and not exists (
            select 1 from teaching_plan_slot_topics x
            where x.slot_id = y.id
              and x.topic_id not in (select topic_id from teaching_plan_slot_topics where slot_id = old.id)
          );
    exception when others then null;
    end;
  end loop;
  return old;
end $$;

create trigger teaching_plan_slots_mirror_clear
  before delete on teaching_plan_slots
  for each row execute function mirror_slot_clear();

-- Link p_assignment with exactly p_mates (unlinks any previous mate not listed). The caller must
-- be the teacher of every assignment; mates must be the same subject/year/term. New mates get the
-- source's placed topics copied once (copy_plan_to_group skip rules) before the link starts mirroring.
create or replace function set_plan_link(p_assignment uuid, p_mates uuid[])
  returns table (copied int, skipped int)
  language plpgsql security definer set search_path = public as $$
declare
  src   teaching_assignments;
  a     teaching_assignments;
  m     uuid;
  gid   uuid;
  added uuid[] := '{}';
  keep  uuid[];
begin
  select * into src from teaching_assignments where id = p_assignment;
  if not found or src.teacher_id is distinct from auth.uid() then
    raise exception 'not your assignment';
  end if;
  gid := coalesce(src.plan_group_id, gen_random_uuid());

  foreach m in array p_mates loop
    select * into a from teaching_assignments where id = m;
    if not found or m = p_assignment or a.teacher_id is distinct from auth.uid()
       or a.subject_id <> src.subject_id or a.academic_year <> src.academic_year
       or a.term is distinct from src.term then
      raise exception 'cannot link assignment %', m;
    end if;
    if a.plan_group_id is distinct from src.plan_group_id or src.plan_group_id is null then
      added := added || m;
    end if;
  end loop;

  copied := 0; skipped := 0;
  if array_length(added, 1) > 0 then
    select coalesce(sum(c.copied), 0), coalesce(sum(c.skipped), 0) into copied, skipped
      from copy_plan_to_group(p_assignment, added) c;
  end if;

  keep := p_mates || p_assignment;
  update teaching_assignments set plan_group_id = gid where id = any (keep);
  update teaching_assignments set plan_group_id = null where plan_group_id = gid and id <> all (keep);
  -- a group of one is no group (also tidies the group a moved mate left)
  update teaching_assignments set plan_group_id = null
    where plan_group_id in (select plan_group_id from teaching_assignments
                            where plan_group_id is not null group by 1 having count(*) = 1);
  return next;
end $$;

grant execute on function set_plan_link(uuid, uuid[]) to authenticated;
