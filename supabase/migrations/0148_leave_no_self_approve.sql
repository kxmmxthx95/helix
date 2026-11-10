-- A requester never decides their own staff leave: managers (dept_head,
-- dept_director, staff, ...) bypass check_leave_self_edit (0033), so without
-- this a manager could approve/reject their own request. Their leave is
-- decided by someone else (org-wide roles for a dept head). Self-cancel of a
-- future request stays allowed.
create or replace function check_leave_no_self_decision() returns trigger
  language plpgsql as $$
begin
  if auth.uid() is not null
    and new.profile_id = auth.uid()
    and new.status is distinct from old.status
    and new.status in ('approved', 'rejected') then
    raise exception 'อนุมัติหรือไม่อนุมัติใบลาของตัวเองไม่ได้';
  end if;
  return new;
end $$;

create trigger leave_requests_no_self_decision before update on leave_requests
  for each row execute function check_leave_no_self_decision();
