-- Auto check-out for people who clocked in but never clocked out. Runs every
-- 5 minutes; fires once the department's work_end_time + 30 min has passed (or
-- for any earlier day still open). The recorded clock_out_time is work_end_time
-- itself (the earliest time the app lets anyone clock out), never the cron
-- tick, so hour totals are not inflated. auto_clock_out marks these rows so a
-- manager can tell them from a real punch. Departments without work_end_time
-- are skipped (no lock, no auto out).
-- ponytail: 30-minute grace is a constant; move to department_settings if schools need another value.

alter table time_clock_records add column auto_clock_out boolean not null default false;

create or replace function auto_clock_out_open_records() returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_now   time := (now() at time zone 'Asia/Bangkok')::time;
begin
  update time_clock_records tc
  set clock_out_time = greatest(tc.clock_in_time, (tc.date + ds.work_end_time) at time zone 'Asia/Bangkok'),
      auto_clock_out = true
  from profiles p
  join department_settings ds on ds.department_id = p.department_id
  where p.id = tc.profile_id
    and ds.work_end_time is not null
    and tc.clock_in_time is not null
    and tc.clock_out_time is null
    and (tc.date < v_today or (tc.date = v_today and v_now >= ds.work_end_time + interval '30 minutes'));
end $$;

select cron.schedule('auto-clock-out', '*/5 * * * *', $$ select auto_clock_out_open_records(); $$);
