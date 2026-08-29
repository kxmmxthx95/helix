import type { Value as PlateValue } from "platejs";
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

export type CharacterOptions = {
  skin: "light" | "amber" | "brown";
  hair: "messy" | "parted_side_bangs" | "swoop_side";
  outfitColor: "blue" | "red" | "green";
  hat: "hairtie" | "thick" | null;
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
  teacher_code: string | null; // display/reference code — not the login id
  learning_area_id: string | null; // required iff role includes 'teacher', see migration 0017
  /** Forces the onboarding gate until cleared — see migration 0022. Students only; always false for staff. */
  must_change_password: boolean;
  /** Object path in the avatars storage bucket — always the profile's own id, see migration 0024. */
  avatar_path: string | null;
  /** Character-builder picks, so the sheet can reopen pre-filled. See migration 0055. */
  character_options: CharacterOptions | null;
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
  updated_at: string;
  /** Roles allowed to use the time-clock feature — empty = off for everyone. See migration 0032. */
  time_tracking_roles: Role[];
};

/** One row per department, always present — see migration 0002 seed trigger. */
export type DepartmentSettings = {
  department_id: string;
  // Default เก็บ:สอบ split — curriculum_subjects rows may override per subject.
  score_collect_pct: number | null;
  score_exam_pct: number | null;
  // Teaching-load alert thresholds — nullable, no alert when unset. See migration 0017.
  min_periods_per_week: number | null;
  max_periods_per_week: number | null;
  // Time-clock: expected start time + geofence, all-or-nothing null. See migration 0032.
  work_start_time: string | null;
  checkin_lat: number | null;
  checkin_lng: number | null;
  checkin_radius_m: number | null;
  updated_at: string;
};

export type PremisesExitStatus = "pending" | "approved" | "rejected";

/** One row per person per day — see migration 0032. */
export type TimeClockRecord = {
  id: string;
  profile_id: string;
  date: string;
  clock_in_time: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_time: string | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
};

/** "ขอออกนอกโรงเรียน" — approval requested async, multiple per day. See migration 0032. */
export type PremisesExitRequest = {
  id: string;
  profile_id: string;
  date: string;
  reason: string;
  exit_time: string;
  exit_lat: number | null;
  exit_lng: number | null;
  return_time: string | null;
  status: PremisesExitStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Lookup table — schools add categories over time. See migration 0033. */
export type LeaveType = {
  id: string;
  code: string;
  name: string;
  max_days_per_year: number | null;
  requires_attachment_after_days: number | null;
  created_at: string;
};

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

/** One row per date-range request (not per day) — see migration 0033. */
export type LeaveRequest = {
  id: string;
  profile_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  /** Generated column (end_date - start_date + 1) — read-only. */
  days: number;
  reason: string;
  attachment_path: string | null;
  status: LeaveStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentLeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

/** Separate domain from LeaveRequest (staff) — see migration 0035. Approval auto-fills attendance_records. */
export type StudentLeaveRequest = {
  id: string;
  student_id: string;
  submitted_by: string;
  start_date: string;
  end_date: string;
  /** Generated column (end_date - start_date + 1) — read-only. */
  days: number;
  reason: string;
  status: StudentLeaveStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
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

export type BloodType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";

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
  phone: string | null;
  email: string | null;
  house_no: string | null;
  village_no: string | null; // หมู่ที่
  alley: string | null; // ตรอก/ซอย
  road: string | null;
  subdistrict: string | null; // ตำบล/แขวง
  district: string | null; // อำเภอ/เขต
  province: string | null;
  postal_code: string | null;
  family_status: string | null; // สถานภาพครอบครัว — free text like prefix
  blood_type: BloodType | null;
  chronic_disease: string | null;
  drug_allergy: string | null;
  food_allergy: string | null;
  created_at: string;
  updated_at: string;
};

/** Standard Thai postal address, broken into real columns — see migration 0016. */
export type AddressFields = {
  house_no: string | null;
  village_no: string | null;
  alley: string | null;
  road: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
};

export type GuardianRelationship = "father" | "mother" | "other";

/** 0..N per student, one may be marked primary — see migration 0015. */
export type StudentContact = {
  id: string;
  student_id: string;
  relationship: GuardianRelationship;
  relationship_note: string | null; // shown/required when relationship = "other"
  is_primary: boolean;
  prefix: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  house_no: string | null;
  village_no: string | null;
  alley: string | null;
  road: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
  created_at: string;
  updated_at: string;
};

/** 1:1 with a StudentContact — split out for narrower RLS (can_manage() only). */
export type StudentGuardianFinancial = {
  contact_id: string;
  occupation: string | null;
  workplace: string | null;
  monthly_income: number | null;
  updated_at: string;
};

// ------------------------------------------------------------- curriculum
// See supabase/migrations/0004_curriculum.sql for the full grill rationale.

export type SubjectType = "basic" | "additional" | "activity"; // พื้นฐาน / เพิ่มเติม / กิจกรรม
export type DevelopmentDomain = "physical" | "emotional" | "social" | "cognitive"; // ร่างกาย / อารมณ์-จิตใจ / สังคม / สติปัญญา
/** ตัดเกรดปกติ vs ผ่าน/ไม่ผ่าน — settable per subject, defaults by subject_type. See migration 0023. */
export type GradingMethod = "graded" | "pass_fail";

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
  grading_method: GradingMethod;
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

/**
 * รับย้ายเข้า case — one row per transfer-in student, kept forever as a
 * record of which school they came from. Not a state machine: whether the
 * case is "done" is derived by checking for a student_classroom_enrollments
 * / student_cohort_enrollments row, not stored here.
 */
export type TransferIntake = {
  id: string;
  student_id: string;
  source_school: string;
  intake_date: string;
  created_at: string;
};

/** ครูประจำชั้น — history per room per academic year, not a mutable pointer. See migration 0017. */
export type ClassroomHomeroomTeacher = {
  id: string;
  classroom_id: string;
  teacher_id: string;
  academic_year: number;
  created_at: string;
};

/**
 * ครูสอนวิชาอะไรให้ห้องไหน + คาบ/สัปดาห์ — periods_per_week is explicit per
 * row (not derived from subjects.hours_per_week) so split/team-teaching can
 * be represented. term is required for SEC, must be null elsewhere. See
 * migration 0017.
 */
export type TeachingAssignment = {
  id: string;
  teacher_id: string;
  subject_id: string;
  classroom_id: string;
  academic_year: number;
  term: number | null;
  periods_per_week: number;
  // Tags rows that intentionally overlap at the same schedule slot
  // (เรียนรวม/แบ่งคาบ) — same non-null value on 2+ rows tells the
  // schedule_entries conflict trigger they're not a real conflict. See
  // migration 0019.
  group_id: string | null;
  // Per-assignment override of curriculum_subjects/department_settings
  // score_collect_pct/score_exam_pct — null = fall back to those. See
  // migration 0030.
  score_collect_pct: number | null;
  score_exam_pct: number | null;
  // Whether the exam side is itemized (teacher makes their own กลางภาค/
  // ปลายภาค items) instead of a single plain exam score. See migration 0030.
  split_exam_items: boolean;
  created_at: string;
  updated_at: string;
};

// ----------------------------------------------------------- score_recording
// ระบบบันทึกคะแนน — คะแนนเก็บ+สอบ per teaching_assignment. See
// supabase/migrations/0030_score_recording.sql for the full grill rationale.

export type ScoreItemKind = "collect" | "exam";

/**
 * A teacher's own line item (e.g. "ใบงาน 1") for one assignment. max_score is
 * informational, not enforced against the assignment's pct target. A row
 * with `description` set doubles as a Google Classroom–style posted
 * assignment (see migration 0039) — `description`/`due_date` left null means
 * it's still just a quick คะแนนเก็บ/คะแนนสอบ line item, unchanged from 0030.
 */
export type ScoreItem = {
  id: string;
  teaching_assignment_id: string;
  kind: ScoreItemKind;
  label: string;
  max_score: number;
  description: string | null;
  due_date: string | null;
  /** Defaults to creation time; a future value schedules the post + its LINE notification. */
  publish_at: string;
  /** True = student must submit online (assignment_submissions); false = teacher grades directly (paper/in-class work). */
  requires_submission: boolean;
  /** Set once the "new assignment" LINE notification has been enqueued — see migration 0040. */
  notified_at: string | null;
  created_at: string;
  updated_at: string;
};

// ------------------------------------------------------------------------- exams
// สร้างข้อสอบ + จัดสอบออนไลน์ — see migration 0047 for the full grill
// rationale (bank owned by subject, sessions are a separate "opening").

export type ExamQuestionType = "multiple_choice" | "true_false" | "short_answer";

export type ExamQuestionDifficulty = "easy" | "medium" | "hard";

/** A bank question, owned by subject_id — any teacher teaching that subject can read/write it. See migration 0047. */
export type ExamQuestion = {
  id: string;
  subject_id: string;
  question_type: ExamQuestionType;
  /** App-derived plaintext copy of prompt_json — index/preview use only (exam-bank table row, session-builder picker). */
  prompt: string;
  /** Plate.js rich-content doc — the actual authored/rendered question body. */
  prompt_json: PlateValue;
  /** short_answer grading key only; multiple_choice/true_false use ExamQuestionChoice.is_correct instead. */
  correct_answer: string | null;
  /** Bank-only tag for the teacher's own browsing/filtering — not exposed to students. See migration 0051. */
  difficulty: ExamQuestionDifficulty;
  /** Free-text bank tag (e.g. หน่วยการเรียนรู้) — same scope as difficulty. See migration 0052. */
  topic: string | null;
  points: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** Answer-safe projection of ExamQuestion — no correct_answer. Read through this while an attempt is in_progress; see exam_questions_for_attempt view, migration 0047. */
export type ExamQuestionForAttempt = Omit<ExamQuestion, "correct_answer">;

/** One option for a multiple_choice/true_false question. */
export type ExamQuestionChoice = {
  id: string;
  question_id: string;
  label: string;
  is_correct: boolean;
  position: number;
};

/** Answer-safe projection — no is_correct. See exam_question_choices_for_attempt view, migration 0047. */
export type ExamQuestionChoiceForAttempt = Omit<ExamQuestionChoice, "is_correct">;

/** An "opening" of hand-picked bank questions against the teacher's own classroom(s). See migration 0047. */
export type ExamSession = {
  id: string;
  subject_id: string;
  teacher_id: string;
  title: string;
  opens_at: string;
  closes_at: string;
  /** Per-attempt countdown from first open; null = only the opens_at/closes_at window applies. */
  duration_minutes: number | null;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  /** Mirrors the graded total into score_items/student_item_scores — see gradebook_item_id. */
  sync_to_gradebook: boolean;
  gradebook_item_id: string | null;
  /** Teacher-flipped — students only see the answer key/correct answers once true. */
  review_released: boolean;
  created_at: string;
  updated_at: string;
};

/** Which of the teacher's own teaching_assignments (classrooms) a session is open to. */
export type ExamSessionTarget = {
  session_id: string;
  teaching_assignment_id: string;
};

/** Which bank questions a session uses, in order, with a per-session point override. */
export type ExamSessionQuestion = {
  session_id: string;
  question_id: string;
  position: number;
  points: number;
};

export type ExamAttemptStatus = "in_progress" | "submitted";

export type ExamAttempt = {
  id: string;
  session_id: string;
  student_id: string;
  attempt_no: number;
  /** Server-stamped on first open — duration_minutes anchors to this, never a client clock. */
  started_at: string;
  submitted_at: string | null;
  status: ExamAttemptStatus;
  /** Per-attempt shuffle order (question ids), generated once at start and reused on resume. */
  question_order: string[];
  score: number | null;
  created_at: string;
  updated_at: string;
};

/** One row per question per attempt, upserted on every answer change (autosave). is_correct/points_awarded fill in at submit. */
export type ExamAttemptAnswer = {
  attempt_id: string;
  question_id: string;
  choice_id: string | null;
  short_answer: string | null;
  is_correct: boolean | null;
  points_awarded: number | null;
  answered_at: string;
};

export type ExamAttemptEventType = "blur" | "visibility_hidden";

/** Tab-switch/blur log for the teacher to review — no client-side lockdown, just a timestamped trail. */
export type ExamAttemptEvent = {
  id: string;
  attempt_id: string;
  event_type: ExamAttemptEventType;
  at: string;
};

// แบบฝึกหัด — ungraded, retry-anytime practice, separate from ข้อสอบ above.
// Reuses the exam_questions bank as its question source. See migration 0053.

/** บทเรียนหลัก — top level of the practice catalog under a subject. See migration 0056. */
export type PracticeLesson = {
  id: string;
  subject_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** เนื้อหาย่อย — one topic under a practice_lessons row; a teacher-curated PracticeSet always points at one of these. See migration 0056. */
export type PracticeTopic = {
  id: string;
  lesson_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** A set of bank questions to practice — either curated by a teacher (visible to every classroom currently studying the subject) or a student's own self-serve random pull. Every PracticeAttempt points at one of these either way. */
export type PracticeSet = {
  id: string;
  subject_id: string;
  created_by: string;
  is_teacher_curated: boolean;
  /** Required iff is_teacher_curated — see migration 0056's SubjectPicker -> lesson -> topic flow. Null on self-serve sets. */
  topic_id: string | null;
  title: string | null;
  /** Self-serve filters this pull was drawn from — null on teacher-curated sets. */
  topic: string | null;
  difficulty: ExamQuestionDifficulty | null;
  created_at: string;
};

export type PracticeSetQuestion = {
  set_id: string;
  question_id: string;
  position: number;
};

export type PracticeAttemptStatus = "in_progress" | "submitted";

export type PracticeAttempt = {
  id: string;
  set_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
  status: PracticeAttemptStatus;
  question_order: string[];
  score: number | null;
  created_at: string;
  updated_at: string;
};

/** Graded immediately on save (not just at submit) — the whole point of practice is instant per-question feedback. */
export type PracticeAttemptAnswer = {
  attempt_id: string;
  question_id: string;
  choice_id: string | null;
  short_answer: string | null;
  is_correct: boolean | null;
  points_awarded: number | null;
  answered_at: string;
};

/** Teacher-posted material for one assignment (score_item). See migration 0039. */
export type AssignmentAttachment = {
  id: string;
  score_item_id: string;
  storage_path: string;
  file_name: string;
  uploaded_at: string;
};

/** A student's turn-in for one assignment. Blocked from editing again once graded unless `reopened`. See migration 0039. */
export type AssignmentSubmission = {
  id: string;
  score_item_id: string;
  student_id: string;
  content: string | null;
  submitted_at: string;
  reopened: boolean;
  created_at: string;
  updated_at: string;
};

export type SubmissionAttachment = {
  id: string;
  submission_id: string;
  storage_path: string;
  file_name: string;
  uploaded_at: string;
};

export type StudentItemScore = {
  id: string;
  score_item_id: string;
  student_id: string;
  score: number;
  /** Written feedback from the teacher, separate from the numeric score. See migration 0039. */
  feedback: string | null;
  created_at: string;
  updated_at: string;
};

export type GradeStatusCode = "ร" | "มส";

/** Presence of a row = override active; absence = grade computed normally from item scores. */
export type StudentGradeStatus = {
  teaching_assignment_id: string;
  student_id: string;
  status: GradeStatusCode;
  created_at: string;
  updated_at: string;
};

/** The entire grade for a grading_method='pass_fail' assignment — no score_items involved. */
export type StudentPassFailScore = {
  teaching_assignment_id: string;
  student_id: string;
  passed: boolean;
  /** Written feedback from the teacher. See migration 0039. */
  feedback: string | null;
  created_at: string;
  updated_at: string;
};

/** One-time code a profile generates to link their LINE account by messaging it to the school's OA. See migration 0040. */
export type LineLinkCode = {
  code: string;
  profile_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

// ------------------------------------------------------------------ timetable
// See supabase/migrations/0019_timetable.sql for the full grill rationale.

export type PeriodType = "teaching" | "break";

/** Per department, per day — Mon/Wed/Fri commonly differ in real Thai private schools. */
export type PeriodDefinition = {
  id: string;
  department_id: string;
  /** Null = department default; set = overrides the default for this one grade. See migration 0031. */
  grade_level_id: string | null;
  day_of_week: number; // 1(จันทร์)..6(เสาร์)
  period_no: number;
  period_type: PeriodType;
  label: string;
  start_time: string;
  end_time: string;
};

/**
 * Weekly recurring template (no specific dates) placing a
 * teaching_assignment into a day+period slot. DB trigger blocks: booking
 * into a non-'teaching' period, teacher/classroom double-booking (unless
 * both assignments share group_id), and edits once the term is locked.
 */
export type ScheduleEntry = {
  id: string;
  teaching_assignment_id: string;
  day_of_week: number;
  period_no: number;
  created_at: string;
};

/**
 * แผนการสอน — a teaching_assignment's content broken into sequential units
 * (สัปดาห์ที่/คาบที่, teacher picks the count). "Current" unit for a session
 * is derived client-side: lowest unit_no with completed_at still null — a
 * queue, not a calendar mapping. See migration 0020.
 */
export type TeachingPlanUnit = {
  id: string;
  teaching_assignment_id: string;
  unit_no: number;
  title: string;
  description: string | null;
  completed_at: string | null;
  completed_on_plan: boolean | null;
  /** บันทึกหลังการสอน — reflection note captured alongside completed_at. See migration 0021. */
  note: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------- attendance
// เช็คชื่อเข้าโรงเรียน — homeroom, once per student per day. See
// supabase/migrations/0026_attendance.sql for the full grill rationale.

export type AttendanceStatus = "present" | "late" | "absent" | "leave";

/** classroom_id is a snapshot at check-in time, not derived from enrollment — see migration 0026. */
export type AttendanceRecord = {
  id: string;
  student_id: string;
  classroom_id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
};

/**
 * เช็คชื่อรายคาบ — one row per (student, schedule_entry, date), separate
 * from AttendanceRecord (homeroom, once per day). schedule_entry_id is the
 * anchor, not a classroom snapshot — see migration 0037. Force-set to
 * 'leave' server-side when an approved StudentLeaveRequest covers the date;
 * synced/un-synced into AttendanceRecord('leave') by a trigger when ALL of
 * the student's scheduled periods that day are 'leave'.
 */
export type PeriodAttendanceRecord = {
  id: string;
  schedule_entry_id: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
};

// ----------------------------------------------------------------- behavior
// คะแนนพฤติกรรม — event log, not one row per day. See
// supabase/migrations/0027_behavior_records.sql.

/** classroom_id is a snapshot at record time, same rationale as AttendanceRecord. */
export type BehaviorRecord = {
  id: string;
  student_id: string;
  classroom_id: string;
  date: string;
  points: number;
  reason: string;
  recorded_by: string;
  created_at: string;
  updated_at: string;
};

export type BehaviorSeverity = "minor" | "moderate" | "severe";

/** Preset (label + fixed points) a teacher can pick instead of typing freehand. Not FK'd from BehaviorRecord. severity is only ever set when points < 0. */
export type BehaviorCategory = {
  id: string;
  label: string;
  points: number;
  severity: BehaviorSeverity | null;
  created_at: string;
};

// ------------------------------------------------------------- academic_terms
// See supabase/migrations/0018_academic_terms.sql for the full grill rationale.

export type TermType = "term1" | "term2" | "summer";
export type TermStatus = "upcoming" | "active" | "locked" | "archived";

/** Per department (KG/PRI/SEC keep independent calendars). status='locked'/'archived' freezes writes on teaching_assignments/student_classroom_enrollments for that department+year. */
export type AcademicTerm = {
  id: string;
  department_id: string;
  academic_year: number; // พ.ศ.
  term_type: TermType;
  start_date: string | null;
  end_date: string | null;
  status: TermStatus;
  created_at: string;
  updated_at: string;
};

export type AcademicEventType = "holiday" | "school_event" | "exam_period" | "teacher_workday" | "suspended";

/** ปฏิทินกิจกรรม/วันหยุด. No department link (see AcademicEventDepartment) = applies to the whole school. */
export type AcademicEvent = {
  id: string;
  name: string;
  event_type: AcademicEventType;
  start_date: string;
  end_date: string;
  students_attend: boolean;
  staff_attend: boolean;
  /** Dedupe key for API-synced rows, e.g. "iapp:2026-01-01" — null for manually created events. See migration 0045. */
  external_ref: string | null;
  created_at: string;
  updated_at: string;
};

/** Which departments an academic_event applies to — no rows for an event = whole school. */
export type AcademicEventDepartment = {
  event_id: string;
  department_id: string;
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
          | "teacher_code"
          | "learning_area_id"
          | "must_change_password"
          | "avatar_path"
          | "character_options"
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
              | "teacher_code"
              | "learning_area_id"
              | "must_change_password"
              | "avatar_path"
              | "character_options"
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
          | "phone"
          | "email"
          | "house_no"
          | "village_no"
          | "alley"
          | "road"
          | "subdistrict"
          | "district"
          | "province"
          | "postal_code"
          | "family_status"
          | "blood_type"
          | "chronic_disease"
          | "drug_allergy"
          | "food_allergy"
        >
      >;
      guardianships: Table<{ parent_id: string; student_id: string }>;
      school_settings: Table<SchoolSettings>;
      department_settings: Table<DepartmentSettings>;
      learning_areas: Table<LearningArea, InsertOf<LearningArea, "parent_id">>;
      subjects: Table<
        Subject,
        InsertOf<
          Subject,
          "name_en" | "is_active" | "suggested_grade_level_id" | "suggested_term" | "grading_method"
        >
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
      transfer_intakes: Table<TransferIntake, InsertOf<TransferIntake, "intake_date">>;
      classroom_homeroom_teachers: Table<
        ClassroomHomeroomTeacher,
        InsertOf<ClassroomHomeroomTeacher, never>
      >;
      teaching_assignments: Table<
        TeachingAssignment,
        InsertOf<
          TeachingAssignment,
          "term" | "group_id" | "score_collect_pct" | "score_exam_pct" | "split_exam_items"
        >
      >;
      score_items: Table<
        ScoreItem,
        InsertOf<ScoreItem, "description" | "due_date" | "publish_at" | "requires_submission" | "notified_at">
      >;
      assignment_attachments: Table<AssignmentAttachment, InsertOf<AssignmentAttachment, "uploaded_at">>;
      assignment_submissions: Table<
        AssignmentSubmission,
        InsertOf<AssignmentSubmission, "content" | "submitted_at" | "reopened">
      >;
      submission_attachments: Table<SubmissionAttachment, InsertOf<SubmissionAttachment, "uploaded_at">>;
      student_item_scores: Table<StudentItemScore, InsertOf<StudentItemScore, "feedback">>;
      student_grade_status: Table<StudentGradeStatus, InsertOf<StudentGradeStatus, never>>;
      student_pass_fail_scores: Table<StudentPassFailScore, InsertOf<StudentPassFailScore, "feedback">>;
      line_link_codes: Table<LineLinkCode, InsertOf<LineLinkCode, "used_at">>;
      teaching_plan_units: Table<
        TeachingPlanUnit,
        InsertOf<TeachingPlanUnit, "description" | "completed_at" | "completed_on_plan" | "note">
      >;
      period_definitions: Table<PeriodDefinition, InsertOf<PeriodDefinition, never>>;
      schedule_entries: Table<ScheduleEntry, InsertOf<ScheduleEntry, never>>;
      time_clock_records: Table<
        TimeClockRecord,
        InsertOf<
          TimeClockRecord,
          "clock_in_lat" | "clock_in_lng" | "clock_out_time" | "clock_out_lat" | "clock_out_lng"
        >
      >;
      premises_exit_requests: Table<
        PremisesExitRequest,
        InsertOf<PremisesExitRequest, "status" | "approved_by" | "approved_at" | "return_time">
      >;
      leave_types: Table<LeaveType, InsertOf<LeaveType, never>>;
      leave_requests: Table<
        LeaveRequest,
        InsertOf<LeaveRequest, "days" | "attachment_path" | "status" | "approved_by" | "approved_at">
      >;
      student_leave_requests: Table<
        StudentLeaveRequest,
        InsertOf<StudentLeaveRequest, "days" | "status" | "approved_by" | "approved_at">
      >;
      academic_terms: Table<AcademicTerm, InsertOf<AcademicTerm, "start_date" | "end_date" | "status">>;
      academic_events: Table<
        AcademicEvent,
        InsertOf<AcademicEvent, "students_attend" | "staff_attend" | "external_ref">
      >;
      academic_event_departments: Table<AcademicEventDepartment, AcademicEventDepartment>;
      student_contacts: Table<
        StudentContact,
        InsertOf<
          StudentContact,
          | "relationship_note"
          | "is_primary"
          | "prefix"
          | "phone"
          | "email"
          | "house_no"
          | "village_no"
          | "alley"
          | "road"
          | "subdistrict"
          | "district"
          | "province"
          | "postal_code"
        >
      >;
      student_guardian_financials: Table<
        StudentGuardianFinancial,
        InsertOf<StudentGuardianFinancial, "occupation" | "workplace" | "monthly_income">
      >;
      attendance_records: Table<AttendanceRecord, InsertOf<AttendanceRecord, "note">>;
      period_attendance_records: Table<PeriodAttendanceRecord, InsertOf<PeriodAttendanceRecord, "note">>;
      behavior_records: Table<BehaviorRecord, InsertOf<BehaviorRecord, never>>;
      behavior_categories: Table<BehaviorCategory, InsertOf<BehaviorCategory, "severity">>;
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
      exam_questions: Table<ExamQuestion, InsertOf<ExamQuestion, "correct_answer" | "points" | "difficulty" | "topic">>;
      exam_question_choices: Table<ExamQuestionChoice, InsertOf<ExamQuestionChoice, "is_correct" | "position">>;
      exam_sessions: Table<
        ExamSession,
        InsertOf<
          ExamSession,
          | "duration_minutes"
          | "max_attempts"
          | "shuffle_questions"
          | "shuffle_choices"
          | "sync_to_gradebook"
          | "gradebook_item_id"
          | "review_released"
        >
      >;
      exam_session_targets: Table<ExamSessionTarget, ExamSessionTarget>;
      exam_session_questions: Table<ExamSessionQuestion, ExamSessionQuestion>;
      exam_attempts: Table<
        ExamAttempt,
        InsertOf<ExamAttempt, "attempt_no" | "started_at" | "submitted_at" | "status" | "question_order" | "score">
      >;
      exam_attempt_answers: Table<
        ExamAttemptAnswer,
        InsertOf<ExamAttemptAnswer, "choice_id" | "short_answer" | "is_correct" | "points_awarded" | "answered_at">
      >;
      exam_attempt_events: Table<ExamAttemptEvent, InsertOf<ExamAttemptEvent, "at">>;
      practice_lessons: Table<PracticeLesson, InsertOf<PracticeLesson, "sort_order" | "created_at" | "updated_at">>;
      practice_topics: Table<PracticeTopic, InsertOf<PracticeTopic, "sort_order" | "created_at" | "updated_at">>;
      practice_sets: Table<PracticeSet, InsertOf<PracticeSet, "title" | "topic_id" | "topic" | "difficulty">>;
      practice_set_questions: Table<PracticeSetQuestion, PracticeSetQuestion>;
      practice_attempts: Table<
        PracticeAttempt,
        InsertOf<PracticeAttempt, "started_at" | "submitted_at" | "status" | "question_order" | "score">
      >;
      practice_attempt_answers: Table<
        PracticeAttemptAnswer,
        InsertOf<PracticeAttemptAnswer, "choice_id" | "short_answer" | "is_correct" | "points_awarded" | "answered_at">
      >;
    };
    Views: Record<string, never>;
    Functions: {
      submit_exam_attempt: {
        Args: { p_attempt_id: string };
        Returns: void;
      };
      save_practice_answer: {
        Args: { p_attempt_id: string; p_question_id: string; p_choice_id: string | null; p_short_answer: string | null };
        Returns: PracticeAttemptAnswer;
      };
      submit_practice_attempt: {
        Args: { p_attempt_id: string };
        Returns: void;
      };
    };
    Enums: {
      app_role: Role;
      student_status: StudentStatus;
      subject_type: SubjectType;
      grading_method: GradingMethod;
      development_domain: DevelopmentDomain;
      blood_type: BloodType;
      guardian_relationship: GuardianRelationship;
      term_type: TermType;
      term_status: TermStatus;
      academic_event_type: AcademicEventType;
      behavior_severity: BehaviorSeverity;
      score_item_kind: ScoreItemKind;
      exam_question_type: ExamQuestionType;
      exam_question_difficulty: ExamQuestionDifficulty;
      exam_attempt_status: ExamAttemptStatus;
      exam_attempt_event_type: ExamAttemptEventType;
      practice_attempt_status: PracticeAttemptStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
