-- Verifies 0236 (log_audit with composite primary keys) against a LOCAL database; every write rolls back. NOT run in CI.
-- Regression for "กดสอบใหม่ แล้วบันทึกไม่ได้": a teacher granting a retake must succeed and leave an audit row whose
-- record_id is "<session>:<student>". Run after applying 0236. Uses session_replication_role = replica for the fixtures
-- (switched back to origin before the calls so triggers fire), so do not run it on production.
begin;
set local session_replication_role = replica;
create temp table ids as select
  gen_random_uuid() tprof, gen_random_uuid() sprof, gen_random_uuid() s1, gen_random_uuid() sess, gen_random_uuid() subj, gen_random_uuid() ta, gen_random_uuid() cls, gen_random_uuid() dept,
  gen_random_uuid() q1, gen_random_uuid() c1a, gen_random_uuid() c1b, gen_random_uuid() a1;
grant select on ids to authenticated;
insert into students (id, profile_id, student_code, first_name, last_name, department_id) select s1, sprof, 'T1', 'a', 'b', dept from ids;
create temp table ts as select gen_random_uuid() id;
grant select on ts to authenticated;
insert into exam_topic_sets (id, teacher_id, subject_id, approval_status) select ts.id, tprof, subj, 'approved' from ids, ts;
insert into exam_sessions (id, subject_id, teacher_id, title, topic_set_id, opens_at, closes_at, max_attempts, is_enabled, strict_mode) select sess, subj, tprof, 'test', (select id from ts), now() - interval '1 hour', now() + interval '1 hour', 1, true, false from ids;
insert into teaching_assignments (id, subject_id, classroom_id, academic_year, periods_per_week) select ta, subj, cls, 2569, 1 from ids;
insert into exam_session_targets (session_id, teaching_assignment_id) select sess, ta from ids;
insert into student_classroom_enrollments (student_id, classroom_id, academic_year) select s1, cls, 2569 from ids;
insert into exam_questions (id, subject_id, question_type, prompt, created_by) select q1, subj, 'multiple_choice', 'Q1', tprof from ids;
insert into exam_question_choices (id, question_id, label, position, is_correct) select c1a, q1, 'a', 1, false from ids;
insert into exam_question_choices (id, question_id, label, position, is_correct) select c1b, q1, 'b', 2, true from ids;
insert into exam_session_questions (session_id, question_id, position, points) select sess, q1, 1, 2 from ids;
insert into exam_attempts (id, session_id, student_id, attempt_no, status, score, question_order) select a1, sess, s1, 1, 'submitted', 2, array[q1] from ids;

insert into profiles (id, first_name, last_name) select tprof, 'ครู', 'ทดสอบ' from ids;
insert into profile_roles (profile_id, role) select tprof, 'teacher' from ids;
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select tprof::text from ids), true);
\echo == teacher grants a retake
select grant_exam_retake((select sess from ids), array[(select s1 from ids)]);
reset role;
\echo == audit row of the grant: record_id must be session:student (not null)
select record_id = (select sess::text || ':' || s1::text from ids) as record_id_is_composite_key, action, table_name from audit_logs where table_name = 'exam_attempt_grants';
set local role authenticated;
select set_config('request.jwt.claim.sub', (select sprof::text from ids), true);
\echo == student inserts attempt 2 through RLS
insert into exam_attempts (session_id, student_id, attempt_no, question_order) select sess, s1, 2, array[q1] from ids returning id, attempt_no, status;
\echo == student saves answers
select save_exam_answers((select id from exam_attempts where student_id = (select s1 from ids) and attempt_no = 2), jsonb_build_array(jsonb_build_object('question_id', (select q1 from ids), 'choice_id', (select c1b from ids))));
\echo == student submits
select submit_exam_attempt((select id from exam_attempts where student_id = (select s1 from ids) and attempt_no = 2), '[]'::jsonb);
select attempt_no, status, score from exam_attempts where student_id = (select s1 from ids) order by attempt_no;
rollback;
