-- หมวดหมู่พฤติกรรมสำเร็จรูป — optional preset (label + fixed points) a
-- teacher can pick from instead of typing points/reason freehand every time
-- on /behavior. Not referenced by FK from behavior_records (0027): picking
-- one just pre-fills the entry form, so deleting a category never touches
-- past records. Same shape as position_titles/departments — org-wide-managed
-- reference data, readable by everyone signed in.

create table behavior_categories (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  points      int not null check (points <> 0),
  created_at  timestamptz not null default now()
);

alter table behavior_categories enable row level security;

create policy behavior_categories_read on behavior_categories
  for select to authenticated using (true);
create policy behavior_categories_write on behavior_categories
  for all to authenticated using (is_org_wide()) with check (is_org_wide());
