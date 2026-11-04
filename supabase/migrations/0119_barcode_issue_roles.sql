-- Who may create a student's payment barcode: org-wide (super_admin / director / staff) for any
-- student, and ผู้บริหารแผนก (dept_director) for students of their own department.
create or replace function _can_issue_qr(p_student uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_org_wide() or exists (
    select 1
    from students s
    join profiles p on p.id = auth.uid() and p.department_id = s.department_id
    join profile_roles r on r.profile_id = p.id and r.role = 'dept_director'
    where s.id = p_student
  )
$$;
revoke execute on function _can_issue_qr(uuid) from public, anon, authenticated;

create or replace function card_issue_qr(p_student_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not _can_issue_qr(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  if not exists (select 1 from students where id = p_student_id) then raise exception 'ไม่พบนักเรียน'; end if;
  perform _wallet_lock(p_student_id);
  update student_cards set status = 'replaced' where student_id = p_student_id and status <> 'replaced';
  insert into student_cards (student_id, card_uid, created_by) values (p_student_id, _new_qr_token(), auth.uid());
end $$;

-- Roster column: which visible students already have a live barcode (never returns the token itself).
create or replace function card_live_status() returns table (student_id uuid, status text)
  language sql stable security definer set search_path = public as $$
  select c.student_id, c.status::text
  from student_cards c
  where c.status <> 'replaced' and _can_issue_qr(c.student_id)
$$;
revoke execute on function card_live_status() from public, anon;
grant execute on function card_live_status() to authenticated;
