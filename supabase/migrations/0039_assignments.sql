-- ฟีเจอร์ "งาน" แบบ Google Classroom — grill decision, 2026-08-17. Reuses
-- score_items (0030) as the assignment record itself instead of a parallel
-- table: a score_item with description/due_date set IS an assignment, one
-- with them left null is still the old quick คะแนนเก็บ/คะแนนสอบ line item.
-- Whole-class targeting only (score_items already keys off one
-- teaching_assignment = one classroom). Submission is opt-in per item
-- (requires_submission) — paper/in-class work just gets graded directly like
-- before. See supabase/migrations/0030_score_recording.sql for the
-- score_items/student_item_scores/student_pass_fail_scores background this
-- migration builds on.

alter table score_items
  add column description text,
  add column due_date date,
  add column publish_at timestamptz not null default now(),
  add column requires_submission boolean not null default false,
  add column notified_at timestamptz;

alter table student_item_scores add column feedback text;
alter table student_pass_fail_scores add column feedback text;

-- ------------------------------------------------------------ assignment_attachments
-- Teacher-posted materials for one score_item. App-enforced cap (10MB/file,
-- 5 files) — no other attachment table in this app has a DB-level size
-- constraint either (see leave_requests, 0033).
create table assignment_attachments (
  id             uuid primary key default gen_random_uuid(),
  score_item_id  uuid not null references score_items on delete cascade,
  storage_path   text not null,
  file_name      text not null,
  uploaded_at    timestamptz not null default now()
);

create index assignment_attachments_item_idx on assignment_attachments (score_item_id);

create trigger assignment_attachments_audit
  after insert or update or delete on assignment_attachments
  for each row execute function log_audit();

-- ------------------------------------------------------------ assignment_submissions
create table assignment_submissions (
  id             uuid primary key default gen_random_uuid(),
  score_item_id  uuid not null references score_items on delete cascade,
  student_id     uuid not null references students on delete restrict,
  content        text,
  submitted_at   timestamptz not null default now(),
  -- Teacher flips this true to let one more submit through after grading —
  -- grill decision ("ส่งซ้ำเมื่อครูเปิด"), not open resubmission by default.
  reopened       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (score_item_id, student_id)
);

create index assignment_submissions_student_idx on assignment_submissions (student_id);

create trigger assignment_submissions_touch before update on assignment_submissions
  for each row execute function touch_updated_at();
create trigger assignment_submissions_audit
  after insert or update or delete on assignment_submissions
  for each row execute function log_audit();

-- Blocks a student from silently editing a submission that's already been
-- graded, unless the teacher reopened it. Explicitly lets the teacher's own
-- writes through unconditionally (including flipping reopened itself) —
-- otherwise checking old.reopened would make the teacher's own "reopen"
-- update block on the very grade it's trying to work around.
create or replace function check_submission_resubmit() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'INSERT' then return new; end if;
  if exists (
    select 1 from score_items si
    where si.id = new.score_item_id and can_write_teaching_assignment(si.teaching_assignment_id)
  ) then
    return new;
  end if;
  if old.reopened then return new; end if;
  if exists (
    select 1 from student_item_scores sis
    join score_items si on si.id = sis.score_item_id
    where si.id = new.score_item_id and sis.student_id = new.student_id
  ) or exists (
    select 1 from student_pass_fail_scores spf where spf.teaching_assignment_id = (
      select teaching_assignment_id from score_items where id = new.score_item_id
    ) and spf.student_id = new.student_id
  ) then
    raise exception 'assignment already graded — teacher must reopen before resubmitting';
  end if;
  return new;
end $$;

create trigger assignment_submissions_resubmit_check
  before update on assignment_submissions
  for each row execute function check_submission_resubmit();

-- ------------------------------------------------------------ submission_attachments
create table submission_attachments (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references assignment_submissions on delete cascade,
  storage_path   text not null,
  file_name      text not null,
  uploaded_at    timestamptz not null default now()
);

create index submission_attachments_submission_idx on submission_attachments (submission_id);

create trigger submission_attachments_audit
  after insert or update or delete on submission_attachments
  for each row execute function log_audit();

-- --------------------------------------------------------------------- RLS

alter table assignment_attachments enable row level security;
alter table assignment_submissions enable row level security;
alter table submission_attachments enable row level security;

create policy assignment_attachments_read on assignment_attachments
  for select to authenticated using (
    exists (select 1 from score_items si where si.id = assignment_attachments.score_item_id
      and can_read_teaching_assignment(si.teaching_assignment_id))
  );
create policy assignment_attachments_write on assignment_attachments
  for all to authenticated
  using (exists (select 1 from score_items si where si.id = assignment_attachments.score_item_id
    and can_write_teaching_assignment(si.teaching_assignment_id)))
  with check (exists (select 1 from score_items si where si.id = assignment_attachments.score_item_id
    and can_write_teaching_assignment(si.teaching_assignment_id)));

-- Read: same as score_items. Write: the assignment's own teacher/manager
-- (can_write_teaching_assignment), OR the student themself/guardian for
-- their own row — a student has to be able to create+edit their own
-- submission even though they can't write teaching_assignment scores.
create policy assignment_submissions_read on assignment_submissions
  for select to authenticated using (
    exists (select 1 from score_items si where si.id = assignment_submissions.score_item_id
      and can_read_teaching_assignment(si.teaching_assignment_id))
  );
create policy assignment_submissions_write on assignment_submissions
  for all to authenticated
  using (
    exists (select 1 from score_items si where si.id = assignment_submissions.score_item_id
      and can_write_teaching_assignment(si.teaching_assignment_id))
    or assignment_submissions.student_id in (select id from students where profile_id = auth.uid())
  )
  with check (
    exists (select 1 from score_items si where si.id = assignment_submissions.score_item_id
      and can_write_teaching_assignment(si.teaching_assignment_id))
    or assignment_submissions.student_id in (select id from students where profile_id = auth.uid())
  );

create policy submission_attachments_read on submission_attachments
  for select to authenticated using (
    exists (
      select 1 from assignment_submissions asub
      join score_items si on si.id = asub.score_item_id
      where asub.id = submission_attachments.submission_id
        and can_read_teaching_assignment(si.teaching_assignment_id)
    )
  );
create policy submission_attachments_write on submission_attachments
  for all to authenticated
  using (
    exists (
      select 1 from assignment_submissions asub
      join score_items si on si.id = asub.score_item_id
      where asub.id = submission_attachments.submission_id
        and (
          can_write_teaching_assignment(si.teaching_assignment_id)
          or asub.student_id in (select id from students where profile_id = auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1 from assignment_submissions asub
      join score_items si on si.id = asub.score_item_id
      where asub.id = submission_attachments.submission_id
        and (
          can_write_teaching_assignment(si.teaching_assignment_id)
          or asub.student_id in (select id from students where profile_id = auth.uid())
        )
    )
  );

-- ------------------------------------------------------- storage: assignment-attachments
insert into storage.buckets (id, name, public)
values ('assignment-attachments', 'assignment-attachments', false)
on conflict (id) do nothing;

create policy assignment_attachments_bucket_read on storage.objects
  for select to authenticated using (
    bucket_id = 'assignment-attachments' and exists (
      select 1 from score_items si
      where si.id = (storage.foldername(name))[1]::uuid
        and can_read_teaching_assignment(si.teaching_assignment_id)
    )
  );
create policy assignment_attachments_bucket_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'assignment-attachments' and exists (
      select 1 from score_items si
      where si.id = (storage.foldername(name))[1]::uuid
        and can_write_teaching_assignment(si.teaching_assignment_id)
    )
  );
create policy assignment_attachments_bucket_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'assignment-attachments' and exists (
      select 1 from score_items si
      where si.id = (storage.foldername(name))[1]::uuid
        and can_write_teaching_assignment(si.teaching_assignment_id)
    )
  );

-- ------------------------------------------------------- storage: assignment-submissions
-- Path: ${score_item_id}/${student_id}/${uuid}.ext
insert into storage.buckets (id, name, public)
values ('assignment-submissions', 'assignment-submissions', false)
on conflict (id) do nothing;

create policy assignment_submissions_bucket_read on storage.objects
  for select to authenticated using (
    bucket_id = 'assignment-submissions' and exists (
      select 1 from score_items si
      where si.id = (storage.foldername(name))[1]::uuid
        and can_read_teaching_assignment(si.teaching_assignment_id)
    )
  );
create policy assignment_submissions_bucket_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'assignment-submissions' and (
      (storage.foldername(name))[2]::uuid in (select id from students where profile_id = auth.uid())
      or exists (
        select 1 from score_items si
        where si.id = (storage.foldername(name))[1]::uuid
          and can_write_teaching_assignment(si.teaching_assignment_id)
      )
    )
  );
create policy assignment_submissions_bucket_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'assignment-submissions' and (
      (storage.foldername(name))[2]::uuid in (select id from students where profile_id = auth.uid())
      or exists (
        select 1 from score_items si
        where si.id = (storage.foldername(name))[1]::uuid
          and can_write_teaching_assignment(si.teaching_assignment_id)
      )
    )
  );
