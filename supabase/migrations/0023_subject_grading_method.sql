-- ประเภทวิชา "กิจกรรม" ปกติไม่ตัดเกรด แต่ประเมินผ่าน/ไม่ผ่านแทน (grill
-- decision, 2026-08-11) — เก็บเป็นช่องแยกที่ตั้งค่าเองได้ต่อวิชา ไม่ผูกตายตัว
-- กับ subject_type เผื่อบางวิชากิจกรรมอยากตัดเกรดปกติ หรือวิชาอื่นอยากใช้
-- ผ่าน/ไม่ผ่านแทนก็ได้. ฟอร์มแค่ auto-suggest ค่าเริ่มต้นตาม subject_type.
create type grading_method as enum ('graded', 'pass_fail');

alter table subjects add column grading_method grading_method not null default 'graded';

update subjects set grading_method = 'pass_fail' where subject_type = 'activity';
