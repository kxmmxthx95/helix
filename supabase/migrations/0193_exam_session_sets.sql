-- One room can cover several subjects that share a ผังการเรียน (merged card): exam_session_sets lists every
-- topic set (and its subject) of a session. exam_sessions.subject_id / topic_set_id stay the primary (first) one.
--   * a set is "used" once any session lists it (the app reads this table, not exam_sessions.topic_set_id)
--   * targets may be the room of ANY listed set
--   * with sync_to_gradebook the score is written to the gradebook of EVERY listed subject the student takes
--     (one exam item per subject, kept in exam_session_sets.gradebook_item_id)

create table exam_session_sets (
  session_id         uuid not null references exam_sessions on delete cascade,
  topic_set_id       uuid not null references exam_topic_sets on delete restrict,
  subject_id         uuid not null references subjects on delete cascade,
  gradebook_item_id  uuid references score_items on delete set null,
  primary key (session_id, topic_set_id)
);
create index exam_session_sets_set_idx on exam_session_sets (topic_set_id);

insert into exam_session_sets (session_id, topic_set_id, subject_id, gradebook_item_id)
select id, topic_set_id, subject_id, gradebook_item_id from exam_sessions;

alter table exam_session_sets enable row level security;
create policy exam_session_sets_read on exam_session_sets
  for select to authenticated using (can_read_exam_session(session_id));
create policy exam_session_sets_write on exam_session_sets
  for all to authenticated
  using (can_write_exam_session(session_id))
  with check (can_write_exam_session(session_id));

-- Every listed set: approved, not "ไม่มีสอบ", the room owner's, and of the stated subject.
create or replace function check_exam_session_set() returns trigger
  language plpgsql as $$
begin
  if not exists (
    select 1 from exam_topic_sets ts
    join exam_sessions es on es.id = new.session_id
    where ts.id = new.topic_set_id and ts.approval_status = 'approved' and not ts.no_exam
      and ts.teacher_id = es.teacher_id and ts.subject_id = new.subject_id
  ) then
    raise exception 'เลือกชุดหัวข้อที่อนุมัติแล้วของวิชานี้ก่อนเปิดสอบ';
  end if;
  return new;
end $$;
create trigger exam_session_sets_check before insert on exam_session_sets
  for each row execute function check_exam_session_set();

-- Targets: the room of any listed set (falls back to the primary set while the list is still empty).
create or replace function check_exam_target_matches_set() returns trigger
  language plpgsql as $$
begin
  if exists (select 1 from exam_session_sets where session_id = new.session_id) then
    if exists (
      select 1 from exam_session_sets ess join exam_topic_sets ts on ts.id = ess.topic_set_id
      where ess.session_id = new.session_id and ts.teaching_assignment_id is not null
    ) and not exists (
      select 1 from exam_session_sets ess join exam_topic_sets ts on ts.id = ess.topic_set_id
      where ess.session_id = new.session_id and ts.teaching_assignment_id = new.teaching_assignment_id
    ) then
      raise exception 'ชุดหัวข้อนี้ใช้เปิดสอบได้เฉพาะห้องของชุดนั้น';
    end if;
    return new;
  end if;
  if (select ts.teaching_assignment_id from exam_sessions es join exam_topic_sets ts on ts.id = es.topic_set_id where es.id = new.session_id)
       is distinct from new.teaching_assignment_id
     and (select ts.teaching_assignment_id from exam_sessions es join exam_topic_sets ts on ts.id = es.topic_set_id where es.id = new.session_id) is not null then
    raise exception 'ชุดหัวข้อนี้ใช้เปิดสอบได้เฉพาะห้องของชุดนั้น';
  end if;
  return new;
end $$;

-- 0047 body, but per listed set instead of "first matching target".
create or replace function sync_exam_attempt_to_gradebook(p_attempt_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_session exam_sessions%rowtype;
  v_student_id uuid;
  v_score numeric(7,2);
  v_max numeric(7,2);
  v_item_id uuid;
  r record;
begin
  select es.* into v_session from exam_attempts ea join exam_sessions es on es.id = ea.session_id
    where ea.id = p_attempt_id;
  if not v_session.sync_to_gradebook then return; end if;

  select student_id, score into v_student_id, v_score from exam_attempts where id = p_attempt_id;
  select coalesce(sum(points), 0) into v_max from exam_session_questions where session_id = v_session.id;

  for r in
    select ess.topic_set_id, ess.gradebook_item_id, ts.teaching_assignment_id as ta_id
    from exam_session_sets ess
      join exam_topic_sets ts on ts.id = ess.topic_set_id
      join teaching_assignments ta on ta.id = ts.teaching_assignment_id
      join student_classroom_enrollments sce
        on sce.classroom_id = ta.classroom_id and sce.academic_year = ta.academic_year
    where ess.session_id = v_session.id and sce.student_id = v_student_id
  loop
    -- a locked/archived term rejects score writes; a submit must never fail because of that, so skip silently
    if not teaching_assignment_term_open(r.ta_id) then continue; end if;

    v_item_id := r.gradebook_item_id;
    if v_item_id is null then
      insert into score_items (teaching_assignment_id, kind, label, max_score)
        values (r.ta_id, 'exam', v_session.title, greatest(v_max, 0.01))
        returning id into v_item_id;
      update exam_session_sets set gradebook_item_id = v_item_id
        where session_id = v_session.id and topic_set_id = r.topic_set_id;
      if r.topic_set_id = v_session.topic_set_id then
        update exam_sessions set gradebook_item_id = v_item_id where id = v_session.id;
      end if;
    end if;

    insert into student_item_scores (score_item_id, student_id, score)
      values (v_item_id, v_student_id, v_score)
      on conflict (score_item_id, student_id) do update set score = excluded.score;
  end loop;
end $$;
