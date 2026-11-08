-- LINE reminder to clock in shortly before work starts, so people check in
-- before being marked late. Same population as staff_daily_status (0066):
-- active staff whose role is in school_settings.time_tracking_roles, in a
-- department with work_start_time, on a staff school day.
-- Skipped when already clocked in today or on approved leave. One reminder
-- per person per day (clock_in_reminders PK) — the 5-minute cron would
-- otherwise re-send for every tick inside the window.
-- ponytail: 15-minute window is a constant; move to department_settings
-- (+ Settings UI) if schools need a different lead time.

create table clock_in_reminders (
  profile_id uuid not null references profiles on delete cascade,
  date       date not null,
  primary key (profile_id, date)
);
alter table clock_in_reminders enable row level security; -- system only, no policies

create or replace function enqueue_clock_in_reminders() returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_now   time := (now() at time zone 'Asia/Bangkok')::time;
begin
  with due as (
    select distinct p.id, ds.work_start_time
    from profiles p
    join profile_roles pr on pr.profile_id = p.id
    cross join school_settings ss
    join department_settings ds on ds.department_id = p.department_id
    where ss.id = 1
      and p.is_active
      and pr.role = any(ss.time_tracking_roles)
      and ds.work_start_time is not null
      and v_now >= ds.work_start_time - interval '15 minutes'
      and v_now < ds.work_start_time
      and department_school_day(p.department_id, v_today, true)
      and not exists (
        select 1 from time_clock_records tc
        where tc.profile_id = p.id and tc.date = v_today and tc.clock_in_time is not null)
      and not exists (
        select 1 from leave_requests lr
        where lr.profile_id = p.id and lr.status = 'approved' and v_today between lr.start_date and lr.end_date)
  ), sent as (
    insert into clock_in_reminders (profile_id, date)
    select id, v_today from due
    on conflict do nothing
    returning profile_id
  )
  insert into line_notifications (profile_id, message)
  select d.id, 'ใกล้ถึงเวลาเข้างาน ' || to_char(d.work_start_time, 'HH24:MI') || ' น. อย่าลืมเช็คอินก่อนเวลาเพื่อไม่ให้ถูกบันทึกว่าสาย'
  from due d join sent s on s.profile_id = d.id;
end $$;

-- same drain job as 0040/0066/0139, one more producer
select cron.schedule(
  'line-notify-drain',
  '*/5 * * * *',
  $$
  select enqueue_due_assignment_notifications();
  select enqueue_attendance_digests();
  select enqueue_cover_digests();
  select enqueue_clock_in_reminders();
  select net.http_post(
    url := 'https://hncabywwkvdekongabln.functions.supabase.co/line-notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'line_notify_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
