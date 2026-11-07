-- Focal point of the home banner image (% for background-position). One value shared by desktop and mobile;
-- profiles_update_self (0001) already lets every user update their own row.
alter table profiles
  add column banner_focus_x smallint not null default 50 check (banner_focus_x between 0 and 100),
  add column banner_focus_y smallint not null default 50 check (banner_focus_y between 0 and 100);
