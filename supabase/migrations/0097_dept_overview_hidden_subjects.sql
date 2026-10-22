-- Dashboard ผู้บริหารแผนก: วิชาที่ผู้ใช้เลือกซ่อนจากการ์ดห้องเรียน (ส่วนตัว ใช้ทุกห้อง).
-- Only hidden subjects are stored, so a newly added subject shows up by default.
create table dept_overview_hidden_subjects (
  profile_id uuid not null references profiles on delete cascade,
  subject_id uuid not null references subjects on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, subject_id)
);

alter table dept_overview_hidden_subjects enable row level security;

create policy dept_overview_hidden_subjects_own on dept_overview_hidden_subjects
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
