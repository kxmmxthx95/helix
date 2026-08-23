-- Structured character-builder choices (skin/hair/outfit/hat), separate from
-- avatar_path (migration 0024) which only ever held the rendered image.
-- Storing the choices lets the builder reopen pre-filled with what the
-- student picked last time.
alter table profiles add column character_options jsonb;

-- profiles_update_self (migration 0001) already lets every user update their
-- own row, so no RLS change needed for the new column.
