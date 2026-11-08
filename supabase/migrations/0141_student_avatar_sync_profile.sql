-- Roster staff (can_manage, not can_manage_users) cannot update profiles under RLS, so the client-side
-- "mirror the student photo onto the linked login" silently matched 0 rows: removing a photo left the
-- login's avatar_path (and the roster fallback) showing the old picture. Sync it here instead.
create or replace function sync_student_avatar_to_profile() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if new.profile_id is not null and new.avatar_path is distinct from old.avatar_path then
    update profiles set avatar_path = new.avatar_path where id = new.profile_id;
  end if;
  return new;
end $$;
create trigger students_sync_avatar_to_profile after update of avatar_path on students
  for each row execute function sync_student_avatar_to_profile();

-- Repair rows already stuck: roster photo removed, linked login still points at students/<id>.
update profiles p set avatar_path = null
  from students s
 where s.profile_id = p.id and s.avatar_path is null and p.avatar_path like 'students/%';
