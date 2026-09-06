-- Per-user LINE notification opt-out — grill decision, 2026-09-06.
--
-- Every LINE-notification producer (0040, 0063, 0066) fans out by inserting
-- into line_notifications keyed on profile_id, with no per-recipient toggle
-- anywhere — a user who's linked their LINE account has no way to go quiet
-- again short of unlinking. This adds one column read at drain time
-- (line-notify edge function) plus a write path for managers to flip it for
-- someone else, without opening full profile writes: profiles_manage (0001)
-- is super_admin-only, but LINE notification prefs are ordinary
-- roster-admin work, so this goes through a security-definer RPC scoped
-- like can_manage()'s existing department boundary instead.

alter table profiles add column line_notifications_enabled boolean not null default true;

create or replace function set_line_notifications_enabled(p_profile_id uuid, p_enabled boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not can_manage() then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from profiles
    where id = p_profile_id and (is_org_wide() or department_id = auth_department())
  ) then
    raise exception 'not authorized';
  end if;

  update profiles set line_notifications_enabled = p_enabled where id = p_profile_id;
end $$;
