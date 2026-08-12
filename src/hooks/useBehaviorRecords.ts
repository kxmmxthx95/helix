import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BehaviorCategory, BehaviorRecord } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------- behavior_records
// คะแนนพฤติกรรม — every student starts each academic year at STARTING_SCORE;
// each row is one +/- point entry (see migration 0027). No day-per-student
// upsert like attendance — a student can get several entries in one day, so
// this is a plain event log.
//
// Classroom picker (useClassroomRoster/useHomeroomClassrooms) is shared with
// attendance — see @/hooks/useAttendance, nothing behavior-specific about it.

export const STARTING_SCORE = 100;

export function useBehaviorRecords(params: {
  classroomId?: string | null;
  studentId?: string | null;
  startDate: string;
  endDate: string;
}) {
  const { classroomId, studentId, startDate, endDate } = params;
  return useQuery({
    queryKey: ["behavior_records", classroomId ?? null, studentId ?? null, startDate, endDate],
    enabled: !!(classroomId || studentId),
    queryFn: async (): Promise<BehaviorRecord[]> => {
      let q = supabase.from("behavior_records").select("*").gte("date", startDate).lte("date", endDate);
      if (classroomId) q = q.eq("classroom_id", classroomId);
      if (studentId) q = q.eq("student_id", studentId);
      const { data, error } = await q.order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export const summarizeBehaviorScore = (records: BehaviorRecord[]): number =>
  STARTING_SCORE + records.reduce((sum, r) => sum + r.points, 0);

export type BehaviorRecordDraft = Pick<
  BehaviorRecord,
  "student_id" | "classroom_id" | "date" | "points" | "reason" | "recorded_by"
>;

/** Insert a new entry, or edit an existing one's points/reason/date when id is passed. */
export function useSaveBehaviorRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: BehaviorRecordDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("behavior_records").update(draft).eq("id", id)
        : await supabase.from("behavior_records").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["behavior_records"] }),
  });
}

export function useDeleteBehaviorRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("behavior_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["behavior_records"] }),
  });
}

// ----------------------------------------------------------- behavior_categories
// หมวดหมู่พฤติกรรมสำเร็จรูป — org-wide-managed presets (see migration 0028).
// Picking one just pre-fills the entry form; not referenced by FK.

export function useBehaviorCategories() {
  return useQuery({
    queryKey: ["behavior_categories"],
    queryFn: async (): Promise<BehaviorCategory[]> => {
      const { data, error } = await supabase.from("behavior_categories").select("*").order("label");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateBehaviorCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: Pick<BehaviorCategory, "label" | "points" | "severity">) => {
      const { error } = await supabase.from("behavior_categories").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["behavior_categories"] }),
  });
}

export function useDeleteBehaviorCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("behavior_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["behavior_categories"] }),
  });
}
