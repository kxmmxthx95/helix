import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StudentLeaveRequest } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------- student_leave_requests
// Separate domain from leave_requests (staff) — see migration 0035. A parent
// or the student submits; the current homeroom teacher (or can_manage() in
// department) approves; approval auto-fills attendance_records via a DB
// trigger — nothing to do client-side for that part.

export function useStudentLeaveRequests(studentId: string | null) {
  return useQuery({
    queryKey: ["student_leave_requests", "by_student", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<StudentLeaveRequest[]> => {
      const { data, error } = await supabase
        .from("student_leave_requests")
        .select("*")
        .eq("student_id", studentId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export type PendingStudentLeaveRequest = StudentLeaveRequest & {
  student: { student_code: string; first_name: string; last_name: string } | null;
};

/** RLS already limits this to the caller's approval scope (current homeroom, or can_manage() in department). */
export function usePendingStudentLeaveApprovals() {
  return useQuery({
    queryKey: ["student_leave_requests", "pending"],
    queryFn: async (): Promise<PendingStudentLeaveRequest[]> => {
      const { data, error } = await supabase
        .from("student_leave_requests")
        .select("*, student:students(student_code, first_name, last_name)")
        .eq("status", "pending")
        .order("start_date");
      if (error) throw error;
      return data as unknown as PendingStudentLeaveRequest[];
    },
  });
}

/** Approved leave rows covering `date` for any of `studentIds` — feeds the auto-leave lock in period check-in (server also enforces this via a trigger, see migration 0037). */
export function useApprovedLeaveOnDate(studentIds: string[], date: string) {
  return useQuery({
    queryKey: ["student_leave_requests", "approved_on_date", studentIds, date],
    enabled: studentIds.length > 0 && !!date,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("student_leave_requests")
        .select("student_id")
        .in("student_id", studentIds)
        .eq("status", "approved")
        .lte("start_date", date)
        .gte("end_date", date);
      if (error) throw error;
      return new Set(data.map((r) => r.student_id));
    },
  });
}

export function useRequestStudentLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      submittedBy: string;
      startDate: string;
      endDate: string;
      reason: string;
    }) => {
      const { error } = await supabase.from("student_leave_requests").insert({
        student_id: params.studentId,
        submitted_by: params.submittedBy,
        start_date: params.startDate,
        end_date: params.endDate,
        reason: params.reason,
      });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_leave_requests"] }),
  });
}

export function useCancelStudentLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("student_leave_requests")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_leave_requests"] }),
  });
}

export function useSetStudentLeaveStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      approvedBy,
    }: {
      id: string;
      status: "approved" | "rejected";
      approvedBy: string;
    }) => {
      const { error } = await supabase
        .from("student_leave_requests")
        .update({ status, approved_by: approvedBy, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["student_leave_requests"] });
      void qc.invalidateQueries({ queryKey: ["attendance_records"] });
    },
  });
}
