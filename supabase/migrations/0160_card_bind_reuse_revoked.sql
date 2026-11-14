-- ผูกบัตรที่ยกเลิก (status 'replaced') กับนักเรียนคนใหม่ได้.
-- เดิม card_bind ปฏิเสธทุกครั้งที่ card_uid มีแถวอยู่แล้วและเป็นของคนอื่น แม้แถวนั้นถูกยกเลิกแล้ว
-- (card_uid unique ทั้งระบบ → ใช้ซ้ำไม่ได้). ตอนนี้ย้ายแถวที่ยกเลิกแล้วไปเป็นของนักเรียนใหม่;
-- รายการเก่าใน card_transactions มี student_id ของตัวเองอยู่แล้ว ยอดไม่เพี้ยน.

create or replace function card_bind(p_student_id uuid, p_card_uid text, p_kind text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  uid text := btrim(p_card_uid);
  c student_cards;
  nm text;
begin
  if not _can_issue_qr(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_kind is null or p_kind not in ('barcode', 'rfid') then raise exception 'ชนิดบัตรไม่ถูกต้อง'; end if;
  if uid is null or uid = '' or length(uid) > 64 then raise exception 'เลขบัตรไม่ถูกต้อง'; end if;
  if uid like 'qr\_%' then raise exception 'เลขบัตรไม่ถูกต้อง'; end if;
  if not exists (select 1 from students where id = p_student_id) then raise exception 'ไม่พบนักเรียน'; end if;
  perform _wallet_lock(p_student_id);
  select * into c from student_cards where card_uid = uid for update;
  if found and c.student_id <> p_student_id and c.status <> 'replaced' then
    if _can_issue_qr(c.student_id) then
      select first_name || ' ' || last_name into nm from students where id = c.student_id;
      raise exception 'บัตรนี้ผูกกับ % อยู่แล้ว', nm;
    end if;
    raise exception 'บัตรนี้ผูกกับนักเรียนคนอื่นอยู่แล้ว';
  end if;
  update student_cards set status = 'replaced'
    where student_id = p_student_id and kind = p_kind and status <> 'replaced' and card_uid <> uid;
  if c.id is not null then
    update student_cards set status = 'active', kind = p_kind, student_id = p_student_id, frozen_by = null where id = c.id;
  else
    insert into student_cards (student_id, card_uid, kind, created_by) values (p_student_id, uid, p_kind, auth.uid());
  end if;
end $$;

revoke execute on function card_bind(uuid, text, text) from public, anon;
grant execute on function card_bind(uuid, text, text) to authenticated;
