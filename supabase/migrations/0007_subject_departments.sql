-- subjects can no longer cross departments — PRI and SEC each keep their own
-- catalog, code is unique per department instead of system-wide
-- (grill decision, 2026-08-08).

alter table subjects add column department_id uuid not null references departments on delete restrict;
create index subjects_department_idx on subjects (department_id);

alter table subjects drop constraint subjects_code_key;
alter table subjects add constraint subjects_department_code_key unique (department_id, code);

-- A curriculum_subjects row's subject must belong to the same department as
-- its cohort — same bug class as check_curriculum_cohort_department() (0005).
create or replace function check_curriculum_subject_department() returns trigger
  language plpgsql as $$
declare
  subject_dept uuid;
  cohort_dept uuid;
begin
  select department_id into subject_dept from subjects where id = new.subject_id;
  select department_id into cohort_dept from curriculum_cohorts where id = new.cohort_id;
  if subject_dept is distinct from cohort_dept then
    raise exception 'subject % belongs to a different department than cohort %', new.subject_id, new.cohort_id;
  end if;
  return new;
end $$;

create trigger curriculum_subjects_subject_department_check before insert or update on curriculum_subjects
  for each row execute function check_curriculum_subject_department();

-- Scoped like curriculum_subjects — can_manage() lets dept_head maintain
-- their own department's catalog, not just org-wide roles.
drop policy subjects_read on subjects;
create policy subjects_read on subjects
  for select to authenticated using (is_org_wide() or department_id = auth_department());

drop policy subjects_write on subjects;
create policy subjects_write on subjects
  for all to authenticated
  using (can_manage() and (is_org_wide() or department_id = auth_department()))
  with check (can_manage() and (is_org_wide() or department_id = auth_department()));
