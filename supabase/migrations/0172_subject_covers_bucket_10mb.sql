-- ปกวิชา: ขยายขีดจำกัดไฟล์จาก 2 MB เป็น 10 MB. Mirrors the 10 MB check in src/routes/Subjects.tsx.
update storage.buckets set file_size_limit = 10485760 where id = 'subject-covers';
