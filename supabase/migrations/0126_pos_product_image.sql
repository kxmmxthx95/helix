-- Optional product photo. Object name in the public 'pos-products' bucket = the product id (upsert overwrites,
-- no orphans); image_path points at it. Only org-wide may write — same as pos_products itself.
alter table pos_products add column image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pos-products', 'pos-products', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy pos_products_img_read on storage.objects
  for select using (bucket_id = 'pos-products');
create policy pos_products_img_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'pos-products' and is_org_wide());
create policy pos_products_img_update on storage.objects
  for update to authenticated using (bucket_id = 'pos-products' and is_org_wide()) with check (bucket_id = 'pos-products' and is_org_wide());
create policy pos_products_img_delete on storage.objects
  for delete to authenticated using (bucket_id = 'pos-products' and is_org_wide());
