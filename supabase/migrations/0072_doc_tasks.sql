-- งานเอกสาร: ผู้บริหารมอบหมายให้ครูส่งเอกสารภายในวันที่กำหนด.
-- Targeting is criteria, not a roster: a teacher is assigned when their
-- department / learning area match the task's non-null filters (both null =
-- every teacher). Evaluated live, so a teacher who joins later gets the task.
-- Status (uploaded / pending / overdue) is never stored — it's derived from
-- doc_task_files and due_date.

create table doc_tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  doc_type         text not null check (doc_type in ('lesson_plan', 'worksheet', 'exam', 'media', 'other')),
  due_date         date not null,
  department_id    uuid references departments on delete cascade,
  learning_area_id uuid references learning_areas on delete cascade,
  created_by       uuid not null references profiles on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table doc_task_files (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references doc_tasks on delete cascade,
  teacher_id  uuid not null references profiles on delete cascade,
  title       text not null,
  file_path   text not null, -- object path in 'subject-documents': `tasks/${task_id}/${teacher_id}/...`
  file_name   text not null,
  mime_type   text not null,
  size_bytes  bigint not null,
  created_at  timestamptz not null default now()
);

create index doc_task_files_task_idx on doc_task_files (task_id, teacher_id);
create index doc_task_files_teacher_idx on doc_task_files (teacher_id);
create unique index doc_task_files_path_idx on doc_task_files (file_path);

create trigger doc_tasks_touch before update on doc_tasks
  for each row execute function touch_updated_at();
create trigger doc_tasks_audit after insert or update or delete on doc_tasks
  for each row execute function log_audit();
create trigger doc_task_files_audit after insert or update or delete on doc_task_files
  for each row execute function log_audit();

-- ------------------------------------------------------------------ helpers
create or replace function is_dept_head() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from profile_roles where profile_id = auth.uid() and role = 'dept_head')
$$;

-- Does this task apply to this teacher (has the teacher role + matches the filters)?
create or replace function doc_task_targets(p_task_id uuid, p_teacher_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from doc_tasks t
    join profiles p on p.id = p_teacher_id
    where t.id = p_task_id
      and exists (select 1 from profile_roles r where r.profile_id = p.id and r.role = 'teacher')
      and (t.department_id is null or t.department_id = p.department_id)
      and (t.learning_area_id is null or t.learning_area_id = p.learning_area_id)
  )
$$;

-- Storage object name `tasks/<task>/<teacher>/<file>` -> task / teacher ids; null when malformed.
create or replace function doc_task_of_path(p_name text) returns uuid
  language sql immutable
as $$
  select case when (storage.foldername(p_name))[1] = 'tasks'
    and (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (storage.foldername(p_name))[2]::uuid end
$$;

create or replace function doc_task_teacher_of_path(p_name text) returns uuid
  language sql immutable
as $$
  select case when (storage.foldername(p_name))[1] = 'tasks'
    and (storage.foldername(p_name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (storage.foldername(p_name))[3]::uuid end
$$;

-- May the caller see this teacher's submissions? super_admin/director: all; dept_head: own department's teachers.
create or replace function can_review_teacher(p_teacher_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select is_org_wide_academic()
    or (is_dept_head() and exists (
      select 1 from profiles p where p.id = p_teacher_id and p.department_id = auth_department()
    ))
$$;

-- --------------------------------------------------------------------- RLS
alter table doc_tasks enable row level security;
alter table doc_task_files enable row level security;

create policy doc_tasks_read on doc_tasks
  for select to authenticated using (
    is_org_wide_academic()
    or (is_dept_head() and (department_id is null or department_id = auth_department()))
    or doc_task_targets(id, auth.uid())
  );

-- write: super_admin/director for any scope; dept_head only tasks pinned to their own department.
create policy doc_tasks_write on doc_tasks
  for all to authenticated
  using (is_org_wide_academic() or (is_dept_head() and department_id = auth_department()))
  with check (
    created_by = auth.uid()
    and (is_org_wide_academic() or (is_dept_head() and department_id = auth_department()))
  );

create policy doc_task_files_read on doc_task_files
  for select to authenticated using (teacher_id = auth.uid() or can_review_teacher(teacher_id));
create policy doc_task_files_insert on doc_task_files
  for insert to authenticated with check (
    teacher_id = auth.uid() and doc_task_targets(task_id, auth.uid())
  );
create policy doc_task_files_delete on doc_task_files
  for delete to authenticated using (teacher_id = auth.uid());

-- ------------------------------------------------------------------ storage
-- Same private bucket as teaching documents; the first folder 'tasks' keeps
-- these objects out of the topic-based policies from 0071 (they resolve to null there).
create policy doc_task_files_storage_read on storage.objects
  for select to authenticated using (
    bucket_id = 'subject-documents'
    and doc_task_teacher_of_path(name) is not null
    and (doc_task_teacher_of_path(name) = auth.uid() or can_review_teacher(doc_task_teacher_of_path(name)))
  );
create policy doc_task_files_storage_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'subject-documents'
    and doc_task_teacher_of_path(name) = auth.uid()
    and doc_task_targets(doc_task_of_path(name), auth.uid())
  );
create policy doc_task_files_storage_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'subject-documents' and doc_task_teacher_of_path(name) = auth.uid()
  );
