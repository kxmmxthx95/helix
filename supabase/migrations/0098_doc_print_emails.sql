-- ประวัติการส่งอีเมลรายการพิมพ์: one row per send attempt of send-print-email (sent or failed).
-- Kept after the print request or document is deleted (request_id -> null) with a snapshot of what was sent.
--
-- Read:  the sender, org-wide roles, and managers who can see the request's department
--        (a request that no longer exists is visible to the sender and org-wide only).
-- Write: Edge Function only (service role) — no insert/update/delete policy, so rows are immutable from the app.

create table doc_print_emails (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid references doc_print_requests on delete set null,
  department_id uuid references departments,
  doc_title     text not null,
  file_name     text not null,
  copies        int not null,
  recipients    text[] not null,
  sent_by       uuid not null references profiles,
  status        text not null check (status in ('sent', 'failed')),
  error         text,
  created_at    timestamptz not null default now()
);

create index doc_print_emails_created_idx on doc_print_emails (created_at desc);
create index doc_print_emails_request_idx on doc_print_emails (request_id);

alter table doc_print_emails enable row level security;

create policy doc_print_emails_read on doc_print_emails
  for select to authenticated using (
    sent_by = auth.uid()
    or is_org_wide()
    or (request_id is not null and can_see_print_request(department_id))
  );
