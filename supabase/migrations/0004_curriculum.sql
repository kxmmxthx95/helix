-- Curriculum: school-wide subject catalog + per-department curriculum
-- structure (grade level / term / study plan for SEC) + KG's separate
-- learning-unit / developmental-domain model (KG never uses subjects at
-- all — grill decision, 2026-08-07). Score-split defaults live on
-- department_settings; the 0-4/ร/มส grade band table is fixed in app code,
-- not the DB, since it's a national standard no department customizes.

-- ------------------------------------------------------------- learning_areas
-- Thai core-curriculum's 8 กลุ่มสาระ. Lookup table, not enum, because a
-- school may add sub-areas later — same reasoning as position_titles.
create table learning_areas (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

insert into learning_areas (code, name) values
  ('thai',         'ภาษาไทย'),
  ('math',         'คณิตศาสตร์'),
  ('science',      'วิทยาศาสตร์และเทคโนโลยี'),
  ('social',       'สังคมศึกษา ศาสนา และวัฒนธรรม'),
  ('health_pe',    'สุขศึกษาและพลศึกษา'),
  ('art',          'ศิลปะ'),
  ('career',       'การงานอาชีพ'),
  ('foreign_lang', 'ภาษาต่างประเทศ');

-- Fixed by ministry regulation, unlike learning_areas — enum, not a lookup table.
create type subject_type as enum ('basic', 'additional', 'activity'); -- พื้นฐาน / เพิ่มเติม / กิจกรรม

-- ------------------------------------------------------------------ subjects
-- School-wide master catalog, never tagged to a department — the same
-- subject row is reused across academic years via curriculum_subjects below.
create table subjects (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name_th          text not null,
  name_en          text,
  learning_area_id uuid not null references learning_areas on delete restrict,
  subject_type     subject_type not null,
  credits          numeric(3,1) not null,
  hours_per_week   int not null,
  -- Soft delete: a retired subject may still be referenced by past academic
  -- years' curriculum_subjects rows, so it can't be hard-deleted.
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index subjects_learning_area_idx on subjects (learning_area_id);
create trigger subjects_touch before update on subjects
  for each row execute function touch_updated_at();

-- --------------------------------------------------------------- study_plans
-- แผนการเรียน (วิทย์-คณิต, ศิลป์-คำนวณ, ...) — only SEC uses these in
-- practice, but the lookup itself isn't department-tagged (no ambiguity to
-- guard against, unlike grade_levels below).
create table study_plans (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------- grade_levels
-- ม.1..ม.6 / ป.1..ป.6 / อ.1..อ.3. Tagged to a department because "1" means a
-- different grade in each department — code is only unique within a dept.
create table grade_levels (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references departments on delete restrict,
  code           text not null,
  name           text not null,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  unique (department_id, code)
);

create index grade_levels_department_idx on grade_levels (department_id);

insert into grade_levels (department_id, code, name, sort_order)
select d.id, v.code, v.name, v.sort_order
from departments d
join (values
  ('SEC', 'M1', 'มัธยมศึกษาปีที่ 1', 1),
  ('SEC', 'M2', 'มัธยมศึกษาปีที่ 2', 2),
  ('SEC', 'M3', 'มัธยมศึกษาปีที่ 3', 3),
  ('SEC', 'M4', 'มัธยมศึกษาปีที่ 4', 4),
  ('SEC', 'M5', 'มัธยมศึกษาปีที่ 5', 5),
  ('SEC', 'M6', 'มัธยมศึกษาปีที่ 6', 6),
  ('PRI', 'P1', 'ประถมศึกษาปีที่ 1', 1),
  ('PRI', 'P2', 'ประถมศึกษาปีที่ 2', 2),
  ('PRI', 'P3', 'ประถมศึกษาปีที่ 3', 3),
  ('PRI', 'P4', 'ประถมศึกษาปีที่ 4', 4),
  ('PRI', 'P5', 'ประถมศึกษาปีที่ 5', 5),
  ('PRI', 'P6', 'ประถมศึกษาปีที่ 6', 6),
  ('KG',  'K1', 'อนุบาล 1', 1),
  ('KG',  'K2', 'อนุบาล 2', 2),
  ('KG',  'K3', 'อนุบาล 3', 3)
) as v(dept_code, code, name, sort_order) on v.dept_code = d.code
on conflict (department_id, code) do nothing;

-- ------------------------------------------------------- curriculum_subjects
-- Binds a subject to a department's grade level for one academic year.
-- department_id is deliberately NOT denormalized here — it's derived via
-- grade_level_id, which never moves between departments in practice.
create table curriculum_subjects (
  id                 uuid primary key default gen_random_uuid(),
  subject_id         uuid not null references subjects on delete restrict,
  grade_level_id     uuid not null references grade_levels on delete restrict,
  study_plan_id      uuid references study_plans on delete restrict,
  term               int, -- 1 or 2 for SEC; must be null everywhere else (see trigger below)
  academic_year      int not null,
  -- Per-subject override of department_settings.score_collect_pct/score_exam_pct.
  -- Null = use the department default.
  score_collect_pct  int,
  score_exam_pct     int,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (term is null or term in (1, 2)),
  check (
    (score_collect_pct is null) = (score_exam_pct is null)
    and (score_collect_pct is null or score_collect_pct + score_exam_pct = 100)
  )
);

create index curriculum_subjects_subject_idx on curriculum_subjects (subject_id);
create index curriculum_subjects_grade_level_idx on curriculum_subjects (grade_level_id);
create index curriculum_subjects_study_plan_idx on curriculum_subjects (study_plan_id);

create trigger curriculum_subjects_touch before update on curriculum_subjects
  for each row execute function touch_updated_at();

-- term is only meaningful for SEC (มัธยม), which splits every subject by
-- เทอม 1/2 — PRI/KG teach continuously all year, so term must stay null
-- there. Can't express "required/forbidden depending on another table's
-- value" as a plain CHECK, so this mirrors check_profile_role_dept().
create or replace function check_curriculum_term_dept() returns trigger
  language plpgsql as $$
declare
  dept_code text;
begin
  select d.code into dept_code
  from grade_levels gl join departments d on d.id = gl.department_id
  where gl.id = new.grade_level_id;

  if dept_code = 'SEC' and new.term is null then
    raise exception 'term is required for SEC (มัธยม) curriculum rows';
  elsif dept_code <> 'SEC' and new.term is not null then
    raise exception 'term must be null outside SEC (only มัธยม splits by term), got department %', dept_code;
  end if;

  return new;
end $$;

create trigger curriculum_subjects_term_check before insert or update on curriculum_subjects
  for each row execute function check_curriculum_term_dept();

-- Dedup, split by which nullable column(s) are actually null in each row —
-- a plain UNIQUE constraint wouldn't catch duplicates because NULL never
-- equals NULL, same problem profile_roles solves with its two partial
-- indexes. Two nullable columns here (term, study_plan_id) means four
-- partitions instead of two.
create unique index curriculum_subjects_unique_nn on curriculum_subjects
  (subject_id, grade_level_id, academic_year)
  where term is null and study_plan_id is null;
create unique index curriculum_subjects_unique_ny on curriculum_subjects
  (subject_id, grade_level_id, study_plan_id, academic_year)
  where term is null and study_plan_id is not null;
create unique index curriculum_subjects_unique_yn on curriculum_subjects
  (subject_id, grade_level_id, term, academic_year)
  where term is not null and study_plan_id is null;
create unique index curriculum_subjects_unique_yy on curriculum_subjects
  (subject_id, grade_level_id, term, study_plan_id, academic_year)
  where term is not null and study_plan_id is not null;

-- ------------------------------------------------------------- KG (อนุบาล)
-- KG never uses subjects/curriculum_subjects — it structures by learning
-- unit and by the 4 fixed developmental domains instead of subject codes.
create type development_domain as enum ('physical', 'emotional', 'social', 'cognitive'); -- ร่างกาย / อารมณ์-จิตใจ / สังคม / สติปัญญา

create table learning_units (
  id             uuid primary key default gen_random_uuid(),
  grade_level_id uuid not null references grade_levels on delete restrict,
  academic_year  int not null,
  name_th        text not null,
  name_en        text,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (grade_level_id, academic_year, sort_order)
);

create index learning_units_grade_level_idx on learning_units (grade_level_id);
create trigger learning_units_touch before update on learning_units
  for each row execute function touch_updated_at();

create table kg_assessment_topics (
  id             uuid primary key default gen_random_uuid(),
  grade_level_id uuid not null references grade_levels on delete restrict,
  domain         development_domain not null,
  academic_year  int not null,
  name_th        text not null,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (grade_level_id, academic_year, domain, sort_order)
);

create index kg_assessment_topics_grade_level_idx on kg_assessment_topics (grade_level_id);
create trigger kg_assessment_topics_touch before update on kg_assessment_topics
  for each row execute function touch_updated_at();

-- --------------------------------------------------- department score split
-- Department-level default for สัดส่วนคะแนนเก็บ:สอบ — curriculum_subjects
-- rows above can override per subject. The 0-4/ร/มส grade band table itself
-- is fixed in app code, not modeled here (grill decision).
alter table department_settings
  add column score_collect_pct int,
  add column score_exam_pct   int,
  add constraint department_settings_score_pct_check check (
    (score_collect_pct is null) = (score_exam_pct is null)
    and (score_collect_pct is null or score_collect_pct + score_exam_pct = 100)
  );

-- ------------------------------------------------------------------ audit
-- Only the department-structure tables are audited — they drive the
-- auto-generated gradebook, so an accidental edit needs a trail. The
-- master/lookup tables (subjects, learning_areas, study_plans, grade_levels)
-- follow departments/position_titles, which aren't audited either.
create trigger curriculum_subjects_audit after insert or update or delete on curriculum_subjects
  for each row execute function log_audit();
create trigger learning_units_audit after insert or update or delete on learning_units
  for each row execute function log_audit();
create trigger kg_assessment_topics_audit after insert or update or delete on kg_assessment_topics
  for each row execute function log_audit();

-- ------------------------------------------------------------------ RLS
alter table learning_areas       enable row level security;
alter table subjects             enable row level security;
alter table study_plans          enable row level security;
alter table grade_levels         enable row level security;
alter table curriculum_subjects  enable row level security;
alter table learning_units       enable row level security;
alter table kg_assessment_topics enable row level security;

-- Master/lookup tables: readable by anyone signed in, written only by
-- org-wide roles — same shape as departments/position_titles.
create policy learning_areas_read on learning_areas
  for select to authenticated using (true);
create policy learning_areas_write on learning_areas
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

create policy subjects_read on subjects
  for select to authenticated using (true);
create policy subjects_write on subjects
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

create policy study_plans_read on study_plans
  for select to authenticated using (true);
create policy study_plans_write on study_plans
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

create policy grade_levels_read on grade_levels
  for select to authenticated using (true);
create policy grade_levels_write on grade_levels
  for all to authenticated using (is_org_wide()) with check (is_org_wide());

-- Department-structure tables: read/write scoped to your own department via
-- grade_level_id, same shape as department_settings/students. can_manage()
-- lets dept_head maintain their own department's curriculum.
create policy curriculum_subjects_read on curriculum_subjects
  for select to authenticated using (
    is_org_wide()
    or grade_level_id in (select id from grade_levels where department_id = auth_department())
  );
create policy curriculum_subjects_write on curriculum_subjects
  for all to authenticated
  using (
    can_manage() and (
      is_org_wide()
      or grade_level_id in (select id from grade_levels where department_id = auth_department())
    )
  )
  with check (
    can_manage() and (
      is_org_wide()
      or grade_level_id in (select id from grade_levels where department_id = auth_department())
    )
  );

create policy learning_units_read on learning_units
  for select to authenticated using (
    is_org_wide()
    or grade_level_id in (select id from grade_levels where department_id = auth_department())
  );
create policy learning_units_write on learning_units
  for all to authenticated
  using (
    can_manage() and (
      is_org_wide()
      or grade_level_id in (select id from grade_levels where department_id = auth_department())
    )
  )
  with check (
    can_manage() and (
      is_org_wide()
      or grade_level_id in (select id from grade_levels where department_id = auth_department())
    )
  );

create policy kg_assessment_topics_read on kg_assessment_topics
  for select to authenticated using (
    is_org_wide()
    or grade_level_id in (select id from grade_levels where department_id = auth_department())
  );
create policy kg_assessment_topics_write on kg_assessment_topics
  for all to authenticated
  using (
    can_manage() and (
      is_org_wide()
      or grade_level_id in (select id from grade_levels where department_id = auth_department())
    )
  )
  with check (
    can_manage() and (
      is_org_wide()
      or grade_level_id in (select id from grade_levels where department_id = auth_department())
    )
  );
