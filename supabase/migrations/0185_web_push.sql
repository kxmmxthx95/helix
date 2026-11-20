-- Web push (grill decision, 2026-11-20): every line_notifications row is also
-- delivered as a PWA push notification to the recipient's subscribed devices,
-- independent of whether they linked LINE. Opt-in per device from Profile.
--
-- Also makes the drain near-instant: a statement-level trigger pings the
-- line-notify edge function after any insert (the 5-minute cron stays as a
-- fallback), so e.g. a student hears about an exit approval right away.

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index push_subscriptions_profile_idx on push_subscriptions (profile_id);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_own_read on push_subscriptions
  for select to authenticated using (profile_id = auth.uid());
create policy push_subscriptions_own_delete on push_subscriptions
  for delete to authenticated using (profile_id = auth.uid());
-- No insert/update policy: saving goes through save_push_subscription() so a
-- device handed from one account to another (shared phone) is re-owned
-- instead of failing on the unique endpoint.

create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end $$;

revoke all on function save_push_subscription(text, text, text) from public, anon;
grant execute on function save_push_subscription(text, text, text) to authenticated;

-- ------------------------------------------------------------ drain claiming
-- Two drains can now overlap (trigger kick + cron), so rows are claimed
-- atomically before sending instead of read-then-update.
alter table line_notifications drop constraint line_notifications_status_check;
alter table line_notifications
  add constraint line_notifications_status_check check (status in ('pending', 'sending', 'sent', 'error'));

create or replace function claim_line_notifications(p_limit int) returns setof line_notifications
  language sql security definer set search_path = public as $$
  update line_notifications set status = 'sending'
  where id in (
    select id from line_notifications where status = 'pending'
    order by created_at limit p_limit for update skip locked
  )
  returning *
$$;

revoke all on function claim_line_notifications(int) from public, authenticated, anon;
grant execute on function claim_line_notifications(int) to service_role;

-- ponytail: a drain that crashes mid-batch leaves its rows in 'sending'
-- forever. Requeue stale ones (status='sending' older than N min) if that ever bites.

-- ------------------------------------------------------------ instant kick
create or replace function kick_line_notify() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://hncabywwkvdekongabln.functions.supabase.co/line-notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'line_notify_cron_secret')
    ),
    body := '{}'::jsonb
  );
  return null;
end $$;

create trigger line_notifications_kick after insert on line_notifications
  for each statement execute function kick_line_notify();
