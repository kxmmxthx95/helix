import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeaveRequest, LeaveStatus, LeaveType } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------------ leave_types
// Lookup table, admin-managed (org-wide only) — see migration 0033.

export function useLeaveTypes() {
  return useQuery({
    queryKey: ["leave_types"],
    queryFn: async (): Promise<LeaveType[]> => {
      const { data, error } = await supabase.from("leave_types").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export type LeaveTypeDraft = Pick<
  LeaveType,
  "code" | "name" | "max_days_per_year" | "requires_attachment_after_days"
>;

export function useSaveLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: LeaveTypeDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("leave_types").update(draft).eq("id", id)
        : await supabase.from("leave_types").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["leave_types"] }),
  });
}

export function useDeleteLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["leave_types"] }),
  });
}

// --------------------------------------------------------------- leave_requests
// Date-range requests, not one row per day — see migration 0033. Quota-used
// is computed client-side from the same "all of mine" query that feeds the
// history list (pending+approved, matching year) — volume per person is
// small, no need for a separate aggregate query.

export function useMyLeaveRequests(profileId: string | null) {
  return useQuery({
    queryKey: ["leave_requests", "mine", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<LeaveRequest[]> => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("profile_id", profileId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** RLS already limits this to the caller's approval scope (own department, or org-wide). Empty status = all. */
export function useLeaveApprovals(status: LeaveStatus | "") {
  return useQuery({
    queryKey: ["leave_requests", "approvals", status],
    queryFn: async (): Promise<LeaveRequest[]> => {
      let query = supabase.from("leave_requests").select("*").order("start_date", { ascending: false });
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

const LEAVE_BUCKET = "leave-attachments";

export function useRequestLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      profileId: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      reason: string;
      file: File | null;
    }) => {
      let attachmentPath: string | null = null;
      if (params.file) {
        const ext = params.file.name.includes(".") ? params.file.name.split(".").pop() : null;
        attachmentPath = `${params.profileId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
        const { error: upErr } = await supabase.storage
          .from(LEAVE_BUCKET)
          .upload(attachmentPath, params.file);
        if (upErr) throw upErr;
      }
      const { error } = await supabase.from("leave_requests").insert({
        profile_id: params.profileId,
        leave_type_id: params.leaveTypeId,
        start_date: params.startDate,
        end_date: params.endDate,
        reason: params.reason,
        attachment_path: attachmentPath,
      });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["leave_requests"] }),
  });
}

export function useCancelLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_requests").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["leave_requests"] }),
  });
}

export function useSetLeaveStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      approvedBy,
    }: {
      id: string;
      status: Exclude<LeaveStatus, "pending" | "cancelled">;
      approvedBy: string;
    }) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({ status, approved_by: approvedBy, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["leave_requests"] }),
  });
}

/** Private bucket — no public URL, sign one on demand (e.g. an approver opening the attachment). */
export async function leaveAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(LEAVE_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
