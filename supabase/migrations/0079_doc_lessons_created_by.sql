-- ผู้สร้างเนื้อหาหลัก — for the ติดตามเนื้อหา tab. Filled by default from the
-- session; older rows are backfilled from their first uploaded file (null if none).

alter table doc_lessons add column created_by uuid references profiles on delete set null default auth.uid();

update doc_lessons l set created_by = (
  select f.uploaded_by from doc_files f where f.lesson_id = l.id order by f.created_at limit 1
);
