-- pos_lookup also returns the student's department name for the POS student card badge.
create or replace function pos_lookup(p_card_uid text default null, p_student_id uuid default null) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  c student_cards;
  s students;
  sid uuid;
  room text;
  dept text;
  lim numeric;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  if p_card_uid is not null then
    select * into c from student_cards where card_uid = btrim(p_card_uid);
    if not found then raise exception 'ไม่พบบัตรนี้ในระบบ'; end if;
    if c.status = 'replaced' then raise exception 'บัตรนี้ถูกแทนที่ด้วยบัตรใหม่แล้ว'; end if;
    sid := c.student_id;
  elsif p_student_id is not null then
    sid := p_student_id;
    c := _live_card(sid);
  else
    raise exception 'ต้องระบุบัตร';
  end if;

  select * into s from students where id = sid;
  if not found then raise exception 'ไม่พบนักเรียน'; end if;
  select gl.name || '/' || cr.name into room
    from student_classroom_enrollments e
    join classrooms cr on cr.id = e.classroom_id
    join grade_levels gl on gl.id = cr.grade_level_id
    where e.student_id = sid order by e.created_at desc limit 1;
  if room is null then select name into room from grade_levels where id = s.grade_level_id; end if;
  select name into dept from departments where id = s.department_id;
  select daily_limit into lim from student_wallets where student_id = sid;

  return jsonb_build_object(
    'student_id', sid,
    'student_code', s.student_code,
    'name', coalesce(s.prefix, '') || s.first_name || ' ' || s.last_name,
    'avatar_path', s.avatar_path,
    'avatar_updated_at', s.updated_at,
    'classroom', room,
    'department', dept,
    'balance', _wallet_balance(sid),
    'daily_limit', lim,
    'spent_today', _spent_today(sid),
    'card_status', c.status
  );
end $$;
