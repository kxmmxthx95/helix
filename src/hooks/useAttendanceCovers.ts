import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceCover, CoverStatus } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ครูแทนเช็คชื่อ — migration 0139. Rules (ownership, date window, status
// transitions) live in DB triggers/RLS; these hooks only call through.

const KEY = ["attendance_covers"] as const;

/** Work the signed-in teacher was asked to cover (pending + confirmed) in a date range. */
export function useMyCovers(from: string, to: string) {
  return useQuery({
    queryKey: [...KEY, "mine", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_attendance_covers", { p_from: from, p_to: to });
      if (error) throw error;
      return data;
    },
  });
}

/** The leave owner's attendance duties on one day (homeroom + their timetable periods). */
export function useAttendanceDuties(profileId: string | null, date: string | null) {
  return useQuery({
    queryKey: [...KEY, "duties", profileId, date],
    enabled: !!profileId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("attendance_duties", { p_profile: profileId!, p_date: date! });
      if (error) throw error;
      return data;
    },
  });
}

/** Covers on one leave request (leave owner / manager view). */
export function useLeaveCovers(leaveRequestId: string | null) {
  return useQuery({
    queryKey: [...KEY, "by_leave", leaveRequestId],
    enabled: !!leaveRequestId,
    queryFn: async (): Promise<AttendanceCover[]> => {
      const { data, error } = await supabase
        .from("attendance_covers")
        .select("*")
        .eq("leave_request_id", leaveRequestId!)
        .in("status", ["pending", "confirmed", "declined"])
        .order("date");
      if (error) throw error;
      return data;
    },
  });
}

export type ProposeCover = {
  leave_request_id: string;
  date: string;
  classroom_id: string | null;
  schedule_entry_id: string | null;
  cover_staff_id: string;
  proposed_by: string;
};

export function useProposeCovers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: ProposeCover[]) => {
      const { error } = await supabase.from("attendance_covers").insert(rows);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetCoverStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Extract<CoverStatus, "confirmed" | "declined" | "cancelled"> }) => {
      const { error } = await supabase.from("attendance_covers").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
