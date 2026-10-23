-- log_audit() records `new.id` as record_id (not null). tuition_term_amounts
-- (0101) is keyed by term_id and had no id column, so every write failed with
-- a 400 from the audit trigger. Add an id for the audit trail; term_id stays the key.
alter table tuition_term_amounts add column id uuid not null default gen_random_uuid() unique;
