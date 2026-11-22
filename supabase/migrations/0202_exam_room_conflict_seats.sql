-- ผังห้องสอบ: seats already taken by other exam sessions that share this session's room at an overlapping time.
-- SECURITY DEFINER because RLS hides other teachers' seat rows; it only returns name, code and seat of students
-- (staff of the department can already read students), only for sessions the caller can write, and only for
-- rooms in the caller's own department (org-wide roles: any room). Earlier-starting session first.
create or replace function exam_room_conflict_seats(p_session uuid)
  returns table (session_id uuid, title text, opens_at timestamptz, student_name text, student_code text,
                 seat_row int, seat_col int, seat_rows int, seat_cols int)
  language plpgsql stable security definer set search_path = public as $$
declare
  s exam_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบ';
  end if;
  if not can_write_exam_session(p_session) then
    raise exception 'ไม่มีสิทธิ์จัดผังที่นั่ง';
  end if;
  select * into s from exam_sessions where id = p_session;
  if s.room_id is null or s.opens_at is null or s.closes_at is null then
    return;
  end if;
  if not exists (
    select 1 from rooms r where r.id = s.room_id and (r.department_id = auth_department() or is_org_wide())
  ) then
    return;
  end if;
  return query
    select es.id, es.title, es.opens_at,
           trim(coalesce(st.prefix, '') || st.first_name || ' ' || st.last_name), st.student_code,
           seat.seat_row, seat.seat_col, g.seat_rows, g.seat_cols
    from exam_sessions es
    join exam_session_seating g on g.session_id = es.id
    join exam_session_seats seat on seat.session_id = es.id
    join students st on st.id = seat.student_id
    where es.room_id = s.room_id
      and es.id <> p_session
      and es.opens_at is not null
      and es.opens_at < s.closes_at
      and es.closes_at > s.opens_at
    order by es.opens_at, es.id, seat.seat_row, seat.seat_col;
end $$;

revoke execute on function exam_room_conflict_seats(uuid) from public, anon;
grant execute on function exam_room_conflict_seats(uuid) to authenticated, service_role;

-- Same rule on write: a seat that is new or moved may not land on a seat another overlapping session holds.
-- Seats already in the saved chart pass, so a chart that clashes after a room/time change can still be repaired.
create or replace function set_exam_session_seats(p_session uuid, p_seats jsonb) returns void
  language plpgsql as $$
begin
  if not can_write_exam_session(p_session) then
    raise exception 'ไม่มีสิทธิ์จัดผังที่นั่ง';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_seats) e
    join exam_room_conflict_seats(p_session) c
      on c.seat_row = (e->>'seat_row')::int and c.seat_col = (e->>'seat_col')::int
    where not exists (
      select 1 from exam_session_seats o
      where o.session_id = p_session
        and o.student_id = (e->>'student_id')::uuid
        and o.seat_row = (e->>'seat_row')::int
        and o.seat_col = (e->>'seat_col')::int
    )
  ) then
    raise exception 'ที่นั่งนี้ถูกใช้ในรอบสอบอื่นที่เวลาทับกัน';
  end if;
  delete from exam_session_seats where session_id = p_session;
  insert into exam_session_seats (session_id, student_id, seat_row, seat_col)
    select p_session, (e->>'student_id')::uuid, (e->>'seat_row')::int, (e->>'seat_col')::int
    from jsonb_array_elements(p_seats) e;
end $$;
