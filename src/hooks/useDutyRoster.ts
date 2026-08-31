import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DutyAssignment, DutyPoint, DutyTransferRequest, DutyTransferStatus } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------------ duty_points
// Lookup table, admin-managed — see Settings.tsx (same shape as leave_types).

export function useDutyPoints() {
  return useQuery({
    queryKey: ["duty_points"],
    queryFn: async (): Promise<DutyPoint[]> => {
      const { data, error } = await supabase.from("duty_points").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export type DutyPointDraft = Pick<DutyPoint, "name" | "active">;

export function useSaveDutyPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: DutyPointDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("duty_points").update(draft).eq("id", id)
        : await supabase.from("duty_points").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["duty_points"] }),
  });
}

export function useDeleteDutyPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("duty_points").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["duty_points"] }),
  });
}

// -------------------------------------------------------------- duty_assignments

export function useDutyAssignmentsRange(startDate: string, endDate: string, staffId?: string) {
  return useQuery({
    queryKey: ["duty_assignments", startDate, endDate, staffId],
    queryFn: async (): Promise<DutyAssignment[]> => {
      let q = supabase.from("duty_assignments").select("*").gte("date", startDate).lte("date", endDate);
      if (staffId) q = q.eq("staff_id", staffId);
      const { data, error } = await q.order("date");
      if (error) throw error;
      return data;
    },
  });
}

/** Tally of duty days per staff member — used by the monthly summary view. */
export function summarizeDutyCounts(assignments: { staff_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of assignments) counts.set(a.staff_id, (counts.get(a.staff_id) ?? 0) + 1);
  return counts;
}

export function useAssignDuty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { dutyPointId: string; staffId: string; date: string; createdBy: string }) => {
      const { error } = await supabase.from("duty_assignments").insert({
        duty_point_id: params.dutyPointId,
        staff_id: params.staffId,
        date: params.date,
        created_by: params.createdBy,
      });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["duty_assignments"] }),
  });
}

export function useRemoveDutyAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("duty_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["duty_assignments"] }),
  });
}

// --------------------------------------------------------- duty_transfer_requests
// One-way hand-off: requester gives their duty away, target accepts/declines,
// can_manage() gives the final word — see migration 0063.

/** Requests I sent — to show their status, and cancel while still pending_target. */
export function useMyDutyTransferRequests(profileId: string | null) {
  return useQuery({
    queryKey: ["duty_transfer_requests", "mine", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<DutyTransferRequest[]> => {
      const { data, error } = await supabase
        .from("duty_transfer_requests")
        .select("*")
        .eq("requester_id", profileId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Requests offered to me — pending_target ones need my accept/decline. */
export function useIncomingDutyTransfers(profileId: string | null) {
  return useQuery({
    queryKey: ["duty_transfer_requests", "incoming", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<DutyTransferRequest[]> => {
      const { data, error } = await supabase
        .from("duty_transfer_requests")
        .select("*")
        .eq("target_staff_id", profileId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** RLS already limits this to the caller's approval scope (own department, or org-wide). Empty status = all. */
export function useDutyTransferApprovals(status: DutyTransferStatus | "") {
  return useQuery({
    queryKey: ["duty_transfer_requests", "approvals", status],
    queryFn: async (): Promise<DutyTransferRequest[]> => {
      let q = supabase.from("duty_transfer_requests").select("*").order("created_at", { ascending: false });
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

function invalidateDutyTransfers(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["duty_transfer_requests"] });
  void qc.invalidateQueries({ queryKey: ["duty_assignments"] });
}

export function useRequestDutyTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { assignmentId: string; requesterId: string; targetStaffId: string }) => {
      const { error } = await supabase.from("duty_transfer_requests").insert({
        assignment_id: params.assignmentId,
        requester_id: params.requesterId,
        target_staff_id: params.targetStaffId,
      });
      if (error) throw error;
    },
    onSettled: () => invalidateDutyTransfers(qc),
  });
}

/** Target accepts (→ pending_admin) or declines (→ rejected_by_target) an offer. */
export function useRespondDutyTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase
        .from("duty_transfer_requests")
        .update({ status: accept ? "pending_admin" : "rejected_by_target" })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => invalidateDutyTransfers(qc),
  });
}

/** Requester withdraws their own request — only while still pending_target. */
export function useCancelDutyTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("duty_transfer_requests").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => invalidateDutyTransfers(qc),
  });
}

/** can_manage()'s final decision on a target-accepted request. */
export function useDecideDutyTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase
        .from("duty_transfer_requests")
        .update({ status: approve ? "approved" : "rejected_by_admin" })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => invalidateDutyTransfers(qc),
  });
}
