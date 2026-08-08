-- Advisory only, not enforced: a subject may carry a suggested grade level
-- and term shown as a hint when adding it into a cohort's curriculum, but
-- curriculum_subjects.grade_level_id/term is still driven entirely by
-- which tab the user is on when adding it — no FK/trigger ties the two
-- together (grill decision, 2026-08-08).
alter table subjects add column suggested_grade_level_id uuid references grade_levels on delete set null;
alter table subjects add column suggested_term int check (suggested_term is null or suggested_term in (1, 2));
