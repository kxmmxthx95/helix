-- หนึ่งรอบสอบ หลายห้อง: every exam session gets an ordered list of physical rooms, each with its own seat grid.
--   * exam_session_rooms      one row per room of a session (position 1 = the first room, created with the session)
--                             holds the physical room (rooms), the grid copied from a seat template, and the template used
--   * exam_session_seats      gains session_room_id: which room of the session a student sits in
--   * exam_sessions.room_id   stays as a copy of the first room, kept in step by triggers, so older readers keep working
-- Expand only: exam_session_seating and the old (session_id, row, col) uniqueness are left in place / replaced, nothing is
-- dropped but that unique constraint. The app reads and writes exam_session_rooms from now on; exam_session_seating is
-- no longer updated.

create table exam_session_rooms (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references exam_sessions on delete cascade,
  position    int not null check (position >= 1),
  room_id     uuid references rooms on delete set null,
  seat_rows   int check (seat_rows between 1 and 30),
  seat_cols   int check (seat_cols between 1 and 30),
  template_id uuid references exam_seat_templates on delete set null,
  unique (session_id, position),
  check ((seat_rows is null) = (seat_cols is null))
);
-- The same physical room cannot appear twice in one session.
create unique index exam_session_rooms_room_key on exam_session_rooms (session_id, room_id) where room_id is not null;
create index exam_session_rooms_room_idx on exam_session_rooms (room_id) where room_id is not null;

-- ------------------------------------------------------------------ backfill (existing sessions become room 1)
insert into exam_session_rooms (session_id, position, room_id, seat_rows, seat_cols, template_id)
select es.id, 1, es.room_id, g.seat_rows, g.seat_cols, g.template_id
from exam_sessions es
left join exam_session_seating g on g.session_id = es.id;

alter table exam_session_seats add column session_room_id uuid references exam_session_rooms on delete cascade;
update exam_session_seats s
set session_room_id = r.id
from exam_session_rooms r
where r.session_id = s.session_id and r.position = 1;
alter table exam_session_seats alter column session_room_id set not null;

alter table exam_session_seats drop constraint if exists exam_session_seats_session_id_seat_row_seat_col_key;
create unique index exam_session_seats_room_cell_key on exam_session_seats (session_room_id, seat_row, seat_col);

-- ------------------------------------------------------------------ grid rules now per room
create or replace function check_exam_seat_in_grid() returns trigger
  language plpgsql as $$
declare
  r exam_session_rooms%rowtype;
begin
  select * into r from exam_session_rooms where id = new.session_room_id;
  if not found or r.session_id <> new.session_id then
    raise exception 'ห้องของที่นั่งไม่ถูกต้อง';
  end if;
  if r.seat_rows is null then
    raise exception 'ยังไม่ได้เลือกผังที่นั่งของห้องนี้';
  end if;
  if new.seat_row > r.seat_rows or new.seat_col > r.seat_cols then
    raise exception 'ที่นั่งอยู่นอกผัง';
  end if;
  return new;
end $$;

-- Picking a smaller template drops the seats of that room that no longer fit; those students become unseated.
create or replace function trim_exam_room_seats() returns trigger
  language plpgsql as $$
begin
  delete from exam_session_seats
  where session_room_id = new.id and (seat_row > new.seat_rows or seat_col > new.seat_cols);
  return null;
end $$;
create trigger exam_session_rooms_trim after update of seat_rows, seat_cols on exam_session_rooms
  for each row execute function trim_exam_room_seats();

-- ------------------------------------------------------------------ room 1 <-> exam_sessions.room_id
-- A new session starts with its first room.
create or replace function exam_sessions_first_room() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into exam_session_rooms (session_id, position, room_id) values (new.id, 1, new.room_id);
  return null;
end $$;
create trigger exam_sessions_first_room after insert on exam_sessions
  for each row execute function exam_sessions_first_room();

-- Writing exam_sessions.room_id (older clients) moves room 1 ...
create or replace function exam_sessions_room_to_first_room() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update exam_session_rooms set room_id = new.room_id
  where session_id = new.id and position = 1 and room_id is distinct from new.room_id;
  return null;
end $$;
create trigger exam_sessions_room_sync after update of room_id on exam_sessions
  for each row when (old.room_id is distinct from new.room_id)
  execute function exam_sessions_room_to_first_room();

-- ... and changing room 1 updates exam_sessions.room_id. Each side only writes when the value differs, so no loop.
create or replace function exam_first_room_to_session() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update exam_sessions set room_id = new.room_id where id = new.session_id and room_id is distinct from new.room_id;
  return null;
end $$;
create trigger exam_session_rooms_first_sync after insert or update of room_id on exam_session_rooms
  for each row when (new.position = 1)
  execute function exam_first_room_to_session();

-- ------------------------------------------------------------------ RLS
-- Room 1 is created by the trigger above, so clients may only insert / delete rooms after the first.
alter table exam_session_rooms enable row level security;
create policy exam_session_rooms_read on exam_session_rooms
  for select to authenticated using (can_write_exam_session(session_id));
create policy exam_session_rooms_insert on exam_session_rooms
  for insert to authenticated with check (can_write_exam_session(session_id) and position > 1);
create policy exam_session_rooms_update on exam_session_rooms
  for update to authenticated using (can_write_exam_session(session_id)) with check (can_write_exam_session(session_id));
create policy exam_session_rooms_delete on exam_session_rooms
  for delete to authenticated using (can_write_exam_session(session_id) and position > 1);
revoke all on exam_session_rooms from anon;

-- Adds the next room of a session (empty: no physical room, no grid yet).
create or replace function add_exam_session_room(p_session uuid) returns uuid
  language plpgsql as $$
declare
  v_id uuid;
begin
  if not can_write_exam_session(p_session) then
    raise exception 'ไม่มีสิทธิ์จัดผังที่นั่ง';
  end if;
  insert into exam_session_rooms (session_id, position)
    select p_session, coalesce(max(position), 0) + 1 from exam_session_rooms where session_id = p_session
    returning id into v_id;
  return v_id;
end $$;
revoke execute on function add_exam_session_room(uuid) from public, anon;
grant execute on function add_exam_session_room(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ room clashes now cover every room of a session
create or replace function exam_room_conflicts(p_room uuid, p_opens timestamptz, p_closes timestamptz, p_exclude uuid default null)
  returns table (session_id uuid, title text, exam_type text, round int, opens_at timestamptz, closes_at timestamptz, teacher_name text)
  language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบ';
  end if;
  if not exists (
    select 1 from rooms r where r.id = p_room and (r.department_id = auth_department() or is_org_wide())
  ) then
    return;
  end if;
  return query
    select es.id, es.title, es.exam_type, es.round, es.opens_at, es.closes_at,
           trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    from exam_sessions es
    left join profiles p on p.id = es.teacher_id
    where exists (select 1 from exam_session_rooms sr where sr.session_id = es.id and sr.room_id = p_room)
      and es.id is distinct from p_exclude
      and es.opens_at is not null
      and es.opens_at < p_closes
      and es.closes_at > p_opens
    order by es.opens_at;
end $$;

-- Seats other overlapping sessions hold in one physical room (read-only overlay on this session's chart).
-- Replaces the one-argument version from 0202: the room is now passed in, since a session can have several.
drop function exam_room_conflict_seats(uuid);
create or replace function exam_room_conflict_seats(p_session uuid, p_room uuid)
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
  if p_room is null or s.opens_at is null or s.closes_at is null then
    return;
  end if;
  if not exists (
    select 1 from rooms r where r.id = p_room and (r.department_id = auth_department() or is_org_wide())
  ) then
    return;
  end if;
  return query
    select es.id, es.title, es.opens_at,
           trim(coalesce(st.prefix, '') || st.first_name || ' ' || st.last_name), st.student_code,
           seat.seat_row, seat.seat_col, sr.seat_rows, sr.seat_cols
    from exam_session_rooms sr
    join exam_sessions es on es.id = sr.session_id
    join exam_session_seats seat on seat.session_room_id = sr.id
    join students st on st.id = seat.student_id
    where sr.room_id = p_room
      and sr.seat_rows is not null
      and es.id <> p_session
      and es.opens_at is not null
      and es.opens_at < s.closes_at
      and es.closes_at > s.opens_at
    order by es.opens_at, es.id, seat.seat_row, seat.seat_col;
end $$;
revoke execute on function exam_room_conflict_seats(uuid, uuid) from public, anon;
grant execute on function exam_room_conflict_seats(uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ one write for the whole session's seats
-- Each seat is {student_id, room (exam_session_rooms.id), seat_row, seat_col}; a seat without "room" goes to the first room
-- (older clients). Same clash rule as 0202: a new or moved seat may not land on one another overlapping session holds
-- in the same physical room; seats already in the saved chart pass, so a clashing chart can still be repaired.
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
end $$;
