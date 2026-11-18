-- Teacher/manager files student leave on a student's behalf (e.g. a parent
-- phones in after the 08:00 cutoff, 0177). The row is inserted already
-- 'approved' — the filer is the approver — so attendance auto-fills on insert
-- (sync trigger now also fires on INSERT) and the cutoff doesn't apply.
-- Also closes a gap in 0035: the old insert policy let a student/guardian
-- insert a row with status 'approved'; they may now only insert 'pending'.

drop policy student_leave_requests_insert on student_leave_requests;
create policy student_leave_requests_insert on student_leave_requests
  for insert to authenticated with check (
    submitted_by = auth.uid() and (
      (status = 'pending' and (
        student_id in (select id from students where profile_id = auth.uid())
        or student_id in (select student_id from guardianships where parent_id = auth.uid())
      ))
      or (status = 'approved' and approved_by = auth.uid() and (
        (can_manage() and (is_org_wide() or student_id in (
          select s.id from students s join grade_levels gl on gl.id = s.grade_level_id where gl.department_id = auth_department()
        )))
        or current_student_classroom(student_id) in (
          select cht.classroom_id from classroom_homeroom_teachers cht where cht.teacher_id = auth.uid()
        )
      ))
    )
  );

-- Body as 0035, plus INSERT support (OLD doesn't exist on insert).
create or replace function sync_student_leave_to_attendance() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  d   date;
  cid uuid;
begin
  if new.status <> 'approved' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    return new;
  end if;
  cid := current_student_classroom(new.student_id);
  if cid is null then
    return new;
  end if;
  d := new.start_date;
  while d <= new.end_date loop
    if extract(dow from d) not in (0, 6) then
      insert into attendance_records (student_id, classroom_id, date, status, recorded_by)
      values (new.student_id, cid, d, 'leave', new.approved_by)
      on conflict (student_id, date) do update
        set status = 'leave', classroom_id = excluded.classroom_id, recorded_by = excluded.recorded_by;
    end if;
    d := d + 1;
  end loop;
  return new;
end $$;

create trigger student_leave_requests_sync_attendance_insert after insert on student_leave_requests
  for each row when (new.status = 'approved') execute function sync_student_leave_to_attendance();

-- Cutoff binds only 'pending' inserts (student/guardian); approved inserts come from approvers (policy above).
create or replace function check_student_leave_cutoff() returns trigger
  language plpgsql as $$
declare
  now_bkk timestamp := now() at time zone 'Asia/Bangkok';
begin
  if new.status = 'pending'
    and new.start_date <= now_bkk::date and new.end_date >= now_bkk::date
    and now_bkk::time >= time '08:00' then
    raise exception 'ยื่นลาของวันนี้ไม่ได้หลัง 08:00 น. กรุณาติดต่อครูประจำชั้น';
  end if;
  return new;
end $$;

-- Body as 0066, skipped when the filer already approved it (nothing to review).
create or replace function notify_student_leave_submitted() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select first_name || ' ' || last_name into v_name from students where id = new.student_id;
  perform notify_student_leave_homeroom(new.student_id,
    v_name || ' ยื่นคำขอลา ' || to_char(new.start_date, 'DD/MM/YYYY') ||
      case when new.end_date <> new.start_date then ' ถึง ' || to_char(new.end_date, 'DD/MM/YYYY') else '' end ||
      ' เหตุผล: ' || new.reason);
  return new;
end $$;
