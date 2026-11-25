-- Portal list of "me + my children". Reading students directly runs students_read RLS
-- (volatile helpers per row → seq scan, ~300 ms); this security-definer read uses the
-- profile_id / guardianships indexes and returns only the portal columns.
create or replace function my_card_students()
  returns table (id uuid, student_code text, prefix text, first_name text, last_name text, avatar_path text,
                 updated_at timestamptz, department_id uuid, grade_level_id uuid, profile_id uuid)
  language sql stable security definer set search_path = public as $$
  select s.id, s.student_code, s.prefix, s.first_name, s.last_name, s.avatar_path,
         s.updated_at, s.department_id, s.grade_level_id, s.profile_id
  from students s
  where s.profile_id = auth.uid()
     or s.id in (select g.student_id from guardianships g where g.parent_id = auth.uid())
  order by s.student_code
$$;
revoke execute on function my_card_students() from public, anon;
grant execute on function my_card_students() to authenticated;
