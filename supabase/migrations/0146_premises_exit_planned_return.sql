-- Staff can state when they expect to be back when asking to leave the school.
-- return_time stays the actual return (confirmed via "กลับมาแล้ว"); null here = not returning / unsure.
alter table premises_exit_requests add column planned_return_time timestamptz;
