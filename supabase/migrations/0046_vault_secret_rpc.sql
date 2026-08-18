-- Fixes a real bug found while testing sync-holidays (migration 0045):
-- `.schema("vault").from("decrypted_secrets")` from supabase-js goes through
-- PostgREST, which only exposes the `public`/`graphql_public` schemas by
-- default — `vault` was never reachable that way, so every edge function
-- reading a vault secret through the JS client (line-notify included, same
-- pattern since migration 0040) was silently failing this whole time.
--
-- Fix is one RPC in `public` rather than exposing all of `vault` via
-- PostgREST (which would let any authenticated request enumerate secret
-- names) — security definer, callable by nobody except service_role, so
-- only the edge functions' admin client can ever call it.
create or replace function read_vault_secret(secret_name text) returns text
  language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name;
$$;

revoke all on function read_vault_secret(text) from public, authenticated, anon;
grant execute on function read_vault_secret(text) to service_role;
