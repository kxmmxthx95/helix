import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PeriodAttendanceRecord } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------- period_attendance_records
// เช็คชื่อรายคาบ — one row per (student, schedule_entry, date), separate
// from attendance_records (homeroom, once per day). See migration 0037.

export function usePeriodAttendance(scheduleEntryId: string | null, date: string) {
  return useQuery({
    queryKey: ["period_attendance_records", "by_entry_date", scheduleEntryId, date],
    enabled: !!scheduleEntryId && !!date,
    queryFn: async (): Promise<PeriodAttendanceRecord[]> => {
      const { data, error } = await supabase
        .from("period_attendance_records")
        .select("*")
        .eq("schedule_entry_id", scheduleEntryId!)
        .eq("date", date);
      if (error) throw error;
      return data;
    },
  });
}

/** All marks for one schedule entry across a date range — feeds the monthly summary table. */
export function usePeriodAttendanceRange(scheduleEntryId: string | null, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["period_attendance_records", "by_entry_range", scheduleEntryId, startDate, endDate],
    enabled: !!scheduleEntryId,
    queryFn: async (): Promise<PeriodAttendanceRecord[]> => {
      const { data, error } = await supabase
        .from("period_attendance_records")
        .select("*")
        .eq("schedule_entry_id", scheduleEntryId!)
        .gte("date", startDate)
        .lte("date", endDate);
      if (error) throw error;
      return data;
    },
  });
}

/** Which of `scheduleEntryIds` already have at least one mark on `date` — feeds the taken/not-taken badge in the periods list. */
export function usePeriodAttendanceTakenSet(scheduleEntryIds: string[], date: string) {
  return useQuery({
    queryKey: ["period_attendance_records", "taken", scheduleEntryIds, date],
    enabled: scheduleEntryIds.length > 0 && !!date,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("period_attendance_records")
        .select("schedule_entry_id")
        .in("schedule_entry_id", scheduleEntryIds)
        .eq("date", date);
      if (error) throw error;
      return new Set(data.map((r) => r.schedule_entry_id));
    },
  });
}

export type PeriodAttendanceDraft = Pick<
  PeriodAttendanceRecord,
  "student_id" | "schedule_entry_id" | "date" | "status" | "note" | "recorded_by"
>;

/** One save = the whole period's marks, upserted in one round trip — the DB trigger may sync/un-sync the daily attendance_records('leave') row. */
export function useSavePeriodAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: PeriodAttendanceDraft[]) => {
      const { error } = await supabase
        .from("period_attendance_records")
        .upsert(rows, { onConflict: "schedule_entry_id,date,student_id" });
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["period_attendance_records"] });
      void qc.invalidateQueries({ queryKey: ["attendance_records"] });
    },
  });
}
