-- Dashboard ผู้บริหารแผนก: การซ่อนวิชาแยกตามห้อง (เดิมซ่อนครั้งเดียวมีผลทุกห้อง).
-- Existing rows are expanded to every classroom that teaches the subject, so each user's current view is unchanged.
alter table dept_overview_hidden_subjects
  add column classroom_id uuid references classrooms on delete cascade,
  drop constraint dept_overview_hidden_subjects_pkey;

insert into dept_overview_hidden_subjects (profile_id, subject_id, classroom_id, created_at)
select distinct h.profile_id, h.subject_id, ta.classroom_id, h.created_at
from dept_overview_hidden_subjects h
join teaching_assignments ta on ta.subject_id = h.subject_id
where h.classroom_id is null;

delete from dept_overview_hidden_subjects where classroom_id is null;

alter table dept_overview_hidden_subjects
  alter column classroom_id set not null,
  add primary key (profile_id, classroom_id, subject_id);
