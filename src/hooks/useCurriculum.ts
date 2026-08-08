import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LearningArea, Subject, SubjectType } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

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

export type SubjectFilters = {
  search: string;
  learningAreaId: string;
  subjectType: SubjectType | "";
  includeInactive: boolean;
};

export function useSubjects(filters: SubjectFilters) {
  return useQuery({
    queryKey: ["subjects", filters],
    queryFn: async (): Promise<Subject[]> => {
      let q = supabase.from("subjects").select("*").order("code");

      if (!filters.includeInactive) q = q.eq("is_active", true);
      if (filters.learningAreaId) q = q.eq("learning_area_id", filters.learningAreaId);
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
  "code" | "name_th" | "name_en" | "learning_area_id" | "subject_type" | "credits" | "hours_per_week" | "is_active"
>;

export function useSaveSubject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...draft }: SubjectDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("subjects").update(draft).eq("id", id)
        : await supabase.from("subjects").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["subjects"] }),
  });
}
