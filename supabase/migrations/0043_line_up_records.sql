-- เช็คชื่อเข้าแถว — กิจกรรมหน้าเสาธงตอนเช้า แยกอิสระจาก attendance_records
-- (homeroom รายวัน, 0026) ไม่ sync กัน ทั้งสองฝั่งเช็คคนละเวลา คนละวัตถุประสงค์
-- ใช้ attendance_status enum เดิมจาก 0026, โครง RLS/trigger เดียวกับ
-- attendance_records ทุกจุด (grill decision: เหมือนกันทุกข้อยกเว้นชื่อตาราง)

create table line_up_records (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students on delete restrict,
  -- Snapshot ห้อง homeroom ณ วันนั้น เหมือน attendance_records.classroom_id —
  -- นักเรียนย้ายห้องกลางปีได้ ประวัติย้อนหลังต้องไม่ดริฟท์ตาม
  classroom_id  uuid not null references classrooms on delete restrict,
  date          date not null,
  status        attendance_status not null,
  note          text,
  recorded_by   uuid not null references profiles on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (student_id, date)
);

create index line_up_records_classroom_date_idx on line_up_records (classroom_id, date);
create index line_up_records_student_idx on line_up_records (student_id);

create trigger line_up_records_touch before update on line_up_records
  for each row execute function touch_updated_at();
create trigger line_up_records_audit
  after insert or update or delete on line_up_records
  for each row execute function log_audit();

alter table line_up_records enable row level security;

-- read: org-wide + department + homeroom teacher + student/guardian — same
-- shape as attendance_records_read (0026)
create policy line_up_records_read on line_up_records
  for select to authenticated using (
    is_org_wide()
    or classroom_id in (
      select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
      where gl.department_id = auth_department()
    )
    or classroom_id in (
      select cht.classroom_id from classroom_homeroom_teachers cht
      where cht.teacher_id = auth.uid()
    )
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );

-- write: can_manage() scoped to department + homeroom teacher — same shape
-- as attendance_records_write (0026)
create policy line_up_records_write on line_up_records
  for all to authenticated
  using (
    (can_manage() and (
      is_org_wide()
      or classroom_id in (
        select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    ))
    or classroom_id in (
      select cht.classroom_id from classroom_homeroom_teachers cht
      where cht.teacher_id = auth.uid()
    )
  )
  with check (
    (can_manage() and (
      is_org_wide()
      or classroom_id in (
        select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    ))
    or classroom_id in (
      select cht.classroom_id from classroom_homeroom_teachers cht
      where cht.teacher_id = auth.uid()
    )
  );

-- คำขอลาที่อนุมัติแล้วบังคับสถานะเป็น 'leave' เสมอ เหมือน
-- lock_period_attendance_to_leave (0037) — เขียนแยกฟังก์ชันเพราะ trigger
-- ผูกกับตารางเดียว ใช้ร่วมกันไม่ได้
create or replace function lock_line_up_to_leave() returns trigger
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

create trigger line_up_records_lock_leave
  before insert or update on line_up_records
  for each row execute function lock_line_up_to_leave();
