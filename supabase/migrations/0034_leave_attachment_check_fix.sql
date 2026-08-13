-- Fix check_leave_attachment_required() (0033): generated columns aren't
-- populated yet inside a BEFORE trigger, so `new.days` read as null there —
-- the check silently never fired. Compute the span from start/end directly
-- instead (caught by the rollback-transaction verification in the same
-- session that introduced 0033).
create or replace function check_leave_attachment_required() returns trigger
  language plpgsql as $$
declare
  threshold int;
  span int;
begin
  select requires_attachment_after_days into threshold from leave_types where id = new.leave_type_id;
  span := new.end_date - new.start_date + 1;
  if threshold is not null and span > threshold and new.attachment_path is null then
    raise exception 'ลาต่อเนื่องเกิน % วัน ต้องแนบเอกสารประกอบ', threshold;
  end if;
  return new;
end $$;
