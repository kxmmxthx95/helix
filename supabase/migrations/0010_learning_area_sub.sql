-- Optional one-level sub-areas under a learning_area (e.g. วิทยาศาสตร์ ->
-- ฟิสิกส์/เคมี/ชีววิทยา) — the lookup-table design already anticipated this
-- (see 0004). subjects.learning_area_id can point at either a top-level
-- area or a sub-area row, so no new column is needed on subjects.
alter table learning_areas add column parent_id uuid references learning_areas on delete restrict;
create index learning_areas_parent_idx on learning_areas (parent_id);
