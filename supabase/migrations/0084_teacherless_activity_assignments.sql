-- Activity subjects (subject_type = 'activity': ชุมนุม, ลูกเสือ, โฮมรูม …) may be
-- placed on a classroom timetable with no teacher. teaching_assignments.teacher_id
-- becomes nullable, but only for activity subjects, and only the academic group
-- (can_manage_academic, not ธุรการ) may create/edit/record against such a row.
--
-- A null teacher never conflicts with another slot (NULL = NULL is not true in
-- check_schedule_entry, 0031), so only the classroom is checked for clashes —
-- exactly what a teacherless activity needs.

alter table teaching_assignments alter column teacher_id drop not null;

-- One teacherless row per classroom+subject+year(+term), same split as 0017
-- because a plain unique index never matches NULLs.
create unique index teaching_assignments_unique_teacherless_no_term on teaching_assignments
  (subject_id, classroom_id, academic_year)
  where teacher_id is null and term is null;
create unique index teaching_assignments_unique_teacherless_term on teaching_assignments
  (subject_id, classroom_id, academic_year, term)
  where teacher_id is null and term is not null;

-- 0017: skip the teacher/classroom department check when there is no teacher,
-- and only activity subjects may go without one.
create or replace function check_teaching_assignment_department() returns trigger
  language plpgsql as $$
declare
  teacher_dept uuid;
  subject_dept uuid;
  subject_kind subject_type;
  classroom_dept uuid;
begin
  select department_id, subject_type into subject_dept, subject_kind from subjects where id = new.subject_id;
  select gl.department_id into classroom_dept
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where c.id = new.classroom_id;
  if new.teacher_id is null then
    if subject_kind is distinct from 'activity' then
      raise exception 'only activity subjects may have no teacher (subject %)', new.subject_id;
    end if;
  else
    select department_id into teacher_dept from profiles where id = new.teacher_id;
    if teacher_dept is distinct from classroom_dept then
      raise exception 'teacher % belongs to a different department than classroom %', new.teacher_id, new.classroom_id;
    end if;
  end if;
  if subject_dept is distinct from classroom_dept then
    raise exception 'subject % belongs to a different department than classroom %', new.subject_id, new.classroom_id;
  end if;
  return new;
end $$;

-- 0018: resolve the department through the classroom instead of the teacher's
-- profile (the same department — 0017 enforces it — but present without a teacher).
do $$
declare
  src text;
  old_line constant text := 'select department_id into dept from profiles where id = rec.teacher_id;';
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p where p.proname = 'check_teaching_assignment_academic_term';
  if position(old_line in src) = 0 then
    raise exception 'check_teaching_assignment_academic_term no longer contains the expected teacher lookup';
  end if;
  execute replace(
    src,
    old_line,
    'select gl.department_id into dept from classrooms c join grade_levels gl on gl.id = c.grade_level_id where c.id = rec.classroom_id;'
  );
end $$;

-- 0030: same — department via classroom, so a teacherless assignment can still
-- be checked against its term lock (the inner join on profiles dropped it).
create or replace function teaching_assignment_term_open(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select
    count(*) > 0
    and count(*) filter (where t.status in ('locked', 'archived')) = 0
  from teaching_assignments ta
  join classrooms c on c.id = ta.classroom_id
  join grade_levels gl on gl.id = c.grade_level_id
  join academic_terms t on t.department_id = gl.department_id
    and t.academic_year = ta.academic_year
    and (ta.term is null or t.term_type = (case ta.term when 1 then 'term1' else 'term2' end)::term_type)
  where ta.id = p_id
$$;

-- 0017: managing the load stays can_manage(), but a teacherless row is the
-- academic group's call (no ธุรการ).
drop policy teaching_assignments_write on teaching_assignments;
create policy teaching_assignments_write on teaching_assignments
  for all to authenticated
  using (
    can_manage() and (teacher_id is not null or can_manage_academic()) and (
      is_org_wide()
      or classroom_id in (
        select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    )
  )
  with check (
    can_manage() and (teacher_id is not null or can_manage_academic()) and (
      is_org_wide()
      or classroom_id in (
        select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
        where gl.department_id = auth_department()
      )
    )
  );

-- 0030: score items / pass-fail results of a teacherless row — academic group only.
create or replace function can_write_teaching_assignment(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from teaching_assignments ta
    where ta.id = p_id
      and (
        ta.teacher_id = auth.uid()
        or (can_manage() and (ta.teacher_id is not null or can_manage_academic()) and (
          is_org_wide()
          or ta.classroom_id in (
            select c.id from classrooms c join grade_levels gl on gl.id = c.grade_level_id
            where gl.department_id = auth_department()
          )
        ))
      )
  )
$$;
