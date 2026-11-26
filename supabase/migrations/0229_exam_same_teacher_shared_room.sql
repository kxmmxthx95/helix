-- ตารางสอบ: widens 0228. Sessions of the same teacher in the same window may also share a physical room
-- (different subjects, e.g. ม.4/2 and ม.5/1 with one invigilator); still a clash only when both claim the same seat.
-- Replaces exam_seating_status from 0228.
create or replace function exam_seating_status(p_sessions uuid[])
  returns table (session_id uuid, rooms_total int, rooms_no_room int, rooms_no_grid int, clash boolean,
                 capacity int, roster int, seated int)
  language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบ';
  end if;
  return query
  with s as (
    select es.id, es.opens_at, es.closes_at, es.teacher_id
    from exam_sessions es
    where es.id = any (p_sessions) and can_write_exam_session(es.id)
  ),
  rooms as (
    select s.id as sid,
           count(*)::int as total,
           (count(*) filter (where sr.room_id is null))::int as no_room,
           (count(*) filter (where sr.seat_rows is null))::int as no_grid,
           coalesce(sum(sr.seat_rows * sr.seat_cols), 0)::int as cells
    from s join exam_session_rooms sr on sr.session_id = s.id
    group by s.id
  ),
  special as (
    select s.id as sid, count(*)::int as n
    from s join exam_session_special_seats x on x.session_id = s.id
    group by s.id
  ),
  clashes as (
    select distinct s.id as sid
    from s
    join exam_session_rooms sr on sr.session_id = s.id and sr.room_id is not null
    join exam_session_rooms o on o.room_id = sr.room_id and o.session_id <> s.id
    join exam_sessions oe on oe.id = o.session_id
    where s.opens_at is not null and s.closes_at is not null
      and oe.opens_at is not null and oe.opens_at < s.closes_at and oe.closes_at > s.opens_at
      and (
        -- another exam shares the room: a clash, unless it runs in the same window and is the same subjects
        -- or the same teacher's (one invigilator seats classes of one or several subjects together)
        not (
          oe.opens_at = s.opens_at and oe.closes_at = s.closes_at
          and (
            s.teacher_id = oe.teacher_id
            or (select array_agg(x.subject_id order by x.subject_id) from exam_session_sets x where x.session_id = s.id)
               is not distinct from
               (select array_agg(x.subject_id order by x.subject_id) from exam_session_sets x where x.session_id = oe.id)
          )
        )
        -- sat together in one room: a clash only when both claim the same desk
        or exists (
          select 1 from exam_session_seats a join exam_session_seats b on b.seat_row = a.seat_row and b.seat_col = a.seat_col
          where a.session_room_id = sr.id and b.session_room_id = o.id
        )
        or exists (
          select 1 from exam_session_special_seats a join exam_session_special_seats b on b.special_no = a.special_no
          where a.session_room_id = sr.id and b.session_room_id = o.id
        )
      )
  ),
  ros as (
    select s.id as sid, e.student_id
    from s
    join exam_session_targets t on t.session_id = s.id
    join teaching_assignments ta on ta.id = t.teaching_assignment_id
    join lateral (
      select distinct on (e1.student_id) e1.student_id, e1.classroom_id
      from student_classroom_enrollments e1
      where e1.academic_year = ta.academic_year
      order by e1.student_id, e1.created_at desc
    ) e on e.classroom_id = ta.classroom_id
    join students st on st.id = e.student_id and st.status = 'studying'
    group by s.id, e.student_id
  ),
  placed as (
    select r.sid, r.student_id
    from ros r
    where exists (select 1 from exam_session_seats x where x.session_id = r.sid and x.student_id = r.student_id)
       or exists (select 1 from exam_session_special_seats x where x.session_id = r.sid and x.student_id = r.student_id)
  )
  select s.id,
         coalesce(rooms.total, 0), coalesce(rooms.no_room, 0), coalesce(rooms.no_grid, 0),
         (clashes.sid is not null),
         coalesce(rooms.cells, 0) + coalesce(special.n, 0),
         (select count(*)::int from ros where ros.sid = s.id),
         (select count(*)::int from placed where placed.sid = s.id)
  from s
  left join rooms on rooms.sid = s.id
  left join special on special.sid = s.id
  left join clashes on clashes.sid = s.id;
end $$;

revoke execute on function exam_seating_status(uuid[]) from public, anon;
grant execute on function exam_seating_status(uuid[]) to authenticated, service_role;
