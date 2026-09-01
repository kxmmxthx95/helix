-- LINE notifications, round 2 — grill decision, 2026-09-01.
--
-- (A) student_leave_requests (0035) had no LINE hook at all: submit ->
-- notify the student's current homeroom teacher(s); approved/rejected ->
-- notify the submitter back; cancelled -> notify the teacher(s) too, since
-- unlike duty transfers (0063, two people who already know each other) a
-- teacher can have several pending requests in flight and silently leaving
-- a cancelled one in their queue risks a stale approval.
--
-- (B)/(C) are digests, not events — daily student attendance counts and
-- staff attendance counts, each fanned out to dept_head (own department)
-- and org-wide roles (whole-school total), on a per-scope configurable
-- cutoff time rather than a fixed hour, since "attendance is finalized" is a
-- school-operational fact this repo has no way to know except by asking.
-- Reuses the existing line-notify-drain cron (0040) rather than a second
-- pg_cron job — enqueue-then-drain is already the established shape here.
-- academic_year resolution mirrors current_student_classroom()'s own fix
-- (0036): school_settings.academic_year was dropped by 0018 — current year
-- is per-department via academic_terms.status='active', falling back to the
-- calendar year (+543) when a department has no active term row yet.
create or replace function notify_student_leave_homeroom(p_student_id uuid, p_message text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_classroom_id  uuid;
  v_academic_year int;
begin
  v_classroom_id := current_student_classroom(p_student_id);
  if v_classroom_id is null then
    return;
  end if;

  select coalesce(
    (select at.academic_year from academic_terms at
      join students s on s.id = p_student_id
      join grade_levels gl on gl.id = s.grade_level_id
      where at.department_id = gl.department_id and at.status = 'active'),
    extract(year from now())::int + 543
  ) into v_academic_year;

  insert into line_notifications (profile_id, message)
  select distinct cht.teacher_id, p_message
  from classroom_homeroom_teachers cht
  where cht.classroom_id = v_classroom_id
    and cht.academic_year = v_academic_year;
end $$;

create or replace function notify_student_leave_submitted() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select first_name || ' ' || last_name into v_name from students where id = new.student_id;
  perform notify_student_leave_homeroom(new.student_id,
    v_name || ' ยื่นคำขอลา ' || to_char(new.start_date, 'DD/MM/YYYY') ||
      case when new.end_date <> new.start_date then ' ถึง ' || to_char(new.end_date, 'DD/MM/YYYY') else '' end ||
      ' เหตุผล: ' || new.reason);
  return new;
end $$;

create trigger student_leave_requests_notify_submitted after insert on student_leave_requests
  for each row execute function notify_student_leave_submitted();

create or replace function notify_student_leave_decision() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_when  text;
begin
  if new.status = old.status then
    return new;
  end if;

  select first_name || ' ' || last_name into v_name from students where id = new.student_id;
  v_when := to_char(new.start_date, 'DD/MM/YYYY') ||
    case when new.end_date <> new.start_date then ' ถึง ' || to_char(new.end_date, 'DD/MM/YYYY') else '' end;

  if new.status in ('approved', 'rejected') then
    insert into line_notifications (profile_id, message)
    values (
      new.submitted_by,
      'คำขอลาของ ' || v_name || ' วันที่ ' || v_when ||
        case when new.status = 'approved' then ' ได้รับอนุมัติแล้ว' else ' ไม่ได้รับอนุมัติ' end
    );
  elsif new.status = 'cancelled' then
    perform notify_student_leave_homeroom(new.student_id,
      'คำขอลาของ ' || v_name || ' วันที่ ' || v_when || ' ถูกยกเลิก');
  end if;

  return new;
end $$;

create trigger student_leave_requests_notify_decision after update on student_leave_requests
  for each row execute function notify_student_leave_decision();

-- --------------------------------------------------------------- digest config
-- Nullable = digest off for that scope until someone sets a time in
-- Settings. *_last_sent tracks the date a digest actually shipped (not just
-- "checked") so a school day with no attendance recorded yet by cutoff keeps
-- retrying every 5 min for the rest of that day instead of giving up once.
alter table department_settings
  add column attendance_digest_time         time,
  add column attendance_digest_last_sent    date,
  add column staff_attendance_digest_time   time,
  add column staff_attendance_digest_last_sent date;

alter table school_settings
  add column attendance_digest_time         time,
  add column attendance_digest_last_sent    date,
  add column staff_attendance_digest_time   time,
  add column staff_attendance_digest_last_sent date;

-- Reuses the exact "whole-school event vs department-scoped event" shape
-- staff_attendance_status() (0062) already established, generalized over
-- students_attend/staff_attend so both digests share one function.
create or replace function department_school_day(p_department_id uuid, p_date date, p_for_staff boolean) returns boolean
  language sql stable as $$
  select extract(isodow from p_date) between 1 and 5
    and not exists (
      select 1 from academic_events e
      where (case when p_for_staff then not e.staff_attend else not e.students_attend end)
        and p_date between e.start_date and e.end_date
        and (
          not exists (select 1 from academic_event_departments aed where aed.event_id = e.id)
          or exists (
            select 1 from academic_event_departments aed
            where aed.event_id = e.id and aed.department_id = p_department_id
          )
        )
    )
$$;

-- ponytail: org-wide closure = a whole-school (undepartmented) event only.
-- A holiday scoped to a single department doesn't suppress the org-wide
-- digest — that department will just show a zero row for the day. Add a
-- per-department roll-up here if that gap matters in practice.
create or replace function org_school_day(p_date date, p_for_staff boolean) returns boolean
  language sql stable as $$
  select extract(isodow from p_date) between 1 and 5
    and not exists (
      select 1 from academic_events e
      where (case when p_for_staff then not e.staff_attend else not e.students_attend end)
        and p_date between e.start_date and e.end_date
        and not exists (select 1 from academic_event_departments aed where aed.event_id = e.id)
    )
$$;

-- Same มา/สาย/ขาด/ลา derivation as staff_attendance_status (0062), but that
-- function gates rows behind auth.uid()/can_manage() for client reads — the
-- digest cron has no JWT/session, so it would silently see zero rows. Not
-- granted to `authenticated`: this is a system-only projection, no client
-- access, same convention as line_notifications itself.
create or replace function staff_daily_status(p_date date) returns table (
  profile_id     uuid,
  department_id  uuid,
  status         attendance_status
) language sql stable security definer set search_path = public as $$
  select distinct p.id, p.department_id,
    case
      when lr.id is not null then 'leave'::attendance_status
      when tc.clock_in_time is null then 'absent'::attendance_status
      when ds.work_start_time is not null
        and (tc.clock_in_time at time zone 'Asia/Bangkok')::time > ds.work_start_time
        then 'late'::attendance_status
      else 'present'::attendance_status
    end
  from profiles p
  join profile_roles pr on pr.profile_id = p.id
  cross join school_settings ss
  left join department_settings ds on ds.department_id = p.department_id
  left join time_clock_records tc on tc.profile_id = p.id and tc.date = p_date
  left join leave_requests lr on lr.profile_id = p.id and lr.status = 'approved'
    and p_date between lr.start_date and lr.end_date
  where ss.id = 1
    and p.is_active
    and pr.role = any(ss.time_tracking_roles)
$$;

create or replace function enqueue_attendance_digests() returns void
  language plpgsql security definer set search_path = public as $$
declare
  dept        record;
  v_present   int;
  v_late      int;
  v_absent    int;
  v_leave     int;
  v_total     int;
  v_message   text;
  v_today     date := (now() at time zone 'Asia/Bangkok')::date;
  v_now_time  time := (now() at time zone 'Asia/Bangkok')::time;
begin
  -- B: student attendance, per department
  for dept in
    select ds.department_id, d.name
    from department_settings ds
    join departments d on d.id = ds.department_id
    where ds.attendance_digest_time is not null
      and ds.attendance_digest_time <= v_now_time
      and (ds.attendance_digest_last_sent is null or ds.attendance_digest_last_sent < v_today)
      and department_school_day(ds.department_id, v_today, false)
  loop
    select
      count(*) filter (where ar.status = 'present'),
      count(*) filter (where ar.status = 'late'),
      count(*) filter (where ar.status = 'absent'),
      count(*) filter (where ar.status = 'leave')
      into v_present, v_late, v_absent, v_leave
    from attendance_records ar
    join classrooms c on c.id = ar.classroom_id
    join grade_levels gl on gl.id = c.grade_level_id
    where gl.department_id = dept.department_id and ar.date = v_today;

    v_total := v_present + v_late + v_absent + v_leave;
    if v_total > 0 then
      v_message := 'สรุปการมาเรียนวันนี้ (' || dept.name || '): มา ' || v_present || ' สาย ' || v_late ||
        ' ขาด ' || v_absent || ' ลา ' || v_leave || ' (จาก ' || v_total || ' คน)';
      insert into line_notifications (profile_id, message)
      select distinct pr.profile_id, v_message
      from profile_roles pr
      join profiles p on p.id = pr.profile_id
      where pr.role = 'dept_head' and p.department_id = dept.department_id;

      update department_settings set attendance_digest_last_sent = v_today
        where department_id = dept.department_id;
    end if;
  end loop;

  -- B: student attendance, org-wide
  if exists (
    select 1 from school_settings
    where id = 1 and attendance_digest_time is not null and attendance_digest_time <= v_now_time
      and (attendance_digest_last_sent is null or attendance_digest_last_sent < v_today)
  ) and org_school_day(v_today, false) then
    select
      count(*) filter (where ar.status = 'present'),
      count(*) filter (where ar.status = 'late'),
      count(*) filter (where ar.status = 'absent'),
      count(*) filter (where ar.status = 'leave')
      into v_present, v_late, v_absent, v_leave
    from attendance_records ar
    where ar.date = v_today;

    v_total := v_present + v_late + v_absent + v_leave;
    if v_total > 0 then
      v_message := 'สรุปการมาเรียนวันนี้ (ทั้งโรงเรียน): มา ' || v_present || ' สาย ' || v_late ||
        ' ขาด ' || v_absent || ' ลา ' || v_leave || ' (จาก ' || v_total || ' คน)';
      insert into line_notifications (profile_id, message)
      select distinct pr.profile_id, v_message
      from profile_roles pr
      where pr.role in ('super_admin', 'director', 'staff');

      update school_settings set attendance_digest_last_sent = v_today where id = 1;
    end if;
  end if;

  -- C: staff attendance, per department
  for dept in
    select ds.department_id, d.name
    from department_settings ds
    join departments d on d.id = ds.department_id
    where ds.staff_attendance_digest_time is not null
      and ds.staff_attendance_digest_time <= v_now_time
      and (ds.staff_attendance_digest_last_sent is null or ds.staff_attendance_digest_last_sent < v_today)
      and department_school_day(ds.department_id, v_today, true)
  loop
    select
      count(*) filter (where sds.status = 'present'),
      count(*) filter (where sds.status = 'late'),
      count(*) filter (where sds.status = 'absent'),
      count(*) filter (where sds.status = 'leave')
      into v_present, v_late, v_absent, v_leave
    from staff_daily_status(v_today) sds
    where sds.department_id = dept.department_id;

    v_total := v_present + v_late + v_absent + v_leave;
    if v_total > 0 then
      v_message := 'สรุปการเข้างานวันนี้ (' || dept.name || '): มา ' || v_present || ' สาย ' || v_late ||
        ' ขาด ' || v_absent || ' ลา ' || v_leave || ' (จาก ' || v_total || ' คน)';
      insert into line_notifications (profile_id, message)
      select distinct pr.profile_id, v_message
      from profile_roles pr
      join profiles p on p.id = pr.profile_id
      where pr.role = 'dept_head' and p.department_id = dept.department_id;

      update department_settings set staff_attendance_digest_last_sent = v_today
        where department_id = dept.department_id;
    end if;
  end loop;

  -- C: staff attendance, org-wide
  if exists (
    select 1 from school_settings
    where id = 1 and staff_attendance_digest_time is not null and staff_attendance_digest_time <= v_now_time
      and (staff_attendance_digest_last_sent is null or staff_attendance_digest_last_sent < v_today)
  ) and org_school_day(v_today, true) then
    select
      count(*) filter (where sds.status = 'present'),
      count(*) filter (where sds.status = 'late'),
      count(*) filter (where sds.status = 'absent'),
      count(*) filter (where sds.status = 'leave')
      into v_present, v_late, v_absent, v_leave
    from staff_daily_status(v_today) sds;

    v_total := v_present + v_late + v_absent + v_leave;
    if v_total > 0 then
      v_message := 'สรุปการเข้างานวันนี้ (ทั้งโรงเรียน): มา ' || v_present || ' สาย ' || v_late ||
        ' ขาด ' || v_absent || ' ลา ' || v_leave || ' (จาก ' || v_total || ' คน)';
      insert into line_notifications (profile_id, message)
      select distinct pr.profile_id, v_message
      from profile_roles pr
      where pr.role in ('super_admin', 'director', 'staff');

      update school_settings set staff_attendance_digest_last_sent = v_today where id = 1;
    end if;
  end if;
end $$;

-- Re-registering the same job name updates it in place (pg_cron upserts on
-- jobname) — still the one line-notify-drain job, just enqueueing from one
-- more producer before the existing drain call.
select cron.schedule(
  'line-notify-drain',
  '*/5 * * * *',
  $$
  select enqueue_due_assignment_notifications();
  select enqueue_attendance_digests();
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
