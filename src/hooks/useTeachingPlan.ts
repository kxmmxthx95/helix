import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TeachingAssignment, TeachingPlanUnit } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------ teaching_assignments
// A teacher's own assigned subjects — reused from teaching_assignments (0017)
// rather than a separate picker table, filtered to the signed-in teacher.

export function useMyTeachingAssignments(teacherId: string | null) {
  return useQuery({
    queryKey: ["teaching_assignments", "by_teacher", teacherId],
    enabled: !!teacherId,
    queryFn: async (): Promise<TeachingAssignment[]> => {
      const { data, error } = await supabase
        .from("teaching_assignments")
        .select("*")
        .eq("teacher_id", teacherId!)
        .order("academic_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ------------------------------------------------------------ teaching_plan_units
// แผนการสอน — see migration 0020 for the "current unit is a queue, not a
// calendar mapping" rationale.

export function useTeachingPlanUnits(teachingAssignmentId: string | null) {
  return useQuery({
    queryKey: ["teaching_plan_units", teachingAssignmentId],
    enabled: !!teachingAssignmentId,
    queryFn: async (): Promise<TeachingPlanUnit[]> => {
      const { data, error } = await supabase
        .from("teaching_plan_units")
        .select("*")
        .eq("teaching_assignment_id", teachingAssignmentId!)
        .order("unit_no");
      if (error) throw error;
      return data;
    },
  });
}

/** Lowest unit_no not yet completed — what PMV-Check (or this page) shows as "today's plan". */
export function currentPlanUnit(units: TeachingPlanUnit[]): TeachingPlanUnit | null {
  return units.find((u) => u.completed_at === null) ?? null;
}

export function planUnitStatus(u: TeachingPlanUnit): { text: string; className: string } {
  if (u.completed_at === null) return { text: "ยังไม่สอน", className: "bg-muted text-muted-foreground" };
  return u.completed_on_plan
    ? { text: "สอนตามแผน", className: "bg-success/15 text-success" }
    : { text: "ไม่ตามแผน", className: "bg-warning/15 text-warning" };
}

/** All plan units for a set of teaching_assignments at once — the overview page's per-assignment progress rollup. */
export function useTeachingPlanUnitsForAssignments(assignmentIds: string[]) {
  return useQuery({
    queryKey: ["teaching_plan_units", "by_assignments", assignmentIds],
    enabled: assignmentIds.length > 0,
    queryFn: async (): Promise<TeachingPlanUnit[]> => {
      const { data, error } = await supabase
        .from("teaching_plan_units")
        .select("*")
        .in("teaching_assignment_id", assignmentIds)
        .order("unit_no");
      if (error) throw error;
      return data;
    },
  });
}

export type TeachingPlanUnitDraft = Pick<TeachingPlanUnit, "teaching_assignment_id" | "unit_no" | "title"> &
  Partial<Pick<TeachingPlanUnit, "description">>;

export function useCreatePlanUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: TeachingPlanUnitDraft) => {
      const { error } = await supabase.from("teaching_plan_units").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_plan_units"] }),
  });
}

export function useUpdatePlanUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title, description }: { id: string; title: string; description: string | null }) => {
      const { error } = await supabase.from("teaching_plan_units").update({ title, description }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_plan_units"] }),
  });
}

export function useDeletePlanUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teaching_plan_units").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_plan_units"] }),
  });
}

/** Marks the current unit taught — สอนตามแผน (true) or ไม่ตามแผน (false) today. */
export function useMarkPlanUnitTaught() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, onPlan }: { id: string; onPlan: boolean }) => {
      const { error } = await supabase
        .from("teaching_plan_units")
        .update({ completed_at: new Date().toISOString(), completed_on_plan: onPlan })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_plan_units"] }),
  });
}

/** Undo — reopens the unit as the current one again. */
export function useReopenPlanUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("teaching_plan_units")
        .update({ completed_at: null, completed_on_plan: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_plan_units"] }),
  });
}
