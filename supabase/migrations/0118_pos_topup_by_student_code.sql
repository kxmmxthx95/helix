-- แคชเชียร์เติมเงินด้วยรหัสนักเรียน — a cashier could only reach a student through a
-- card swipe; org-wide could also pass a student id. Let any POS user pass the id
-- (can_pos() is already checked above), and add pos_student_by_code() so the id is
-- found by EXACT student_code. Cashiers still cannot list or search students.
-- pos_sale is untouched: it takes card_uid only, so a student code can top up but never charge.

create or replace function pos_student_by_code(p_code text) returns uuid
  language plpgsql stable security definer set search_path = public as $$
declare
  sid uuid;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  select id into sid from students where student_code = btrim(p_code);
  if not found then raise exception 'ไม่พบรหัสนักเรียนนี้'; end if;
  return sid;
end $$;
revoke execute on function pos_student_by_code(text) from public, anon;
grant execute on function pos_student_by_code(text) to authenticated;

create or replace function pos_lookup(p_card_uid text default null, p_student_id uuid default null) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  c student_cards;
  s students;
  sid uuid;
  room text;
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
    select * into c from student_cards where student_id = sid and status <> 'replaced';
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
  select daily_limit into lim from student_wallets where student_id = sid;

  return jsonb_build_object(
    'student_id', sid,
    'student_code', s.student_code,
    'name', coalesce(s.prefix, '') || s.first_name || ' ' || s.last_name,
    'avatar_path', s.avatar_path,
    'avatar_updated_at', s.updated_at,
    'classroom', room,
    'balance', _wallet_balance(sid),
    'daily_limit', lim,
    'spent_today', _spent_today(sid),
    'card_status', c.status
  );
end $$;

create or replace function pos_topup_cash(
  p_card_uid text, p_student_id uuid, p_amount numeric, p_terminal_id uuid, p_pin text, p_client_tx_id uuid default null
) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
  sid uuid;
  pin jsonb;
  bal numeric;
  tx uuid;
  prior card_transactions;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  perform _check_amount(p_amount, 20, 5000);
  perform _check_terminal(p_terminal_id);
  if p_pin is null or p_pin !~ '^\d{6}$' then raise exception 'PIN ต้องเป็นตัวเลข 6 หลัก'; end if;

  if p_card_uid is not null then
    select * into c from student_cards where card_uid = btrim(p_card_uid);
    if not found then raise exception 'ไม่พบบัตรนี้ในระบบ'; end if;
    if c.status = 'replaced' then raise exception 'บัตรนี้ถูกแทนที่ด้วยบัตรใหม่แล้ว'; end if;
    sid := c.student_id;
  elsif p_student_id is not null then
    sid := p_student_id;
    select * into c from student_cards where student_id = sid and status <> 'replaced';
  else
    raise exception 'ต้องระบุบัตร';
  end if;

  pin := _pin_verify(p_pin);
  if pin ->> 'status' <> 'ok' then
    return pin || jsonb_build_object('ok', false);
  end if;

  perform _wallet_lock(sid);
  if p_client_tx_id is not null then
    select * into prior from card_transactions where client_tx_id = p_client_tx_id;
    if found then
      if prior.recorded_by <> auth.uid() or prior.student_id <> sid or prior.type <> 'topup_cash' or prior.amount <> p_amount then
        raise exception 'รายการนี้ถูกบันทึกไปแล้วด้วยข้อมูลที่ต่างกัน — ตรวจที่ "รายการวันนี้" ก่อนทำซ้ำ';
      end if;
      return jsonb_build_object('ok', true, 'tx_id', prior.id, 'amount', p_amount, 'balance', _wallet_balance(sid), 'replayed', true);
    end if;
  end if;

  insert into card_transactions (student_id, card_id, type, amount, terminal_id, recorded_by, client_tx_id)
  values (sid, c.id, 'topup_cash', p_amount, p_terminal_id, auth.uid(), p_client_tx_id)
  returning id into tx;
  bal := _wallet_balance(sid);
  return jsonb_build_object('ok', true, 'tx_id', tx, 'amount', p_amount, 'balance', bal);
end $$;
