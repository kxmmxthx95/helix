import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DutyAssignment,
  DutyPoint,
  DutyTransferRequest,
  DutyTransferStatus,
  DutyWeeklyTemplate,
} from "@/lib/database.types";
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

export type DutyPointDraft = Pick<DutyPoint, "name" | "active" | "mode" | "fixed_staff_id">;

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

const SCHOOL_WEEKDAYS = new Set([1, 2, 3, 4, 5]); // จ-ศ, see migration 0064 grill decision

function schoolDaysInRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  for (const cur = new Date(startDate); cur <= new Date(endDate); cur.setDate(cur.getDate() + 1)) {
    if (SCHOOL_WEEKDAYS.has(cur.getDay())) days.push(cur.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Fixed-mode duty points have no real `duty_assignments` row on a normal
 * day — only exceptions (a manager override, or a materialized transfer
 * request) do. Expand each fixed point's rule into virtual rows for every
 * school day not already covered by a real row, so "เวรของฉัน" and the
 * monthly summary see the full picture. See migration 0064.
 */
export function expandFixedDutyAssignments(
  points: Pick<DutyPoint, "id" | "mode" | "fixed_staff_id" | "active">[],
  realAssignments: Pick<DutyAssignment, "duty_point_id" | "date">[],
  startDate: string,
  endDate: string,
): { duty_point_id: string; staff_id: string; date: string }[] {
  const covered = new Set(realAssignments.map((a) => `${a.duty_point_id}|${a.date}`));
  const days = schoolDaysInRange(startDate, endDate);
  const virtual: { duty_point_id: string; staff_id: string; date: string }[] = [];
  for (const p of points) {
    if (p.mode !== "fixed" || !p.fixed_staff_id || !p.active) continue;
    for (const date of days) {
      if (covered.has(`${p.id}|${date}`)) continue;
      virtual.push({ duty_point_id: p.id, staff_id: p.fixed_staff_id, date });
    }
  }
  return virtual;
}

function allDaysInRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  for (const cur = new Date(startDate); cur <= new Date(endDate); cur.setDate(cur.getDate() + 1)) {
    days.push(cur.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Same idea as expandFixedDutyAssignments, for a 'rotating' point's weekly
 * template (0065) instead: every weekday, all 7 days, any number of staff.
 * A real duty_assignments row for the point+date (there's currently no UI
 * path that creates one for a rotating point — the grid only ever writes to
 * duty_weekly_template) suppresses ALL of that day's virtual rows.
 */
export function expandWeeklyTemplateAssignments(
  points: Pick<DutyPoint, "id" | "mode" | "active">[],
  template: Pick<DutyWeeklyTemplate, "duty_point_id" | "weekday" | "staff_id">[],
  realAssignments: Pick<DutyAssignment, "duty_point_id" | "date">[],
  startDate: string,
  endDate: string,
): { duty_point_id: string; staff_id: string; date: string }[] {
  const rotatingPointIds = new Set(points.filter((p) => p.mode === "rotating" && p.active).map((p) => p.id));
  const covered = new Set(realAssignments.map((a) => `${a.duty_point_id}|${a.date}`));
  const byPointWeekday = new Map<string, string[]>();
  for (const t of template) {
    if (!rotatingPointIds.has(t.duty_point_id)) continue;
    const key = `${t.duty_point_id}|${t.weekday}`;
    const staffIds = byPointWeekday.get(key) ?? [];
    staffIds.push(t.staff_id);
    byPointWeekday.set(key, staffIds);
  }

  const virtual: { duty_point_id: string; staff_id: string; date: string }[] = [];
  for (const date of allDaysInRange(startDate, endDate)) {
    const weekday = new Date(date).getDay();
    for (const pointId of rotatingPointIds) {
      if (covered.has(`${pointId}|${date}`)) continue;
      for (const staffId of byPointWeekday.get(`${pointId}|${weekday}`) ?? []) {
        virtual.push({ duty_point_id: pointId, staff_id: staffId, date });
      }
    }
  }
  return virtual;
}

export function useDutyWeeklyTemplate() {
  return useQuery({
    queryKey: ["duty_weekly_template"],
    queryFn: async (): Promise<DutyWeeklyTemplate[]> => {
      const { data, error } = await supabase.from("duty_weekly_template").select("*");
      if (error) throw error;
      return data;
    },
  });
}

export function useAddWeeklyTemplateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { dutyPointId: string; weekday: number; staffId: string; createdBy: string }) => {
      const { error } = await supabase.from("duty_weekly_template").insert({
        duty_point_id: params.dutyPointId,
        weekday: params.weekday,
        staff_id: params.staffId,
        created_by: params.createdBy,
      });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["duty_weekly_template"] }),
  });
}

export function useRemoveWeeklyTemplateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("duty_weekly_template").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["duty_weekly_template"] }),
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

/**
 * `assignmentId` for a normal (already-materialized) duty. For a fixed-mode
 * point's virtual day, pass `dutyPointId` + `date` instead — the DB trigger
 * lazy-creates the `duty_assignments` row and fills in `assignment_id`. See
 * migration 0064.
 */
export function useRequestDutyTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      params: { requesterId: string; targetStaffId: string } & (
        | { assignmentId: string; dutyPointId?: undefined; date?: undefined }
        | { assignmentId?: undefined; dutyPointId: string; date: string }
      ),
    ) => {
      const { error } = await supabase.from("duty_transfer_requests").insert(
        params.assignmentId
          ? { assignment_id: params.assignmentId, requester_id: params.requesterId, target_staff_id: params.targetStaffId }
          : {
              duty_point_id: params.dutyPointId,
              date: params.date,
              requester_id: params.requesterId,
              target_staff_id: params.targetStaffId,
            },
      );
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
