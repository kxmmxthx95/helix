-- Close time follows the exam length: closes_at = opens_at + duration_minutes whenever both are set.
-- Named "0_..." so it sorts before the other BEFORE triggers on exam_sessions (Postgres fires same-event triggers by name).
create or replace function exam_sessions_close_from_duration() returns trigger
language plpgsql as $$
begin
  if new.opens_at is not null and new.duration_minutes is not null then
    new.closes_at := new.opens_at + make_interval(mins => new.duration_minutes);
  end if;
  return new;
end $$;

create trigger exam_sessions_0_close_from_duration before insert or update of opens_at, duration_minutes on exam_sessions
  for each row execute function exam_sessions_close_from_duration();
