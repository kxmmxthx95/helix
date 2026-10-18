-- ผังการเรียน: optional tile colour + icon per plan subject (preset keys, null = default).
alter table plan_subjects
  add column color text check (color in ('rose','blue','emerald','amber','orange','violet','cyan','pink','slate')),
  add column icon text check (icon in ('book','flask','calculator','globe','language','music','brush','sport','laptop','leaf','planet','people','heart'));
