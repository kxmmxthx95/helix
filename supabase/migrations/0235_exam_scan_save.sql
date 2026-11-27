-- กระดาษคำตอบ: save the result of a scanned bubble sheet (phase 3).
-- A scanned sheet reuses the teacher-entered ("manual") attempt of 0231: attempt_no 0, one per student per room,
-- never counted in max_attempts, written to the gradebook by the same path (latest write wins). What is new is that
-- it keeps the per-question answers, and the score is graded HERE from the answer key, never taken from the phone.
-- Short-answer questions are not on the sheet: the teacher types their points once (scan_extra), added to the total.
-- Re-scanning replaces the earlier scan; a later hand-entered score replaces the scan (and drops its answers).
-- Rollback: drop function save_exam_scan(uuid, uuid, jsonb, numeric); the columns can stay.
alter table exam_attempts
  add column is_scan boolean not null default false,
  add column scan_extra numeric(7,2),
  add constraint exam_attempts_scan_chk check (not is_scan or is_manual);

-- p_answers: [{"question_id": uuid, "choice_id": uuid | null}] — one entry per bubbled question; null/absent = no answer.
-- Returns 'synced' (score is in the gradebook), 'off' (room does not sync) or 'not_synced' (e.g. locked term).
create or replace function save_exam_scan(p_session_id uuid, p_student_id uuid, p_answers jsonb, p_extra numeric)
  returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_session exam_sessions%rowtype;
  v_extra numeric(7,2) := coalesce(p_extra, 0);
  v_extra_max numeric;
  v_total numeric(7,2);
  v_id uuid;
  r record;
begin
  if not can_write_exam_session(p_session_id) then
    raise exception 'ไม่มีสิทธิ์บันทึกผลห้องสอบนี้';
  end if;
  select * into v_session from exam_sessions where id = p_session_id;
  if v_session.opens_at is null or v_session.opens_at > now() then
    raise exception 'ห้องสอบยังไม่ถึงเวลาเปิดสอบ';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 200 then
    raise exception 'ข้อมูลคำตอบไม่ถูกต้อง';
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

  -- Every answer must be a bubbled question of this room, with one of its own choices, once.
  if exists (
    select 1
    from jsonb_to_recordset(p_answers) as x(question_id uuid, choice_id uuid)
    where x.question_id is null
       or not exists (
            select 1 from exam_session_questions esq join exam_questions q on q.id = esq.question_id
            where esq.session_id = p_session_id and esq.question_id = x.question_id and q.question_type <> 'short_answer')
       or (x.choice_id is not null and not exists (
            select 1 from exam_question_choices c where c.id = x.choice_id and c.question_id = x.question_id))
  ) or (select count(*) from jsonb_to_recordset(p_answers) as x(question_id uuid, choice_id uuid))
       <> (select count(distinct x.question_id) from jsonb_to_recordset(p_answers) as x(question_id uuid, choice_id uuid)) then
    raise exception 'คำตอบไม่ตรงกับข้อสอบของห้องนี้';
  end if;

  select coalesce(sum(esq.points), 0) into v_extra_max
    from exam_session_questions esq join exam_questions q on q.id = esq.question_id
    where esq.session_id = p_session_id and q.question_type = 'short_answer';
  if v_extra < 0 or v_extra > v_extra_max or v_extra <> round(v_extra, 2) then
    raise exception 'คะแนนข้อเติมคำตอบต้องอยู่ระหว่าง 0 ถึง %', v_extra_max;
  end if;

  -- A round still in progress is closed with the answers given so far, so the student cannot submit over the scan.
  for r in select id from exam_attempts where session_id = p_session_id and student_id = p_student_id and status = 'in_progress' and not is_manual loop
    update exam_attempts set status = 'submitted', submitted_at = now() where id = r.id;
    perform grade_exam_attempt(r.id);
  end loop;

  perform set_config('helix.manual_attempt', '1', true);
  select id into v_id from exam_attempts where session_id = p_session_id and student_id = p_student_id and is_manual;
  if v_id is null then
    insert into exam_attempts (session_id, student_id, attempt_no, status, started_at, submitted_at, score, is_manual, manual_note, manual_by, is_scan, scan_extra)
      values (p_session_id, p_student_id, 0, 'submitted', now(), now(), 0, true, 'สแกนกระดาษคำตอบ', auth.uid(), true, v_extra)
      returning id into v_id;
  else
    update exam_attempts set is_scan = true, scan_extra = v_extra, manual_note = 'สแกนกระดาษคำตอบ', manual_by = auth.uid(), submitted_at = now() where id = v_id;
  end if;
  perform set_config('helix.manual_attempt', '', true);

  delete from exam_attempt_answers where attempt_id = v_id;
  insert into exam_attempt_answers (attempt_id, question_id, choice_id)
    select v_id, x.question_id, x.choice_id
    from jsonb_to_recordset(p_answers) as x(question_id uuid, choice_id uuid)
    where x.choice_id is not null;
  update exam_attempt_answers eaa set
    is_correct = exists (select 1 from exam_question_choices c where c.id = eaa.choice_id and c.is_correct)
  where eaa.attempt_id = v_id;
  update exam_attempt_answers eaa set points_awarded = case when eaa.is_correct then esq.points else 0 end
  from exam_session_questions esq
  where esq.session_id = p_session_id and esq.question_id = eaa.question_id and eaa.attempt_id = v_id;

  select coalesce(sum(points_awarded), 0) + v_extra into v_total from exam_attempt_answers where attempt_id = v_id;
  update exam_attempts set score = v_total where id = v_id;

  perform sync_exam_attempt_to_gradebook(v_id);
  if not v_session.sync_to_gradebook then
    return 'off';
  end if;
  if exists (
    select 1 from exam_session_sets ess
      join student_item_scores s on s.score_item_id = ess.gradebook_item_id and s.student_id = p_student_id
    where ess.session_id = p_session_id and s.score = v_total
  ) then
    return 'synced';
  end if;
  return 'not_synced';
end $$;

revoke all on function save_exam_scan(uuid, uuid, jsonb, numeric) from public, anon;
grant execute on function save_exam_scan(uuid, uuid, jsonb, numeric) to authenticated;

-- A hand-entered score replaces a scan: drop the scan's answers so score and answers never disagree. (Body of 0231 + 3 lines.)
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
    delete from exam_attempt_answers where attempt_id = v_id;
    update exam_attempts set score = p_score, manual_note = btrim(p_note), manual_by = auth.uid(), submitted_at = now(), is_scan = false, scan_extra = null where id = v_id;
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
