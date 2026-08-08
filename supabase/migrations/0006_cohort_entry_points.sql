-- A curriculum_cohorts.entry_grade_level_id may only be a real intake point
-- (ม.1/ม.4 for SEC, ป.1/ป.4 for PRI) — not any grade level — since a cohort
-- only ever forms where the school actually admits new students
-- (grill decision, 2026-08-08).

alter table grade_levels add column is_entry_point boolean not null default false;

update grade_levels gl set is_entry_point = true
from departments d
where gl.department_id = d.id
  and (d.code, gl.code) in (('SEC', 'M1'), ('SEC', 'M4'), ('PRI', 'P1'), ('PRI', 'P4'));

-- Extends check_cohort_department() (0005) with the entry-point check —
-- same lookup, one more condition, no new trigger needed.
create or replace function check_cohort_department() returns trigger
  language plpgsql as $$
declare
  entry_dept uuid;
  entry_is_point boolean;
begin
  select department_id, is_entry_point into entry_dept, entry_is_point
    from grade_levels where id = new.entry_grade_level_id;
  if entry_dept is distinct from new.department_id then
    raise exception 'entry_grade_level_id must belong to department_id';
  end if;
  if not entry_is_point then
    raise exception 'entry_grade_level_id must be a recognized entry point (is_entry_point = true)';
  end if;
  return new;
end $$;
