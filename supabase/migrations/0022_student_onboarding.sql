-- นักเรียนกรอกข้อมูลเพิ่มเติม + ตั้งรหัสผ่านใหม่ตอน login ครั้งแรก (grill
-- decision, 2026-08-11). เพิ่มนักเรียนยังกรอกแค่ 6 ช่องหลักเหมือนเดิม
-- (0001/0011/0005) — ที่อยู่/ติดต่อ/ผู้ปกครอง/สุขภาพ และการตั้งรหัสผ่านใหม่
-- ย้ายมาบังคับกรอกหลัง login ครั้งแรกแทน ทั้งบัญชีใหม่และบัญชีเก่าที่มีอยู่แล้ว.

-- หมู่เลือดที่ไม่เคยตรวจ — ไม่บังคับให้เดา, เพิ่มค่า "ไม่ทราบ" เป็นตัวเลือกจริง
-- แทนการปล่อยให้ blood_type เป็น optional เพียงช่องเดียว.
alter type blood_type add value if not exists 'unknown';

-- default false (staff ไม่อยู่ใน scope ของ gate นี้) แล้วเปิดเฉพาะนักเรียน
-- ทุกคนที่มีอยู่แล้วด้านล่าง — invite-user จะเปิดให้บัญชีนักเรียนใหม่ต่อจากนี้เอง.
alter table profiles add column must_change_password boolean not null default false;

update profiles set must_change_password = true
where id in (select profile_id from students where profile_id is not null);

-- ------------------------------------------------- students self-update
-- นักเรียนแก้ไขข้อมูลตัวเอง (ที่อยู่/ติดต่อ/สุขภาพ/สถานภาพครอบครัว) ได้ แต่
-- ห้ามแตะ 6 ช่องที่ admin กรอกตอนเพิ่ม + status (grill decision) — บังคับ
-- ด้วย trigger เพราะ RLS USING/WITH CHECK เทียบ OLD vs NEW กันเองไม่ได้.
create or replace function protect_student_admin_fields() returns trigger
  language plpgsql as $$
begin
  if not can_manage() then
    if new.student_code is distinct from old.student_code
      or new.prefix is distinct from old.prefix
      or new.first_name is distinct from old.first_name
      or new.last_name is distinct from old.last_name
      or new.department_id is distinct from old.department_id
      or new.grade_level_id is distinct from old.grade_level_id
      or new.status is distinct from old.status
    then
      raise exception 'นักเรียนแก้ไขช่องนี้เองไม่ได้ ติดต่อธุรการ';
    end if;
  end if;
  return new;
end;
$$;

create trigger students_protect_admin_fields
  before update on students
  for each row execute function protect_student_admin_fields();

create policy students_update_self on students
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ------------------------------------------------- student_contacts self-manage
-- นักเรียนเพิ่ม/แก้/ลบผู้ปกครองของตัวเองได้ (ไม่รวม
-- student_guardian_financials — ยังเป็น can_manage() only ตามเดิม, 0015).
create policy student_contacts_manage_self on student_contacts
  for all to authenticated
  using (student_id in (select id from students where profile_id = auth.uid()))
  with check (student_id in (select id from students where profile_id = auth.uid()));
