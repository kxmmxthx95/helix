-- วันเกิดนักเรียน — เดิมมีแต่ใน profiles; ฟอร์มทะเบียนนักเรียนบันทึกและคำนวณอายุจากคอลัมน์นี้.
alter table students add column date_of_birth date;

-- รูปโปรไฟล์นักเรียน — เก็บในบัคเก็ต avatars (public) ที่ students/<student_id>; นักเรียนที่ยังไม่มีบัญชีก็มีรูปได้.
alter table students add column avatar_path text;

-- Staff who manage students may write student photos (storage can't see the student's department, so this is role-wide, like the row policy minus the department check).
create policy avatars_student_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name like 'students/%' and can_manage());
create policy avatars_student_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name like 'students/%' and can_manage())
  with check (bucket_id = 'avatars' and name like 'students/%' and can_manage());

-- พิกัดบ้านนักเรียน (เลือกจาก Google Maps ในแท็บที่อยู่).
alter table students add column latitude double precision check (latitude between -90 and 90);
alter table students add column longitude double precision check (longitude between -180 and 180);
