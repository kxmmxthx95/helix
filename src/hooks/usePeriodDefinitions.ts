import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PeriodDefinition } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------- period_definitions
// Per department, per day — day_of_week is part of the row (not a shared
// grid) because Mon/Wed/Fri commonly differ in real Thai private schools.
// See migration 0019. grade_level_id (0031) optionally overrides the
// department default for one grade — null rows are the department default.

export function useDepartmentPeriods(departmentId: string | null) {
  return useQuery({
    queryKey: ["period_definitions", departmentId, "default"],
    enabled: !!departmentId,
    queryFn: async (): Promise<PeriodDefinition[]> => {
      const { data, error } = await supabase
        .from("period_definitions")
        .select("*")
        .eq("department_id", departmentId!)
        .is("grade_level_id", null)
        .order("day_of_week")
        .order("period_no");
      if (error) throw error;
      return data;
    },
  });
}

export function usePeriodsForGrade(departmentId: string | null, gradeLevelId: string | null) {
  return useQuery({
    queryKey: ["period_definitions", departmentId, gradeLevelId],
    enabled: !!departmentId && !!gradeLevelId,
    queryFn: async (): Promise<PeriodDefinition[]> => {
      const { data, error } = await supabase
        .from("period_definitions")
        .select("*")
        .eq("department_id", departmentId!)
        .eq("grade_level_id", gradeLevelId!)
        .order("day_of_week")
        .order("period_no");
      if (error) throw error;
      return data;
    },
  });
}

export type PeriodDefinitionDraft = Pick<
  PeriodDefinition,
  | "department_id"
  | "grade_level_id"
  | "day_of_week"
  | "period_no"
  | "period_type"
  | "label"
  | "start_time"
  | "end_time"
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

/** Quick-setup wizard: replace a scope's rows for the given days, then insert the generated set. */
export function useGeneratePeriods() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      departmentId,
      gradeLevelId,
      days,
      rows,
    }: {
      departmentId: string;
      gradeLevelId: string | null;
      days: number[];
      rows: PeriodDefinitionDraft[];
    }) => {
      let del = supabase.from("period_definitions").delete().eq("department_id", departmentId).in("day_of_week", days);
      del = gradeLevelId ? del.eq("grade_level_id", gradeLevelId) : del.is("grade_level_id", null);
      const { error: delError } = await del;
      if (delError) throw delError;

      if (rows.length === 0) return;
      const { error: insertError } = await supabase.from("period_definitions").insert(rows);
      if (insertError) throw insertError;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["period_definitions"] }),
  });
}

export type ScheduledSlot = { id: string; day_of_week: number; period_no: number; grade_level_id: string };

/** Every placed schedule entry of a department for one year (all terms), reduced to day+period+grade — used to check a period-structure change before saving it. */
export function useDepartmentScheduledSlots(departmentId: string | null, academicYear: number) {
  return useQuery({
    queryKey: ["schedule_entries", "slots_by_department", departmentId, academicYear],
    enabled: !!departmentId,
    queryFn: async (): Promise<ScheduledSlot[]> => {
      const { data, error } = await supabase
        .from("schedule_entries")
        .select(
          "id, day_of_week, period_no, teaching_assignments!inner(academic_year, classroom:classrooms!inner(grade_level_id, grade_level:grade_levels!inner(department_id)))",
        )
        .eq("teaching_assignments.academic_year", academicYear)
        .eq("teaching_assignments.classroom.grade_level.department_id", departmentId!);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as unknown as {
          id: string;
          day_of_week: number;
          period_no: number;
          teaching_assignments: { classroom: { grade_level_id: string } };
        };
        return {
          id: row.id,
          day_of_week: row.day_of_week,
          period_no: row.period_no,
          grade_level_id: row.teaching_assignments.classroom.grade_level_id,
        };
      });
    },
  });
}

/** Grades that have their own period rows (everyone else falls back to the department default). */
export function useGradesWithPeriodOverride(departmentId: string | null) {
  return useQuery({
    queryKey: ["period_definitions", departmentId, "override_grades"],
    enabled: !!departmentId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("period_definitions")
        .select("grade_level_id")
        .eq("department_id", departmentId!)
        .not("grade_level_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.grade_level_id as string));
    },
  });
}
