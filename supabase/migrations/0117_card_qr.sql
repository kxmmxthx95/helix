-- QR แทนบัตร RFID — the student's payment credential is now a random token kept
-- in student_cards.card_uid (prefix 'qr_'), rendered as a QR for the POS scanner.
-- Table, POS lookup, freeze and daily limit are unchanged. Tokens are minted
-- server-side (never by a client). card_uid stays unreadable to clients; the
-- owner (student / guardian) and org-wide read it only through card_my_qr().

create or replace function _new_qr_token() returns text
  language sql as $$ select 'qr_' || left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40) $$;
revoke execute on function _new_qr_token() from public, anon, authenticated;

-- (Re)issue: any live card of the student becomes 'replaced'.
create or replace function card_issue_qr(p_student_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  if not exists (select 1 from students where id = p_student_id) then raise exception 'ไม่พบนักเรียน'; end if;
  perform _wallet_lock(p_student_id);
  update student_cards set status = 'replaced' where student_id = p_student_id and status <> 'replaced';
  insert into student_cards (student_id, card_uid, created_by) values (p_student_id, _new_qr_token(), auth.uid());
end $$;

-- Token + status of the live QR, or null when none (an old RFID uid is never returned).
create or replace function card_my_qr(p_student_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  c student_cards;
begin
  if not _can_view_student(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into c from student_cards where student_id = p_student_id and status <> 'replaced' and card_uid like 'qr\_%';
  if not found then return null; end if;
  return jsonb_build_object('token', c.card_uid, 'status', c.status, 'frozen_by', c.frozen_by);
end $$;

revoke execute on function card_issue_qr(uuid), card_my_qr(uuid) from public, anon;
grant execute on function card_issue_qr(uuid), card_my_qr(uuid) to authenticated;

-- Cut-over: retire every live RFID card and give those students a fresh QR so
-- there is no gap. Balances belong to the student, so they are untouched.
create temp table _qr_cutover on commit drop as
  select student_id from student_cards where status <> 'replaced' and card_uid not like 'qr\_%';
update student_cards set status = 'replaced' where status <> 'replaced' and card_uid not like 'qr\_%';
insert into student_cards (student_id, card_uid)
  select student_id, _new_qr_token() from _qr_cutover
  on conflict do nothing;
