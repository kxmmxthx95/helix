-- Event drawer: free-text description + two display/notify flags.
alter table academic_events
  add column description text check (char_length(description) <= 300),
  add column show_in_schedule boolean not null default true,
  add column notify_users boolean not null default false;
