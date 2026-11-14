-- ระงับเฉพาะบัตร RFID (บัตรหาย) โดยผู้ปกครองหรือนักเรียน — บาร์โค้ด/QR ในมือถือไม่ถูกแตะ.
-- ระงับ: ผู้ปกครอง / นักเรียน / โรงเรียน. ปลด: ผู้ปกครองหรือโรงเรียนเท่านั้น; ถ้าโรงเรียนระงับ ผู้ปกครองปลดเองไม่ได้.
-- trigger set_card_frozen_by (0152) ตั้ง frozen_by ให้เอง.

create or replace function card_rfid_status(p_student_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  c student_cards;
begin
  if not _can_view_student(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into c from student_cards where student_id = p_student_id and kind = 'rfid' and status <> 'replaced';
  if not found then return null; end if;
  return jsonb_build_object('status', c.status, 'frozen_by', c.frozen_by, 'last4', right(c.card_uid, 4));
end $$;

create or replace function card_set_rfid_frozen(p_student_id uuid, p_frozen boolean) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
begin
  if not _can_view_student(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  perform _wallet_lock(p_student_id);
  select * into c from student_cards where student_id = p_student_id and kind = 'rfid' and status <> 'replaced' for update;
  if not found then raise exception 'ไม่พบบัตร RFID'; end if;
  if p_frozen then
    update student_cards set status = 'frozen' where id = c.id and status = 'active';
  else
    if not (_can_issue_qr(p_student_id) or _is_guardian(p_student_id)) then
      raise exception 'เฉพาะผู้ปกครองหรือโรงเรียนที่ปลดระงับได้';
    end if;
    if c.frozen_by = 'school' and not _can_issue_qr(p_student_id) then
      raise exception 'บัตรนี้ถูกระงับโดยโรงเรียน — ติดต่อฝ่ายการเงินเพื่อปลดระงับ';
    end if;
    update student_cards set status = 'active' where id = c.id and status = 'frozen';
  end if;
end $$;

revoke execute on function card_rfid_status(uuid), card_set_rfid_frozen(uuid, boolean) from public, anon;
grant execute on function card_rfid_status(uuid), card_set_rfid_frozen(uuid, boolean) to authenticated;
