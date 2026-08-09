-- ข้อมูลส่วนตัวนักเรียนเพิ่มเติม: ติดต่อ, สุขภาพ, สถานภาพครอบครัว, และ
-- ผู้ปกครอง (grill decision, 2026-08-09). RLS แยกตามความอ่อนไหว:
-- สุขภาพ/แพ้ยา-อาหาร และข้อมูลติดต่อผู้ปกครองเปิดกว้างเหมือน column
-- เดิมของ students (ครูควรรู้เพื่อความปลอดภัย/ติดต่อได้) แต่
-- อาชีพ/ที่ทำงาน/เงินเดือนผู้ปกครองจำกัดแค่ can_manage() — จึงแยกเป็น
-- คนละ table (student_guardian_financials) แทนที่จะฝังใน
-- student_contacts ซึ่งต้องอ่านกว้างกว่า.

alter table students add column phone text;
alter table students add column email text;
alter table students add column address text;
-- สถานภาพครอบครัว: free text แบบเดียวกับ prefix (0011) — ไม่มีคำศัพท์
-- มาตรฐานตายตัวระดับประเทศ ต่างจาก blood_type ด้านล่าง.
alter table students add column family_status text;
alter table students add column chronic_disease text;
alter table students add column drug_allergy text;
alter table students add column food_allergy text;

create type blood_type as enum ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');
alter table students add column blood_type blood_type;

-- ------------------------------------------------------- guardian contacts
-- Replaces guardian_name/guardian_phone below — a student can have 0..N
-- guardians (not every student has both parents on record), tagged by
-- relationship. "other" covers grandparents/relatives/legal guardians via
-- relationship_note. Exactly one row may be marked primary; the trigger
-- below clears any previous primary so the UI can just set the new one
-- without a separate unset step.
create type guardian_relationship as enum ('father', 'mother', 'other');

create table student_contacts (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references students on delete cascade,
  relationship       guardian_relationship not null,
  relationship_note  text, -- shown/required in the UI when relationship = 'other'
  is_primary         boolean not null default false,
  prefix             text,
  first_name         text not null,
  last_name          text not null,
  phone              text,
  email              text,
  address            text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index student_contacts_student_idx on student_contacts (student_id);

create or replace function enforce_one_primary_guardian() returns trigger
  language plpgsql as $$
begin
  if new.is_primary then
    update student_contacts set is_primary = false
    where student_id = new.student_id and is_primary and id is distinct from new.id;
  end if;
  return new;
end $$;

create trigger student_contacts_one_primary
  before insert or update on student_contacts
  for each row execute function enforce_one_primary_guardian();

-- Belt and suspenders alongside the trigger above — a partial unique index
-- makes "at most one primary per student" hold even if the trigger is ever
-- bypassed (e.g. a bulk statement that fires triggers per-row but in an
-- order the trigger logic doesn't anticipate).
create unique index student_contacts_one_primary_idx on student_contacts (student_id) where is_primary;

alter table students drop column guardian_name;
alter table students drop column guardian_phone;

alter table student_contacts enable row level security;

-- Same read scope as students itself (0001) — dept-wide, so any teacher
-- can reach a guardian's name/phone for everyday contact, same as the
-- columns this table replaces.
create policy student_contacts_read on student_contacts
  for select to authenticated using (
    is_org_wide()
    or student_id in (select id from students where department_id = auth_department())
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );
create policy student_contacts_manage on student_contacts
  for all to authenticated using (
    can_manage() and (
      is_org_wide()
      or student_id in (select id from students where department_id = auth_department())
    )
  )
  with check (
    can_manage() and (
      is_org_wide()
      or student_id in (select id from students where department_id = auth_department())
    )
  );

create trigger student_contacts_audit
  after insert or update or delete on student_contacts
  for each row execute function log_audit();

-- --------------------------------------------- guardian financial details
-- Split from student_contacts so its RLS can be strictly narrower —
-- occupation/workplace/income isn't something a classroom teacher needs,
-- unlike the contact info above (grill decision).
create table student_guardian_financials (
  contact_id      uuid primary key references student_contacts on delete cascade,
  occupation      text,
  workplace       text,
  monthly_income  numeric,
  updated_at      timestamptz not null default now()
);

alter table student_guardian_financials enable row level security;

create policy student_guardian_financials_all on student_guardian_financials
  for all to authenticated using (
    can_manage() and (
      is_org_wide()
      or contact_id in (
        select c.id from student_contacts c join students s on s.id = c.student_id
        where s.department_id = auth_department()
      )
    )
  )
  with check (
    can_manage() and (
      is_org_wide()
      or contact_id in (
        select c.id from student_contacts c join students s on s.id = c.student_id
        where s.department_id = auth_department()
      )
    )
  );

create trigger student_guardian_financials_audit
  after insert or update or delete on student_guardian_financials
  for each row execute function log_audit();
