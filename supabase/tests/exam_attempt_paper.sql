-- Verifies 0234 (exam_attempt_paper) against a LOCAL database; every write rolls back. NOT run in CI.
-- Run after applying 0234:  docker exec -i supabase_db_<project> psql -U postgres < supabase/tests/exam_attempt_paper.sql
-- Expected: questions Q2, Q1 (session order), choices c1a, c1b, three 'f', then four 'ok:' notices.
-- Uses session_replication_role = replica to skip foreign keys for the fixtures, so do not run it on production.
begin;
set local session_replication_role = replica;
-- fixtures (random uuids kept in a temp table so the script can refer to them)
create temp table ids as select
  gen_random_uuid() p1, gen_random_uuid() p2, gen_random_uuid() s1, gen_random_uuid() s2, gen_random_uuid() sess,
  gen_random_uuid() q1, gen_random_uuid() q2, gen_random_uuid() q3, gen_random_uuid() a1, gen_random_uuid() a2, gen_random_uuid() a3, gen_random_uuid() dept;
grant select on ids to authenticated, anon;
insert into students (id, profile_id, student_code, first_name, last_name, department_id) select s1, p1, 'T1', 'a', 'b', dept from ids;
insert into students (id, profile_id, student_code, first_name, last_name, department_id) select s2, p2, 'T2', 'c', 'd', dept from ids;
insert into exam_questions (id, subject_id, question_type, prompt, created_by, correct_answer) select q1, dept, 'multiple_choice', 'Q1', p1, null from ids;
insert into exam_questions (id, subject_id, question_type, prompt, created_by, correct_answer) select q2, dept, 'short_answer', 'Q2', p1, 'SECRET2' from ids;
insert into exam_questions (id, subject_id, question_type, prompt, created_by, correct_answer) select q3, dept, 'short_answer', 'NOT-IN-SESSION', p1, 'SECRET3' from ids;
insert into exam_question_choices (question_id, label, position, is_correct) select q1, 'c1b', 2, false from ids;
insert into exam_question_choices (question_id, label, position, is_correct) select q1, 'c1a', 1, true from ids;
insert into exam_question_choices (question_id, label, position, is_correct) select q3, 'c3', 1, true from ids;
insert into exam_session_questions (session_id, question_id, position, points) select sess, q1, 2, 1 from ids;
insert into exam_session_questions (session_id, question_id, position, points) select sess, q2, 1, 1 from ids;
insert into exam_attempts (id, session_id, student_id, status, question_order) select a1, sess, s1, 'in_progress', array[q2, q1, q3] from ids;
insert into exam_attempts (id, session_id, student_id, status, question_order) select a2, sess, s2, 'in_progress', array[q1] from ids;
insert into exam_attempts (id, session_id, student_id, attempt_no, status, question_order) select a3, sess, s1, 2, 'submitted', array[q1] from ids;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select p1 from ids), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select p1::text from ids), true);

\echo == own in-progress attempt: expect Q2 then Q1 (by position), Q3 excluded, choices c1a,c1b only
select (r->>'prompt') as prompt from jsonb_array_elements(exam_attempt_paper((select a1 from ids))->'questions') r;
select (r->>'label') as choice from jsonb_array_elements(exam_attempt_paper((select a1 from ids))->'choices') r;
\echo == leak check: expect f f f
select exam_attempt_paper((select a1 from ids))::text like '%SECRET%' as has_secret,
       exam_attempt_paper((select a1 from ids))::text like '%is_correct%' as has_is_correct,
       exam_attempt_paper((select a1 from ids))::text like '%correct_answer%' as has_correct_answer;
\echo == another student attempt -> error
do $$ begin perform exam_attempt_paper((select a2 from ids)); raise notice 'BAD: no error'; exception when others then if sqlerrm = 'ไม่พบการสอบที่กำลังทำ' then raise notice 'ok: %', sqlerrm; else raise notice 'BAD: %', sqlerrm; end if; end $$;
\echo == own but submitted attempt -> error
do $$ begin perform exam_attempt_paper((select a3 from ids)); raise notice 'BAD: no error'; exception when others then if sqlerrm = 'ไม่พบการสอบที่กำลังทำ' then raise notice 'ok: %', sqlerrm; else raise notice 'BAD: %', sqlerrm; end if; end $$;
\echo == unknown attempt -> error
do $$ begin perform exam_attempt_paper(gen_random_uuid()); raise notice 'BAD: no error'; exception when others then if sqlerrm = 'ไม่พบการสอบที่กำลังทำ' then raise notice 'ok: %', sqlerrm; else raise notice 'BAD: %', sqlerrm; end if; end $$;
\echo == anon role may not execute
reset role;
set local role anon;
do $$ begin perform exam_attempt_paper(gen_random_uuid()); raise notice 'BAD: anon allowed'; exception when others then if sqlerrm like 'permission denied%' then raise notice 'ok: %', sqlerrm; else raise notice 'BAD: %', sqlerrm; end if; end $$;
rollback;
