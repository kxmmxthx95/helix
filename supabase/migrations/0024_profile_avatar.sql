-- Profile picture. Client compresses before upload (src/lib/image.ts), so
-- the column here is just a path pointer, same shape as
-- school_settings.logo_path (migration 0002).
alter table profiles add column avatar_path text;

-- profiles_update_self (migration 0001) already lets every user update their
-- own row, so no RLS change needed for the new column.

-- Public bucket: avatars render in the sidebar for every signed-in user.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

-- Object name is always the uploader's own user id (fixed, no extension —
-- always overwrites, no orphaned files), so everyone may only ever touch
-- their own file.
create policy avatars_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text);
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text)
  with check (bucket_id = 'avatars' and name = auth.uid()::text);
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text);
