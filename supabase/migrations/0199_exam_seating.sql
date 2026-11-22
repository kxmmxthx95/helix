-- ผังห้องสอบ: seat layout templates (per department, reusable) and the seating of one exam session.
--   * exam_seat_templates      name + rows x cols, shared by the department; creator (or a dept head) edits/deletes
--   * exam_session_seating     the grid size copied from a template onto the session, so deleting or editing the template
--                              never changes a chart that is already laid out
--   * exam_session_seats       which student sits where in that session
-- Teachers and whoever can write the session only; students never read these tables.

create table exam_seat_templates (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments on delete cascade,
  name          text not null check (length(btrim(name)) > 0),
  seat_rows     int not null check (seat_rows between 1 and 30),
  seat_cols     int not null check (seat_cols between 1 and 30),
  created_by    uuid not null default auth.uid() references profiles on delete cascade,
  created_at    timestamptz not null default now()
);
create index exam_seat_templates_dept_idx on exam_seat_templates (department_id);

create table exam_session_seating (
  session_id  uuid primary key references exam_sessions on delete cascade,
  seat_rows   int not null check (seat_rows between 1 and 30),
  seat_cols   int not null check (seat_cols between 1 and 30),
  template_id uuid references exam_seat_templates on delete set null,
  updated_at  timestamptz not null default now()
);

create table exam_session_seats (
  session_id uuid not null references exam_sessions on delete cascade,
  student_id uuid not null references students on delete cascade,
  seat_row   int not null check (seat_row >= 1),
  seat_col   int not null check (seat_col >= 1),
  primary key (session_id, student_id),
  unique (session_id, seat_row, seat_col)
);

-- A seat must sit inside the session's grid.
create or replace function check_exam_seat_in_grid() returns trigger
  language plpgsql as $$
declare
  g exam_session_seating%rowtype;
begin
  select * into g from exam_session_seating where session_id = new.session_id;
  if not found then
    raise exception 'ยังไม่ได้เลือกผังที่นั่งของรอบสอบนี้';
  end if;
  if new.seat_row > g.seat_rows or new.seat_col > g.seat_cols then
    raise exception 'ที่นั่งอยู่นอกผัง';
  end if;
  return new;
end $$;
create trigger exam_session_seats_in_grid before insert or update on exam_session_seats
  for each row execute function check_exam_seat_in_grid();

-- Shrinking the grid (or picking a smaller template) drops the seats that no longer fit; those students become unseated.
create or replace function trim_exam_seats_to_grid() returns trigger
  language plpgsql as $$
begin
  delete from exam_session_seats
  where session_id = new.session_id and (seat_row > new.seat_rows or seat_col > new.seat_cols);
  return null;
end $$;
create trigger exam_session_seating_trim after insert or update of seat_rows, seat_cols on exam_session_seating
  for each row execute function trim_exam_seats_to_grid();

-- Replace a session's whole seat list at once (auto-arrange, swap, move, clear). Runs under the caller's RLS.
create or replace function set_exam_session_seats(p_session uuid, p_seats jsonb) returns void
  language plpgsql as $$
begin
  if not can_write_exam_session(p_session) then
    raise exception 'ไม่มีสิทธิ์จัดผังที่นั่ง';
  end if;
  delete from exam_session_seats where session_id = p_session;
  insert into exam_session_seats (session_id, student_id, seat_row, seat_col)
    select p_session, (e->>'student_id')::uuid, (e->>'seat_row')::int, (e->>'seat_col')::int
    from jsonb_array_elements(p_seats) e;
end $$;
revoke execute on function set_exam_session_seats(uuid, jsonb) from public, anon;
grant execute on function set_exam_session_seats(uuid, jsonb) to authenticated, service_role;

-- ------------------------------------------------------------------ RLS
alter table exam_seat_templates enable row level security;
create policy exam_seat_templates_read on exam_seat_templates
  for select to authenticated
  using (not is_student() and (department_id = auth_department() or is_org_wide()));
create policy exam_seat_templates_insert on exam_seat_templates
  for insert to authenticated
  with check (not is_student() and department_id = auth_department() and created_by = auth.uid());
create policy exam_seat_templates_update on exam_seat_templates
  for update to authenticated
  using (created_by = auth.uid() or is_org_wide() or (is_dept_head() and department_id = auth_department()))
  with check (department_id = auth_department() or is_org_wide());
create policy exam_seat_templates_delete on exam_seat_templates
  for delete to authenticated
  using (created_by = auth.uid() or is_org_wide() or (is_dept_head() and department_id = auth_department()));

alter table exam_session_seating enable row level security;
create policy exam_session_seating_all on exam_session_seating
  for all to authenticated
  using (can_write_exam_session(session_id)) with check (can_write_exam_session(session_id));

alter table exam_session_seats enable row level security;
create policy exam_session_seats_all on exam_session_seats
  for all to authenticated
  using (can_write_exam_session(session_id)) with check (can_write_exam_session(session_id));

revoke all on exam_seat_templates, exam_session_seating, exam_session_seats from anon;
