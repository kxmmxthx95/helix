-- Period attendance can't be recorded ahead of time: the home "next period"
-- card opens tomorrow's roster, and teachers saved marks a day early.
-- Rejects insert/update with a date after today (Asia/Bangkok). Deletes are not blocked.
create or replace function reject_future_period_attendance() returns trigger
  language plpgsql as $$
begin
  if new.date > (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'ยังเช็คชื่อล่วงหน้าไม่ได้ (วันที่ % ยังไม่ถึง)', new.date;
  end if;
  return new;
end $$;

create trigger period_attendance_records_no_future
  before insert or update on period_attendance_records
  for each row execute function reject_future_period_attendance();
