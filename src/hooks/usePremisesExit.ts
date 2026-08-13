import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentPosition } from "@/lib/geofence";
import type { PremisesExitRequest, PremisesExitStatus } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ----------------------------------------------------------- premises_exit_requests
// "ขอออกนอกโรงเรียน" — approved async, never blocks the actual exit. See
// migration 0032. RLS already scopes reads/writes to own rows + can_manage()
// within the actor's department (or org-wide) — queries here don't need to
// re-filter by department themselves.

export function useTodayPremisesExits(profileId: string | null, date: string) {
  return useQuery({
    queryKey: ["premises_exit_requests", "by_profile_date", profileId, date],
    enabled: !!profileId && !!date,
    queryFn: async (): Promise<PremisesExitRequest[]> => {
      const { data, error } = await supabase
        .from("premises_exit_requests")
        .select("*")
        .eq("profile_id", profileId!)
        .eq("date", date)
        .order("exit_time");
      if (error) throw error;
      return data;
    },
  });
}

/** RLS already limits this to the caller's approval scope (own department, or org-wide). */
export function usePendingApprovals() {
  return useQuery({
    queryKey: ["premises_exit_requests", "pending"],
    queryFn: async (): Promise<PremisesExitRequest[]> => {
      const { data, error } = await supabase
        .from("premises_exit_requests")
        .select("*")
        .eq("status", "pending")
        .order("exit_time");
      if (error) throw error;
      return data;
    },
  });
}

export function useRequestPremisesExit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, date, reason }: { profileId: string; date: string; reason: string }) => {
      // Best-effort location — a denied/unavailable GPS doesn't block the request (unlike clock-in/out).
      const pos = await getCurrentPosition();
      const { error } = await supabase.from("premises_exit_requests").insert({
        profile_id: profileId,
        date,
        reason,
        exit_time: new Date().toISOString(),
        exit_lat: "error" in pos ? null : pos.lat,
        exit_lng: "error" in pos ? null : pos.lng,
      });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["premises_exit_requests"] }),
  });
}

export function useConfirmReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("premises_exit_requests")
        .update({ return_time: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["premises_exit_requests"] }),
  });
}

export function useSetPremisesExitStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      approvedBy,
    }: {
      id: string;
      status: Exclude<PremisesExitStatus, "pending">;
      approvedBy: string;
    }) => {
      const { error } = await supabase
        .from("premises_exit_requests")
        .update({ status, approved_by: approvedBy, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["premises_exit_requests"] }),
  });
}
