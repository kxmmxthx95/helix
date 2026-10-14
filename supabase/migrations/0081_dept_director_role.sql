-- ผู้บริหารแผนก (dept_director): director-level powers scoped to the person's
-- own department, and may also hold the teacher role. Separate from dept_head
-- (หัวหน้างาน, a position-titled role). Split from 0082 because a new enum
-- value can't be used in the transaction that adds it.
alter type app_role add value if not exists 'dept_director';
