-- เช็คชื่อรายคาบ — แยกจาก attendance_records (0026) ที่เป็น homeroom วันละครั้ง
-- schedule_entry_id เป็น anchor ไม่ snapshot classroom_id เพราะ classroom ของ
-- schedule_entry ไม่ดริฟท์กลางปีเหมือนห้อง homeroom ของนักเรียน (แก้ตารางสอนคือ
-- delete+create ใหม่ ไม่ใช่ repoint แถวเดิม) ใช้ attendance_status enum เดิมจาก 0026

create table period_attendance_records (
  id                 uuid primary key default gen_random_uuid(),
  schedule_entry_id  uuid not null references schedule_entries on delete restrict,
  student_id         uuid not null references students on delete restrict,
  date               date not null,
  status             attendance_status not null,
  note               text,
  recorded_by        uuid not null references profiles on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (schedule_entry_id, date, student_id)
);

-- (schedule_entry_id, date, student_id) unique index ด้านบนใช้เป็น index ของ
-- "กริดเช็คชื่อของคาบนั้นวันนั้น" อยู่แล้ว ตัวนี้ใช้กับการค้นหาราย student+date
-- (sync trigger ด้านล่าง และรายงานในอนาคต) เหมือน attendance_records_student_idx (0026)
create index period_attendance_records_student_date_idx on period_attendance_records (student_id, date);

create trigger period_attendance_records_touch before update on period_attendance_records
  for each row execute function touch_updated_at();
create trigger period_attendance_records_audit
  after insert or update or delete on period_attendance_records
  for each row execute function log_audit();

alter table period_attendance_records enable row level security;

-- read: org-wide + คนในแผนกเดียวกัน (ผ่าน schedule_entry -> teaching_assignment ->
-- classroom -> grade_level), ครูประจำวิชาของคาบนั้น, ตัวนักเรียนเอง/ผู้ปกครอง —
-- โครงเดียวกับ attendance_records_read (0026)
create policy period_attendance_records_read on period_attendance_records
  for select to authenticated using (
    is_org_wide()
    or schedule_entry_id in (
      select se.id from schedule_entries se
      join teaching_assignments ta on ta.id = se.teaching_assignment_id
      join classrooms c on c.id = ta.classroom_id
      join grade_levels gl on gl.id = c.grade_level_id
      where gl.department_id = auth_department()
    )
    or schedule_entry_id in (
      select se.id from schedule_entries se
      join teaching_assignments ta on ta.id = se.teaching_assignment_id
      where ta.teacher_id = auth.uid()
    )
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );

-- write: can_manage() สโคปแผนก (เหมือน attendance_records_write) + ครูประจำวิชาของ
-- คาบนั้น (แทนที่ classroom_homeroom_teachers ด้วย teaching_assignments.teacher_id)
create policy period_attendance_records_write on period_attendance_records
  for all to authenticated
  using (
    (can_manage() and (
      is_org_wide()
      or schedule_entry_id in (
        select se.id from schedule_entries se
        join teaching_assignments ta on ta.id = se.teaching_assignment_id
        join classrooms c on c.id = ta.classroom_id
        join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    ))
    or schedule_entry_id in (
      select se.id from schedule_entries se
      join teaching_assignments ta on ta.id = se.teaching_assignment_id
      where ta.teacher_id = auth.uid()
    )
  )
  with check (
    (can_manage() and (
      is_org_wide()
      or schedule_entry_id in (
        select se.id from schedule_entries se
        join teaching_assignments ta on ta.id = se.teaching_assignment_id
        join classrooms c on c.id = ta.classroom_id
        join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    ))
    or schedule_entry_id in (
      select se.id from schedule_entries se
      join teaching_assignments ta on ta.id = se.teaching_assignment_id
      where ta.teacher_id = auth.uid()
    )
  );

-- คำขอลาที่อนุมัติแล้ว (0035) เป็น source of truth — บังคับสถานะเป็น 'leave' เสมอ
-- ไม่ว่าจะกดอะไรมา security definer เพราะครูประจำวิชาที่ไม่ใช่ครูประจำชั้น/
-- can_manage() ไม่มีสิทธิ์อ่าน student_leave_requests ของนักเรียนคนนั้นโดยตรง
create or replace function lock_period_attendance_to_leave() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from student_leave_requests slr
    where slr.student_id = new.student_id
      and slr.status = 'approved'
      and new.date between slr.start_date and slr.end_date
  ) then
    new.status := 'leave';
  end if;
  return new;
end $$;

create trigger period_attendance_records_lock_leave
  before insert or update on period_attendance_records
  for each row execute function lock_period_attendance_to_leave();

-- Sync เข้า attendance_records('leave') เฉพาะตอนครบทุกคาบของ classroom+วันนั้นเป็น
-- 'leave' เท่านั้น ไม่ครบ (หรือเคยครบแล้วภายหลังไม่ครบ) ให้ลบแถว 'leave' ที่เคย
-- sync ออก (ยกเว้นแถวที่ถูกป้องกันด้วยคำขอลาอนุมัติแล้ว — กันซ้อนกับ trigger ด้านบน)
-- recompute ทุกครั้งที่ insert/update ไม่ branch ตาม old/new เพื่อความง่าย (จำนวน
-- แถวต่อ student+date น้อยมาก ไม่มีปัญหาประสิทธิภาพ)
create or replace function sync_period_attendance_to_daily() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_classroom_id   uuid;
  v_academic_year  int;
  v_term           int;
  v_day_of_week    smallint;
  total_periods    int;
  leave_count      int;
begin
  select ta.classroom_id, ta.academic_year, ta.term, se.day_of_week
    into v_classroom_id, v_academic_year, v_term, v_day_of_week
    from schedule_entries se
    join teaching_assignments ta on ta.id = se.teaching_assignment_id
    where se.id = new.schedule_entry_id;

  -- "ตารางเต็มของห้องนี้ในวันนี้" — ไม่แยกตาม group_id (เรียนรวม/แบ่งคาบ) เหมือน
  -- useClassroomRoster ที่ไม่แยกเช่นกัน — ห้องที่มีคาบแบ่งกลุ่มอาจนับคาบนั้นซ้ำ
  -- ทำให้ "ครบทุกคาบ" ไปไม่ถึงในวันนั้น อัปเกรดได้ภายหลังถ้าพบว่าเป็นปัญหาจริง
  select count(*) into total_periods
    from schedule_entries se2
    join teaching_assignments ta2 on ta2.id = se2.teaching_assignment_id
    where ta2.classroom_id = v_classroom_id
      and ta2.academic_year = v_academic_year
      and ta2.term is not distinct from v_term
      and se2.day_of_week = v_day_of_week;

  select count(*) into leave_count
    from period_attendance_records par
    join schedule_entries se3 on se3.id = par.schedule_entry_id
    join teaching_assignments ta3 on ta3.id = se3.teaching_assignment_id
    where par.student_id = new.student_id
      and par.date = new.date
      and par.status = 'leave'
      and ta3.classroom_id = v_classroom_id
      and ta3.academic_year = v_academic_year
      and ta3.term is not distinct from v_term
      and se3.day_of_week = v_day_of_week;

  if total_periods > 0 and leave_count = total_periods then
    insert into attendance_records (student_id, classroom_id, date, status, recorded_by)
    values (new.student_id, v_classroom_id, new.date, 'leave', new.recorded_by)
    on conflict (student_id, date) do update
      set status = 'leave', classroom_id = excluded.classroom_id, recorded_by = excluded.recorded_by;
  else
    delete from attendance_records
      where student_id = new.student_id
        and date = new.date
        and status = 'leave'
        and not exists (
          select 1 from student_leave_requests slr
          where slr.student_id = new.student_id
            and slr.status = 'approved'
            and new.date between slr.start_date and slr.end_date
        );
  end if;

  return new;
end $$;

create trigger period_attendance_records_sync_daily
  after insert or update on period_attendance_records
  for each row execute function sync_period_attendance_to_daily();
