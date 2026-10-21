-- ค่าเทอม — tuition invoices and payments (first ERP finance slice).
--
-- tuition_invoices: one bill per student per term (title + amount). Money is
-- never deleted: an invoice is cancelled via status, a payment is voided via
-- voided_at/void_reason, so there is no DELETE policy on either table.
-- Paid / partial / overdue are derived client-side from the embedded
-- non-voided payments (src/hooks/useTuition.ts) — no view, nothing to keep
-- in sync.
--
-- Access: finance is org-wide-only (is_org_wide(): super_admin, director,
-- staff/ธุรการ) for read + write — dept_head / teachers get nothing. A student
-- or parent reads only their own / their children's rows, same guardianships
-- path as attendance_records (0026).
--
-- receipt_no is an identity column: unique and increasing, but a rolled-back
-- insert leaves a gap. If the school's accountant needs gap-free numbers,
-- replace with a locked counter table.

create table tuition_invoices (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students on delete restrict,
  term_id     uuid not null references academic_terms on delete restrict,
  title       text not null,
  amount      numeric(12,2) not null check (amount > 0),
  due_date    date,
  status      text not null default 'open' check (status in ('open', 'cancelled')),
  -- The school's own invoice PDF (tuition-invoices bucket), uploaded by org-wide staff.
  file_path   text,
  created_by  uuid not null references profiles on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tuition_invoices_term_idx on tuition_invoices (term_id);
create index tuition_invoices_student_idx on tuition_invoices (student_id);

create table tuition_payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references tuition_invoices on delete restrict,
  receipt_no  bigint generated always as identity unique,
  amount      numeric(12,2) not null check (amount > 0),
  method      text not null check (method in ('cash', 'transfer', 'other')),
  paid_at     date not null default current_date,
  note        text,
  voided_at   timestamptz,
  void_reason text,
  recorded_by uuid not null references profiles on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((voided_at is null) = (void_reason is null))
);

create index tuition_payments_invoice_idx on tuition_payments (invoice_id);

create trigger tuition_invoices_touch before update on tuition_invoices
  for each row execute function touch_updated_at();
create trigger tuition_payments_touch before update on tuition_payments
  for each row execute function touch_updated_at();
create trigger tuition_invoices_audit
  after insert or update or delete on tuition_invoices
  for each row execute function log_audit();
create trigger tuition_payments_audit
  after insert or update or delete on tuition_payments
  for each row execute function log_audit();

-- A payment may never push the live (non-voided) total past the invoice
-- amount, and a cancelled invoice takes no payments. The invoice row is
-- locked first so two clerks recording at once can't both slip under the cap.
create or replace function check_tuition_payment() returns trigger
  language plpgsql as $$
declare
  inv tuition_invoices;
  paid numeric;
begin
  if tg_op = 'UPDATE' then
    -- Only voiding is allowed after the fact; the money fields are frozen.
    if old.voided_at is not null
      or new.invoice_id <> old.invoice_id or new.amount <> old.amount
      or new.method <> old.method or new.paid_at <> old.paid_at
      or new.receipt_no <> old.receipt_no then
      raise exception 'tuition payment is immutable; void it instead';
    end if;
    return new;
  end if;

  select * into inv from tuition_invoices where id = new.invoice_id for update;
  if inv.status <> 'open' then
    raise exception 'invoice is cancelled';
  end if;
  select coalesce(sum(amount), 0) into paid
    from tuition_payments where invoice_id = new.invoice_id and voided_at is null;
  if paid + new.amount > inv.amount then
    raise exception 'payment exceeds invoice balance';
  end if;
  return new;
end $$;

create trigger tuition_payments_check
  before insert or update on tuition_payments
  for each row execute function check_tuition_payment();

alter table tuition_invoices enable row level security;
alter table tuition_payments enable row level security;

create policy tuition_invoices_read on tuition_invoices
  for select to authenticated using (
    is_org_wide()
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );
create policy tuition_invoices_insert on tuition_invoices
  for insert to authenticated with check (is_org_wide());
create policy tuition_invoices_update on tuition_invoices
  for update to authenticated using (is_org_wide()) with check (is_org_wide());

create policy tuition_payments_read on tuition_payments
  for select to authenticated using (
    is_org_wide()
    or invoice_id in (
      select id from tuition_invoices
      where student_id in (select id from students where profile_id = auth.uid())
         or student_id in (select student_id from guardianships where parent_id = auth.uid())
    )
  );
create policy tuition_payments_insert on tuition_payments
  for insert to authenticated with check (is_org_wide());
create policy tuition_payments_update on tuition_payments
  for update to authenticated using (is_org_wide()) with check (is_org_wide());

-- ------------------------------------------------------------ invoice PDFs
-- Private bucket, path `<student_id>/<uuid>.pdf`. Org-wide uploads and reads;
-- the student / their guardians read only their own folder. No delete policy
-- (money documents are kept): a corrected PDF is a new object plus an update
-- of tuition_invoices.file_path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tuition-invoices', 'tuition-invoices', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy tuition_invoice_files_read on storage.objects
  for select to authenticated using (
    bucket_id = 'tuition-invoices' and (
      is_org_wide()
      or (storage.foldername(name))[1]::uuid in (select id from students where profile_id = auth.uid())
      or (storage.foldername(name))[1]::uuid in (select student_id from guardianships where parent_id = auth.uid())
    )
  );

create policy tuition_invoice_files_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tuition-invoices' and is_org_wide());
