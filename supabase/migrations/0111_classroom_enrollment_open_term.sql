-- Classroom enrollments are per academic_year, not per term. The original
-- check (0018) blocked the write when ANY term of the year was locked/archived,
-- so locking term 1 made it impossible to place students for term 2 of the same
-- year. Block only when no open (upcoming/active) term is left in that year.
create or replace function check_classroom_enrollment_academic_term() returns trigger
  language plpgsql as $$
declare
  rec student_classroom_enrollments;
  dept uuid;
  total_count int;
  open_count int;
begin
  rec := coalesce(new, old);
  select gl.department_id into dept
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id
    where c.id = rec.classroom_id;

  select count(*), count(*) filter (where status in ('upcoming', 'active'))
    into total_count, open_count
    from academic_terms
    where department_id = dept and academic_year = rec.academic_year;

  if tg_op <> 'DELETE' and total_count = 0 then
    raise exception 'no academic_terms row for department %, year % — set up the academic term first', dept, rec.academic_year;
  end if;
  if total_count > 0 and open_count = 0 then
    raise exception 'academic term for department %, year % is locked/archived', dept, rec.academic_year;
  end if;

  return coalesce(new, old);
end $$;
