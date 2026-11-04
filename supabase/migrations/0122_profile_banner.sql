-- Cover image for the home profile card. Client compresses before upload (src/lib/image.ts);
-- the bucket also caps size/type server-side. Same shape as avatars (0024): one object per
-- user, named by their own id, always overwritten.
alter table profiles add column banner_path text;

-- profiles_update_self (migration 0001) already lets every user update their own row.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy banners_read on storage.objects
  for select using (bucket_id = 'banners');
create policy banners_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'banners' and name = auth.uid()::text);
create policy banners_update on storage.objects
  for update to authenticated
  using (bucket_id = 'banners' and name = auth.uid()::text)
  with check (bucket_id = 'banners' and name = auth.uid()::text);
create policy banners_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'banners' and name = auth.uid()::text);
