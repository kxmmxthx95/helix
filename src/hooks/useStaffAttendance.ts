import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceStatus, StaffAttendanceStatusRow } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// -------------------------------------------------------- staff attendance status
// Derived มา/สาย/ขาด/ลา per employee per work day — see
// supabase/migrations/0062_staff_attendance_status.sql. Not a table: every
// row is computed server-side from time_clock_records + leave_requests +
// academic_events, scoped to whatever the caller could already see on those
// tables (self, or can_manage() within their department/org-wide).

export function useStaffAttendanceRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["staff_attendance_status", startDate, endDate],
    queryFn: async (): Promise<StaffAttendanceStatusRow[]> => {
      const { data, error } = await supabase.rpc("staff_attendance_status", {
        p_start: startDate,
        p_end: endDate,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useSetStaffAttendanceOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { profileId: string; date: string; status: AttendanceStatus; reason: string }) => {
      const { error } = await supabase.rpc("set_staff_attendance_override", {
        p_profile_id: v.profileId,
        p_date: v.date,
        p_status: v.status,
        p_reason: v.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_attendance_status"] }),
  });
}

export function useClearStaffAttendanceOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { profileId: string; date: string }) => {
      const { error } = await supabase.rpc("clear_staff_attendance_override", {
        p_profile_id: v.profileId,
        p_date: v.date,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_attendance_status"] }),
  });
}
