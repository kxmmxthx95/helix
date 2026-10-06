-- ตัวละครอาชีพของนักเรียนในหน้าแรกธีมเกม — cosmetic only, ไม่มีผลต่อคะแนน/สิทธิ์.
-- นักเรียนแก้ได้เองผ่าน students_update_self + protect_student_admin_fields (0022):
-- trigger นั้นล็อกเฉพาะ 7 ช่องของ admin จึงไม่ต้องแก้ policy. รูปร่าง (ชาย/หญิง)
-- ไม่เก็บ — คำนวณจาก prefix ฝั่ง client (src/lib/game.ts).
alter table students add column character_class text
  check (character_class in ('math', 'science', 'language', 'social', 'art', 'music', 'sport', 'tech'));
