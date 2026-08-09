import type { Role } from "@/lib/roles";

export type StudentStatus = "studying" | "transferred" | "graduated" | "dropped";

export type Department = {
  id: string;
  code: string;
  name: string;
  created_at: string;
};

export type PositionTitle = {
  id: string;
  code: string;
  name: string;
  created_at: string;
};

export type Profile = {
  id: string;
  department_id: string | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  email: string | null; // contact only — never the login identity
  phone: string | null; // also the login id for non-student roles
  national_id: string | null;
  date_of_birth: string | null;
  line_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const profileFullName = (p: Pick<Profile, "prefix" | "first_name" | "last_name">) =>
  `${p.prefix ?? ""}${p.first_name} ${p.last_name}`.trim();

/** Singleton row (id is always 1) — header branding, shown app-wide. */
export type SchoolSettings = {
  id: 1;
  name_th: string;
  name_en: string | null;
  logo_path: string | null; // object path in the school-assets storage bucket
  academic_year: number; // พ.ศ.
  updated_at: string;
};

/** One row per department, always present — see migration 0002 seed trigger. */
export type DepartmentSettings = {
  department_id: string;
  semester1_start: string | null;
  semester1_end: string | null;
  semester2_start: string | null;
  semester2_end: string | null;
  // Default เก็บ:สอบ split — curriculum_subjects rows may override per subject.
  score_collect_pct: number | null;
  score_exam_pct: number | null;
  updated_at: string;
};

export type ProfileRole = {
  id: string;
  profile_id: string;
  role: Role;
  position_title_id: string | null;
  created_at: string;
};

/** A profile plus the role names it holds — enough for every permission check. */
export type ProfileWithRoles = Profile & { roles: Role[] };

export type Student = {
  id: string;
  student_code: string;
  national_id: string | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  department_id: string;
  grade_level_id: string | null;
  status: StudentStatus;
  profile_id: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  created_at: string;
  updated_at: string;
};

// ------------------------------------------------------------- curriculum
// See supabase/migrations/0004_curriculum.sql for the full grill rationale.

export type SubjectType = "basic" | "additional" | "activity"; // พื้นฐาน / เพิ่มเติม / กิจกรรม
export type DevelopmentDomain = "physical" | "emotional" | "social" | "cognitive"; // ร่างกาย / อารมณ์-จิตใจ / สังคม / สติปัญญา

export type LearningArea = {
  id: string;
  code: string;
  name: string;
  parent_id: string | null; // optional sub-area under another learning_area — one level only
  created_at: string;
};

/** Per-department catalog — reused across academic years within that department, never across departments. */
export type Subject = {
  id: string;
  code: string;
  name_th: string;
  name_en: string | null;
  department_id: string; // subjects don't cross departments — each belongs to exactly one
  learning_area_id: string;
  subject_type: SubjectType;
  credits: number;
  hours_per_week: number;
  // Advisory hint shown when adding this subject into a cohort's curriculum — not enforced.
  suggested_grade_level_id: string | null;
  suggested_term: number | null;
  is_active: boolean; // soft delete — past academic years may still reference a retired subject
  created_at: string;
  updated_at: string;
};

/** แผนการเรียน (วิทย์-คณิต, ศิลป์-คำนวณ, ...) — used by SEC only, but not department-tagged itself. */
export type StudyPlan = {
  id: string;
  code: string;
  name: string;
  created_at: string;
};

/** ม.1..ม.6 / ป.1..ป.6 / อ.1..อ.3 — code is unique only within its department. */
export type GradeLevel = {
  id: string;
  department_id: string;
  code: string;
  name: string;
  sort_order: number;
  is_entry_point: boolean; // true for ม.1/ม.4/ป.1/ป.4 — valid curriculum_cohorts entry points
  created_at: string;
};

/**
 * A curriculum bundle for one entry cohort (e.g. "มัธยมต้น รุ่นปี 2569") —
 * authored once, stays fixed for that cohort across every grade it spans.
 * See supabase/migrations/0005_curriculum_cohorts.sql.
 */
export type CurriculumCohort = {
  id: string;
  department_id: string;
  entry_grade_level_id: string; // ม.1 or ม.4 — the entry point this cohort started at
  entry_year: number; // พ.ศ.
  name: string;
  created_at: string;
  updated_at: string;
};

/** Binds a subject to a department's grade level within one cohort's curriculum. */
export type CurriculumSubject = {
  id: string;
  subject_id: string;
  grade_level_id: string;
  study_plan_id: string | null; // track within the cohort: สายวิทย์/สายศิลป์, or null = shared
  term: number | null; // 1 or 2 for SEC, null everywhere else
  cohort_id: string;
  score_collect_pct: number | null; // overrides department_settings default when set
  score_exam_pct: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * History, not a mutable pointer — a transfer or ซ้ำชั้น inserts a new row
 * rather than overwriting the old one. Latest row per student = current.
 */
export type StudentCohortEnrollment = {
  id: string;
  student_id: string;
  cohort_id: string;
  study_plan_id: string | null;
  created_at: string;
};

/** KG (อนุบาล) หน่วยการเรียนรู้ — replaces subjects entirely for this department. */
export type LearningUnit = {
  id: string;
  grade_level_id: string;
  academic_year: number;
  name_th: string;
  name_en: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** KG หัวข้อการประเมินพัฒนาการ, grouped under one of the 4 fixed domains. */
export type KgAssessmentTopic = {
  id: string;
  grade_level_id: string;
  domain: DevelopmentDomain;
  academic_year: number;
  name_th: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** ห้องเรียน (e.g. "1" under ม.1 -> displayed "ม.1/1") — durable, reused every year. */
export type Classroom = {
  id: string;
  grade_level_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

/** History, not a mutable pointer — a reassignment inserts a new row. Latest row per (student, academic_year) = current. */
export type StudentClassroomEnrollment = {
  id: string;
  student_id: string;
  classroom_id: string;
  academic_year: number;
  created_at: string;
};

type Table<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

/** Columns the database fills in itself are never required on insert. */
type Generated = "id" | "created_at" | "updated_at";

/** Nullable and defaulted columns are optional on insert; the rest are not. */
type InsertOf<Row, Optional extends keyof Row> = Omit<Row, Generated | Optional> &
  Partial<Pick<Row, Extract<Optional, keyof Row>>>;

/**
 * Hand-written until the schema settles. Regenerate with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 */
export type Database = {
  public: {
    Tables: {
      departments: Table<Department, InsertOf<Department, never>>;
      position_titles: Table<PositionTitle, InsertOf<PositionTitle, never>>;
      // profiles.id is the auth.users id, so it is supplied, not generated.
      profiles: Table<
        Profile,
        Omit<
          Profile,
          | "created_at"
          | "updated_at"
          | "department_id"
          | "prefix"
          | "email"
          | "phone"
          | "national_id"
          | "date_of_birth"
          | "line_user_id"
          | "is_active"
        > &
          Partial<
            Pick<
              Profile,
              | "department_id"
              | "prefix"
              | "email"
              | "phone"
              | "national_id"
              | "date_of_birth"
              | "line_user_id"
              | "is_active"
            >
          >
      >;
      profile_roles: Table<ProfileRole, InsertOf<ProfileRole, "position_title_id">>;
      students: Table<
        Student,
        InsertOf<
          Student,
          | "status"
          | "profile_id"
          | "national_id"
          | "prefix"
          | "grade_level_id"
          | "guardian_name"
          | "guardian_phone"
        >
      >;
      guardianships: Table<{ parent_id: string; student_id: string }>;
      school_settings: Table<SchoolSettings>;
      department_settings: Table<DepartmentSettings>;
      learning_areas: Table<LearningArea, InsertOf<LearningArea, "parent_id">>;
      subjects: Table<
        Subject,
        InsertOf<Subject, "name_en" | "is_active" | "suggested_grade_level_id" | "suggested_term">
      >;
      study_plans: Table<StudyPlan, InsertOf<StudyPlan, never>>;
      grade_levels: Table<GradeLevel, InsertOf<GradeLevel, "sort_order" | "is_entry_point">>;
      curriculum_cohorts: Table<CurriculumCohort, InsertOf<CurriculumCohort, never>>;
      curriculum_subjects: Table<
        CurriculumSubject,
        InsertOf<CurriculumSubject, "study_plan_id" | "term" | "score_collect_pct" | "score_exam_pct">
      >;
      learning_units: Table<LearningUnit, InsertOf<LearningUnit, "name_en" | "sort_order">>;
      kg_assessment_topics: Table<KgAssessmentTopic, InsertOf<KgAssessmentTopic, "sort_order">>;
      student_cohort_enrollments: Table<
        StudentCohortEnrollment,
        InsertOf<StudentCohortEnrollment, "study_plan_id">
      >;
      classrooms: Table<Classroom, InsertOf<Classroom, "is_active">>;
      student_classroom_enrollments: Table<
        StudentClassroomEnrollment,
        InsertOf<StudentClassroomEnrollment, never>
      >;
      audit_logs: Table<{
        id: number;
        actor_id: string | null;
        actor_roles: Role[];
        action: string;
        table_name: string;
        record_id: string;
        changes: unknown;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: Role;
      student_status: StudentStatus;
      subject_type: SubjectType;
      development_domain: DevelopmentDomain;
    };
    CompositeTypes: Record<string, never>;
  };
};
