-- ปกวิชา: let dept_head / dept_director upload covers for their own department's subjects
-- (0134 allowed org-wide only). Object name = subject id, so scope via the subjects row —
-- same rule as subjects_write (0007).
create or replace function _can_write_subject_cover(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage() and exists (
    select 1 from subjects s
    where s.id::text = object_name and (is_org_wide() or s.department_id = auth_department())
  );
$$;

drop policy subject_covers_insert on storage.objects;
drop policy subject_covers_update on storage.objects;
drop policy subject_covers_delete on storage.objects;

create policy subject_covers_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'subject-covers' and _can_write_subject_cover(name));
create policy subject_covers_update on storage.objects
  for update to authenticated using (bucket_id = 'subject-covers' and _can_write_subject_cover(name))
  with check (bucket_id = 'subject-covers' and _can_write_subject_cover(name));
create policy subject_covers_delete on storage.objects
  for delete to authenticated using (bucket_id = 'subject-covers' and _can_write_subject_cover(name));
