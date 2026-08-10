import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScheduleEntry, TeachingAssignment } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------- schedule_entries
// Weekly recurring placement of a teaching_assignment into a day+period slot
// (see migration 0019). Fetched per classroom or per teacher, joined with the
// assignment for display — the DB trigger (not this hook) enforces
// conflicts, period validity, and term locks.

export type ScheduleEntryRow = ScheduleEntry & {
  teaching_assignment: Pick<
    TeachingAssignment,
    "teacher_id" | "subject_id" | "classroom_id" | "periods_per_week" | "group_id"
  >;
};

function mapRow(row: unknown): ScheduleEntryRow {
  const r = row as ScheduleEntry & { teaching_assignments: ScheduleEntryRow["teaching_assignment"] };
  const { teaching_assignments, ...rest } = r;
  return { ...rest, teaching_assignment: teaching_assignments };
}

export function useClassroomSchedule(classroomId: string | null, academicYear: number, term: number | null) {
  return useQuery({
    queryKey: ["schedule_entries", "by_classroom", classroomId, academicYear, term],
    enabled: !!classroomId,
    queryFn: async (): Promise<ScheduleEntryRow[]> => {
      let q = supabase
        .from("schedule_entries")
        .select("*, teaching_assignments!inner(teacher_id,subject_id,classroom_id,periods_per_week,group_id)")
        .eq("teaching_assignments.classroom_id", classroomId!)
        .eq("teaching_assignments.academic_year", academicYear);
      q = term === null ? q.is("teaching_assignments.term", null) : q.eq("teaching_assignments.term", term);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export function useTeacherSchedule(teacherId: string | null, academicYear: number, term: number | null) {
  return useQuery({
    queryKey: ["schedule_entries", "by_teacher", teacherId, academicYear, term],
    enabled: !!teacherId,
    queryFn: async (): Promise<ScheduleEntryRow[]> => {
      let q = supabase
        .from("schedule_entries")
        .select("*, teaching_assignments!inner(teacher_id,subject_id,classroom_id,periods_per_week,group_id)")
        .eq("teaching_assignments.teacher_id", teacherId!)
        .eq("teaching_assignments.academic_year", academicYear);
      q = term === null ? q.is("teaching_assignments.term", null) : q.eq("teaching_assignments.term", term);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export type ScheduleEntryDraft = Pick<ScheduleEntry, "teaching_assignment_id" | "day_of_week" | "period_no">;

export function useCreateScheduleEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ScheduleEntryDraft) => {
      const { error } = await supabase.from("schedule_entries").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["schedule_entries"] }),
  });
}

export function useDeleteScheduleEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedule_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["schedule_entries"] }),
  });
}
