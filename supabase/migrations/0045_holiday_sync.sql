-- Sync Thailand's public holiday calendar (Google Calendar's public
-- "en.th.official#holiday" calendar) into academic_events — grill decision,
-- 2026-08-18. Manual button (org-wide, src/routes/AcademicEvents.tsx) plus
-- a yearly cron catch-up; both call the same edge function
-- (supabase/functions/sync-holidays), same shared-secret pattern as the
-- line-notify cron in migration 0040.

-- Dedupe key so re-running sync (manual or cron) upserts instead of
-- duplicating rows already pulled from the API. Only synced rows carry
-- this — manually created events stay null and are untouched by sync.
alter table academic_events add column external_ref text unique;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'holiday_sync_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'holiday_sync_cron_secret'
    );
  end if;
end $$;

-- Google Calendar API key itself — set manually after deploy via:
--   select vault.create_secret('<key>', 'google_calendar_api_key');
-- Left uncreated here since the key isn't known at migration time; the edge
-- function errors clearly if it's still missing when called.

-- ponytail: fixed early-January run, not "on academic year rollover" — this
-- school's calendar years and academic years don't diverge enough to matter.
-- Move the schedule if that ever changes.
select cron.schedule(
  'holiday-sync-yearly',
  '0 3 2 1 *',
  $$
  select net.http_post(
    url := 'https://hncabywwkvdekongabln.functions.supabase.co/sync-holidays',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'holiday_sync_cron_secret')
    ),
    body := jsonb_build_object('years', jsonb_build_array(extract(year from now())::int, extract(year from now())::int + 1))
  );
  $$
);
