import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Student, StudentStatus } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export type StudentFilters = {
  search: string;
  departmentId: string;
  status: StudentStatus | "";
};

export type StudentDraft = Pick<
  Student,
  | "student_code"
  | "prefix"
  | "first_name"
  | "last_name"
  | "department_id"
  | "grade_level_id"
  | "status"
  | "national_id"
  | "phone"
  | "email"
  | "address"
  | "family_status"
  | "blood_type"
  | "chronic_disease"
  | "drug_allergy"
  | "food_allergy"
>;

export function useStudents(filters: StudentFilters) {
  return useQuery({
    queryKey: ["students", filters],
    queryFn: async (): Promise<Student[]> => {
      let q = supabase.from("students").select("*").order("student_code");

      if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        q = q.or(
          `first_name.ilike.${term},last_name.ilike.${term},student_code.ilike.${term}`,
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useSaveStudent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...draft }: StudentDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("students").update(draft).eq("id", id)
        : await supabase.from("students").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

export type ImportOutcome = { inserted: number; skipped: string[] };

/**
 * Bulk insert from CSV. Codes that already exist are reported back rather
 * than overwritten — an import must never silently replace a live record.
 */
export function useImportStudents() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (drafts: StudentDraft[]): Promise<ImportOutcome> => {
      const codes = drafts.map((d) => d.student_code);
      const { data: existing, error: lookupError } = await supabase
        .from("students")
        .select("student_code")
        .in("student_code", codes);
      if (lookupError) throw lookupError;

      const taken = new Set(existing.map((r) => r.student_code));
      const fresh = drafts.filter((d) => !taken.has(d.student_code));

      if (fresh.length > 0) {
        const { error } = await supabase.from("students").insert(fresh);
        if (error) throw error;
      }

      return { inserted: fresh.length, skipped: [...taken] };
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["students"] }),
  });
}
