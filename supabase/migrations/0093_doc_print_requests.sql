-- รายการพิมพ์: a manager (can_manage_academic) queues a teacher-uploaded document for printing,
-- ธุรการ (or the manager) prints it and marks it printed. grill decision, 2026-10-19.
--
-- Scope: org-wide roles (super_admin, director, staff) see every department; dept_head/dept_director
-- see their own department's requests. department_id comes from the document's subject.
-- Only managers insert; a request can only move pending -> printed.

create table doc_print_requests (
  id            uuid primary key default gen_random_uuid(),
  doc_file_id   uuid not null references doc_files on delete cascade,
  department_id uuid references departments,
  copies        int not null default 1 check (copies between 1 and 999),
  note          text check (char_length(note) <= 300),
  requested_by  uuid not null default auth.uid() references profiles,
  status        text not null default 'pending' check (status in ('pending', 'printed')),
  printed_by    uuid references profiles,
  printed_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- the same file can wait in the queue only once; a printed one can be queued again.
create unique index doc_print_requests_pending_unique on doc_print_requests (doc_file_id) where status = 'pending';
create index doc_print_requests_status_idx on doc_print_requests (status, created_at desc);

create or replace function doc_print_requests_before() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select s.department_id into new.department_id
      from doc_files f
      join doc_lessons l on l.id = f.lesson_id
      join subjects s on s.id = l.subject_id
      where f.id = new.doc_file_id;
    new.status := 'pending';
    new.printed_by := null;
    new.printed_at := null;
  else
    if new.status <> old.status then
      if old.status <> 'pending' or new.status <> 'printed' then
        raise exception 'print request can only move from pending to printed';
      end if;
      new.printed_by := auth.uid();
      new.printed_at := now();
    end if;
    -- identity columns never change.
    new.doc_file_id := old.doc_file_id;
    new.department_id := old.department_id;
    new.requested_by := old.requested_by;
  end if;
  return new;
end;
$$;

create trigger doc_print_requests_before before insert or update on doc_print_requests
  for each row execute function doc_print_requests_before();

-- department scope of a row: org-wide roles see all, department heads their own.
create or replace function can_see_print_request(p_department_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select is_org_wide() or (can_manage_academic() and p_department_id = auth_department())
$$;

alter table doc_print_requests enable row level security;

create policy doc_print_requests_read on doc_print_requests
  for select to authenticated using (can_see_print_request(department_id));

create policy doc_print_requests_insert on doc_print_requests
  for insert to authenticated
  with check (
    can_manage_academic()
    and requested_by = auth.uid()
    and can_see_print_request(department_id)
    and doc_file_id in (select id from doc_files)
  );

create policy doc_print_requests_update on doc_print_requests
  for update to authenticated
  using (can_see_print_request(department_id))
  with check (can_see_print_request(department_id));

create policy doc_print_requests_delete on doc_print_requests
  for delete to authenticated
  using (status = 'pending' and can_manage_academic() and can_see_print_request(department_id));
