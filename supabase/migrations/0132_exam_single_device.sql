-- Exam anti-impersonation (grill decision, 2026-11-07): stop one student's account being used to sit an
-- exam from two devices, or by someone else. Students only; staff sessions are untouched.
--   * strict_mode (default on, teacher can switch off per exam; the switch-off is logged).
--   * Per-exam 6-digit code, verified server-side, 5 wrong tries -> locked until the teacher unlocks.
--   * One "holder" auth session per in-progress attempt (JWT session_id). Answers, events, submit are
--     refused for any other session. Holder pings via claim_exam_attempt (also the heartbeat).
--     Another session while the holder is alive -> 'blocked'; holder silent >3 min -> 'pending_teacher'
--     and the teacher approves the switch.
--   * exam_security_events: teacher-only trail (device = user agent, ip masked).
--   * exam_blocks_reset: reset-password Edge Function refuses self-service reset while a strict exam is open.
-- Rollback: drop the objects below, restore policies/submit_exam_attempt from 0047.

alter table exam_sessions add column strict_mode boolean not null default true;

alter table exam_attempts
  add column holder_session uuid,
  add column holder_seen_at timestamptz not null default now(),
  add column takeover_session uuid,
  add column takeover_requested_at timestamptz;

create or replace function _jwt_session() returns uuid
  language sql stable as $$ select nullif(auth.jwt() ->> 'session_id', '')::uuid $$;

-- A new attempt belongs to the session that created it.
create or replace function exam_attempts_set_holder() returns trigger
  language plpgsql as $$
begin
  new.holder_session := _jwt_session();
  new.holder_seen_at := now();
  return new;
end $$;
create trigger exam_attempts_holder before insert on exam_attempts
  for each row execute function exam_attempts_set_holder();

-- ------------------------------------------------------------ codes + failures
create table exam_session_codes (
  session_id uuid primary key references exam_sessions on delete cascade,
  code       text not null
);

create or replace function _new_exam_code() returns text
  language sql volatile as $$
  select lpad((abs(('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))::bit(28)::int) % 1000000)::text, 6, '0')
$$;

create or replace function exam_sessions_make_code() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into exam_session_codes (session_id, code) values (new.id, _new_exam_code());
  return new;
end $$;
create trigger exam_sessions_code after insert on exam_sessions
  for each row execute function exam_sessions_make_code();

insert into exam_session_codes (session_id, code) select id, _new_exam_code() from exam_sessions;

alter table exam_session_codes enable row level security;
create policy exam_session_codes_teacher on exam_session_codes
  for all to authenticated
  using (can_write_exam_session(session_id)) with check (can_write_exam_session(session_id));

-- No policies: only the security-definer functions below touch it.
create table exam_code_state (
  session_id uuid not null references exam_sessions on delete cascade,
  student_id uuid not null references students on delete cascade,
  fails      int not null default 0,
  locked     boolean not null default false,
  passed     boolean not null default false,
  primary key (session_id, student_id)
);
alter table exam_code_state enable row level security;
create policy exam_code_state_teacher_read on exam_code_state
  for select to authenticated using (can_write_exam_session(session_id));

-- ----------------------------------------------------------------- event trail
create table exam_security_events (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references exam_sessions on delete cascade,
  attempt_id uuid references exam_attempts on delete cascade,
  student_id uuid references students on delete cascade,
  event_type text not null check (event_type in (
    'login_blocked', 'takeover_requested', 'takeover_approved',
    'code_failed', 'code_locked', 'code_unlocked', 'strict_disabled', 'reset_blocked')),
  device     text,
  ip         text,
  actor      uuid default auth.uid(),
  at         timestamptz not null default now()
);
create index exam_security_events_session_idx on exam_security_events (session_id, at desc);
alter table exam_security_events enable row level security;
create policy exam_security_events_read on exam_security_events
  for select to authenticated using (can_write_exam_session(session_id));

create or replace function _exam_log(p_session uuid, p_attempt uuid, p_student uuid, p_type text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  h json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  v_ip text := split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1);
begin
  insert into exam_security_events (session_id, attempt_id, student_id, event_type, device, ip)
  values (p_session, p_attempt, p_student, p_type, left(h ->> 'user-agent', 200),
    nullif(case when v_ip ~ '\.' then regexp_replace(v_ip, '\.\d+$', '.x')
                else regexp_replace(v_ip, ':[^:]*$', ':x') end, ''));
end $$;
revoke all on function _exam_log(uuid, uuid, uuid, text) from public, authenticated, anon;

-- Turning strict_mode off is allowed but never silent.
create or replace function exam_sessions_log_strict_off() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if old.strict_mode and not new.strict_mode then
    perform _exam_log(new.id, null, null, 'strict_disabled');
  end if;
  return new;
end $$;
create trigger exam_sessions_strict_log after update on exam_sessions
  for each row execute function exam_sessions_log_strict_off();

-- -------------------------------------------------------------------- exam code
create or replace function _my_student_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from students where profile_id = auth.uid()
$$;

-- Returns 'ok' | 'wrong' | 'locked' (not raise — a raise would roll back the fail counter).
create or replace function verify_exam_code(p_session_id uuid, p_code text) returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := _my_student_id();
  v_state exam_code_state;
begin
  if v_student is null or not can_read_exam_session(p_session_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  if not (select strict_mode from exam_sessions where id = p_session_id) then return 'ok'; end if;

  insert into exam_code_state (session_id, student_id) values (p_session_id, v_student)
    on conflict do nothing;
  select * into v_state from exam_code_state
    where session_id = p_session_id and student_id = v_student for update;

  if v_state.passed then return 'ok'; end if;
  if v_state.locked then return 'locked'; end if;

  if btrim(coalesce(p_code, '')) = (select code from exam_session_codes where session_id = p_session_id) then
    update exam_code_state set passed = true where session_id = p_session_id and student_id = v_student;
    return 'ok';
  end if;

  update exam_code_state set fails = fails + 1, locked = fails + 1 >= 5
    where session_id = p_session_id and student_id = v_student;
  perform _exam_log(p_session_id, null, v_student, case when v_state.fails + 1 >= 5 then 'code_locked' else 'code_failed' end);
  return case when v_state.fails + 1 >= 5 then 'locked' else 'wrong' end;
end $$;

create or replace function unlock_exam_code(p_session_id uuid, p_student_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not can_write_exam_session(p_session_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  update exam_code_state set fails = 0, locked = false where session_id = p_session_id and student_id = p_student_id;
  perform _exam_log(p_session_id, null, p_student_id, 'code_unlocked');
end $$;

create or replace function exam_code_cleared(p_session_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select not es.strict_mode or exists (
    select 1 from exam_code_state cs
    where cs.session_id = es.id and cs.passed and cs.student_id = _my_student_id())
  from exam_sessions es where es.id = p_session_id
$$;

-- Starting an attempt now also needs the code (when strict).
drop policy exam_attempts_insert on exam_attempts;
create policy exam_attempts_insert on exam_attempts
  for insert to authenticated
  with check (
    student_id in (select id from students where profile_id = auth.uid())
    and can_read_exam_session(session_id)
    and exam_code_cleared(session_id)
    and now() between (select opens_at from exam_sessions where id = session_id)
      and (select closes_at from exam_sessions where id = session_id)
  );

-- --------------------------------------------------------------- single device
create or replace function exam_attempt_held(p_attempt_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from exam_attempts ea join exam_sessions es on es.id = ea.session_id
    where ea.id = p_attempt_id and (not es.strict_mode or ea.holder_session = _jwt_session()))
$$;

-- Open / heartbeat. 'ok' | 'blocked' (holder alive elsewhere) | 'pending_teacher' (holder gone, awaiting
-- approval) | 'ended'. Call on open and every ~30s from the holder.
create or replace function claim_exam_attempt(p_attempt_id uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare
  a exam_attempts;
  v_me uuid := _jwt_session();
begin
  select ea.* into a from exam_attempts ea
    where ea.id = p_attempt_id and ea.student_id = _my_student_id() for update;
  if not found then raise exception 'ไม่พบการสอบ'; end if;
  if a.status <> 'in_progress' then return 'ended'; end if;
  if not (select strict_mode from exam_sessions where id = a.session_id) then return 'ok'; end if;

  if a.holder_session is null or a.holder_session = v_me then
    update exam_attempts set holder_session = v_me, holder_seen_at = now() where id = a.id;
    return 'ok';
  end if;

  if a.holder_seen_at > now() - interval '3 minutes' then
    -- throttled: heartbeats from the blocked device must not flood the trail
    if not exists (select 1 from exam_security_events where attempt_id = a.id
        and event_type = 'login_blocked' and at > now() - interval '1 minute') then
      perform _exam_log(a.session_id, a.id, a.student_id, 'login_blocked');
    end if;
    return 'blocked';
  end if;

  if a.takeover_session is distinct from v_me then
    update exam_attempts set takeover_session = v_me, takeover_requested_at = now() where id = a.id;
    perform _exam_log(a.session_id, a.id, a.student_id, 'takeover_requested');
  end if;
  return 'pending_teacher';
end $$;

create or replace function approve_exam_takeover(p_attempt_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare a exam_attempts;
begin
  select * into a from exam_attempts where id = p_attempt_id for update;
  if not found or not can_write_exam_session(a.session_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  if a.takeover_session is null then raise exception 'ไม่มีคำขอเปลี่ยนเครื่อง'; end if;
  update exam_attempts set holder_session = a.takeover_session, holder_seen_at = now(),
    takeover_session = null, takeover_requested_at = null where id = a.id;
  perform _exam_log(a.session_id, a.id, a.student_id, 'takeover_approved');
end $$;

-- Login-time hint for the client: true = do NOT sign my other sessions out. Staff (not students) and
-- anyone with a strict attempt live on another session keep them; everyone else is "newest login wins".
create or replace function keep_other_sessions() returns boolean
  language sql stable security definer set search_path = public as $$
  select _my_student_id() is null or exists (
    select 1 from exam_attempts ea join exam_sessions es on es.id = ea.session_id
    where ea.student_id = _my_student_id() and ea.status = 'in_progress' and es.strict_mode
      and ea.holder_session is distinct from _jwt_session()
      and ea.holder_seen_at > now() - interval '3 minutes')
$$;

-- Writes only from the holder session.
drop policy exam_attempt_answers_write on exam_attempt_answers;
create policy exam_attempt_answers_write on exam_attempt_answers
  for all to authenticated
  using (exists (select 1 from exam_attempts ea where ea.id = exam_attempt_answers.attempt_id
    and can_write_exam_attempt(ea.id) and exam_attempt_held(ea.id)))
  with check (exists (select 1 from exam_attempts ea where ea.id = exam_attempt_answers.attempt_id
    and can_write_exam_attempt(ea.id) and exam_attempt_held(ea.id) and ea.status = 'in_progress'));

drop policy exam_attempt_events_write on exam_attempt_events;
create policy exam_attempt_events_write on exam_attempt_events
  for insert to authenticated with check (
    exists (select 1 from exam_attempts ea where ea.id = exam_attempt_events.attempt_id
      and can_write_exam_attempt(ea.id) and exam_attempt_held(ea.id)));

create or replace function submit_exam_attempt(p_attempt_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from exam_attempts where id = p_attempt_id
      and student_id in (select id from students where profile_id = auth.uid())
      and status = 'in_progress'
  ) then
    raise exception 'attempt not found, not yours, or already submitted';
  end if;
  if not exam_attempt_held(p_attempt_id) then
    raise exception 'การสอบนี้กำลังใช้งานในอุปกรณ์อื่น';
  end if;

  update exam_attempts set status = 'submitted', submitted_at = now() where id = p_attempt_id;
  perform grade_exam_attempt(p_attempt_id);
end $$;

-- ----------------------------------------------------------------- reset guard
-- For the reset-password Edge Function (service role): true when this student has a strict exam open
-- (in window and targeting their classroom, or an unsubmitted attempt). Logs one event per blocking exam.
create or replace function exam_blocks_reset(p_profile_id uuid) returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
  r record;
  v_blocked boolean := false;
begin
  select id into v_student from students where profile_id = p_profile_id;
  if v_student is null then return false; end if;
  for r in
    select es.id from exam_sessions es
    where es.strict_mode and (
      exists (select 1 from exam_attempts ea where ea.session_id = es.id
        and ea.student_id = v_student and ea.status = 'in_progress')
      or (now() between es.opens_at and es.closes_at and exists (
        select 1 from exam_session_targets est
        join teaching_assignments ta on ta.id = est.teaching_assignment_id
        join student_classroom_enrollments sce
          on sce.classroom_id = ta.classroom_id and sce.academic_year = ta.academic_year
        where est.session_id = es.id and sce.student_id = v_student)))
  loop
    v_blocked := true;
    perform _exam_log(r.id, null, v_student, 'reset_blocked');
  end loop;
  return v_blocked;
end $$;

revoke all on function verify_exam_code(uuid, text), unlock_exam_code(uuid, uuid), claim_exam_attempt(uuid),
  approve_exam_takeover(uuid), keep_other_sessions(), exam_blocks_reset(uuid) from public, anon;
grant execute on function verify_exam_code(uuid, text), unlock_exam_code(uuid, uuid), claim_exam_attempt(uuid),
  approve_exam_takeover(uuid), keep_other_sessions() to authenticated;
grant execute on function exam_blocks_reset(uuid) to service_role;
