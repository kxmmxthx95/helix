-- POS products: a shared catalogue (org-wide manages, cashiers read) and per-sale line items.
--
-- * pos_products.code is system-generated ('P-000123', Code128 on the printed label). The 'P-' prefix keeps
--   it apart from student barcodes ('qr_…') and student codes in the POS capture input. Products are
--   switched off (active = false), never deleted, so old sales keep their reference.
-- * pos_sale_items(...) prices the cart ON THE SERVER from pos_products (the client sends only product
--   ids + quantities), then reuses pos_sale() for the charge — card checks, balance, daily limit, the
--   1–500 ceiling and client_tx_id idempotency all stay in one place. Items are written in the same
--   transaction, with name / price copied at sale time so later edits never rewrite history.

create sequence pos_product_code_seq;

create table pos_products (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique default 'P-' || lpad(nextval('pos_product_code_seq')::text, 6, '0')
             check (code ~ '^P-[0-9]{6,}$'),
  name       text not null check (btrim(name) <> ''),
  price      integer not null check (price between 1 and 500),
  category   text check (category is null or btrim(category) <> ''),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence pos_product_code_seq owned by pos_products.code;
create trigger pos_products_touch before update on pos_products for each row execute function touch_updated_at();

create table card_sale_items (
  id         uuid primary key default gen_random_uuid(),
  tx_id      uuid not null references card_transactions on delete restrict,
  product_id uuid references pos_products on delete set null,
  code       text not null,
  name       text not null,
  price      integer not null,
  qty        integer not null check (qty between 1 and 99),
  created_at timestamptz not null default now()
);
create index card_sale_items_tx_idx on card_sale_items (tx_id);
create index card_sale_items_product_idx on card_sale_items (product_id);

alter table pos_products enable row level security;
alter table card_sale_items enable row level security;

create policy pos_products_read on pos_products for select to authenticated using (can_pos());
create policy pos_products_insert on pos_products for insert to authenticated with check (is_org_wide());
create policy pos_products_update on pos_products for update to authenticated using (is_org_wide()) with check (is_org_wide());
-- Line items are written only by pos_sale_items(); org-wide may read them for reports.
create policy card_sale_items_read on card_sale_items for select to authenticated using (is_org_wide());

-- p_items: [{"product_id": "<uuid>", "qty": 2}, …]
create or replace function pos_sale_items(
  p_card_uid text, p_items jsonb, p_terminal_id uuid default null, p_client_tx_id uuid default null
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

  -- Same product listed twice is merged; every id must be a live product and qty a whole 1–99.
  -- (Written as repeated subqueries rather than a temp table so two calls in one transaction work.)
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

  res := pos_sale(p_card_uid, total, p_terminal_id, p_client_tx_id);

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

revoke execute on function pos_sale_items(text, jsonb, uuid, uuid) from public, anon;
grant execute on function pos_sale_items(text, jsonb, uuid, uuid) to authenticated;
