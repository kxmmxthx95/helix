-- ที่อยู่แบบฟอร์มมาตรฐานไทย แทน address text เดียว (grill decision,
-- 2026-08-09) — แยก column จริงแทนการเก็บเป็น string เดียว เพื่อ
-- query/กรองตามจังหวัด-อำเภอได้ในอนาคตโดยไม่ต้อง parse.
-- Pre-launch (ไม่มี live data) จึงตัดคอลัมน์เดิมทิ้งตรงๆ ไม่ต้อง backfill.

alter table students drop column address;
alter table students add column house_no text;
alter table students add column village_no text; -- หมู่ที่
alter table students add column alley text; -- ตรอก/ซอย
alter table students add column road text;
alter table students add column subdistrict text; -- ตำบล/แขวง
alter table students add column district text; -- อำเภอ/เขต
alter table students add column province text;
alter table students add column postal_code text;

alter table student_contacts drop column address;
alter table student_contacts add column house_no text;
alter table student_contacts add column village_no text;
alter table student_contacts add column alley text;
alter table student_contacts add column road text;
alter table student_contacts add column subdistrict text;
alter table student_contacts add column district text;
alter table student_contacts add column province text;
alter table student_contacts add column postal_code text;
