-- "ออกนอกโรงเรียนแบบไม่กลับมา": when such a request is approved, close that
-- day's open clock record at the exit time (flagged auto_clock_out, like 0145)
-- so the person need not clock out and hours are not inflated. Done in a
-- security definer trigger so any approver, from any screen, can trigger it
-- without needing write access to the requester's time_clock_records.

alter table premises_exit_requests add column no_return boolean not null default false;

create or replace function premises_exit_no_return_clock_out() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.no_return and new.status = 'approved' and old.status is distinct from 'approved' then
    update time_clock_records
    set clock_out_time = greatest(clock_in_time, new.exit_time), auto_clock_out = true
    where profile_id = new.profile_id and date = new.date
      and clock_in_time is not null and clock_out_time is null;
  end if;
  return new;
end $$;

create trigger premises_exit_requests_no_return after update on premises_exit_requests
  for each row execute function premises_exit_no_return_clock_out();
