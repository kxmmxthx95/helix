-- Focal point of the subject cover (% for object-position), set by dragging in the subject form.
alter table subjects
  add column cover_focus_x smallint not null default 50 check (cover_focus_x between 0 and 100),
  add column cover_focus_y smallint not null default 50 check (cover_focus_y between 0 and 100);
