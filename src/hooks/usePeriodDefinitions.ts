import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PeriodDefinition } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------- period_definitions
// Per department, per day — day_of_week is part of the row (not a shared
// grid) because Mon/Wed/Fri commonly differ in real Thai private schools.
// See migration 0019.

export function useDepartmentPeriods(departmentId: string | null) {
  return useQuery({
    queryKey: ["period_definitions", departmentId],
    enabled: !!departmentId,
    queryFn: async (): Promise<PeriodDefinition[]> => {
      const { data, error } = await supabase
        .from("period_definitions")
        .select("*")
        .eq("department_id", departmentId!)
        .order("day_of_week")
        .order("period_no");
      if (error) throw error;
      return data;
    },
  });
}

export type PeriodDefinitionDraft = Pick<
  PeriodDefinition,
  "department_id" | "day_of_week" | "period_no" | "period_type" | "label" | "start_time" | "end_time"
>;

export function useSavePeriodDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: PeriodDefinitionDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("period_definitions").update(draft).eq("id", id)
        : await supabase.from("period_definitions").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["period_definitions"] }),
  });
}

export function useDeletePeriodDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("period_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["period_definitions"] }),
  });
}
