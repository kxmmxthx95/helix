-- ครูแทนเช็คชื่อ (เข้าแถว + รายคาบ) เมื่อครูเจ้าของลา — grill decisions 2026-11-08:
--  * ผูกกับใบลา (leave_requests): มอบได้ตั้งแต่ pending แต่ "มีผล" เมื่อใบลา approved
--    และครูแทนกด confirm; ใบลา rejected/cancelled/แก้วันที่ -> cancel อัตโนมัติ
--  * ครูแทนเขียน/อ่านได้เฉพาะห้อง/คาบ/วันที่ที่ confirmed (บังคับที่ RLS)
--  * เจ้าของเดิมไม่ถูกตัดสิทธิ์ (policy เดิมไม่แตะ); recorded_by = ครูแทน (คอลัมน์เดิม)
--  * ผู้เสนอ: ครูที่ลา หรือ can_manage(); ครูแทนต้อง confirm ทุกกรณี
--  * LINE: เสนอชื่อ (ทันที), ปฏิเสธ (ครูลา+ผู้บริหาร), digest เย็นก่อนวัน/เช้าวันนั้น

create type cover_status as enum ('pending', 'confirmed', 'declined', 'cancelled');

create table attendance_covers (
  id                 uuid primary key default gen_random_uuid(),
  leave_request_id   uuid not null references leave_requests on delete cascade,
  date               date not null,
  -- exactly one of: เข้าแถว (classroom_id) | รายคาบ (schedule_entry_id)
  classroom_id       uuid references classrooms on delete restrict,
  schedule_entry_id  uuid references schedule_entries on delete cascade,
  cover_staff_id     uuid not null references profiles on delete restrict,
  proposed_by        uuid not null references profiles on delete restrict,
  status             cover_status not null default 'pending',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((classroom_id is null) <> (schedule_entry_id is null))
);

-- หนึ่งงานมีครูแทนที่ active ได้คนเดียว
create unique index attendance_covers_active_uniq
  on attendance_covers (date, coalesce(classroom_id, schedule_entry_id))
  where status in ('pending', 'confirmed');
create index attendance_covers_staff_date_idx on attendance_covers (cover_staff_id, date);
create index attendance_covers_leave_idx on attendance_covers (leave_request_id);

create trigger attendance_covers_touch before update on attendance_covers
  for each row execute function touch_updated_at();
create trigger attendance_covers_audit
  after insert or update or delete on attendance_covers
  for each row execute function log_audit();

-- ---------------------------------------------------------------- duties
-- งานเช็คชื่อของครูคนหนึ่งในวันหนึ่ง (ปีล่าสุดที่ครูคนนั้นมีข้อมูล) — ใช้ทั้ง
-- ตรวจตอนเสนอชื่อ และ digest
create or replace function attendance_duties(p_profile uuid, p_date date)
  returns table (classroom_id uuid, schedule_entry_id uuid, label text, period_no smallint)
  language sql stable security definer set search_path = public as $$
  select cht.classroom_id, null::uuid,
         'เช็คชื่อเข้าแถว ' || gl.name || '/' || c.name, null::smallint
  from classroom_homeroom_teachers cht
  join classrooms c on c.id = cht.classroom_id
  join grade_levels gl on gl.id = c.grade_level_id
  where cht.teacher_id = p_profile
    and cht.academic_year = (
      select max(x.academic_year) from classroom_homeroom_teachers x where x.classroom_id = cht.classroom_id)
  union all
  select null::uuid, se.id,
         'คาบ ' || se.period_no || ' ' || gl.name || '/' || c.name, se.period_no
  from schedule_entries se
  join teaching_assignments ta on ta.id = se.teaching_assignment_id
  join classrooms c on c.id = ta.classroom_id
  join grade_levels gl on gl.id = c.grade_level_id
  where ta.teacher_id = p_profile
    and se.day_of_week = extract(isodow from p_date)
    and ta.academic_year = (
      select max(y.academic_year) from teaching_assignments y where y.teacher_id = p_profile)
$$;

-- ---------------------------------------------------------------- insert check
create or replace function check_attendance_cover_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_leave leave_requests%rowtype;
begin
  select * into v_leave from leave_requests where id = new.leave_request_id;
  if not found or v_leave.status not in ('pending', 'approved') then
    raise exception 'ใบลานี้ไม่อยู่ในสถานะที่มอบงานแทนได้';
  end if;
  if new.date not between v_leave.start_date and v_leave.end_date then
    raise exception 'วันที่ที่มอบอยู่นอกช่วงที่ลา';
  end if;
  if auth.uid() is distinct from v_leave.profile_id and not can_manage() then
    raise exception 'ไม่มีสิทธิ์มอบงานแทนในใบลานี้';
  end if;
  if new.cover_staff_id = v_leave.profile_id then
    raise exception 'เลือกตัวเองเป็นครูแทนไม่ได้';
  end if;
  if not exists (
    select 1 from attendance_duties(v_leave.profile_id, new.date) d
    where d.classroom_id is not distinct from new.classroom_id
      and d.schedule_entry_id is not distinct from new.schedule_entry_id
  ) then
    raise exception 'งานนี้ไม่ใช่ของครูที่ลา';
  end if;
  new.status := 'pending';
  new.proposed_by := auth.uid();
  return new;
end $$;

create trigger attendance_covers_insert_check before insert on attendance_covers
  for each row execute function check_attendance_cover_insert();

-- ---------------------------------------------------------------- transitions
-- ครูแทน: pending -> confirmed|declined. ผู้เสนอ/ครูที่ลา/can_manage: pending|confirmed -> cancelled.
-- trigger ฝั่งใบลาตั้ง app.cover_system เพื่อ cancel อัตโนมัติ
create or replace function check_attendance_cover_transition() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.leave_request_id is distinct from old.leave_request_id
    or new.date is distinct from old.date
    or new.classroom_id is distinct from old.classroom_id
    or new.schedule_entry_id is distinct from old.schedule_entry_id
    or new.cover_staff_id is distinct from old.cover_staff_id
    or new.proposed_by is distinct from old.proposed_by then
    raise exception 'แก้ไขข้อมูลการมอบเดิมไม่ได้ ยกเลิกแล้วมอบใหม่แทน';
  end if;
  if new.status = old.status then
    return new;
  end if;
  if current_setting('app.cover_system', true) = '1' and new.status = 'cancelled' then
    return new;
  end if;
  if old.status = 'pending' and new.status in ('confirmed', 'declined')
    and auth.uid() = old.cover_staff_id then
    if new.status = 'confirmed' and old.date < (now() at time zone 'Asia/Bangkok')::date then
      raise exception 'เลยวันที่มอบแล้ว ยืนยันไม่ได้';
    end if;
    return new;
  end if;
  if old.status in ('pending', 'confirmed') and new.status = 'cancelled'
    and (auth.uid() = old.proposed_by or can_manage()
         or exists (select 1 from leave_requests lr
                    where lr.id = old.leave_request_id and lr.profile_id = auth.uid())) then
    return new;
  end if;
  raise exception 'เปลี่ยนสถานะการมอบงานแทนแบบนี้ไม่ได้';
end $$;

create trigger attendance_covers_transition_check before update on attendance_covers
  for each row execute function check_attendance_cover_transition();

-- ---------------------------------------------------------------- RLS
alter table attendance_covers enable row level security;

create policy attendance_covers_read on attendance_covers
  for select to authenticated using (
    cover_staff_id = auth.uid()
    or proposed_by = auth.uid()
    or can_manage()
    or exists (select 1 from leave_requests lr where lr.id = leave_request_id and lr.profile_id = auth.uid())
  );
create policy attendance_covers_insert on attendance_covers
  for insert to authenticated with check (proposed_by = auth.uid());
create policy attendance_covers_update on attendance_covers
  for update to authenticated
  using (
    cover_staff_id = auth.uid() or proposed_by = auth.uid() or can_manage()
    or exists (select 1 from leave_requests lr where lr.id = leave_request_id and lr.profile_id = auth.uid())
  )
  with check (true); -- field/transition rules live in the trigger

-- ---------------------------------------------------------------- effective cover -> attendance access
-- "มีผล" = confirmed + ใบลา approved + วันที่ตรงกับแถวที่เขียน/อ่าน
create or replace function has_cover_for_classroom(p_classroom uuid, p_date date) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from attendance_covers ac join leave_requests lr on lr.id = ac.leave_request_id
    where ac.cover_staff_id = auth.uid() and ac.status = 'confirmed' and lr.status = 'approved'
      and ac.date = p_date and ac.classroom_id = p_classroom)
$$;

create or replace function has_cover_for_entry(p_entry uuid, p_date date) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from attendance_covers ac join leave_requests lr on lr.id = ac.leave_request_id
    where ac.cover_staff_id = auth.uid() and ac.status = 'confirmed' and lr.status = 'approved'
      and ac.date = p_date and ac.schedule_entry_id = p_entry)
$$;

-- นักเรียน/การลงทะเบียนห้อง: อ่านได้เฉพาะห้องที่ตัวเองแทนอยู่ "วันนี้"
create or replace function cover_sees_classroom(p_classroom uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from attendance_covers ac join leave_requests lr on lr.id = ac.leave_request_id
    left join schedule_entries se on se.id = ac.schedule_entry_id
    left join teaching_assignments ta on ta.id = se.teaching_assignment_id
    where ac.cover_staff_id = auth.uid() and ac.status = 'confirmed' and lr.status = 'approved'
      and ac.date = (now() at time zone 'Asia/Bangkok')::date
      and coalesce(ac.classroom_id, ta.classroom_id) = p_classroom)
$$;

create or replace function cover_sees_student(p_student uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from student_classroom_enrollments sce
    where sce.student_id = p_student and cover_sees_classroom(sce.classroom_id))
$$;

create policy attendance_records_cover_write on attendance_records
  for all to authenticated
  using (has_cover_for_classroom(classroom_id, date))
  with check (has_cover_for_classroom(classroom_id, date));
create policy attendance_records_cover_read on attendance_records
  for select to authenticated using (cover_sees_classroom(classroom_id));

create policy period_attendance_records_cover_write on period_attendance_records
  for all to authenticated
  using (has_cover_for_entry(schedule_entry_id, date))
  with check (has_cover_for_entry(schedule_entry_id, date));

create policy students_cover_read on students
  for select to authenticated using (cover_sees_student(id));
create policy student_classroom_enrollments_cover_read on student_classroom_enrollments
  for select to authenticated using (cover_sees_classroom(classroom_id));

-- งานแทนของฉัน (flatten ชื่อห้อง/คาบ/ครูที่ลา ให้ UI — ครูแทนอ่าน
-- teaching_assignments ของคนอื่นตรง ๆ ไม่ได้)
create or replace function my_attendance_covers(p_from date, p_to date)
  returns table (
    id uuid, date date, status cover_status, classroom_id uuid, schedule_entry_id uuid,
    label text, owner_name text, leave_status leave_status,
    room_label text, period_no smallint, subject_code text, subject_name text
  )
  language sql stable security definer set search_path = public as $$
  select ac.id, ac.date, ac.status,
         coalesce(ac.classroom_id, ta.classroom_id), ac.schedule_entry_id,
         case when ac.classroom_id is not null
           then 'เช็คชื่อเข้าแถว ' || gl.name || '/' || c.name
           else 'คาบ ' || se.period_no || ' ' || gl.name || '/' || c.name end,
         p.first_name || ' ' || p.last_name,
         lr.status,
         gl.name || '/' || c.name, se.period_no, sub.code, sub.name_th
  from attendance_covers ac
  join leave_requests lr on lr.id = ac.leave_request_id
  join profiles p on p.id = lr.profile_id
  left join schedule_entries se on se.id = ac.schedule_entry_id
  left join teaching_assignments ta on ta.id = se.teaching_assignment_id
  left join subjects sub on sub.id = ta.subject_id
  join classrooms c on c.id = coalesce(ac.classroom_id, ta.classroom_id)
  join grade_levels gl on gl.id = c.grade_level_id
  where ac.cover_staff_id = auth.uid()
    and ac.date between p_from and p_to
    and ac.status in ('pending', 'confirmed')
  order by ac.date, se.period_no nulls first
$$;

-- ---------------------------------------------------------------- leave sync
create or replace function sync_covers_with_leave() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status
    and new.start_date is not distinct from old.start_date
    and new.end_date is not distinct from old.end_date then
    return new;
  end if;
  perform set_config('app.cover_system', '1', true);
  with cancelled as (
    update attendance_covers ac set status = 'cancelled'
    where ac.leave_request_id = new.id
      and ac.status in ('pending', 'confirmed')
      and (new.status in ('rejected', 'cancelled') or ac.date not between new.start_date and new.end_date)
    returning ac.cover_staff_id, ac.date
  )
  insert into line_notifications (profile_id, message)
  select cover_staff_id,
         'งานเช็คชื่อแทนวันที่ ' || to_char(date, 'DD/MM/YYYY') || ' ถูกยกเลิก (ใบลาของครูเจ้าของมีการเปลี่ยนแปลง)'
  from cancelled;
  perform set_config('app.cover_system', '0', true);
  return new;
end $$;

create trigger leave_requests_sync_covers after update on leave_requests
  for each row execute function sync_covers_with_leave();

-- ---------------------------------------------------------------- LINE (event)
create or replace function cover_label(p_classroom uuid, p_entry uuid) returns text
  language sql stable security definer set search_path = public as $$
  select case when p_classroom is not null
    then 'เช็คชื่อเข้าแถว ' || gl.name || '/' || c.name
    else 'คาบ ' || se.period_no || ' ' || gl.name || '/' || c.name end
  from (select 1) x
  left join schedule_entries se on se.id = p_entry
  left join teaching_assignments ta on ta.id = se.teaching_assignment_id
  join classrooms c on c.id = coalesce(p_classroom, ta.classroom_id)
  join grade_levels gl on gl.id = c.grade_level_id
$$;

create or replace function notify_attendance_cover() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_name text;
begin
  select lr.profile_id, p.first_name || ' ' || p.last_name into v_owner, v_name
  from leave_requests lr join profiles p on p.id = lr.profile_id where lr.id = new.leave_request_id;

  if tg_op = 'INSERT' then
    insert into line_notifications (profile_id, message) values (
      new.cover_staff_id,
      'มีการขอให้คุณเช็คชื่อแทน ' || v_name || ': ' || cover_label(new.classroom_id, new.schedule_entry_id) ||
        ' วันที่ ' || to_char(new.date, 'DD/MM/YYYY') || ' กรุณายืนยันในระบบ');
  elsif new.status = 'declined' and old.status = 'pending' then
    insert into line_notifications (profile_id, message)
    select distinct r.pid,
      'ครูแทนปฏิเสธการเช็คชื่อแทน ' || v_name || ': ' || cover_label(new.classroom_id, new.schedule_entry_id) ||
        ' วันที่ ' || to_char(new.date, 'DD/MM/YYYY') || ' กรุณาหาคนใหม่'
    from (
      select v_owner as pid
      union select pr.profile_id from profile_roles pr where pr.role in ('super_admin', 'director', 'staff')
    ) r;
  end if;
  return new;
end $$;

create trigger attendance_covers_notify after insert or update on attendance_covers
  for each row execute function notify_attendance_cover();

-- ---------------------------------------------------------------- LINE (digest)
create table cover_digest_runs (
  run_date date not null,
  slot     text not null check (slot in ('evening', 'morning')),
  primary key (run_date, slot)
);
alter table cover_digest_runs enable row level security; -- system only, no policies

-- เย็น (>=16:00): พรุ่งนี้; เช้า (>=06:30): วันนี้ — แจ้งผู้บริหารเฉพาะงานของคนที่ลา
-- (approved) แต่ยังไม่มีครูแทนที่ confirmed; เช้ายังแจ้งครูแทนที่ confirmed ด้วย
create or replace function enqueue_cover_digests() returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_time  time := (now() at time zone 'Asia/Bangkok')::time;
  v_slot  text;
  v_date  date;
  v_n     int;
  v_msg   text;
begin
  if v_time >= '16:00' then v_slot := 'evening'; v_date := v_today + 1;
  elsif v_time >= '06:30' then v_slot := 'morning'; v_date := v_today;
  else return;
  end if;
  -- evening slot catches up only until midnight; morning slot only before 16:00
  if v_slot = 'morning' and v_time >= '16:00' then return; end if;

  insert into cover_digest_runs (run_date, slot) values (v_today, v_slot) on conflict do nothing;
  if not found then return; end if;
  if not org_school_day(v_date, true) then return; end if;

  drop table if exists _uncovered;
  create temp table _uncovered on commit drop as
  select lr.profile_id as owner_id, d.label
  from leave_requests lr
  cross join lateral attendance_duties(lr.profile_id, v_date) d
  where lr.status = 'approved' and v_date between lr.start_date and lr.end_date
    and not exists (
      select 1 from attendance_covers ac
      where ac.date = v_date and ac.status = 'confirmed'
        and ac.classroom_id is not distinct from d.classroom_id
        and ac.schedule_entry_id is not distinct from d.schedule_entry_id);

  select count(*) into v_n from _uncovered;
  if v_n > 0 then
    select 'ยังไม่มีครูแทนเช็คชื่อ' || case when v_slot = 'evening' then 'พรุ่งนี้' else 'วันนี้' end ||
           ' ' || v_n || ' รายการ: ' ||
           string_agg(p.first_name || ' (' || u.label || ')', ', ')
      into v_msg
    from _uncovered u join profiles p on p.id = u.owner_id;
    insert into line_notifications (profile_id, message)
    select distinct pr.profile_id, v_msg from profile_roles pr
    where pr.role in ('super_admin', 'director', 'staff');
  end if;

  if v_slot = 'morning' then
    insert into line_notifications (profile_id, message)
    select ac.cover_staff_id,
           'วันนี้คุณต้องเช็คชื่อแทน: ' ||
             string_agg(cover_label(ac.classroom_id, ac.schedule_entry_id), ', ')
    from attendance_covers ac join leave_requests lr on lr.id = ac.leave_request_id
    where ac.date = v_date and ac.status = 'confirmed' and lr.status = 'approved'
    group by ac.cover_staff_id;
  end if;
end $$;

-- same drain job as 0040/0066, one more producer
select cron.schedule(
  'line-notify-drain',
  '*/5 * * * *',
  $$
  select enqueue_due_assignment_notifications();
  select enqueue_attendance_digests();
  select enqueue_cover_digests();
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
