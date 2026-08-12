-- ระดับความรุนแรง — only meaningful for a negative (points < 0) category;
-- merit categories never carry one.

create type behavior_severity as enum ('minor', 'moderate', 'severe');

alter table behavior_categories
  add column severity behavior_severity,
  add constraint behavior_categories_severity_only_negative
    check (severity is null or points < 0);
