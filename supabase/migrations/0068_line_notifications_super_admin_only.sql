-- Narrow LINE-notification management to super_admin — grill decision,
-- 2026-09-06. 0067 scoped set_line_notifications_enabled to can_manage()
-- (director/staff/dept_head too), matching most other admin pages, but this
-- one reaches every profile school-wide (not department-bounded like
-- roster/HR work), so it follows profiles_manage / can_manage_users()
-- instead. UI hides the menu item accordingly, but the database stays the
-- real boundary — narrow it here too, not just in the sidebar filter.
create or replace function set_line_notifications_enabled(p_profile_id uuid, p_enabled boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_users() then
    raise exception 'not authorized';
  end if;

  update profiles set line_notifications_enabled = p_enabled where id = p_profile_id;
end $$;
