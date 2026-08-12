import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurriculumCohort,
  CurriculumSubject,
  DevelopmentDomain,
  GradeLevel,
  KgAssessmentTopic,
  LearningUnit,
  StudentCohortEnrollment,
  StudyPlan,
} from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// -------------------------------------------------------------- study_plans

export function useStudyPlans() {
  return useQuery({
    queryKey: ["study_plans"],
    queryFn: async (): Promise<StudyPlan[]> => {
      const { data, error } = await supabase.from("study_plans").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export type StudyPlanDraft = Pick<StudyPlan, "code" | "name">;

export function useSaveStudyPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: StudyPlanDraft & { id?: string }): Promise<StudyPlan> => {
      const { data, error } = id
        ? await supabase.from("study_plans").update(draft).eq("id", id).select().single()
        : await supabase.from("study_plans").insert(draft).select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["study_plans"] }),
  });
}

// ------------------------------------------------------------- grade_levels

export function useGradeLevels(departmentId: string | null) {
  return useQuery({
    queryKey: ["grade_levels", departmentId],
    enabled: !!departmentId,
    queryFn: async (): Promise<GradeLevel[]> => {
      const { data, error } = await supabase
        .from("grade_levels")
        .select("*")
        .eq("department_id", departmentId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

/** Every grade level, across departments — for lookup maps (e.g. roster tables), not pickers. */
export function useAllGradeLevels() {
  return useQuery({
    queryKey: ["grade_levels", "all"],
    queryFn: async (): Promise<GradeLevel[]> => {
      const { data, error } = await supabase.from("grade_levels").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

// ----------------------------------------------------------- curriculum_cohorts

/** A department's curriculum bundles (one per entry point + entry year). */
export function useCohorts(departmentId: string | null) {
  return useQuery({
    queryKey: ["curriculum_cohorts", departmentId],
    enabled: !!departmentId,
    queryFn: async (): Promise<CurriculumCohort[]> => {
      const { data, error } = await supabase
        .from("curriculum_cohorts")
        .select("*")
        .eq("department_id", departmentId!)
        .order("entry_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export type CohortDraft = Pick<CurriculumCohort, "department_id" | "entry_grade_level_id" | "entry_year" | "name">;

export function useSaveCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: CohortDraft) => {
      const { error } = await supabase.from("curriculum_cohorts").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["curriculum_cohorts"] }),
  });
}

export function useRenameCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("curriculum_cohorts").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["curriculum_cohorts"] }),
  });
}

export function useDeleteCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("curriculum_cohorts").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["curriculum_cohorts"] }),
  });
}

// -------------------------------------------------------- curriculum_subjects

export function useCurriculumSubjects(gradeLevelId: string | null, cohortId: string | null) {
  return useQuery({
    queryKey: ["curriculum_subjects", gradeLevelId, cohortId],
    enabled: !!gradeLevelId && !!cohortId,
    queryFn: async (): Promise<CurriculumSubject[]> => {
      const { data, error } = await supabase
        .from("curriculum_subjects")
        .select("*")
        .eq("grade_level_id", gradeLevelId!)
        .eq("cohort_id", cohortId!);
      if (error) throw error;
      return data;
    },
  });
}

/** All curriculum rows at a grade — used when the assignment drawer skips cohort/plan picks. */
export function useCurriculumSubjectsAtGrade(gradeLevelId: string | null) {
  return useQuery({
    queryKey: ["curriculum_subjects", "at_grade", gradeLevelId],
    enabled: !!gradeLevelId,
    queryFn: async (): Promise<CurriculumSubject[]> => {
      const { data, error } = await supabase
        .from("curriculum_subjects")
        .select("*")
        .eq("grade_level_id", gradeLevelId!);
      if (error) throw error;
      return data;
    },
  });
}

export type CurriculumSubjectDraft = Pick<
  CurriculumSubject,
  "subject_id" | "grade_level_id" | "study_plan_id" | "term" | "cohort_id" | "score_collect_pct" | "score_exam_pct"
>;

export function useSaveCurriculumSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: CurriculumSubjectDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("curriculum_subjects").update(draft).eq("id", id)
        : await supabase.from("curriculum_subjects").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["curriculum_subjects"] }),
  });
}

/** Batch insert — shared plan/score settings across many subjects in one submit. */
export function useSaveCurriculumSubjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (drafts: CurriculumSubjectDraft[]) => {
      if (drafts.length === 0) return;
      const { error } = await supabase.from("curriculum_subjects").insert(drafts);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["curriculum_subjects"] }),
  });
}

export function useDeleteCurriculumSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("curriculum_subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["curriculum_subjects"] }),
  });
}

// ---------------------------------------------------------------- KG (อนุบาล)

/** Distinct academic years that already have units or assessment topics across these grade levels — for the year picker tabs. */
export function useKgAcademicYears(gradeLevelIds: string[]) {
  const key = [...gradeLevelIds].sort().join(",");
  return useQuery({
    queryKey: ["kg_academic_years", key],
    enabled: gradeLevelIds.length > 0,
    queryFn: async (): Promise<number[]> => {
      const [units, topics] = await Promise.all([
        supabase.from("learning_units").select("academic_year").in("grade_level_id", gradeLevelIds),
        supabase.from("kg_assessment_topics").select("academic_year").in("grade_level_id", gradeLevelIds),
      ]);
      if (units.error) throw units.error;
      if (topics.error) throw topics.error;
      const years = new Set([...units.data, ...topics.data].map((r) => r.academic_year));
      return [...years];
    },
  });
}

export function useLearningUnits(gradeLevelId: string | null, academicYear: number) {
  return useQuery({
    queryKey: ["learning_units", gradeLevelId, academicYear],
    enabled: !!gradeLevelId,
    queryFn: async (): Promise<LearningUnit[]> => {
      const { data, error } = await supabase
        .from("learning_units")
        .select("*")
        .eq("grade_level_id", gradeLevelId!)
        .eq("academic_year", academicYear)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export type LearningUnitDraft = Pick<
  LearningUnit,
  "grade_level_id" | "academic_year" | "name_th" | "name_en" | "sort_order"
>;

export function useSaveLearningUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: LearningUnitDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("learning_units").update(draft).eq("id", id)
        : await supabase.from("learning_units").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["learning_units"] }),
  });
}

export function useDeleteLearningUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_units").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["learning_units"] }),
  });
}

export function useKgAssessmentTopics(gradeLevelId: string | null, academicYear: number) {
  return useQuery({
    queryKey: ["kg_assessment_topics", gradeLevelId, academicYear],
    enabled: !!gradeLevelId,
    queryFn: async (): Promise<KgAssessmentTopic[]> => {
      const { data, error } = await supabase
        .from("kg_assessment_topics")
        .select("*")
        .eq("grade_level_id", gradeLevelId!)
        .eq("academic_year", academicYear)
        .order("domain")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export type KgAssessmentTopicDraft = Pick<
  KgAssessmentTopic,
  "grade_level_id" | "domain" | "academic_year" | "name_th" | "sort_order"
>;

export function useSaveKgAssessmentTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: KgAssessmentTopicDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("kg_assessment_topics").update(draft).eq("id", id)
        : await supabase.from("kg_assessment_topics").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["kg_assessment_topics"] }),
  });
}

export function useDeleteKgAssessmentTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kg_assessment_topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["kg_assessment_topics"] }),
  });
}

// ----------------------------------------------------- student_cohort_enrollments
// History, not a mutable pointer (see 0005) — "current" enrollment per
// student is just the latest row.

export function useCurrentEnrollments(cohortId: string | null) {
  return useQuery({
    queryKey: ["student_cohort_enrollments", "by_cohort", cohortId],
    enabled: !!cohortId,
    queryFn: async (): Promise<StudentCohortEnrollment[]> => {
      const { data, error } = await supabase
        .from("student_cohort_enrollments")
        .select("*")
        .eq("cohort_id", cohortId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Latest row per student wins — a transfer/ซ้ำชั้น leaves the old row in place.
      const latest = new Map<string, StudentCohortEnrollment>();
      for (const row of data) if (!latest.has(row.student_id)) latest.set(row.student_id, row);
      return [...latest.values()];
    },
  });
}

/** Latest cohort enrollment per student in a department — for study-plan lookup outside the enrollment page. */
export function useDepartmentStudentEnrollments(departmentId: string | null) {
  return useQuery({
    queryKey: ["student_cohort_enrollments", "by_department", departmentId],
    enabled: !!departmentId,
    queryFn: async (): Promise<StudentCohortEnrollment[]> => {
      const { data: cohorts, error: cohortErr } = await supabase
        .from("curriculum_cohorts")
        .select("id")
        .eq("department_id", departmentId!);
      if (cohortErr) throw cohortErr;
      const cohortIds = (cohorts ?? []).map((c) => c.id);
      if (cohortIds.length === 0) return [];

      const { data, error } = await supabase
        .from("student_cohort_enrollments")
        .select("*")
        .in("cohort_id", cohortIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const latest = new Map<string, StudentCohortEnrollment>();
      for (const row of data) if (!latest.has(row.student_id)) latest.set(row.student_id, row);
      return [...latest.values()];
    },
  });
}

export type EnrollmentDraft = Pick<StudentCohortEnrollment, "student_id" | "cohort_id" | "study_plan_id">;

/** Registers one or more students into a cohort (+ optional track) in one go. */
export function useEnrollStudents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (drafts: EnrollmentDraft[]) => {
      const { error } = await supabase.from("student_cohort_enrollments").insert(drafts);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_cohort_enrollments"] }),
  });
}

export function useDeleteEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("student_cohort_enrollments").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_cohort_enrollments"] }),
  });
}

export const DOMAIN_LABEL: Record<DevelopmentDomain, string> = {
  physical: "ด้านร่างกาย",
  emotional: "ด้านอารมณ์-จิตใจ",
  social: "ด้านสังคม",
  cognitive: "ด้านสติปัญญา",
};
