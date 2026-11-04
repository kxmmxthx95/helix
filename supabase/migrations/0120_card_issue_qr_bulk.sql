-- Bulk: give a barcode to every listed student that has no live one (students the caller may
-- issue to, see _can_issue_qr). Students that already have one are left untouched. Returns how many were created.
create or replace function card_issue_qr_bulk(p_student_ids uuid[]) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  n integer := 0;
begin
  foreach sid in array p_student_ids loop
    continue when not _can_issue_qr(sid);
    continue when exists (select 1 from student_cards where student_id = sid and status <> 'replaced');
    perform _wallet_lock(sid);
    insert into student_cards (student_id, card_uid, created_by) values (sid, _new_qr_token(), auth.uid()) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function card_issue_qr_bulk(uuid[]) from public, anon;
grant execute on function card_issue_qr_bulk(uuid[]) to authenticated;
