-- Student PIN for big card sales. A cloned 125 kHz card (EM4100) carries no secret, so a sale at or
-- above the threshold must also present the student's 4-digit PIN. Same shape as the cashier PIN:
-- bcrypt in a table no client can read, 5 wrong tries lock it for 15 minutes, and a wrong PIN is
-- RETURNED (not raised) so the attempt counter commits. A student with no PIN set is not asked
-- (soft rollout); set by the student or a guardian, reset (cleared) by org-wide staff.

create table student_pins (
  student_id      uuid primary key references students on delete cascade,
  pin_hash        text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);
alter table student_pins enable row level security;
revoke all on student_pins from anon, authenticated;

-- One row: the sale amount (baht) from which the PIN is required.
create table card_settings (
  id            boolean primary key default true check (id),
  pin_threshold numeric not null default 100 check (pin_threshold >= 1 and pin_threshold <= 500)
);
insert into card_settings default values;
alter table card_settings enable row level security;
revoke all on card_settings from anon, authenticated;

create or replace function card_settings_get() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์'; end if;
  return (select jsonb_build_object('pin_threshold', pin_threshold) from card_settings);
end $$;

create or replace function card_settings_set(p_pin_threshold numeric) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_pin_threshold is null or p_pin_threshold < 1 or p_pin_threshold > 500 or p_pin_threshold <> round(p_pin_threshold) then
    raise exception 'ยอดต้องเป็นจำนวนเต็ม 1–500 บาท';
  end if;
  update card_settings set pin_threshold = p_pin_threshold;
end $$;

create or replace function card_pin_status(p_student_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not _can_view_student(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  return jsonb_build_object(
    'has_pin', exists (select 1 from student_pins where student_id = p_student_id),
    'pin_threshold', (select pin_threshold from card_settings)
  );
end $$;

-- The student themselves or a guardian. Org-wide staff can only reset, never set, so nobody at school knows a PIN.
create or replace function card_set_pin(p_student_id uuid, p_pin text) returns void
  language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (_is_guardian(p_student_id) or exists (select 1 from students where id = p_student_id and profile_id = auth.uid())) then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN ต้องเป็นตัวเลข 4 หลัก'; end if;
  insert into student_pins (student_id, pin_hash) values (p_student_id, crypt(p_pin, gen_salt('bf')))
  on conflict (student_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end $$;

create or replace function card_reset_pin(p_student_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  delete from student_pins where student_id = p_student_id;
end $$;

-- 'ok' | 'no_pin' | 'locked' | 'bad' (+ attempts_left). Returns instead of raising so the counter commits.
create or replace function _student_pin_verify(p_student_id uuid, p_pin text) returns jsonb
  language plpgsql security definer set search_path = public, extensions as $$
declare
  r student_pins;
  n int;
begin
  select * into r from student_pins where student_id = p_student_id for update;
  if not found then return jsonb_build_object('status', 'no_pin'); end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', r.locked_until);
  end if;
  if r.pin_hash = crypt(p_pin, r.pin_hash) then
    update student_pins set failed_attempts = 0, locked_until = null, updated_at = now() where student_id = p_student_id;
    return jsonb_build_object('status', 'ok');
  end if;
  n := r.failed_attempts + 1;
  if n >= 5 then
    update student_pins set failed_attempts = 0, locked_until = now() + interval '15 minutes', updated_at = now() where student_id = p_student_id;
    return jsonb_build_object('status', 'locked', 'locked_until', now() + interval '15 minutes');
  end if;
  update student_pins set failed_attempts = n, updated_at = now() where student_id = p_student_id;
  return jsonb_build_object('status', 'bad', 'attempts_left', 5 - n);
end $$;

revoke execute on function _student_pin_verify(uuid, text) from public, anon, authenticated;
revoke execute on function card_settings_get(), card_settings_set(numeric), card_pin_status(uuid),
  card_set_pin(uuid, text), card_reset_pin(uuid) from public, anon;
grant execute on function card_settings_get(), card_settings_set(numeric), card_pin_status(uuid),
  card_set_pin(uuid, text), card_reset_pin(uuid) to authenticated;

-- ------------------------------------------------------------ sale with PIN
-- p_pin is new, so the old signatures are dropped (create-or-replace would leave an ambiguous overload).
drop function pos_sale_items(text, jsonb, uuid, uuid);
drop function pos_sale(text, numeric, uuid, uuid);

-- Result is {ok:true,...} or, when the PIN gate stops it, {ok:false, status:'pin_required'|'bad'|'locked', ...}.
-- Every check that can RAISE runs before the PIN check, so a failed attempt is never rolled back.
create or replace function pos_sale(
  p_card_uid text, p_amount numeric, p_terminal_id uuid default null, p_client_tx_id uuid default null, p_pin text default null
) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
  lim numeric;
  bal numeric;
  tx uuid;
  prior card_transactions;
  thr numeric;
  v jsonb;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  perform _check_amount(p_amount, 1, 500);
  perform _check_terminal(p_terminal_id);
  select * into c from student_cards where card_uid = btrim(p_card_uid);
  if not found then raise exception 'ไม่พบบัตรนี้ในระบบ'; end if;
  if c.status = 'frozen' then
    raise exception '%', case when c.frozen_by = 'school' then 'บัตรถูกระงับโดยโรงเรียน — ติดต่อฝ่ายการเงิน' else 'บัตรนี้ถูกระงับการใช้งาน' end;
  end if;
  if c.status <> 'active' then raise exception 'บัตรนี้ถูกแทนที่ด้วยบัตรใหม่แล้ว'; end if;

  lim := _wallet_lock(c.student_id);
  if p_client_tx_id is not null then
    select * into prior from card_transactions where client_tx_id = p_client_tx_id;
    if found then
      if prior.recorded_by <> auth.uid() or prior.student_id <> c.student_id or prior.type <> 'sale' or -prior.amount <> p_amount then
        raise exception 'รายการนี้ถูกบันทึกไปแล้วด้วยข้อมูลที่ต่างกัน — ตรวจที่ "รายการวันนี้" ก่อนทำซ้ำ';
      end if;
      return jsonb_build_object('ok', true, 'tx_id', prior.id, 'amount', p_amount, 'balance', _wallet_balance(c.student_id), 'replayed', true);
    end if;
  end if;

  bal := _wallet_balance(c.student_id);
  if bal < p_amount then raise exception 'ยอดคงเหลือไม่พอ (เหลือ % บาท)', bal; end if;
  if lim is not null and _spent_today(c.student_id) + p_amount > lim then
    raise exception 'เกินวงเงินใช้จ่ายต่อวัน (% บาท)', lim;
  end if;

  -- PIN gate: only for a student who has set a PIN, and only at or above the threshold.
  select pin_threshold into thr from card_settings;
  if p_amount >= thr and exists (select 1 from student_pins where student_id = c.student_id) then
    if p_pin is null or p_pin = '' then
      return jsonb_build_object('ok', false, 'status', 'pin_required');
    end if;
    v := _student_pin_verify(c.student_id, p_pin);
    if v->>'status' <> 'ok' then
      return jsonb_build_object('ok', false) || v;
    end if;
  end if;

  insert into card_transactions (student_id, card_id, type, amount, terminal_id, recorded_by, client_tx_id)
  values (c.student_id, c.id, 'sale', -p_amount, p_terminal_id, auth.uid(), p_client_tx_id)
  returning id into tx;
  return jsonb_build_object('ok', true, 'tx_id', tx, 'amount', p_amount, 'balance', bal - p_amount);
end $$;

create or replace function pos_sale_items(
  p_card_uid text, p_items jsonb, p_terminal_id uuid default null, p_client_tx_id uuid default null, p_pin text default null
) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  total numeric := 0;
  res jsonb;
  n integer;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ตะกร้าว่างเปล่า';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) i
    where jsonb_typeof(i) <> 'object' or i->>'product_id' is null or (i->>'qty') !~ '^[0-9]{1,2}$' or (i->>'qty')::integer < 1
  ) then
    raise exception 'จำนวนสินค้าไม่ถูกต้อง';
  end if;
  select sum(p.price * c.qty), count(*) into total, n from (
    select (i->>'product_id')::uuid as product_id, sum((i->>'qty')::integer) as qty
    from jsonb_array_elements(p_items) i group by 1
  ) c left join pos_products p on p.id = c.product_id and p.active;
  if exists (
    select 1 from (select (i->>'product_id')::uuid as product_id from jsonb_array_elements(p_items) i) c
    left join pos_products p on p.id = c.product_id and p.active where p.id is null
  ) then
    raise exception 'มีสินค้าที่ไม่พบหรือปิดขายแล้ว';
  end if;
  if exists (
    select 1 from (select (i->>'product_id')::uuid as product_id, sum((i->>'qty')::integer) as qty
                   from jsonb_array_elements(p_items) i group by 1) c where c.qty > 99
  ) then
    raise exception 'จำนวนสินค้าไม่ถูกต้อง';
  end if;

  res := pos_sale(p_card_uid, total, p_terminal_id, p_client_tx_id, p_pin);

  -- The PIN gate stopped the sale: nothing was written, so no line items either.
  if not coalesce((res->>'ok')::boolean, false) then return res; end if;

  -- A replayed request (lost response, same client_tx_id) already has its items.
  if not coalesce((res->>'replayed')::boolean, false) then
    insert into card_sale_items (tx_id, product_id, code, name, price, qty)
    select (res->>'tx_id')::uuid, p.id, p.code, p.name, p.price, c.qty
    from (select (i->>'product_id')::uuid as product_id, sum((i->>'qty')::integer)::integer as qty
          from jsonb_array_elements(p_items) i group by 1) c
    join pos_products p on p.id = c.product_id;
  end if;
  return res;
end $$;

revoke execute on function pos_sale(text, numeric, uuid, uuid, text), pos_sale_items(text, jsonb, uuid, uuid, text) from public, anon;
grant execute on function pos_sale(text, numeric, uuid, uuid, text), pos_sale_items(text, jsonb, uuid, uuid, text) to authenticated;
