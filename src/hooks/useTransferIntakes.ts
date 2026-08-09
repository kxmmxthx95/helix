import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TransferIntake } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export function useTransferIntakes() {
  return useQuery({
    queryKey: ["transfer_intakes"],
    queryFn: async (): Promise<TransferIntake[]> => {
      const { data, error } = await supabase
        .from("transfer_intakes")
        .select("*")
        .order("intake_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export type TransferIntakeDraft = Pick<TransferIntake, "student_id" | "source_school" | "intake_date">;

export function useCreateTransferIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: TransferIntakeDraft) => {
      const { error } = await supabase.from("transfer_intakes").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["transfer_intakes"] }),
  });
}

/**
 * Which of these students already have a classroom / cohort placement —
 * derived from the real enrollment tables, not stored on the case itself,
 * so progress can't drift out of sync (grill decision, 2026-08-09).
 * refetchOnMount "always": classroom/cohort assignment happens on other
 * tabs, whose mutations invalidate their own query keys, not this one.
 */
export function useTransferProgress(studentIds: string[]) {
  return useQuery({
    queryKey: ["transfer_intakes", "progress", studentIds],
    enabled: studentIds.length > 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [classroomRes, cohortRes] = await Promise.all([
        supabase.from("student_classroom_enrollments").select("student_id").in("student_id", studentIds),
        supabase.from("student_cohort_enrollments").select("student_id").in("student_id", studentIds),
      ]);
      if (classroomRes.error) throw classroomRes.error;
      if (cohortRes.error) throw cohortRes.error;
      return {
        hasClassroom: new Set(classroomRes.data.map((r) => r.student_id)),
        hasCohort: new Set(cohortRes.data.map((r) => r.student_id)),
      };
    },
  });
}
