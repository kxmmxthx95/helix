-- A department/grade can open a day the whole school has closed: an event with students_attend and no
-- replaces_classes (e.g. "เปิดเรียนปกติ") overrides a closed-all-day holiday/suspended event for the same scope.
-- Mirrors closingEvent() in src/lib/planSlots.ts. Only period_replaced_by_event changes; the digest/staff
-- attendance functions (0062/0066) still treat the closed event as a day off.
-- Rollback: restore period_replaced_by_event from 0166.

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
    -- A closed-all-day event (holiday / suspended) yields to an event that says students come and lessons run
    -- as normal (students_attend, not replaces_classes) for the same department/grade that day.
    and (e.students_attend or not exists (
      select 1 from academic_events o
      where o.students_attend and not o.replaces_classes
        and o.start_date <= p_date and p_date <= o.end_date
        and (not exists (select 1 from academic_event_departments d where d.event_id = o.id)
             or exists (select 1 from academic_event_departments d where d.event_id = o.id and d.department_id = gl.department_id))
        and (not exists (select 1 from academic_event_grade_levels g where g.event_id = o.id)
             or exists (select 1 from academic_event_grade_levels g where g.event_id = o.id and g.grade_level_id = gl.id))
    ))
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
