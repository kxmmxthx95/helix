-- Teacher-granted retakes: per-student extra attempts on top of exam_sessions.max_attempts.
-- Effective limit = max_attempts + extra. Old attempts are kept; the gradebook sync
-- upserts on every submit, so the latest attempt's score is the one that sticks.

create table exam_attempt_grants (
  session_id uuid not null references exam_sessions on delete cascade,
  student_id uuid not null references students on delete cascade,
  extra      int not null check (extra > 0),
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

create trigger exam_attempt_grants_touch before update on exam_attempt_grants
  for each row execute function touch_updated_at();
create trigger exam_attempt_grants_audit after insert or update or delete on exam_attempt_grants
  for each row execute function log_audit();

alter table exam_attempt_grants enable row level security;
-- Read only: grants are written through grant_exam_retake().
create policy exam_attempt_grants_read on exam_attempt_grants
  for select to authenticated
  using (can_write_exam_session(session_id) or student_id = _my_student_id());

-- True while the student still has an attempt left (max_attempts + granted extra).
create or replace function exam_attempt_slot_free(p_session_id uuid, p_student_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select (select count(*) from exam_attempts where session_id = p_session_id and student_id = p_student_id)
       < es.max_attempts + coalesce((select extra from exam_attempt_grants where session_id = p_session_id and student_id = p_student_id), 0)
  from exam_sessions es where es.id = p_session_id
$$;

drop policy exam_attempts_insert on exam_attempts;
create policy exam_attempts_insert on exam_attempts
  for insert to authenticated
  with check (
    student_id in (select id from students where profile_id = auth.uid())
    and can_read_exam_session(session_id)
    and exam_code_cleared(session_id)
    and exam_attempt_slot_free(session_id, student_id)
    and now() between (select opens_at from exam_sessions where id = session_id)
      and (select closes_at from exam_sessions where id = session_id)
  );

-- Teacher: +1 attempt for each given student who has submitted and used every attempt.
-- Anyone else in the list is skipped. Returns how many were granted.
create or replace function grant_exam_retake(p_session_id uuid, p_student_ids uuid[]) returns int
  language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not can_write_exam_session(p_session_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  with eligible as (
    select s.student_id
    from unnest(p_student_ids) as s(student_id)
    join exam_sessions es on es.id = p_session_id
    where not exists (select 1 from exam_attempts a where a.session_id = p_session_id and a.student_id = s.student_id and a.status = 'in_progress')
      and exists (select 1 from exam_attempts a where a.session_id = p_session_id and a.student_id = s.student_id)
      and not exam_attempt_slot_free(p_session_id, s.student_id)
  ), up as (
    insert into exam_attempt_grants (session_id, student_id, extra)
    select p_session_id, student_id, 1 from eligible
    on conflict (session_id, student_id) do update set extra = exam_attempt_grants.extra + 1
    returning 1
  )
  select count(*) into v_n from up;
  return v_n;
end $$;
grant execute on function grant_exam_retake(uuid, uuid[]) to authenticated;
