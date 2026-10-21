-- The uploaded PDF *is* the invoice the parent receives, so every invoice must
-- carry one (0095 left it optional). Fails loudly if a row without a file
-- already exists — attach a PDF to it (or cancel it) first.
alter table tuition_invoices alter column file_path set not null;
