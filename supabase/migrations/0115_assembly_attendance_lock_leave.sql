-- Approved leave (0035) is the source of truth for assembly attendance too,
-- same as period attendance (0037): force status 'leave' on any insert/update
-- inside an approved range, so approving after a "present" mark, or a manual
-- change, can't leave the two out of step. security definer for the same reason
-- as lock_period_attendance_to_leave().
create or replace function lock_attendance_to_leave() returns trigger
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

create trigger attendance_records_lock_leave
  before insert or update on attendance_records
  for each row execute function lock_attendance_to_leave();
