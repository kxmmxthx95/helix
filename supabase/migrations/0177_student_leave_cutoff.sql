-- Student leave cutoff: a request whose range covers today can't be submitted
-- after 08:00 Asia/Bangkok (grill decision, 2026-11-18). Future-only ranges are
-- always fine. Insert-only: approval time is not limited. Teachers can't insert
-- today (RLS insert = self-student/guardian only), so no role exemption here.
create or replace function check_student_leave_cutoff() returns trigger
  language plpgsql as $$
declare
  now_bkk timestamp := now() at time zone 'Asia/Bangkok';
begin
  if new.start_date <= now_bkk::date and new.end_date >= now_bkk::date
    and now_bkk::time >= time '08:00' then
    raise exception 'ยื่นลาของวันนี้ไม่ได้หลัง 08:00 น. กรุณาติดต่อครูประจำชั้น';
  end if;
  return new;
end $$;

create trigger student_leave_requests_cutoff_check before insert on student_leave_requests
  for each row execute function check_student_leave_cutoff();
