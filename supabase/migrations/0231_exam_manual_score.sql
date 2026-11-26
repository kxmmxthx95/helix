-- Teacher-entered score for an exam that broke (system fault): one "manual" attempt per student per room.
-- attempt_no 0 keeps it clear of the student's real attempts (1, 2, ...), it never counts toward max_attempts,
-- and it syncs to the gradebook through the same path as a graded attempt (latest write wins).

alter table exam_attempts
  add column is_manual boolean not null default false,
  add column manual_note text,
  add column manual_by uuid references profiles on delete set null,
  add constraint exam_attempts_manual_note_chk check (not is_manual or (manual_note is not null and btrim(manual_note) <> ''));
create unique index exam_attempts_manual_one on exam_attempts (session_id, student_id) where is_manual;

-- Only set_exam_attempt_manual_score may create manual rows (a student's own insert policy must not be able to).
create or replace function exam_attempts_manual_guard() returns trigger
  language plpgsql as $$
begin
  if new.is_manual and coalesce(current_setting('helix.manual_attempt', true), '') <> '1' then
    raise exception 'สร้างรอบครูกรอกคะแนนโดยตรงไม่ได้';
  end if;
  return new;
end $$;
create trigger exam_attempts_manual_guard before insert on exam_attempts
  for each row execute function exam_attempts_manual_guard();

create or replace function exam_attempt_slot_free(p_session_id uuid, p_student_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select (select count(*) from exam_attempts where session_id = p_session_id and student_id = p_student_id and not is_manual)
       < es.max_attempts + coalesce((select extra from exam_attempt_grants where session_id = p_session_id and student_id = p_student_id), 0)
  from exam_sessions es where es.id = p_session_id
$$;

-- Returns 'synced' (score is in the gradebook), 'off' (room does not sync) or 'not_synced' (e.g. locked term).
create or replace function set_exam_attempt_manual_score(p_session_id uuid, p_student_id uuid, p_score numeric, p_note text)
  returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_session exam_sessions%rowtype;
  v_max numeric;
  v_id uuid;
  r record;
begin
  if not can_write_exam_session(p_session_id) then
    raise exception 'ไม่มีสิทธิ์กรอกคะแนนห้องสอบนี้';
  end if;
  select * into v_session from exam_sessions where id = p_session_id;
  if v_session.opens_at is null or v_session.opens_at > now() then
    raise exception 'ห้องสอบยังไม่ถึงเวลาเปิดสอบ';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'กรุณาระบุเหตุผล';
  end if;
  select coalesce(sum(points), 0) into v_max from exam_session_questions where session_id = p_session_id;
  if p_score is null or p_score < 0 or p_score > v_max or p_score <> round(p_score, 2) then
    raise exception 'คะแนนต้องอยู่ระหว่าง 0 ถึง % (ทศนิยมไม่เกิน 2 ตำแหน่ง)', v_max;
  end if;
  if not exists (
    select 1
    from exam_session_targets t
      join teaching_assignments ta on ta.id = t.teaching_assignment_id
      join student_classroom_enrollments sce on sce.classroom_id = ta.classroom_id and sce.academic_year = ta.academic_year
    where t.session_id = p_session_id and sce.student_id = p_student_id
  ) then
    raise exception 'นักเรียนไม่ได้อยู่ในห้องสอบนี้';
  end if;

  -- A round still in progress is closed with the answers given so far, so the student cannot submit over the manual score.
  for r in select id from exam_attempts where session_id = p_session_id and student_id = p_student_id and status = 'in_progress' and not is_manual loop
    update exam_attempts set status = 'submitted', submitted_at = now() where id = r.id;
    perform grade_exam_attempt(r.id);
  end loop;

  perform set_config('helix.manual_attempt', '1', true);
  select id into v_id from exam_attempts where session_id = p_session_id and student_id = p_student_id and is_manual;
  if v_id is null then
    insert into exam_attempts (session_id, student_id, attempt_no, status, started_at, submitted_at, score, is_manual, manual_note, manual_by)
      values (p_session_id, p_student_id, 0, 'submitted', now(), now(), p_score, true, btrim(p_note), auth.uid())
      returning id into v_id;
  else
    update exam_attempts set score = p_score, manual_note = btrim(p_note), manual_by = auth.uid(), submitted_at = now() where id = v_id;
  end if;
  perform set_config('helix.manual_attempt', '', true);

  perform sync_exam_attempt_to_gradebook(v_id);
  if not v_session.sync_to_gradebook then
    return 'off';
  end if;
  if exists (
    select 1 from exam_session_sets ess
      join student_item_scores s on s.score_item_id = ess.gradebook_item_id and s.student_id = p_student_id
    where ess.session_id = p_session_id and s.score = p_score
  ) then
    return 'synced';
  end if;
  return 'not_synced';
end $$;

revoke all on function set_exam_attempt_manual_score(uuid, uuid, numeric, text) from public, anon;
grant execute on function set_exam_attempt_manual_score(uuid, uuid, numeric, text) to authenticated;
