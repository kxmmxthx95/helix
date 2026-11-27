-- "กดสอบใหม่ แล้วบันทึกไม่ได้": granting a retake always failed for teachers.
-- log_audit() takes the record id from an "id" column, but exam_attempt_grants (and student_grade_status,
-- student_guardian_financials, student_pass_fail_scores) have a composite primary key and no "id": the audit row got
-- record_id = null and audit_logs.record_id is NOT NULL, so the whole write was rolled back
-- ("null value in column record_id of relation audit_logs violates not-null constraint").
-- Fix: without an "id" column the record id is the primary-key values joined by ":" (session:student ...), and a
-- problem with the log can no longer be a reason to lose the write (falls back to "?").
-- Rollback: recreate the 0184 body (record id from "id" only).
create or replace function log_audit() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  actor_roles app_role[] := (
    select coalesce(array_agg(role), '{}') from profile_roles where profile_id = auth.uid()
  );
  rec_id text;
begin
  if auth.uid() is null or actor_roles = '{}' or actor_roles <@ array['student', 'parent']::app_role[] then
    return coalesce(new, old);
  end if;

  rec_id := coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'));
  if rec_id is null then
    select string_agg(coalesce(coalesce(to_jsonb(new), to_jsonb(old)) ->> a.attname::text, ''), ':' order by array_position(i.indkey::smallint[], a.attnum))
      into rec_id
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
      where i.indrelid = tg_relid and i.indisprimary;
  end if;

  insert into audit_logs (actor_id, actor_roles, action, table_name, record_id, changes)
  values (
    auth.uid(), actor_roles, tg_op, tg_table_name, coalesce(rec_id, '?'),
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'DELETE' then jsonb_build_object('old', to_jsonb(old))
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    end
  );

  return coalesce(new, old);
end $$;
