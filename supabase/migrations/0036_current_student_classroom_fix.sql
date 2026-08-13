-- Fix current_student_classroom() (0035): school_settings.academic_year was
-- dropped by migration 0018 — replaced with a per-department "current year"
-- via academic_terms.status='active' (same source src/hooks/useAcademicTerms.ts
-- useActiveAcademicYear() reads, with the same calendar-year+543 fallback
-- when no active term row exists yet). Caught by the rollback-transaction
-- verification in the same session that introduced 0035 — the old body
-- referenced a column that no longer exists and would have failed every call.
create or replace function current_student_classroom(p_student_id uuid) returns uuid
  language sql stable security definer set search_path = public
as $$
  select sce.classroom_id
  from student_classroom_enrollments sce
  where sce.student_id = p_student_id
    and sce.academic_year = coalesce(
      (
        select at.academic_year from academic_terms at
        join students s on s.id = p_student_id
        join grade_levels gl on gl.id = s.grade_level_id
        where at.department_id = gl.department_id and at.status = 'active'
      ),
      extract(year from now())::int + 543
    )
  order by sce.created_at desc
  limit 1
$$;
