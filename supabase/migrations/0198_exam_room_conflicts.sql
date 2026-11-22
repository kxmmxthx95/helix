-- Other exam sessions that use the same room at an overlapping time, for the warning in the schedule drawer.
-- SECURITY DEFINER because RLS hides other teachers' sessions; it only returns title, exam, times and the
-- teacher's name, and only for rooms in the caller's own department (org-wide roles: any room).
-- Back-to-back sessions (one closes exactly when the next opens) do not overlap.
create or replace function exam_room_conflicts(p_room uuid, p_opens timestamptz, p_closes timestamptz, p_exclude uuid default null)
  returns table (session_id uuid, title text, exam_type text, round int, opens_at timestamptz, closes_at timestamptz, teacher_name text)
  language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบ';
  end if;
  if not exists (
    select 1 from rooms r where r.id = p_room and (r.department_id = auth_department() or is_org_wide())
  ) then
    return;
  end if;
  return query
    select es.id, es.title, es.exam_type, es.round, es.opens_at, es.closes_at,
           trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    from exam_sessions es
    left join profiles p on p.id = es.teacher_id
    where es.room_id = p_room
      and es.id is distinct from p_exclude
      and es.opens_at is not null
      and es.opens_at < p_closes
      and es.closes_at > p_opens
    order by es.opens_at;
end $$;

revoke execute on function exam_room_conflicts(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function exam_room_conflicts(uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;
