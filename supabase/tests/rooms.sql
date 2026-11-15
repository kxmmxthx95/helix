-- Verifies 0161 (rooms + room conflict trigger) against a real project; every write rolls back.
-- NOT run in CI — execute manually after applying 0161.
begin;
do $$
declare
  a1 teaching_assignments; a2 teaching_assignments;
  dept uuid; other_dept uuid; r1 uuid; r_other uuid; d int; p int; e1 uuid; e2 uuid;
  caught boolean;
begin
  -- a slot S with a real entry e1 (assignment a1), plus an open-term assignment a2 that is free at S
  -- (teacher and classroom not booked there), so only the room can clash
  select se.id, a.id, t.id, se.day_of_week, se.period_no, gl.department_id
    into strict e1, a1.id, a2.id, d, p, dept
    from schedule_entries se
    join teaching_assignments a on a.id = se.teaching_assignment_id
    join classrooms ac on ac.id = a.classroom_id join grade_levels gl on gl.id = ac.grade_level_id
    join teaching_assignments t on t.id <> a.id and t.academic_year = a.academic_year and t.term is not distinct from a.term
    join classrooms tc on tc.id = t.classroom_id join grade_levels tgl on tgl.id = tc.grade_level_id and tgl.department_id = gl.department_id
    where t.teacher_id is not null and teaching_assignment_term_open(t.id)
      and not exists (
        select 1 from schedule_entries s2 join teaching_assignments x on x.id = s2.teaching_assignment_id
        where s2.day_of_week = se.day_of_week and s2.period_no = se.period_no
          and x.academic_year = t.academic_year and x.term is not distinct from t.term
          and (x.teacher_id = t.teacher_id or x.classroom_id = t.classroom_id))
    limit 1;

  insert into rooms (department_id, name) values (dept, 'TEST-R1') returning id into r1;
  select id into other_dept from departments where id <> dept limit 1;
  insert into rooms (department_id, name) values (other_dept, 'TEST-OTHER') returning id into r_other;

  update schedule_entries set room_id = r1 where id = e1;

  -- same room, same slot, no group -> must be rejected
  caught := false;
  begin
    insert into schedule_entries (teaching_assignment_id, day_of_week, period_no, room_id) values (a2.id, d, p, r1);
  exception when others then caught := sqlerrm like 'room conflict%';
  end;
  if not caught then raise exception 'FAIL: double-booked room was accepted'; end if;

  -- no room -> fine (null never conflicts)
  insert into schedule_entries (teaching_assignment_id, day_of_week, period_no) values (a2.id, d, p) returning id into e2;

  -- setting the clashing room on it afterwards -> rejected
  caught := false;
  begin
    update schedule_entries set room_id = r1 where id = e2;
  exception when others then caught := sqlerrm like 'room conflict%';
  end;
  if not caught then raise exception 'FAIL: update into a taken room was accepted'; end if;

  -- room of another department -> rejected
  caught := false;
  begin
    update schedule_entries set room_id = r_other where id = e2;
  exception when others then caught := sqlerrm like 'room % belongs to a different department%';
  end;
  if not caught then raise exception 'FAIL: other-department room was accepted'; end if;

  -- group_id edits need can_manage(): act as a manager (still rolled back)
  perform set_config('request.jwt.claim.sub', (select profile_id::text from profile_roles where role in ('super_admin','director','staff') limit 1), true);

  -- same group_id (เรียนรวม) -> shared room allowed
  update teaching_assignments set group_id = gen_random_uuid() where id = a1.id;
  update teaching_assignments set group_id = (select group_id from teaching_assignments where id = a1.id) where id = a2.id;
  update schedule_entries set room_id = r1 where id = e2;

  raise notice 'rooms: all checks passed';
end $$;
rollback;
