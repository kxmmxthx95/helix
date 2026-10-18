-- ผังการเรียน: standard content topics per subject, shared across cohorts.
create table subject_topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  sort_order int not null default 0,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subject_topics_subject_idx on subject_topics (subject_id, sort_order);

create trigger subject_topics_touch before update on subject_topics
  for each row execute function touch_updated_at();

alter table subject_topics enable row level security;

-- read/write follow the parent subject's department, same as subjects (0007).
create policy subject_topics_read on subject_topics
  for select to authenticated using (
    subject_id in (select id from subjects)
  );

create policy subject_topics_write on subject_topics
  for all to authenticated
  using (
    can_manage_academic() and subject_id in (
      select id from subjects where is_org_wide() or department_id = auth_department()
    )
  )
  with check (
    can_manage_academic() and subject_id in (
      select id from subjects where is_org_wide() or department_id = auth_department()
    )
  );
