-- pg_cron logs every run into cron.job_run_details and never trims it. Per-minute jobs (assignment
-- notifications, net.http_post) made it the biggest table (~24 MB, 25% of the DB, 2026-11-25) and
-- every run adds an insert on the hot path. Keep 3 days — enough to debug a failed job, nothing more.
-- Rollback: select cron.unschedule('purge-cron-history');

-- One-off: trim the existing backlog now instead of waiting for the first nightly run.
delete from cron.job_run_details where end_time < now() - interval '3 days';

-- 20:10 UTC = 03:10 Asia/Bangkok, outside school hours.
select cron.schedule('purge-cron-history', '10 20 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '3 days'; $$);
