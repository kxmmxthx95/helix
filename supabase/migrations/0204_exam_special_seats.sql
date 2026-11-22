-- ที่นั่งพิเศษ: extra seats a teacher adds to one room of an exam session, outside the template grid (e.g. an extra desk).
--   * exam_session_special_seats   one row per special seat: its room row, a number (พิเศษ N, 1..10) and who sits there
-- The number is the identity of the desk: in one physical room, two sessions with overlapping windows never hold the same
-- number. add_exam_special_seat picks the lowest number free in this room row and in every overlapping session of the
-- same physical room. Clients cannot insert / update rows directly (no policies), only through the functions below.
-- A student sits in the grid or in a special seat, never both.

create table exam_session_special_seats (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references exam_sessions on delete cascade,
  session_room_id uuid not null references exam_session_rooms on delete cascade,
  special_no      int not null check (special_no between 1 and 10),
  student_id      uuid references students on delete set null,
  unique (session_room_id, special_no),
  unique (session_id, student_id)
);

alter table exam_session_special_seats enable row level security;
create policy exam_session_special_seats_read on exam_session_special_seats
  for select to authenticated using (can_write_exam_session(session_id));
create policy exam_session_special_seats_delete on exam_session_special_seats
  for delete to authenticated using (can_write_exam_session(session_id));
revoke all on exam_session_special_seats from anon;

-- Adds a special seat to one room of a session. Security definer: it must see the seats of other teachers' sessions.
create or replace function add_exam_special_seat(p_room_row uuid) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  r exam_session_rooms%rowtype;
  s exam_sessions%rowtype;
  v_no int;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบ';
  end if;
  select * into r from exam_session_rooms where id = p_room_row;
  if not found or not can_write_exam_session(r.session_id) then
    raise exception 'ไม่มีสิทธิ์จัดผังที่นั่ง';
  end if;
  select * into s from exam_sessions where id = r.session_id;
  select n into v_no
  from generate_series(1, 10) n
  where not exists (
      select 1 from exam_session_special_seats x where x.session_room_id = r.id and x.special_no = n
    )
    and not exists (
      select 1
      from exam_session_special_seats x
      join exam_session_rooms xr on xr.id = x.session_room_id
      join exam_sessions es on es.id = x.session_id
      where r.room_id is not null
        and xr.room_id = r.room_id
        and x.session_id <> r.session_id
        and x.special_no = n
        and s.opens_at is not null and s.closes_at is not null
        and es.opens_at is not null and es.closes_at is not null
        and es.opens_at < s.closes_at
        and es.closes_at > s.opens_at
    )
  order by n
  limit 1;
  if v_no is null then
    raise exception 'ไม่มีหมายเลขที่นั่งพิเศษว่างในห้องนี้ (สูงสุด 10 ที่)';
  end if;
  insert into exam_session_special_seats (session_id, session_room_id, special_no)
    values (r.session_id, r.id, v_no)
    returning id into v_id;
  return v_id;
end $$;
revoke execute on function add_exam_special_seat(uuid) from public, anon;
grant execute on function add_exam_special_seat(uuid) to authenticated, service_role;

-- Puts a student in a special seat (or empties it with null). The student leaves their grid seat or other special seat;
-- whoever was in this seat becomes unseated.
create or replace function set_exam_special_seat(p_seat uuid, p_student uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  x exam_session_special_seats%rowtype;
begin
  select * into x from exam_session_special_seats where id = p_seat;
  if not found or not can_write_exam_session(x.session_id) then
    raise exception 'ไม่มีสิทธิ์จัดผังที่นั่ง';
  end if;
  if p_student is not null then
    delete from exam_session_seats where session_id = x.session_id and student_id = p_student;
    update exam_session_special_seats set student_id = null
      where session_id = x.session_id and student_id = p_student and id <> p_seat;
  end if;
  update exam_session_special_seats set student_id = p_student where id = p_seat;
end $$;
revoke execute on function set_exam_special_seat(uuid, uuid) from public, anon;
grant execute on function set_exam_special_seat(uuid, uuid) to authenticated, service_role;

-- A student placed in the grid leaves any special seat. Called by set_exam_session_seats (the table has no update policy).
create or replace function release_special_seats_of_seated(p_session uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not can_write_exam_session(p_session) then
    raise exception 'ไม่มีสิทธิ์จัดผังที่นั่ง';
  end if;
  update exam_session_special_seats set student_id = null
    where session_id = p_session
      and student_id in (select student_id from exam_session_seats where session_id = p_session);
end $$;
revoke execute on function release_special_seats_of_seated(uuid) from public, anon;
grant execute on function release_special_seats_of_seated(uuid) to authenticated, service_role;

-- Same as 0203, plus: students now seated in the grid are released from their special seat.
create or replace function set_exam_session_seats(p_session uuid, p_seats jsonb) returns void
  language plpgsql as $$
declare
  v_first uuid;
begin
  if not can_write_exam_session(p_session) then
    raise exception 'ไม่มีสิทธิ์จัดผังที่นั่ง';
  end if;
  select id into v_first from exam_session_rooms where session_id = p_session order by position limit 1;
  if exists (
    with n as (
      select (e->>'student_id')::uuid as sid, coalesce((e->>'room')::uuid, v_first) as rid,
             (e->>'seat_row')::int as r, (e->>'seat_col')::int as c
      from jsonb_array_elements(p_seats) e
    )
    select 1
    from n
    join exam_session_rooms nr on nr.id = n.rid
    cross join lateral exam_room_conflict_seats(p_session, nr.room_id) k
    where k.seat_row = n.r and k.seat_col = n.c
      and not exists (
        select 1 from exam_session_seats o
        where o.session_id = p_session and o.student_id = n.sid and o.session_room_id = n.rid
          and o.seat_row = n.r and o.seat_col = n.c
      )
  ) then
    raise exception 'ที่นั่งนี้ถูกใช้ในรอบสอบอื่นที่เวลาทับกัน';
  end if;
  delete from exam_session_seats where session_id = p_session;
  insert into exam_session_seats (session_id, session_room_id, student_id, seat_row, seat_col)
    select p_session, coalesce((e->>'room')::uuid, v_first), (e->>'student_id')::uuid, (e->>'seat_row')::int, (e->>'seat_col')::int
    from jsonb_array_elements(p_seats) e;
  perform release_special_seats_of_seated(p_session);
end $$;
