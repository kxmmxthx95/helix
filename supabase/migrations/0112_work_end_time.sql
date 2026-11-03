-- Per-department work-end time. Clock-out unlocks at this time; null = no lock.
alter table department_settings add column work_end_time time;
