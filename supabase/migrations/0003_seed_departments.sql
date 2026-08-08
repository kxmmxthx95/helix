-- Starter departments — nothing seeded departments in 0001, so every
-- department-scoped feature (roster, settings, invites) had nothing to
-- select from until now.
insert into departments (code, name) values
  ('KG',  'ปฐมวัย'),
  ('PRI', 'ประถมศึกษา'),
  ('SEC', 'มัธยมศึกษา')
on conflict (code) do nothing;
