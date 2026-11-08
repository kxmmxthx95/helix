-- Verifies 0140 against a real project; everything rolls back. Run manually after applying 0140.
-- Picks a time-tracked staff member, forces work_start_time to ~10 min from now, and checks
-- one reminder is queued, a second run adds none, and clocking in suppresses it.
begin;
do $$
declare
  pid uuid; dept uuid; n1 int; n2 int; n3 int;
  v_now time := (now() at time zone 'Asia/Bangkok')::time;
begin
  select p.id, p.department_id into strict pid, dept
  from profiles p join profile_roles pr on pr.profile_id = p.id cross join school_settings ss
  join department_settings ds on ds.department_id = p.department_id
  where ss.id = 1 and p.is_active and pr.role = any(ss.time_tracking_roles)
    and department_school_day(p.department_id, (now() at time zone 'Asia/Bangkok')::date, true)
    and not exists (select 1 from time_clock_records t where t.profile_id = p.id
                    and t.date = (now() at time zone 'Asia/Bangkok')::date and t.clock_in_time is not null)
    and not exists (select 1 from leave_requests l where l.profile_id = p.id and l.status = 'approved'
                    and (now() at time zone 'Asia/Bangkok')::date between l.start_date and l.end_date)
  limit 1;
  update department_settings set work_start_time = v_now + interval '10 minutes' where department_id = dept;

  perform enqueue_clock_in_reminders();
  select count(*) into n1 from line_notifications where profile_id = pid and message like 'ใกล้ถึงเวลาเข้างาน%';
  perform enqueue_clock_in_reminders();
  select count(*) into n2 from line_notifications where profile_id = pid and message like 'ใกล้ถึงเวลาเข้างาน%';
  if n1 <> 1 or n2 <> 1 then raise exception 'expected exactly one reminder, got % then %', n1, n2; end if;

  delete from clock_in_reminders where profile_id = pid;
  delete from line_notifications where profile_id = pid and message like 'ใกล้ถึงเวลาเข้างาน%';
  insert into time_clock_records (profile_id, date, clock_in_time, recorded_by)
    values (pid, (now() at time zone 'Asia/Bangkok')::date, now(), pid)
    on conflict (profile_id, date) do update set clock_in_time = excluded.clock_in_time;
  perform enqueue_clock_in_reminders();
  select count(*) into n3 from line_notifications where profile_id = pid and message like 'ใกล้ถึงเวลาเข้างาน%';
  if n3 <> 0 then raise exception 'reminder sent despite clock-in'; end if;
end $$;
rollback;
