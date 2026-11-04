-- Secondary-school (SEC) students may file card top-up slips for themselves.
-- Policies are OR'd with the guardian ones from 0108, which stay as they are:
-- same limits (20–5,000 ฿ via the table check), still pending until the school approves.

create policy card_slip_requests_insert_self_sec on card_slip_requests
  for insert to authenticated with check (
    requested_by = auth.uid() and status = 'pending'
    and student_id in (
      select s.id from students s join departments d on d.id = s.department_id
      where s.profile_id = auth.uid() and d.code = 'SEC'
    )
    and transferred_at <= now() + interval '5 minutes'
    and slip_path like student_id::text || '/%'
  );

create policy card_slip_files_write_self_sec on storage.objects
  for insert to authenticated with check (
    bucket_id = 'card-slips'
    and (storage.foldername(name))[1]::uuid in (
      select s.id from students s join departments d on d.id = s.department_id
      where s.profile_id = auth.uid() and d.code = 'SEC'
    )
  );

create policy card_slip_files_read_self_sec on storage.objects
  for select to authenticated using (
    bucket_id = 'card-slips'
    and (storage.foldername(name))[1]::uuid in (
      select s.id from students s join departments d on d.id = s.department_id
      where s.profile_id = auth.uid() and d.code = 'SEC'
    )
  );
