-- Verifies 0210 (teacher history trigger) against a real project; every write rolls back.
-- NOT run in CI — execute manually after applying 0210. The RPC itself needs a signed-in manager
-- (auth.uid() / can_manage()), so it is exercised from the app; this covers the history rules.
begin;
do $$
declare
  a teaching_assignments;
  v_new uuid; v_mgr uuid;
  n int;
begin
  -- the 0041 trigger lets only a manager change teacher_id: act as one
  select profile_id into strict v_mgr from profile_roles
    where role in ('super_admin', 'director', 'staff', 'dept_head', 'dept_director') limit 1;
  perform set_config('request.jwt.claim.sub', v_mgr::text, true);

  -- an open-term assignment with a teacher, and another active teacher of the same department
  select ta.* into strict a
    from teaching_assignments ta
    where ta.teacher_id is not null and teaching_assignment_term_open(ta.id)
      and not exists (select 1 from teaching_assignments t2
                      where t2.teacher_id is not null and t2.id <> ta.id
                        and t2.subject_id = ta.subject_id and t2.classroom_id = ta.classroom_id
                        and t2.academic_year = ta.academic_year and t2.term is not distinct from ta.term)
    limit 1;
  select p.id into strict v_new from profiles p
    where p.is_active and p.id <> a.teacher_id
      and p.department_id = (select department_id from profiles where id = a.teacher_id)
      and not exists (select 1 from teaching_assignments t3
                      where t3.teacher_id = p.id and t3.subject_id = a.subject_id
                        and t3.classroom_id = a.classroom_id and t3.academic_year = a.academic_year
                        and t3.term is not distinct from a.term)
    limit 1;

  -- backfill / insert left exactly one open row for the current teacher
  select count(*) into n from teaching_assignment_teachers
    where assignment_id = a.id and to_date is null and teacher_id = a.teacher_id;
  if n <> 1 then raise exception 'expected one open history row, got %', n; end if;

  -- the row must have started before the effective date (the RPC refuses earlier dates)
  update teaching_assignment_teachers set from_date = current_date - 10 where assignment_id = a.id;

  -- hand over back-dated: old row closed on the effective date, new row opened there
  perform set_config('helix.handover_date', (current_date - 3)::text, true);
  update teaching_assignments set teacher_id = v_new where id = a.id;
  if not exists (select 1 from teaching_assignment_teachers
                 where assignment_id = a.id and teacher_id = a.teacher_id and to_date = current_date - 3) then
    raise exception 'old teacher row not closed on the effective date';
  end if;
  if not exists (select 1 from teaching_assignment_teachers
                 where assignment_id = a.id and teacher_id = v_new and from_date = current_date - 3 and to_date is null) then
    raise exception 'new teacher row not opened on the effective date';
  end if;

  -- handed straight back the same day: the new row had no length and goes; the old row reopens
  update teaching_assignments set teacher_id = a.teacher_id where id = a.id;
  if exists (select 1 from teaching_assignment_teachers where assignment_id = a.id and teacher_id = v_new) then
    raise exception 'zero-length row was kept';
  end if;
  select count(*) into n from teaching_assignment_teachers where assignment_id = a.id and to_date is null;
  if n <> 1 then raise exception 'expected exactly one open row after undo, got %', n; end if;
  select count(*) into n from teaching_assignment_teachers where assignment_id = a.id and teacher_id = a.teacher_id;
  if n <> 1 then raise exception 'undo left adjacent duplicate rows (%)', n; end if;

  -- a topic set owner can only change inside a handover
  begin
    update exam_topic_sets set teacher_id = v_new where teaching_assignment_id = a.id;
    if found then raise exception 'set owner changed outside a handover'; end if;
  exception when raise_exception then
    if sqlerrm like 'set owner%' then raise; end if;
  end;
end $$;
rollback;
