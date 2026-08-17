-- period_attendance_records.schedule_entry_id had no index — the existing
-- unique (schedule_entry_id, date, student_id) doesn't serve a bare
-- schedule_entry_id lookup without date. usePeriodAttendance.ts loads the
-- full period roster via .in("schedule_entry_id", scheduleEntryIds).

create index period_attendance_records_schedule_entry_idx
  on period_attendance_records (schedule_entry_id);
