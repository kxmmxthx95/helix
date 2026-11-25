-- An attempt only ever got submitted by the student's own browser. Closed tab / dropped connection / dead battery
-- left it in_progress forever: no submit, no grading, no result. Server-side sweep: once an attempt's deadline
-- (the earlier of the room's closes_at and started_at + duration) is 2 minutes behind us, submit it as-is with the
-- answers already synced and grade it. The 2 minutes let a live client's own deadline submit win.
-- Rollback: select cron.unschedule('exam-auto-submit'); drop function auto_submit_expired_exam_attempts();

create or replace function auto_submit_expired_exam_attempts() returns int
  language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select ea.id, least(es.closes_at, ea.started_at + make_interval(mins => coalesce(es.duration_minutes, 100000))) as deadline
    from exam_attempts ea join exam_sessions es on es.id = ea.session_id
    where ea.status = 'in_progress'
      and least(es.closes_at, ea.started_at + make_interval(mins => coalesce(es.duration_minutes, 100000)))
          < now() - interval '2 minutes'
  loop
    begin
      update exam_attempts set status = 'submitted', submitted_at = r.deadline where id = r.id and status = 'in_progress';
      perform grade_exam_attempt(r.id);
      n := n + 1;
    exception when others then
      raise warning 'auto submit failed for attempt %: %', r.id, sqlerrm; -- one bad attempt must not block the rest
    end;
  end loop;
  return n;
end $$;
revoke all on function auto_submit_expired_exam_attempts() from public, authenticated, anon;

select cron.schedule('exam-auto-submit', '* * * * *', 'select auto_submit_expired_exam_attempts();');
