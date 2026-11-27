-- Verifies 0235 (save_exam_scan + the manual-score change) against a LOCAL database; every write rolls back. NOT run in CI.
-- Run after applying 0235 (it needs 0231 too). Uses session_replication_role = replica
-- to skip foreign keys for the fixtures, so do not run it on production.
-- Expected: every line starting "ok:" and none starting "BAD:".
begin;
set local session_replication_role = replica;
create temp table ids as select
  gen_random_uuid() teacher, gen_random_uuid() other, gen_random_uuid() s1, gen_random_uuid() s2, gen_random_uuid() outsider,
  gen_random_uuid() sess, gen_random_uuid() subj, gen_random_uuid() ta, gen_random_uuid() cls, gen_random_uuid() dept,
  gen_random_uuid() q1, gen_random_uuid() q2, gen_random_uuid() qs, gen_random_uuid() qx,
  gen_random_uuid() c1a, gen_random_uuid() c1b, gen_random_uuid() c2a, gen_random_uuid() c2b, gen_random_uuid() cx;
grant select on ids to authenticated;
insert into students (id, profile_id, student_code, first_name, last_name, department_id) select s1, gen_random_uuid(), 'T1', 'a', 'b', dept from ids;
insert into students (id, profile_id, student_code, first_name, last_name, department_id) select s2, gen_random_uuid(), 'T2', 'c', 'd', dept from ids;
insert into students (id, profile_id, student_code, first_name, last_name, department_id) select outsider, gen_random_uuid(), 'T3', 'e', 'f', dept from ids;
insert into exam_sessions (id, subject_id, teacher_id, title, topic_set_id, opens_at, closes_at) select sess, subj, teacher, 'test', gen_random_uuid(), now() - interval '1 hour', now() + interval '1 hour' from ids;
insert into teaching_assignments (id, subject_id, classroom_id, academic_year, periods_per_week) select ta, subj, cls, 2569, 1 from ids;
insert into exam_session_targets (session_id, teaching_assignment_id) select sess, ta from ids;
insert into student_classroom_enrollments (student_id, classroom_id, academic_year) select s1, cls, 2569 from ids;
insert into student_classroom_enrollments (student_id, classroom_id, academic_year) select s2, cls, 2569 from ids;
-- q1: 2 points, c1b correct; q2: 3 points, c2a correct; qs: short answer 4 points; qx: not in the session
insert into exam_questions (id, subject_id, question_type, prompt, created_by, correct_answer) select q1, subj, 'multiple_choice', 'Q1', teacher, null from ids;
insert into exam_questions (id, subject_id, question_type, prompt, created_by, correct_answer) select q2, subj, 'true_false', 'Q2', teacher, null from ids;
insert into exam_questions (id, subject_id, question_type, prompt, created_by, correct_answer) select qs, subj, 'short_answer', 'QS', teacher, 'x' from ids;
insert into exam_questions (id, subject_id, question_type, prompt, created_by, correct_answer) select qx, subj, 'multiple_choice', 'QX', teacher, null from ids;
insert into exam_question_choices (id, question_id, label, position, is_correct) select c1a, q1, 'a', 1, false from ids;
insert into exam_question_choices (id, question_id, label, position, is_correct) select c1b, q1, 'b', 2, true from ids;
insert into exam_question_choices (id, question_id, label, position, is_correct) select c2a, q2, 'a', 1, true from ids;
insert into exam_question_choices (id, question_id, label, position, is_correct) select c2b, q2, 'b', 2, false from ids;
insert into exam_question_choices (id, question_id, label, position, is_correct) select cx, qx, 'x', 1, true from ids;
insert into exam_session_questions (session_id, question_id, position, points) select sess, q1, 1, 2 from ids;
insert into exam_session_questions (session_id, question_id, position, points) select sess, q2, 2, 3 from ids;
insert into exam_session_questions (session_id, question_id, position, points) select sess, qs, 3, 4 from ids;
-- s1 already has an online attempt (score 4) and s2 an unfinished one
insert into exam_attempts (session_id, student_id, attempt_no, status, score) select sess, s1, 1, 'submitted', 4 from ids;
insert into exam_attempts (session_id, student_id, attempt_no, status) select sess, s2, 1, 'in_progress' from ids;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select teacher::text from ids), true);

\echo == scan for s1: q1 right (c1b), q2 wrong (c2b), short-answer points 3 -> score 2 + 0 + 3 = 5
select save_exam_scan((select sess from ids), (select s1 from ids), jsonb_build_array(
  jsonb_build_object('question_id', (select q1 from ids), 'choice_id', (select c1b from ids)),
  jsonb_build_object('question_id', (select q2 from ids), 'choice_id', (select c2b from ids))), 3);
select a.attempt_no, a.is_manual, a.is_scan, a.score, a.scan_extra, a.manual_note from exam_attempts a where a.session_id = (select sess from ids) and a.student_id = (select s1 from ids) order by attempt_no;
select count(*) as answers, sum(points_awarded) as points from exam_attempt_answers where attempt_id = (select id from exam_attempts where is_scan and student_id = (select s1 from ids));

\echo == re-scan replaces: both right, no short-answer points -> 5, still ONE scan row
select save_exam_scan((select sess from ids), (select s1 from ids), jsonb_build_array(
  jsonb_build_object('question_id', (select q1 from ids), 'choice_id', (select c1b from ids)),
  jsonb_build_object('question_id', (select q2 from ids), 'choice_id', (select c2a from ids))), 0);
select count(*) as scan_rows, max(score) as score from exam_attempts where is_scan and student_id = (select s1 from ids);
select count(*) as answers from exam_attempt_answers where attempt_id = (select id from exam_attempts where is_scan and student_id = (select s1 from ids));

\echo == blank answers store no row; scan closes the unfinished online attempt for s2
select save_exam_scan((select sess from ids), (select s2 from ids), jsonb_build_array(
  jsonb_build_object('question_id', (select q1 from ids), 'choice_id', null)), 0);
select status from exam_attempts where student_id = (select s2 from ids) and attempt_no = 1;
select count(*) as answers from exam_attempt_answers where attempt_id = (select id from exam_attempts where is_scan and student_id = (select s2 from ids));

\echo == hand-entered score replaces the scan and drops its answers
select set_exam_attempt_manual_score((select sess from ids), (select s1 from ids), 6, 'แก้คะแนน');
select is_scan, scan_extra, score from exam_attempts where is_manual and student_id = (select s1 from ids);
select count(*) as answers from exam_attempt_answers where attempt_id = (select id from exam_attempts where is_manual and student_id = (select s1 from ids));

\echo == rejections
do $$ declare t text; begin
  begin perform save_exam_scan((select sess from ids), (select outsider from ids), '[]'::jsonb, 0); raise notice 'BAD: outsider accepted'; exception when others then raise notice 'ok: %', sqlerrm; end;
  begin perform save_exam_scan((select sess from ids), (select s1 from ids), jsonb_build_array(jsonb_build_object('question_id', (select qx from ids), 'choice_id', (select cx from ids))), 0); raise notice 'BAD: question outside the room accepted'; exception when others then raise notice 'ok: %', sqlerrm; end;
  begin perform save_exam_scan((select sess from ids), (select s1 from ids), jsonb_build_array(jsonb_build_object('question_id', (select qs from ids), 'choice_id', null)), 0); raise notice 'BAD: short answer accepted'; exception when others then raise notice 'ok: %', sqlerrm; end;
  begin perform save_exam_scan((select sess from ids), (select s1 from ids), jsonb_build_array(jsonb_build_object('question_id', (select q1 from ids), 'choice_id', (select c2a from ids))), 0); raise notice 'BAD: choice of another question accepted'; exception when others then raise notice 'ok: %', sqlerrm; end;
  begin perform save_exam_scan((select sess from ids), (select s1 from ids), jsonb_build_array(jsonb_build_object('question_id', (select q1 from ids), 'choice_id', (select c1a from ids)), jsonb_build_object('question_id', (select q1 from ids), 'choice_id', (select c1b from ids))), 0); raise notice 'BAD: duplicate question accepted'; exception when others then raise notice 'ok: %', sqlerrm; end;
  begin perform save_exam_scan((select sess from ids), (select s1 from ids), '[]'::jsonb, 4.5); raise notice 'BAD: extra above the short-answer points accepted'; exception when others then raise notice 'ok: %', sqlerrm; end;
end $$;
\echo == another teacher cannot save
select set_config('request.jwt.claim.sub', (select other::text from ids), true);
do $$ begin
  begin perform save_exam_scan((select sess from ids), (select s1 from ids), '[]'::jsonb, 0); raise notice 'BAD: other teacher accepted'; exception when others then raise notice 'ok: %', sqlerrm; end;
end $$;
\echo == anon cannot execute
reset role;
set local role anon;
do $$ begin
  begin perform save_exam_scan(gen_random_uuid(), gen_random_uuid(), '[]'::jsonb, 0); raise notice 'BAD: anon allowed'; exception when others then raise notice 'ok: %', sqlerrm; end;
end $$;
rollback;
