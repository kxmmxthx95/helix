-- บันทึกหลังการสอน — optional reflection note captured alongside
-- completed_at/completed_on_plan when a teacher marks a plan unit taught
-- (ปัญหา/ข้อสังเกตหลังสอน). Reuses the existing mark-taught flow (0020)
-- rather than a separate log table — one unit is already one session mark,
-- so the note just rides along on the same update.

alter table teaching_plan_units add column note text;

-- Same attestation rule as completed_at/completed_on_plan (0020): only the
-- assigned teacher may write it, even a dept_head with content-write access
-- may not add/edit it on the teacher's behalf. Redefines the existing
-- trigger function body — the trigger itself still points at this name.
create or replace function check_teaching_plan_unit_mark_taught() returns trigger
  language plpgsql as $$
declare
  v_teacher_id uuid;
begin
  if new.completed_at is distinct from old.completed_at
     or new.completed_on_plan is distinct from old.completed_on_plan
     or new.note is distinct from old.note then
    select teacher_id into v_teacher_id from teaching_assignments where id = new.teaching_assignment_id;
    if v_teacher_id is distinct from auth.uid() then
      raise exception 'only the assigned teacher may mark a plan unit taught';
    end if;
  end if;
  return new;
end $$;
