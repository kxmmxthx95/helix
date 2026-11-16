-- Half-day / time-windowed activities: an academic_event can replace the
-- periods that overlap its time window (students still come to school —
-- students_attend stays true; students_attend=false is still "closed all day").
-- Rule (shared with src/lib/planSlots.ts periodReplaced): a period is replaced
-- when the event applies to its department/grade on that date and
--   students_attend = false                      -> whole day, or
--   replaces_classes and (no window or the period's time overlaps the window).
-- Existing attendance rows are never deleted; only new writes are rejected.

alter table academic_events
  add column replaces_classes boolean not null default false,
  add column start_time time,
  add column end_time time,
  add constraint academic_events_window_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  );

-- Which grade levels an event applies to — no rows = every grade of the chosen departments.
create table academic_event_grade_levels (
  event_id       uuid not null references academic_events on delete cascade,
  grade_level_id uuid not null references grade_levels on delete cascade,
  primary key (event_id, grade_level_id)
);

alter table academic_event_grade_levels enable row level security;

create policy academic_event_grade_levels_read on academic_event_grade_levels
  for select to authenticated using (true);

-- Same scoping as academic_event_departments_write, via the grade's department.
create policy academic_event_grade_levels_write on academic_event_grade_levels
  for all to authenticated
  using (
    is_org_wide()
    or (can_manage() and grade_level_id in (select id from grade_levels where department_id = auth_department()))
  )
  with check (
    is_org_wide()
    or (can_manage() and grade_level_id in (select id from grade_levels where department_id = auth_department()))
  );

-- Name of the event replacing this schedule entry on p_date, or null.
create or replace function period_replaced_by_event(p_entry uuid, p_date date) returns text
  language sql stable as $$
  select e.name
  from schedule_entries se
  join teaching_assignments ta on ta.id = se.teaching_assignment_id
  join classrooms c on c.id = ta.classroom_id
  join grade_levels gl on gl.id = c.grade_level_id
  left join lateral (
    select pd.start_time, pd.end_time from period_definitions pd
    where pd.department_id = gl.department_id
      and pd.day_of_week = se.day_of_week
      and pd.period_no = se.period_no
      and (pd.grade_level_id is null or pd.grade_level_id = gl.id)
    order by (pd.grade_level_id is null)
    limit 1
  ) p on true
  join academic_events e
    on e.start_date <= p_date and p_date <= e.end_date
   and (not e.students_attend or e.replaces_classes)
  where se.id = p_entry
    and (
      not e.students_attend
      or e.start_time is null
      or (p.start_time < e.end_time and e.start_time < p.end_time)
    )
    and (not exists (select 1 from academic_event_departments d where d.event_id = e.id)
         or exists (select 1 from academic_event_departments d where d.event_id = e.id and d.department_id = gl.department_id))
    and (not exists (select 1 from academic_event_grade_levels g where g.event_id = e.id)
         or exists (select 1 from academic_event_grade_levels g where g.event_id = e.id and g.grade_level_id = gl.id))
  limit 1
$$;

create or replace function reject_replaced_period_attendance() returns trigger
  language plpgsql as $$
declare
  v_event text;
begin
  v_event := period_replaced_by_event(new.schedule_entry_id, new.date);
  if v_event is not null then
    raise exception 'คาบนี้ถูกแทนด้วยกิจกรรม "%" ไม่ต้องเช็คชื่อ', v_event;
  end if;
  return new;
end $$;

create trigger period_attendance_records_not_replaced
  before insert or update on period_attendance_records
  for each row execute function reject_replaced_period_attendance();
