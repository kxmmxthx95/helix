-- Gradient colours of the home banner (5 hex colours). null = default preset.
-- profiles_update_self (0001) already lets every user update their own row.
alter table profiles
  add column banner_colors text[] check (banner_colors is null or array_length(banner_colors, 1) = 5);
