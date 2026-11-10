-- my_attendance_covers: also return the leave owner's profile photo so the
-- dashboard cover card can show who the teacher is covering for.
drop function if exists my_attendance_covers(date, date);
create function my_attendance_covers(p_from date, p_to date)
  returns table (
    id uuid, date date, status cover_status, classroom_id uuid, schedule_entry_id uuid,
    label text, owner_name text, leave_status leave_status,
    room_label text, period_no smallint, subject_code text, subject_name text,
    owner_avatar_path text, owner_updated_at timestamptz
  )
  language sql stable security definer set search_path = public as $$
  select ac.id, ac.date, ac.status,
         coalesce(ac.classroom_id, ta.classroom_id), ac.schedule_entry_id,
         case when ac.classroom_id is not null
           then 'เช็คชื่อเข้าแถว ' || gl.name || '/' || c.name
           else 'คาบ ' || se.period_no || ' ' || gl.name || '/' || c.name end,
         p.first_name || ' ' || p.last_name,
         lr.status,
         gl.name || '/' || c.name, se.period_no, sub.code, sub.name_th,
         p.avatar_path, p.updated_at
  from attendance_covers ac
  join leave_requests lr on lr.id = ac.leave_request_id
  join profiles p on p.id = lr.profile_id
  left join schedule_entries se on se.id = ac.schedule_entry_id
  left join teaching_assignments ta on ta.id = se.teaching_assignment_id
  left join subjects sub on sub.id = ta.subject_id
  join classrooms c on c.id = coalesce(ac.classroom_id, ta.classroom_id)
  join grade_levels gl on gl.id = c.grade_level_id
  where ac.cover_staff_id = auth.uid()
    and ac.date between p_from and p_to
    and ac.status in ('pending', 'confirmed')
  order by ac.date, se.period_no nulls first
$$;
