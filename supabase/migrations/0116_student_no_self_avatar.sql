-- Students may not upload/change their own profile picture; staff set it for
-- them (Users edit drawer / roster, migrations 0025 + 0105).
create or replace function is_student() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from profile_roles where profile_id = auth.uid() and role = 'student')
$$;

-- Replace the 0024 self-service storage policies with student-excluding ones.
drop policy avatars_write on storage.objects;
drop policy avatars_update on storage.objects;
drop policy avatars_delete on storage.objects;
create policy avatars_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text and not is_student());
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text and not is_student())
  with check (bucket_id = 'avatars' and name = auth.uid()::text and not is_student());
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text and not is_student());

-- profiles_update_self lets a user edit any column of their own row, so also
-- block a student re-pointing/clearing avatar_path on themselves.
create or replace function block_student_self_avatar() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if new.avatar_path is distinct from old.avatar_path and auth.uid() = new.id and is_student() then
    raise exception 'students cannot change their own profile picture';
  end if;
  return new;
end $$;
create trigger profiles_block_student_avatar before update on profiles
  for each row execute function block_student_self_avatar();
