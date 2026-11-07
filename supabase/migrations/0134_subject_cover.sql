-- Optional subject cover. Object name in the public 'subject-covers' bucket = the subject id (upsert overwrites,
-- no orphans); cover_path points at it. Only org-wide (admin) may write — same pattern as pos-products (0126).
alter table subjects add column cover_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subject-covers', 'subject-covers', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy subject_covers_read on storage.objects
  for select using (bucket_id = 'subject-covers');
create policy subject_covers_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'subject-covers' and is_org_wide());
create policy subject_covers_update on storage.objects
  for update to authenticated using (bucket_id = 'subject-covers' and is_org_wide()) with check (bucket_id = 'subject-covers' and is_org_wide());
create policy subject_covers_delete on storage.objects
  for delete to authenticated using (bucket_id = 'subject-covers' and is_org_wide());
