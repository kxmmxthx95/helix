-- บัตรเติมเงิน PR 2 — parent / student portal, PromptPay slips, LINE notices.
--
-- Parents top up by transferring to the school's PromptPay (shown from
-- school_settings) and uploading the slip: that creates a card_slip_requests row
-- (pending). Org-wide staff approve in an RPC that locks the request, inserts the
-- topup_slip ledger row and flips the status in one transaction, so a request can
-- never be approved twice. Staff may correct the amount first; rejecting needs a
-- reason. No OCR — a person reads the slip. Slip images live in the private
-- card-slips bucket, laid out and scoped like tuition-invoices (0095).
--
-- A parent may set the child's daily limit and freeze / unfreeze the card through
-- RPCs (no table write access). A student has read-only access. Both read their
-- balance through card_portal_summary() because cards (card_uid is a swipe
-- credential) stay org-wide-only.
--
-- LINE: one AFTER INSERT trigger on the ledger queues a message for every
-- guardian on any top-up (cash or slip); slip rejection queues one for the
-- requester. Sales never notify. Same line_notifications queue as 0040.

alter table school_settings
  add column promptpay_id text,
  add column promptpay_qr_path text; -- object path in school-assets, same bucket as the logo

-- --------------------------------------------------------------- helpers
create or replace function _is_guardian(p_student uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardianships where parent_id = auth.uid() and student_id = p_student)
$$;

create or replace function _can_view_student(p_student uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_org_wide() or _is_guardian(p_student)
    or exists (select 1 from students where id = p_student and profile_id = auth.uid())
$$;

create or replace function _notify_guardians(p_student uuid, p_message text) returns void
  language sql security definer set search_path = public as $$
  insert into line_notifications (profile_id, message)
  select parent_id, p_message from guardianships where student_id = p_student
$$;

revoke execute on function _is_guardian(uuid), _can_view_student(uuid), _notify_guardians(uuid, text)
  from public, anon, authenticated;

create or replace function notify_card_topup() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  nm text;
begin
  if new.type in ('topup_cash', 'topup_slip') then
    select first_name into nm from students where id = new.student_id;
    perform _notify_guardians(
      new.student_id,
      'เติมเงินบัตรของ ' || nm || ' จำนวน ' || to_char(new.amount, 'FM999,990.00') ||
        ' บาท ยอดคงเหลือ ' || to_char(_wallet_balance(new.student_id), 'FM999,999,990.00') || ' บาท'
    );
  end if;
  return new;
end $$;
create trigger card_transactions_notify after insert on card_transactions
  for each row execute function notify_card_topup();

-- ------------------------------------------------------------ slip requests
create table card_slip_requests (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references students on delete restrict,
  requested_by    uuid not null references profiles on delete restrict,
  amount          numeric(12,2) not null check (amount >= 20 and amount <= 5000),
  transferred_at  timestamptz not null,
  slip_path       text not null,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_amount numeric(12,2),
  reject_reason   text,
  reviewed_by     uuid references profiles on delete restrict,
  reviewed_at     timestamptz,
  tx_id           uuid references card_transactions on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status = 'approved') = (tx_id is not null)),
  check ((status = 'rejected') = (reject_reason is not null)),
  check ((status = 'pending') = (reviewed_by is null))
);
create index card_slip_requests_student_idx on card_slip_requests (student_id, created_at desc);
create index card_slip_requests_status_idx on card_slip_requests (status, created_at);

create trigger card_slip_requests_touch before update on card_slip_requests
  for each row execute function touch_updated_at();
create trigger card_slip_requests_audit after insert or update or delete on card_slip_requests
  for each row execute function log_audit();

alter table card_slip_requests enable row level security;

create policy card_slip_requests_read on card_slip_requests
  for select to authenticated using (
    is_org_wide() or requested_by = auth.uid()
    or student_id in (select student_id from guardianships where parent_id = auth.uid())
  );
-- A guardian files a pending request for their own child; every later change is an RPC.
create policy card_slip_requests_insert on card_slip_requests
  for insert to authenticated with check (
    requested_by = auth.uid() and status = 'pending'
    and student_id in (select student_id from guardianships where parent_id = auth.uid())
    and transferred_at <= now() + interval '5 minutes'
    and slip_path like student_id::text || '/%'
  );

-- ------------------------------------------------------------ slip images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-slips', 'card-slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy card_slip_files_read on storage.objects
  for select to authenticated using (
    bucket_id = 'card-slips' and (
      is_org_wide()
      or (storage.foldername(name))[1]::uuid in (select student_id from guardianships where parent_id = auth.uid())
    )
  );
create policy card_slip_files_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'card-slips'
    and (storage.foldername(name))[1]::uuid in (select student_id from guardianships where parent_id = auth.uid())
  );

-- --------------------------------------------------------------------- RPCs
create or replace function card_slip_approve(p_request_id uuid, p_amount numeric default null) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  r card_slip_requests;
  amt numeric;
  tx uuid;
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into r from card_slip_requests where id = p_request_id for update;
  if not found then raise exception 'ไม่พบคำขอ'; end if;
  if r.status <> 'pending' then raise exception 'คำขอนี้ถูกดำเนินการไปแล้ว'; end if;
  amt := coalesce(p_amount, r.amount);
  perform _check_amount(amt, 20, 5000);
  perform _wallet_lock(r.student_id);
  insert into card_transactions (student_id, card_id, type, amount, note, recorded_by)
  values (
    r.student_id,
    (select id from student_cards where student_id = r.student_id and status <> 'replaced'),
    'topup_slip', amt,
    'สลิปโอน ' || to_char(r.transferred_at at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI'),
    auth.uid()
  ) returning id into tx;
  update card_slip_requests
    set status = 'approved', approved_amount = amt, tx_id = tx, reviewed_by = auth.uid(), reviewed_at = now()
    where id = r.id;
  return jsonb_build_object('ok', true, 'tx_id', tx, 'balance', _wallet_balance(r.student_id));
end $$;

create or replace function card_slip_reject(p_request_id uuid, p_reason text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r card_slip_requests;
  nm text;
begin
  if not is_org_wide() then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'ต้องระบุเหตุผลที่ไม่อนุมัติ'; end if;
  select * into r from card_slip_requests where id = p_request_id for update;
  if not found then raise exception 'ไม่พบคำขอ'; end if;
  if r.status <> 'pending' then raise exception 'คำขอนี้ถูกดำเนินการไปแล้ว'; end if;
  update card_slip_requests
    set status = 'rejected', reject_reason = btrim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
    where id = r.id;
  select first_name into nm from students where id = r.student_id;
  insert into line_notifications (profile_id, message)
  values (r.requested_by, 'สลิปเติมเงินบัตรของ ' || nm || ' จำนวน ' || to_char(r.amount, 'FM999,990.00') ||
    ' บาท ไม่ผ่านการตรวจสอบ: ' || btrim(p_reason));
end $$;

-- Balance, limit and card state for the student themself, a guardian, or org-wide.
create or replace function card_portal_summary(p_student_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not _can_view_student(p_student_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  return jsonb_build_object(
    'balance', _wallet_balance(p_student_id),
    'daily_limit', (select daily_limit from student_wallets where student_id = p_student_id),
    'spent_today', _spent_today(p_student_id),
    'card_status', (select status from student_cards where student_id = p_student_id and status <> 'replaced')
  );
end $$;

-- p_limit null = unlimited.
create or replace function card_parent_set_limit(p_student_id uuid, p_limit numeric) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not (_is_guardian(p_student_id) or is_org_wide()) then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_limit is not null and (p_limit <= 0 or p_limit > 100000 or p_limit <> round(p_limit, 2)) then
    raise exception 'วงเงินต่อวันไม่ถูกต้อง';
  end if;
  insert into student_wallets (student_id, daily_limit) values (p_student_id, p_limit)
  on conflict (student_id) do update set daily_limit = excluded.daily_limit;
end $$;

create or replace function card_parent_set_frozen(p_student_id uuid, p_frozen boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not (_is_guardian(p_student_id) or is_org_wide()) then raise exception 'ไม่มีสิทธิ์'; end if;
  update student_cards set status = case when p_frozen then 'frozen' else 'active' end
    where student_id = p_student_id and status <> 'replaced';
  if not found then raise exception 'นักเรียนยังไม่มีบัตร'; end if;
end $$;

revoke execute on function card_slip_approve(uuid, numeric), card_slip_reject(uuid, text), card_portal_summary(uuid),
  card_parent_set_limit(uuid, numeric), card_parent_set_frozen(uuid, boolean) from public, anon;
grant execute on function card_slip_approve(uuid, numeric), card_slip_reject(uuid, text), card_portal_summary(uuid),
  card_parent_set_limit(uuid, numeric), card_parent_set_frozen(uuid, boolean) to authenticated;
