-- Where the exam is sat: one physical room (public.rooms, migration 0161) per exam session. Optional, so
-- existing sessions are untouched; retiring or deleting a room just clears it.
alter table exam_sessions add column room_id uuid references rooms on delete set null;
create index exam_sessions_room_idx on exam_sessions (room_id) where room_id is not null;
