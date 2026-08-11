-- super_admin may set/replace any account's avatar too (mirrors profiles_manage,
-- migration 0001) — needed for the profile-picture UI in Users.tsx's edit
-- drawer, which writes to a path keyed by the *target* user's id, not the
-- admin's own. Additive: these are separate permissive policies, so the
-- migration 0024 self-service ones (name = auth.uid()::text) still apply.
create policy avatars_admin_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and can_manage_users());
create policy avatars_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and can_manage_users())
  with check (bucket_id = 'avatars' and can_manage_users());
