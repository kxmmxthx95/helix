-- An invoice amount may be edited (inline in the staff table) but never below
-- what has already been paid (live, non-voided payments). Mirrors the cap that
-- check_tuition_payment() (0095) enforces from the payment side.
create or replace function check_tuition_invoice_amount() returns trigger
  language plpgsql as $$
declare
  paid numeric;
begin
  select coalesce(sum(amount), 0) into paid
    from tuition_payments where invoice_id = new.id and voided_at is null;
  if new.amount < paid then
    raise exception 'invoice amount is below the amount already paid';
  end if;
  return new;
end $$;

create trigger tuition_invoices_amount_floor
  before update of amount on tuition_invoices
  for each row execute function check_tuition_invoice_amount();
