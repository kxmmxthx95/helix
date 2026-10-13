-- เป้าหมายเนื้อหาต่อวิชา x ระดับชั้น — denominators for the ติดตามเนื้อหา tab
-- ("เนื้อหาหลัก 3 / 12"). Not scoped to academic year, like doc_lessons.
-- Read/write: super_admin / director for any subject; dept_head for subjects
-- of their own department.

create table doc_targets (
  id              uuid primary key default gen_random_uuid(), -- log_audit() records ids
  subject_id      uuid not null references subjects on delete cascade,
  grade_level_id  uuid not null references grade_levels on delete cascade,
  lesson_target   int not null default 0 check (lesson_target >= 0),
  topic_target    int not null default 0 check (topic_target >= 0),
  updated_at      timestamptz not null default now(),
  unique (subject_id, grade_level_id)
);

create trigger doc_targets_touch before update on doc_targets
  for each row execute function touch_updated_at();
create trigger doc_targets_audit after insert or update or delete on doc_targets
  for each row execute function log_audit();

create or replace function can_manage_doc_target(p_subject_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select is_org_wide_academic()
    or (is_dept_head() and exists (
      select 1 from subjects s where s.id = p_subject_id and s.department_id = auth_department()
    ))
$$;

alter table doc_targets enable row level security;

create policy doc_targets_read on doc_targets
  for select to authenticated using (can_manage_doc_target(subject_id));
create policy doc_targets_write on doc_targets
  for all to authenticated
  using (can_manage_doc_target(subject_id))
  with check (can_manage_doc_target(subject_id));
