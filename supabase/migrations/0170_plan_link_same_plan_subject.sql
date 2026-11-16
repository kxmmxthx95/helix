-- รวมแผน across different subjects of the same ผังการเรียน (e.g. คณิตพื้นฐาน + คณิตเพิ่มเติม):
-- set_plan_link (0169) now requires same grade + a shared ผัง subject instead of the same subject_id.
-- Mirroring is unchanged; a topic the mate's subject cannot take is skipped by the existing triggers.

create or replace function set_plan_link(p_assignment uuid, p_mates uuid[])
  returns table (copied int, skipped int)
  language plpgsql security definer set search_path = public as $$
declare
  src   teaching_assignments;
  a     teaching_assignments;
  src_grade uuid;
  src_dept  uuid;
  m     uuid;
  gid   uuid;
  added uuid[] := '{}';
  keep  uuid[];
begin
  select * into src from teaching_assignments where id = p_assignment;
  if not found or src.teacher_id is distinct from auth.uid() then
    raise exception 'not your assignment';
  end if;
  gid := coalesce(src.plan_group_id, gen_random_uuid());
  select gl.id, gl.department_id into src_grade, src_dept
    from classrooms c join grade_levels gl on gl.id = c.grade_level_id where c.id = src.classroom_id;

  foreach m in array p_mates loop
    select * into a from teaching_assignments where id = m;
    if not found or m = p_assignment or a.teacher_id is distinct from auth.uid()
       or a.academic_year <> src.academic_year or a.term is distinct from src.term
       -- same grade, and both subjects resolve to the same ผังการเรียน subject (name prefix,
       -- as check_teaching_plan_slot_topic): e.g. คณิตศาสตร์พื้นฐาน + คณิตศาสตร์เพิ่มเติม
       or not exists (select 1 from classrooms c where c.id = a.classroom_id and c.grade_level_id = src_grade)
       or not exists (
         select 1 from plan_subjects ps, subjects s1, subjects s2
         where ps.department_id = src_dept and s1.id = src.subject_id and s2.id = a.subject_id
           and starts_with(btrim(s1.name_th), btrim(ps.name))
           and starts_with(btrim(s2.name_th), btrim(ps.name))) then
      raise exception 'cannot link assignment %', m;
    end if;
    if a.plan_group_id is distinct from src.plan_group_id or src.plan_group_id is null then
      added := added || m;
    end if;
  end loop;

  copied := 0; skipped := 0;
  if array_length(added, 1) > 0 then
    select coalesce(sum(c.copied), 0), coalesce(sum(c.skipped), 0) into copied, skipped
      from copy_plan_to_group(p_assignment, added) c;
  end if;

  keep := p_mates || p_assignment;
  update teaching_assignments set plan_group_id = gid where id = any (keep);
  update teaching_assignments set plan_group_id = null where plan_group_id = gid and id <> all (keep);
  -- a group of one is no group (also tidies the group a moved mate left)
  update teaching_assignments set plan_group_id = null
    where plan_group_id in (select plan_group_id from teaching_assignments
                            where plan_group_id is not null group by 1 having count(*) = 1);
  return next;
end $$;

grant execute on function set_plan_link(uuid, uuid[]) to authenticated;
