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

/** Only the plans actually used in this cohort's curriculum_subjects — not every plan in the system. */
export function useCohortStudyPlans(cohortId: string | null) {
  return useQuery({
    queryKey: ["study_plans", "by_cohort", cohortId],
    enabled: !!cohortId,
    queryFn: async (): Promise<StudyPlan[]> => {
      const { data, error } = await supabase
        .from("curriculum_subjects")
        .select("study_plan:study_plans!inner(*)")
        .eq("cohort_id", cohortId!)
        .not("study_plan_id", "is", null);
      if (error) throw error;
      const byId = new Map<string, StudyPlan>();
      for (const row of data as unknown as { study_plan: StudyPlan }[]) {
        byId.set(row.study_plan.id, row.study_plan);
      }
      return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
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

export const DOMAIN_LABEL: Record<DevelopmentDomain, string> = {
  physical: "ด้านร่างกาย",
  emotional: "ด้านอารมณ์-จิตใจ",
  social: "ด้านสังคม",
  cognitive: "ด้านสติปัญญา",
};
