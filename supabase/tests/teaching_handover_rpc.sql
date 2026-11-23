-- Verifies handover_teaching_assignments (0210) end to end; builds its own fixtures, every write rolls back.
-- NOT run in CI — run on a scratch/local DB with all migrations applied (it inserts auth.users rows).
begin;
do $$
declare
  d uuid := (select id from departments where code='PRI');
  g uuid := (select id from grade_levels where department_id=(select id from departments where code='PRI') order by code limit 1);
  la uuid := (select id from learning_areas limit 1);
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); m uuid := gen_random_uuid(); z uuid := gen_random_uuid();
  x1 uuid; x2 uuid; s1 uuid; s2 uuid; t1 uuid; t2 uuid; t3 uuid; t4 uuid; c1 uuid;
  v_set uuid; v_ses uuid; v_ses2 uuid; r jsonb; n int; pg uuid := gen_random_uuid();
  topic uuid;
begin
  insert into auth.users (id) select unnest(array[a,b,c,m,z]);
  insert into profiles (id, first_name, last_name, department_id) values
    (a,'A','old',d),(b,'B','new',d),(c,'C','co',d),(m,'M','mgr',d),(z,'Z','gone',d);
  update profiles set is_active=false where id=z; update profiles set learning_area_id=la where id in (a,b,c);
  insert into profile_roles (profile_id, role) values (m,'super_admin'),(a,'teacher'),(b,'teacher'),(c,'teacher');
  insert into classrooms (grade_level_id, name) values (g,'T1') returning id into x1;
  insert into classrooms (grade_level_id, name) values (g,'T2') returning id into x2;
  insert into subjects (code,name_th,learning_area_id,subject_type,credits,hours_per_week,department_id)
    values ('T-S1','s1',la,'basic',1,1,d) returning id into s1;
  insert into subjects (code,name_th,learning_area_id,subject_type,credits,hours_per_week,department_id)
    values ('T-S2','s2',la,'basic',1,1,d) returning id into s2;
  insert into teaching_assignments (teacher_id,subject_id,classroom_id,academic_year,term,periods_per_week,plan_group_id)
    values (a,s1,x1,2569,null,2,pg) returning id into t1;
  insert into teaching_assignments (teacher_id,subject_id,classroom_id,academic_year,term,periods_per_week,plan_group_id)
    values (a,s1,x2,2569,null,2,pg) returning id into t2;
  insert into teaching_assignments (teacher_id,subject_id,classroom_id,academic_year,term,periods_per_week)
    values (a,s2,x1,2569,null,2) returning id into t3;
  insert into teaching_assignments (teacher_id,subject_id,classroom_id,academic_year,term,periods_per_week)
    values (c,s1,x1,2569,null,1) returning id into t4;   -- C already co-teaches s1/x1? no: conflicts with t1 only for C as receiver
  update teaching_assignment_teachers set from_date = current_date - 10;
  raise notice 'seeded';

  perform set_config('request.jwt.claim.sub', m::text, true);

  -- 1 receiver already teaches same subject x room -> friendly error
  begin
    perform handover_teaching_assignments(jsonb_build_array(jsonb_build_object('assignment_id',t1,'to_teacher',c)), current_date);
    raise exception 'FAIL conflict accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice '1 ok: %', sqlerrm;
  end;
  -- 2 future date refused
  begin
    perform handover_teaching_assignments(jsonb_build_array(jsonb_build_object('assignment_id',t1,'to_teacher',b)), current_date+1);
    raise exception 'FAIL future accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice '2 ok: %', sqlerrm;
  end;
  -- 3 inactive receiver refused
  begin
    perform handover_teaching_assignments(jsonb_build_array(jsonb_build_object('assignment_id',t1,'to_teacher',z)), current_date);
    raise exception 'FAIL inactive accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice '3 ok: %', sqlerrm;
  end;
  -- 4 non-manager refused
  perform set_config('request.jwt.claim.sub', a::text, true);
  begin
    perform handover_teaching_assignments(jsonb_build_array(jsonb_build_object('assignment_id',t1,'to_teacher',b)), current_date);
    raise exception 'FAIL teacher accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice '4 ok: %', sqlerrm;
  end;
  perform set_config('request.jwt.claim.sub', m::text, true);

  -- exam fixtures: approved set for t1 + open session targeting t1
  insert into exam_topic_sets (teacher_id, subject_id, teaching_assignment_id) values (a,s1,t1) returning id into v_set;
  perform _exam_approval_bypass(true);
  update exam_topic_sets set approval_status='approved' where id=v_set;
  perform _exam_approval_bypass(false);
  insert into exam_sessions (subject_id, teacher_id, title, opens_at, closes_at, topic_set_id)
    values (s1,a,'open',now(), now()+interval '2 days', v_set) returning id into v_ses;
  insert into exam_session_sets (session_id, topic_set_id, subject_id) values (v_ses, v_set, s1);
  insert into exam_session_targets (session_id, teaching_assignment_id) values (v_ses, t1);
  insert into exam_sessions (subject_id, teacher_id, title, opens_at, closes_at, topic_set_id)
    values (s1,a,'closed',now()-interval '3 days', now()-interval '2 days', v_set) returning id into v_ses2;
  insert into exam_session_targets (session_id, teaching_assignment_id) values (v_ses2, t1);

  -- 5 real handover t1 -> B (back-dated 2 days) and t3 -> B
  r := handover_teaching_assignments(jsonb_build_array(
        jsonb_build_object('assignment_id',t1,'to_teacher',b),
        jsonb_build_object('assignment_id',t3,'to_teacher',b)), current_date-2);
  raise notice '5 result: %', r;
  if (r->>'moved')::int<>2 or (r->>'topic_sets')::int<>1 or (r->>'sessions_moved')::int<>1 or (r->>'plans_unlinked')::int<>1 then
    raise exception 'FAIL unexpected result %', r; end if;
  if (select teacher_id from teaching_assignments where id=t1)<>b then raise exception 'FAIL teacher not moved'; end if;
  if (select teacher_id from exam_topic_sets where id=v_set)<>b then raise exception 'FAIL set owner'; end if;
  if (select teacher_id from exam_sessions where id=v_ses)<>b then raise exception 'FAIL open session'; end if;
  if (select teacher_id from exam_sessions where id=v_ses2)<>a then raise exception 'FAIL closed session moved'; end if;
  if exists (select 1 from teaching_assignments where id in (t1,t2) and plan_group_id is not null) then raise exception 'FAIL plan group'; end if;
  if not exists (select 1 from teaching_assignment_teachers where assignment_id=t1 and teacher_id=a and to_date=current_date-2)
     or not exists (select 1 from teaching_assignment_teachers where assignment_id=t1 and teacher_id=b and from_date=current_date-2 and to_date is null)
  then raise exception 'FAIL history'; end if;

  -- 6 back-dating before the previous handover refused
  begin
    perform handover_teaching_assignments(jsonb_build_array(jsonb_build_object('assignment_id',t1,'to_teacher',a)), current_date-5);
    raise exception 'FAIL backdate accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice '6 ok: %', sqlerrm;
  end;

  -- 7 undo same day as the handover (effective = current_date-2): no zero-length row, no duplicate rows
  perform handover_teaching_assignments(jsonb_build_array(jsonb_build_object('assignment_id',t1,'to_teacher',a)), current_date-2);
  select count(*) into n from teaching_assignment_teachers where assignment_id=t1;
  if n<>1 then raise exception 'FAIL undo left % history rows', n; end if;
  raise notice '7 ok';

  -- 8 term lock refuses
  update academic_terms set status='locked' where department_id=d and term_type='term1';
  begin
    perform handover_teaching_assignments(jsonb_build_array(jsonb_build_object('assignment_id',t2,'to_teacher',b)), current_date);
    raise exception 'FAIL locked accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice '8 ok: %', sqlerrm;
  end;
  raise notice 'ALL PASS';
end $$;
rollback;
