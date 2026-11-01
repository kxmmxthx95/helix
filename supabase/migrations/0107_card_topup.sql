-- บัตรเติมเงิน — stored-value student card + mini POS (PR 1: cash top-up and
-- sales; slip top-up is reserved as a type, no UI yet).
--
-- Helix owns the balance. card_transactions is an append-only ledger with a
-- signed amount (top-ups > 0, sales / cash-outs < 0); balance = sum of
-- non-voided rows. Like tuition_payments, money is never deleted or edited: a
-- row is voided via voided_at/void_reason and there is no DELETE policy. The
-- balance belongs to the student, not the card — replacing a card only marks
-- the old student_cards row 'replaced'.
--
-- Every rule (balance >= 0, per-day limit by Asia/Bangkok day, card active and
-- not frozen, amount bounds, cashier PIN) lives in SECURITY DEFINER functions
-- below, never the client. Clients get NO insert/update policy on the ledger:
-- they must go through the RPCs. student_wallets exists so each student has one
-- row to `select ... for update`, which serialises two terminals selling at once.
--
-- Access: org-wide (is_org_wide(): super_admin, director, staff) reads/writes
-- cards, wallets and terminals. A cashier gets nothing from tables except the
-- terminal list; everything else (swiped student's name/photo/class/balance,
-- own shift totals) is returned by RPCs. A student / parent reads their own /
-- their children's ledger and wallet via the same guardianships path as tuition
-- (0095); card_uid is org-wide-only (it is a swipe credential).
--
-- Cashier PIN: 6 digits, chosen on first use, bcrypt via pgcrypto (0001). The
-- hash sits in cashier_pins, which has RLS on and NO policy, so no client can
-- read it, and it is deliberately not audited (log_audit would copy the hash
-- into audit_logs). 5 wrong tries lock top-up for 15 minutes. A wrong PIN is
-- returned as a result, not raised, because a raise would roll back the
-- failed-attempt counter.

-- ------------------------------------------------------------------ tables
create table pos_terminals (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (btrim(name) <> ''),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per student: carries the daily limit (null = unlimited; the parent
-- sets it in PR 2) and is the row locked during every money movement.
create table student_wallets (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null unique references students on delete cascade,
  daily_limit numeric(12,2) check (daily_limit is null or daily_limit > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table student_cards (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students on delete cascade,
  card_uid   text not null unique check (card_uid = btrim(card_uid) and card_uid <> ''),
  status     text not null default 'active' check (status in ('active', 'frozen', 'replaced')),
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one live (active or frozen) card per student.
create unique index student_cards_one_live on student_cards (student_id) where status <> 'replaced';

create table card_transactions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students on delete restrict,
  card_id     uuid references student_cards on delete set null,
  type        text not null check (type in ('topup_cash', 'topup_slip', 'sale', 'refund_withdraw')),
  amount      numeric(12,2) not null,
  terminal_id uuid references pos_terminals on delete set null,
  note        text,
  voided_at   timestamptz,
  void_reason text,
  recorded_by uuid not null references profiles on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((voided_at is null) = (void_reason is null)),
  check ((type in ('topup_cash', 'topup_slip') and amount > 0) or (type in ('sale', 'refund_withdraw') and amount < 0))
);
create index card_transactions_student_idx on card_transactions (student_id, created_at desc);
create index card_transactions_recorder_idx on card_transactions (recorded_by, created_at desc);

create table cashier_pins (
  profile_id      uuid primary key references profiles on delete cascade,
  pin_hash        text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);
revoke all on cashier_pins from anon, authenticated;

create trigger pos_terminals_touch before update on pos_terminals for each row execute function touch_updated_at();
create trigger student_wallets_touch before update on student_wallets for each row execute function touch_updated_at();
create trigger student_cards_touch before update on student_cards for each row execute function touch_updated_at();
create trigger card_transactions_touch before update on card_transactions for each row execute function touch_updated_at();
create trigger pos_terminals_audit after insert or update or delete on pos_terminals for each row execute function log_audit();
create trigger student_wallets_audit after insert or update or delete on student_wallets for each row execute function log_audit();
create trigger student_cards_audit after insert or update or delete on student_cards for each row execute function log_audit();
create trigger card_transactions_audit after insert or update or delete on card_transactions for each row execute function log_audit();

-- Only voiding is allowed after the fact; the money fields are frozen.
create or replace function check_card_transaction_immutable() returns trigger
  language plpgsql as $$
begin
  if old.voided_at is not null
    or (new.id, new.student_id, new.card_id, new.type, new.amount, new.terminal_id, new.note, new.recorded_by, new.created_at)
       is distinct from (old.id, old.student_id, old.card_id, old.type, old.amount, old.terminal_id, old.note, old.recorded_by, old.created_at) then
    raise exception 'card transaction is immutable; void it instead';
  end if;
  return new;
end $$;
create trigger card_transactions_immutable before update on card_transactions
  for each row execute function check_card_transaction_immutable();

-- --------------------------------------------------------------------- RLS
create or replace function is_cashier() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from profile_roles where profile_id = auth.uid() and role = 'cashier')
$$;

create or replace function can_pos() returns boolean
  language sql stable security definer set search_path = public
as $$
  select is_cashier() or is_org_wide()
$$;

alter table pos_terminals enable row level security;
alter table student_wallets enable row level security;
alter table student_cards enable row level security;
alter table card_transactions enable row level security;
alter table cashier_pins enable row level security;

create policy pos_terminals_read on pos_terminals for select to authenticated using (can_pos());
create policy pos_terminals_insert on pos_terminals for insert to authenticated with check (is_org_wide());
create policy pos_terminals_update on pos_terminals for update to authenticated using (is_org_wide()) with check (is_org_wide());

-- Binding goes through card_bind(); org-wide may then freeze / unfreeze directly.
create policy student_cards_read on student_cards for select to authenticated using (is_org_wide());
create policy student_cards_update on student_cards for update to authenticated using (is_org_wide()) with check (is_org_wide());

create policy student_wallets_read on student_wallets
  for select to authenticated using (
    is_org_wide()
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );
create policy student_wallets_insert on student_wallets for insert to authenticated with check (is_org_wide());
create policy student_wallets_update on student_wallets for update to authenticated using (is_org_wide()) with check (is_org_wide());

-- Read-only for clients: every write is an RPC below.
create policy card_transactions_read on card_transactions
  for select to authenticated using (
    is_org_wide()
    or student_id in (select id from students where profile_id = auth.uid())
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );

-- --------------------------------------------------------- internal helpers
-- Not callable by clients; only the RPCs below use them.
create or replace function _bkk_day_start() returns timestamptz
  language sql stable as $$
  select date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
$$;

-- Ensures the wallet row exists, locks it, returns the daily limit.
create or replace function _wallet_lock(p_student uuid) returns numeric
  language plpgsql security definer set search_path = public as $$
declare
  lim numeric;
begin
  insert into student_wallets (student_id) values (p_student) on conflict (student_id) do nothing;
  select daily_limit into lim from student_wallets where student_id = p_student for update;
  return lim;
end $$;

create or replace function _wallet_balance(p_student uuid) returns numeric
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from card_transactions where student_id = p_student and voided_at is null
$$;

create or replace function _spent_today(p_student uuid) returns numeric
  language sql stable security definer set search_path = public as $$
  select coalesce(-sum(amount), 0) from card_transactions
  where student_id = p_student and type = 'sale' and voided_at is null and created_at >= _bkk_day_start()
$$;

create or replace function _check_amount(p_amount numeric, p_min numeric, p_max numeric) returns void
  language plpgsql immutable as $$
begin
  if p_amount is null or p_amount <> round(p_amount, 2) or p_amount < p_min or p_amount > p_max then
    raise exception 'จำนวนเงินต้องอยู่ระหว่าง % – % บาท', p_min, p_max;
  end if;
end $$;

create or replace function _check_terminal(p_terminal uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if p_terminal is not null and not exists (select 1 from pos_terminals where id = p_terminal and active) then
    raise exception 'เครื่องขายนี้ถูกปิดใช้งานหรือไม่มีอยู่';
  end if;
end $$;

-- 'ok' | 'no_pin' | 'locked' | 'bad' (+ attempts_left). Returns instead of raising so the counter commits.
create or replace function _pin_verify(p_pin text) returns jsonb
  language plpgsql security definer set search_path = public, extensions as $$
declare
  r cashier_pins;
  n int;
begin
  select * into r from cashier_pins where profile_id = auth.uid() for update;
  if not found then return jsonb_build_object('status', 'no_pin'); end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', r.locked_until);
  end if;
  if r.pin_hash = crypt(p_pin, r.pin_hash) then
    update cashier_pins set failed_attempts = 0, locked_until = null, updated_at = now() where profile_id = auth.uid();
    return jsonb_build_object('status', 'ok');
  end if;
  n := r.failed_attempts + 1;
  if n >= 5 then
    update cashier_pins set failed_attempts = 0, locked_until = now() + interval '15 minutes', updated_at = now()
      where profile_id = auth.uid();
    return jsonb_build_object('status', 'locked', 'locked_until', now() + interval '15 minutes');
  end if;
  update cashier_pins set failed_attempts = n, updated_at = now() where profile_id = auth.uid();
  return jsonb_build_object('status', 'bad', 'attempts_left', 5 - n);
end $$;

revoke execute on function _bkk_day_start(), _wallet_lock(uuid), _wallet_balance(uuid), _spent_today(uuid),
  _check_amount(numeric, numeric, numeric), _check_terminal(uuid), _pin_verify(text)
  from public, anon, authenticated;

-- --------------------------------------------------------------------- RPCs
-- What the cashier sees of the swiped student — name, photo, class, balance —
-- without any read access to students. Org-wide may look up by student id too.
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
  elsif p_student_id is not null and is_org_wide() then
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

create or replace function pos_sale(p_card_uid text, p_amount numeric, p_terminal_id uuid default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
  lim numeric;
  bal numeric;
  tx uuid;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  perform _check_amount(p_amount, 1, 500);
  perform _check_terminal(p_terminal_id);
  select * into c from student_cards where card_uid = btrim(p_card_uid);
  if not found then raise exception 'ไม่พบบัตรนี้ในระบบ'; end if;
  if c.status = 'frozen' then raise exception 'บัตรนี้ถูกระงับการใช้งาน'; end if;
  if c.status <> 'active' then raise exception 'บัตรนี้ถูกแทนที่ด้วยบัตรใหม่แล้ว'; end if;

  lim := _wallet_lock(c.student_id);
  bal := _wallet_balance(c.student_id);
  if bal < p_amount then raise exception 'ยอดคงเหลือไม่พอ (เหลือ % บาท)', bal; end if;
  if lim is not null and _spent_today(c.student_id) + p_amount > lim then
    raise exception 'เกินวงเงินใช้จ่ายต่อวัน (% บาท)', lim;
  end if;

  insert into card_transactions (student_id, card_id, type, amount, terminal_id, recorded_by)
  values (c.student_id, c.id, 'sale', -p_amount, p_terminal_id, auth.uid())
  returning id into tx;
  return jsonb_build_object('ok', true, 'tx_id', tx, 'amount', p_amount, 'balance', bal - p_amount);
end $$;

create or replace function pos_topup_cash(
  p_card_uid text, p_student_id uuid, p_amount numeric, p_terminal_id uuid, p_pin text
) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  c student_cards;
  sid uuid;
  pin jsonb;
  bal numeric;
  tx uuid;
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
  elsif p_student_id is not null and is_org_wide() then
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
  insert into card_transactions (student_id, card_id, type, amount, terminal_id, recorded_by)
  values (sid, c.id, 'topup_cash', p_amount, p_terminal_id, auth.uid())
  returning id into tx;
  bal := _wallet_balance(sid);
  return jsonb_build_object('ok', true, 'tx_id', tx, 'amount', p_amount, 'balance', bal);
end $$;

-- Cashier: own sale / cash top-up, same Bangkok day. Org-wide: anything.
create or replace function pos_void(p_tx_id uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  tx card_transactions;
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'ต้องระบุเหตุผลที่ยกเลิก'; end if;
  select * into tx from card_transactions where id = p_tx_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if not is_org_wide()
    and (tx.recorded_by <> auth.uid() or tx.type not in ('sale', 'topup_cash') or tx.created_at < _bkk_day_start()) then
    raise exception 'ยกเลิกได้เฉพาะรายการขาย/เติมเงินสดของตนเองในวันนี้';
  end if;
  if tx.voided_at is not null then raise exception 'รายการนี้ถูกยกเลิกแล้ว'; end if;

  perform _wallet_lock(tx.student_id);
  if tx.amount > 0 and _wallet_balance(tx.student_id) < tx.amount then
    raise exception 'ยกเลิกไม่ได้ เพราะยอดคงเหลือไม่พอ (เงินที่เติมถูกใช้ไปแล้ว)';
  end if;
  update card_transactions set voided_at = now(), void_reason = btrim(p_reason) where id = tx.id;
  return jsonb_build_object('ok', true, 'balance', _wallet_balance(tx.student_id));
end $$;

-- Cash-out at graduation / transfer. Org-wide only.
create or replace function card_refund_withdraw(p_student_id uuid, p_amount numeric, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  bal numeric;
  card uuid;
  tx uuid;
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  perform _check_amount(p_amount, 0.01, 1000000);
  perform _wallet_lock(p_student_id);
  bal := _wallet_balance(p_student_id);
  if p_amount > bal then raise exception 'ยอดคงเหลือไม่พอ (เหลือ % บาท)', bal; end if;
  select id into card from student_cards where student_id = p_student_id and status <> 'replaced';
  insert into card_transactions (student_id, card_id, type, amount, note, recorded_by)
  values (p_student_id, card, 'refund_withdraw', -p_amount, nullif(btrim(p_note), ''), auth.uid())
  returning id into tx;
  return jsonb_build_object('ok', true, 'tx_id', tx, 'balance', bal - p_amount);
end $$;

-- Bind a card to a student; any other live card of theirs becomes 'replaced'.
-- Re-binding a card already theirs just reactivates it.
create or replace function card_bind(p_student_id uuid, p_card_uid text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  uid text := btrim(p_card_uid);
  c student_cards;
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  if uid is null or uid = '' or length(uid) > 64 then raise exception 'เลขบัตรไม่ถูกต้อง'; end if;
  if not exists (select 1 from students where id = p_student_id) then raise exception 'ไม่พบนักเรียน'; end if;
  perform _wallet_lock(p_student_id);
  select * into c from student_cards where card_uid = uid;
  if found and c.student_id <> p_student_id then raise exception 'บัตรนี้ผูกกับนักเรียนคนอื่นอยู่แล้ว'; end if;
  update student_cards set status = 'replaced'
    where student_id = p_student_id and status <> 'replaced' and card_uid <> uid;
  if c.id is not null then
    update student_cards set status = 'active' where id = c.id;
  else
    insert into student_cards (student_id, card_uid, created_by) values (p_student_id, uid, auth.uid());
  end if;
end $$;

create or replace function cashier_pin_status() returns jsonb
  language sql stable security definer set search_path = public as $$
  select case when can_pos() then jsonb_build_object(
    'has_pin', exists (select 1 from cashier_pins where profile_id = auth.uid()),
    'locked_until', (select locked_until from cashier_pins where profile_id = auth.uid() and locked_until > now())
  ) end
$$;

-- First use only; changing a PIN is an org-wide reset followed by a new first use.
create or replace function cashier_pin_set(p_pin text) returns void
  language plpgsql security definer set search_path = public, extensions as $$
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  if p_pin is null or p_pin !~ '^\d{6}$' then raise exception 'PIN ต้องเป็นตัวเลข 6 หลัก'; end if;
  if exists (select 1 from cashier_pins where profile_id = auth.uid()) then
    raise exception 'ตั้ง PIN ไว้แล้ว — ให้ผู้ดูแลรีเซ็ตก่อน';
  end if;
  insert into cashier_pins (profile_id, pin_hash) values (auth.uid(), crypt(p_pin, gen_salt('bf')));
end $$;

create or replace function cashier_pin_reset(p_profile_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  delete from cashier_pins where profile_id = p_profile_id;
end $$;

-- The caller's own shift today (Asia/Bangkok): totals plus their rows for the void list.
create or replace function pos_my_today() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not can_pos() then raise exception 'ไม่มีสิทธิ์ใช้งานบัตรเติมเงิน'; end if;
  return jsonb_build_object(
    'sales_count', (select count(*) from card_transactions
      where recorded_by = auth.uid() and type = 'sale' and voided_at is null and created_at >= _bkk_day_start()),
    'sales_total', (select coalesce(-sum(amount), 0) from card_transactions
      where recorded_by = auth.uid() and type = 'sale' and voided_at is null and created_at >= _bkk_day_start()),
    'topup_total', (select coalesce(sum(amount), 0) from card_transactions
      where recorded_by = auth.uid() and type = 'topup_cash' and voided_at is null and created_at >= _bkk_day_start()),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'type', t.type, 'amount', t.amount, 'created_at', t.created_at,
        'voided_at', t.voided_at, 'student_name', coalesce(s.prefix, '') || s.first_name || ' ' || s.last_name
      ) order by t.created_at desc)
      from (select * from card_transactions
            where recorded_by = auth.uid() and created_at >= _bkk_day_start()
            order by created_at desc limit 50) t
      join students s on s.id = t.student_id
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function pos_lookup(text, uuid), pos_sale(text, numeric, uuid),
  pos_topup_cash(text, uuid, numeric, uuid, text), pos_void(uuid, text),
  card_refund_withdraw(uuid, numeric, text), card_bind(uuid, text), cashier_pin_status(),
  cashier_pin_set(text), cashier_pin_reset(uuid), pos_my_today() from public, anon;
grant execute on function pos_lookup(text, uuid), pos_sale(text, numeric, uuid),
  pos_topup_cash(text, uuid, numeric, uuid, text), pos_void(uuid, text),
  card_refund_withdraw(uuid, numeric, text), card_bind(uuid, text), cashier_pin_status(),
  cashier_pin_set(text), cashier_pin_reset(uuid), pos_my_today() to authenticated;
