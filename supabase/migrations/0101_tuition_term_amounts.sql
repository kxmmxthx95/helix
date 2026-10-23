-- ค่าเทอม: ยอดมาตรฐานต่อภาคเรียน + ใบแจ้งหนี้ที่ยังไม่มี PDF.
--
-- tuition_term_amounts: one default amount per term. It only pre-fills the
-- new-invoice form and drives the bulk "create for the filtered students"
-- action; invoices keep their own amount, so changing it never touches
-- existing invoices. Org-wide only, like the rest of finance.
--
-- file_path becomes nullable again (reverses 0096): bulk-created invoices
-- have no PDF yet. The UI flags them and "เปลี่ยนไฟล์" attaches one later.

alter table tuition_invoices alter column file_path drop not null;

create table tuition_term_amounts (
  term_id    uuid primary key references academic_terms on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  updated_by uuid not null references profiles on delete restrict,
  updated_at timestamptz not null default now()
);

create trigger tuition_term_amounts_touch before update on tuition_term_amounts
  for each row execute function touch_updated_at();
create trigger tuition_term_amounts_audit
  after insert or update or delete on tuition_term_amounts
  for each row execute function log_audit();

alter table tuition_term_amounts enable row level security;

create policy tuition_term_amounts_all on tuition_term_amounts
  for all to authenticated using (is_org_wide()) with check (is_org_wide());
