-- A room can be created before it is scheduled: opens_at/closes_at null = "not on the exam
-- timetable yet". Every RLS/attempt check reads `now() between opens_at and closes_at`, which is
-- null (not true) here, so students can neither see nor start an unscheduled room.
alter table exam_sessions
  alter column opens_at drop not null,
  alter column closes_at drop not null,
  add constraint exam_sessions_scheduled_both check ((opens_at is null) = (closes_at is null));
