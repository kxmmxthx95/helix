-- 0141 only synced when students.avatar_path changed. When the roster shows the linked login's photo as a
-- fallback (students.avatar_path already null), "remove photo" sets null -> null, the trigger skipped, and the
-- login photo stayed. Removal (new is null) must always clear the login's photo.
create or replace function sync_student_avatar_to_profile() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if new.profile_id is not null
     and (new.avatar_path is null or new.avatar_path is distinct from old.avatar_path) then
    update profiles set avatar_path = new.avatar_path where id = new.profile_id and avatar_path is distinct from new.avatar_path;
  end if;
  return new;
end $$;

