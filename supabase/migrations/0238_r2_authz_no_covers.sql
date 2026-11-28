-- 0238: subject-covers stays on Supabase Storage (decision 2026-11-28), so its branch is gone.
-- Cloudflare R2 storage (docs/cloudflare-migration.md, phase 2): the files-worker has no RLS, so it asks this
-- function "may the caller do <op> on <bucket>/<name>?" with the caller's own JWT. Each branch is the matching
-- storage.objects policy copied with `name` := p_name; security invoker keeps RLS on the tables the policies read.
-- Fails closed: any error (e.g. a non-uuid folder) => false. `subject-documents` is intentionally absent (stays on Supabase).
-- Delete this function with the storage policies once the API worker owns authorization (phase 4/5).
create or replace function public.r2_authz(p_bucket text, p_name text, p_op text)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, storage
as $$
declare
  f text[] := storage.foldername(p_name);
  uid text := auth.uid()::text;
begin
  if p_op not in ('read', 'write', 'delete') or auth.uid() is null then
    return false;
  end if;

  case p_bucket
    when 'assignment-attachments' then
      return exists (select 1 from score_items si where si.id = f[1]::uuid
        and case when p_op = 'read' then can_read_teaching_assignment(si.teaching_assignment_id)
                 else can_write_teaching_assignment(si.teaching_assignment_id) end);

    when 'assignment-submissions' then
      if p_op = 'read' then
        return exists (select 1 from score_items si where si.id = f[1]::uuid and can_read_teaching_assignment(si.teaching_assignment_id));
      end if;
      return f[2]::uuid in (select id from students where profile_id = auth.uid())
        or exists (select 1 from score_items si where si.id = f[1]::uuid and can_write_teaching_assignment(si.teaching_assignment_id));

    when 'avatars' then
      if p_op = 'read' then return true; end if;
      if p_op = 'delete' then return p_name = uid and not is_student(); end if;
      return (p_name = uid and not is_student()) or can_manage_users() or (p_name like 'students/%' and can_manage());

    when 'banners' then
      return p_op = 'read' or p_name = uid;

    when 'card-slips' then
      if p_op = 'delete' then return false; end if;
      if p_op = 'read' and is_org_wide() then return true; end if;
      return f[1]::uuid in (select student_id from guardianships where parent_id = auth.uid())
        or f[1]::uuid in (select s.id from students s join departments d on d.id = s.department_id
                          where s.profile_id = auth.uid() and d.code = 'SEC');

    when 'employee-documents' then
      return (p_op = 'read' and f[1] = uid)
        or (f[1] ~ '^[0-9a-f-]{36}$' and can_manage_hr_of(f[1]::uuid));

    when 'exam-question-images' then
      if p_op = 'read' then return true; end if;
      return exists (select 1 from exam_questions q where q.id = f[1]::uuid and can_write_bank_row(q.subject_id, q.plan_topic_id));

    when 'leave-attachments' then
      if p_op <> 'read' then return f[1] = uid; end if;
      return f[1] = uid
        or (can_manage() and (is_org_wide()
            or f[1]::uuid in (select id from profiles where department_id = auth_department())))
        or exists (select 1 from student_leave_requests r where r.attachment_path = p_name);

    when 'pos-products', 'school-assets' then
      return p_op = 'read' or is_org_wide();

    when 'tuition-invoices' then
      if p_op = 'delete' then return false; end if;
      if p_op = 'write' then return is_org_wide(); end if;
      return is_org_wide()
        or f[1]::uuid in (select id from students where profile_id = auth.uid())
        or f[1]::uuid in (select student_id from guardianships where parent_id = auth.uid());

    else
      return false;
  end case;
exception when others then
  return false;
end;
$$;

revoke all on function public.r2_authz(text, text, text) from public, anon;
grant execute on function public.r2_authz(text, text, text) to authenticated;
