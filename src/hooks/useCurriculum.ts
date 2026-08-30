import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LearningArea, Subject, SubjectType } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import type { ImportOutcome } from "@/hooks/useStudents";

export function useLearningAreas() {
  return useQuery({
    queryKey: ["learning_areas"],
    queryFn: async (): Promise<LearningArea[]> => {
      const { data, error } = await supabase.from("learning_areas").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export type LearningAreaDraft = Pick<LearningArea, "code" | "name" | "parent_id">;

/** Insert only — no admin page for learning_areas, just the inline "+ สาระย่อย" creator in the subject form. */
export function useSaveLearningArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: LearningAreaDraft): Promise<LearningArea> => {
      const { data, error } = await supabase.from("learning_areas").insert(draft).select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["learning_areas"] }),
  });
}

export type SubjectFilters = {
  search: string;
  departmentId: string;
  learningAreaId: string;
  gradeLevelId: string;
  term: number | "";
  subjectType: SubjectType | "";
  includeInactive: boolean;
};

export function useSubjects(filters: SubjectFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["subjects", filters],
    enabled: options?.enabled ?? true,
    queryFn: async (): Promise<Subject[]> => {
      let q = supabase.from("subjects").select("*").order("code");

      if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
      if (!filters.includeInactive) q = q.eq("is_active", true);
      if (filters.learningAreaId) q = q.eq("learning_area_id", filters.learningAreaId);
      if (filters.gradeLevelId) q = q.eq("suggested_grade_level_id", filters.gradeLevelId);
      if (filters.term) q = q.eq("suggested_term", filters.term);
      if (filters.subjectType) q = q.eq("subject_type", filters.subjectType);
      if (filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        q = q.or(`code.ilike.${term},name_th.ilike.${term},name_en.ilike.${term}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export type SubjectDraft = Pick<
  Subject,
  | "code"
  | "name_th"
  | "name_en"
  | "department_id"
  | "learning_area_id"
  | "credits"
  | "hours_per_week"
  | "is_active"
  | "suggested_grade_level_id"
  | "suggested_term"
  | "grading_method"
> & {
  /** Empty string while the create form hasn't chosen a type yet. */
  subject_type: SubjectType | "";
};

export function useSaveSubject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...draft }: SubjectDraft & { id?: string }) => {
      const { subject_type, learning_area_id, ...rest } = draft;
      if (!learning_area_id || !subject_type) {
        throw new Error("กรุณาเลือกกลุ่มสาระและประเภทวิชา");
      }
      const row = { ...rest, learning_area_id, subject_type };
      const { error } = id
        ? await supabase.from("subjects").update(row).eq("id", id)
        : await supabase.from("subjects").insert(row);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["subjects"] }),
  });
}

/**
 * Bulk insert from CSV, scoped to one department (all drafts share the same
 * department_id). Codes that already exist in that department are reported
 * back rather than overwritten — same shape as useImportStudents.
 */
export function useImportSubjects() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (drafts: SubjectDraft[]): Promise<ImportOutcome> => {
      if (drafts.length === 0) return { inserted: 0, skipped: [] };
      const departmentId = drafts[0]!.department_id;
      const codes = drafts.map((d) => d.code);
      const { data: existing, error: lookupError } = await supabase
        .from("subjects")
        .select("code")
        .eq("department_id", departmentId)
        .in("code", codes);
      if (lookupError) throw lookupError;

      const taken = new Set(existing.map((r) => r.code));
      const fresh = drafts.filter(
        (d): d is SubjectDraft & { subject_type: SubjectType } =>
          !taken.has(d.code) && !!d.subject_type && !!d.learning_area_id,
      );

      if (fresh.length > 0) {
        const { error } = await supabase.from("subjects").insert(fresh);
        if (error) throw error;
      }

      return { inserted: fresh.length, skipped: [...taken] };
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["subjects"] }),
  });
}

/** Hard delete — blocked at the DB (on delete restrict) if the subject is used in any curriculum_subjects row. */
export function useDeleteSubject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["subjects"] }),
  });
}
