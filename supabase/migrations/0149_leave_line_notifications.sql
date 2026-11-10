-- LINE notifications for staff leave (leave_requests), mirroring what 0066 does
-- for student leave. Rows go into line_notifications and the existing
-- line-notify-drain cron (0040) delivers them.
--   * submitted  -> dept_head + dept_director of the requester's department
--                   (never the requester); if none, the directors instead
--   * approved / rejected -> the requester
--   * cancelled (from pending/approved) -> same recipients as "submitted"

create or replace function notify_leave_approvers(p_profile_id uuid, p_message text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  insert into line_notifications (profile_id, message)
  select distinct pr.profile_id, p_message
  from profile_roles pr
  join profiles p on p.id = pr.profile_id
  where pr.role in ('dept_head', 'dept_director')
    and p.is_active
    and p.department_id = (select department_id from profiles where id = p_profile_id)
    and pr.profile_id <> p_profile_id;

  if not found then
    insert into line_notifications (profile_id, message)
    select distinct pr.profile_id, p_message
    from profile_roles pr
    join profiles p on p.id = pr.profile_id
    where pr.role = 'director' and p.is_active and pr.profile_id <> p_profile_id;
  end if;
end $$;

create or replace function leave_summary(p_row leave_requests) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select name from leave_types where id = p_row.leave_type_id), 'ลา') || ' ' ||
    to_char(p_row.start_date, 'DD/MM/YYYY') ||
    case when p_row.end_date <> p_row.start_date then ' ถึง ' || to_char(p_row.end_date, 'DD/MM/YYYY') else '' end ||
    ' (' || p_row.days || ' วัน)'
$$;

create or replace function notify_leave_submitted() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select trim(coalesce(prefix, '') || first_name || ' ' || last_name) into v_name from profiles where id = new.profile_id;
  perform notify_leave_approvers(new.profile_id,
    v_name || ' ยื่นใบลา' || leave_summary(new) || ' เหตุผล: ' || new.reason || ' รออนุมัติ');
  return new;
end $$;

create trigger leave_requests_notify_submitted after insert on leave_requests
  for each row execute function notify_leave_submitted();

create or replace function notify_leave_decision() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status in ('approved', 'rejected') then
    insert into line_notifications (profile_id, message)
    values (new.profile_id, 'ใบลา' || leave_summary(new) ||
      case when new.status = 'approved' then ' ได้รับการอนุมัติแล้ว' else ' ไม่ได้รับการอนุมัติ' end);
  elsif new.status = 'cancelled' and old.status in ('pending', 'approved') then
    select trim(coalesce(prefix, '') || first_name || ' ' || last_name) into v_name from profiles where id = new.profile_id;
    perform notify_leave_approvers(new.profile_id, v_name || ' ยกเลิกใบลา' || leave_summary(new));
  end if;
  return new;
end $$;

create trigger leave_requests_notify_decision after update on leave_requests
  for each row execute function notify_leave_decision();
