-- เข้าแถว (line_up_records, 0043) ถูกยกเลิก — ผู้ใช้เห็นว่าซ้ำกับเช็คชื่อ
-- homeroom (attendance_records, 0026) ในทางปฏิบัติ ใช้ "เช็คชื่อ" อย่างเดียว

drop trigger if exists line_up_records_lock_leave on line_up_records;
drop function if exists lock_line_up_to_leave();
drop table if exists line_up_records;
