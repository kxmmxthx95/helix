-- anon never reads or writes public tables: every policy in this schema is TO authenticated,
-- so RLS already returns nothing (or rejects writes) for anon. Drop the Supabase default
-- table grant to anon so the database enforces it too. service_role and authenticated keep
-- their grants; SECURITY DEFINER RPCs and edge functions run under those roles, not anon.
-- Reversible: `grant all on all tables in schema public to anon` plus the default-privilege line.

revoke all on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
