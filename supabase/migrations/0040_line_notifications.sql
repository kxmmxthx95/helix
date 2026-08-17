-- LINE Notify สำหรับงาน/คะแนน — grill decision, 2026-08-17. School already
-- has a Messaging API channel (channel access token) ready; profiles.line_user_id
-- (0001) has existed unused until now. Two producers write into one queue
-- table, one drain step (edge function line-notify) sends everything pending
-- — see supabase/functions/line-notify and supabase/functions/line-webhook.
--
-- ponytail: the scheduled-post sweep only runs every 5 minutes (pg_cron
-- below), so a future-dated post's notification can lag up to 5 minutes
-- after publish_at — not true instant push. Tighten the cron interval, or
-- fire net.http_post directly from a per-row trigger, if that's ever not
-- good enough.

create table line_link_codes (
  code        text primary key,
  profile_id  uuid not null references profiles on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index line_link_codes_profile_idx on line_link_codes (profile_id);

alter table line_link_codes enable row level security;

-- A profile may only create/read its own codes. No update/delete from the
-- client — the webhook (service-role, bypasses RLS) is what marks one used.
create policy line_link_codes_own on line_link_codes
  for select to authenticated using (profile_id = auth.uid());
create policy line_link_codes_insert on line_link_codes
  for insert to authenticated with check (profile_id = auth.uid());

-- --------------------------------------------------------------- line_notifications
-- Plain send queue. No client access at all — only the service-role edge
-- function (line-notify) and the producer triggers/function below touch it.
create table line_notifications (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles on delete cascade,
  message        text not null,
  score_item_id  uuid references score_items on delete set null,
  status         text not null default 'pending' check (status in ('pending', 'sent', 'error')),
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  error          text
);

create index line_notifications_pending_idx on line_notifications (status) where status = 'pending';

alter table line_notifications enable row level security;
-- Deliberately no policies — RLS enabled with zero policies denies all
-- client access; only the service-role key (line-notify function) reads it.

-- ---------------------------------------------------------- assignment-posted producer
-- One function reused by both the row trigger (instant "post now") and the
-- cron sweep (catches scheduled posts once publish_at arrives) — posting
-- logic lives in exactly one place.
create or replace function enqueue_due_assignment_notifications() returns void
  language plpgsql security definer set search_path = public as $$
declare
  item record;
begin
  for item in
    select si.id, si.label, si.due_date, ta.classroom_id, ta.academic_year
    from score_items si
    join teaching_assignments ta on ta.id = si.teaching_assignment_id
    where si.description is not null
      and si.publish_at <= now()
      and si.notified_at is null
  loop
    insert into line_notifications (profile_id, message, score_item_id)
    select distinct recipient, 'มีงานใหม่: ' || item.label ||
      case when item.due_date is not null then ' (กำหนดส่ง ' || to_char(item.due_date, 'DD/MM/YYYY') || ')' else '' end,
      item.id
    from (
      select s.profile_id as recipient
      from student_classroom_enrollments sce
      join students s on s.id = sce.student_id
      where sce.classroom_id = item.classroom_id
        and sce.academic_year = item.academic_year
        and s.status = 'studying'
        and s.profile_id is not null
      union
      select g.parent_id as recipient
      from student_classroom_enrollments sce
      join students s on s.id = sce.student_id
      join guardianships g on g.student_id = s.id
      where sce.classroom_id = item.classroom_id
        and sce.academic_year = item.academic_year
        and s.status = 'studying'
    ) recipients
    where recipient is not null;

    update score_items set notified_at = now() where id = item.id;
  end loop;
end $$;

create or replace function trigger_enqueue_assignment_notifications() returns trigger
  language plpgsql as $$
begin
  perform enqueue_due_assignment_notifications();
  return null;
end $$;

create trigger score_items_notify_posted
  after insert or update on score_items
  for each statement execute function trigger_enqueue_assignment_notifications();

-- ---------------------------------------------------------------- grading producer
create or replace function enqueue_grade_notification() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_label   text;
  recipient uuid;
begin
  select si.label into v_label from score_items si where si.id = new.score_item_id;

  for recipient in
    select s.profile_id from students s where s.id = new.student_id and s.profile_id is not null
    union
    select g.parent_id from guardianships g where g.student_id = new.student_id
  loop
    insert into line_notifications (profile_id, message, score_item_id)
    values (recipient, 'คะแนนงาน ' || v_label || ' ออกแล้ว', new.score_item_id);
  end loop;
  return new;
end $$;

create trigger student_item_scores_notify_graded
  after insert or update on student_item_scores
  for each row execute function enqueue_grade_notification();

-- student_pass_fail_scores has no score_item_id (whole-assignment pass/fail
-- lives directly on teaching_assignment_id, see 0030) — separate, simpler
-- producer, no score_item label to look up.
create or replace function enqueue_pass_fail_notification() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  recipient uuid;
begin
  for recipient in
    select s.profile_id from students s where s.id = new.student_id and s.profile_id is not null
    union
    select g.parent_id from guardianships g where g.student_id = new.student_id
  loop
    insert into line_notifications (profile_id, message)
    values (recipient, case when new.passed then 'ผลการเรียนออกแล้ว: ผ่าน' else 'ผลการเรียนออกแล้ว: ไม่ผ่าน' end);
  end loop;
  return new;
end $$;

create trigger student_pass_fail_scores_notify_graded
  after insert or update on student_pass_fail_scores
  for each row execute function enqueue_pass_fail_notification();

-- ------------------------------------------------------------------------ cron
-- pg_cron + pg_net are Supabase-bundled extensions — no external worker.
-- Both are fixed to their own schema (cron / net respectively, matching the
-- cron.schedule/net.http_post calls below) — neither is relocatable.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Shared secret the cron job sends and the line-notify edge function checks,
-- so an arbitrary public POST to that endpoint can't trigger a mass-send.
-- Generated once here — never needs to be typed in anywhere, since both the
-- cron job and the (service-role) edge function read it back from vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'line_notify_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'line_notify_cron_secret');
  end if;
end $$;

-- IMPORTANT (manual step): replace YOUR_PROJECT_REF below with this
-- project's actual ref before applying, or reschedule the job afterward —
-- the functions URL isn't knowable from inside a migration file.
select cron.schedule(
  'line-notify-drain',
  '*/5 * * * *',
  $$
  select enqueue_due_assignment_notifications();
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.functions.supabase.co/line-notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'line_notify_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
