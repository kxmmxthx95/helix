-- บาร์โค้ดนักเรียนอ่านบนจอมือถือไม่ติด: 'qr_' + 40 hex = 43 ตัวอักษร Code128 บางเกินไปเมื่อย่อให้พอดีการ์ด.
-- ย่อเหลือ 'qr_' + 16 hex (64 bit สุ่ม) = 19 ตัวอักษร. Rollback: restore the 40-hex body in
-- _new_qr_token(); shortened tokens stay valid, only newly minted ones get longer.

create or replace function _new_qr_token() returns text
  language sql as $$ select 'qr_' || left(replace(gen_random_uuid()::text, '-', ''), 16) $$;

-- Re-token live (active/frozen) cards in place: status/freeze and balances are untouched, nothing else
-- references card_uid. 'replaced' rows stay dead. Idempotent (only tokens longer than 19 chars).
update student_cards set card_uid = _new_qr_token()
  where status <> 'replaced' and card_uid like 'qr\_%' and length(card_uid) > 19;
