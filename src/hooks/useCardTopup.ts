import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CardPortalSummary,
  CardReport,
  CardSlipRequest,
  CardTransaction,
  PosMyToday,
  PosStudent,
  PosTerminal,
  PosTopupResult,
  Student,
  StudentCard,
  StudentCardStatus,
} from "@/lib/database.types";
import { compressImage } from "@/lib/image";
import { supabase } from "@/lib/supabase";

// บัตรเติมเงิน — see migration 0107. Money only moves through RPCs, and ONLY online:
// nothing here touches the IndexedDB outbox, so an offline sale fails loudly instead of queuing.

const NET_ERR = "เชื่อมต่ออินเทอร์เน็ตไม่ได้ — รายการนี้อาจยังไม่ถูกบันทึก ตรวจสอบ \"รายการวันนี้\" ก่อนทำซ้ำ";

/** Runs an RPC, turning "offline" and network failures into one clear Thai error. */
async function rpc<T>(run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  if (!navigator.onLine) throw new Error(NET_ERR);
  let res: { data: unknown; error: { message: string } | null };
  try {
    res = await run();
  } catch {
    throw new Error(NET_ERR);
  }
  if (res.error) throw new Error(/failed to fetch|network|load failed/i.test(res.error.message) ? NET_ERR : res.error.message);
  return res.data as T;
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => (window.removeEventListener("online", sync), window.removeEventListener("offline", sync));
  }, []);
  return online;
}

// ---------------------------------------------------------------- terminals

export function useTerminals() {
  return useQuery({
    queryKey: ["pos_terminals"],
    queryFn: async (): Promise<PosTerminal[]> => {
      const { data, error } = await supabase.from("pos_terminals").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: { id?: string; name?: string; active?: boolean }) => {
      const { id, ...patch } = t;
      const { error } = id
        ? await supabase.from("pos_terminals").update(patch).eq("id", id)
        : await supabase.from("pos_terminals").insert({ name: patch.name! });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["pos_terminals"] }),
  });
}

// --------------------------------------------------------------------- POS

export const posLookup = (a: { card_uid?: string; student_id?: string }) =>
  rpc<PosStudent>(() => supabase.rpc("pos_lookup", { p_card_uid: a.card_uid ?? null, p_student_id: a.student_id ?? null }));

export function usePosMyToday() {
  return useQuery({
    queryKey: ["pos_my_today"],
    queryFn: () => rpc<PosMyToday>(() => supabase.rpc("pos_my_today")),
  });
}

const useRefreshMoney = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["pos_my_today"] });
    void qc.invalidateQueries({ queryKey: ["card_transactions"] });
    void qc.invalidateQueries({ queryKey: ["student_cards"] });
  };
};

export function usePosSale() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (a: { card_uid: string; amount: number; terminal_id: string | null; client_tx_id: string }) =>
      rpc<{ tx_id: string; amount: number; balance: number }>(() =>
        supabase.rpc("pos_sale", { p_card_uid: a.card_uid, p_amount: a.amount, p_terminal_id: a.terminal_id, p_client_tx_id: a.client_tx_id }),
      ),
    onSettled: refresh,
  });
}

export function usePosTopupCash() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (a: { card_uid?: string; student_id?: string; amount: number; terminal_id: string | null; pin: string; client_tx_id: string }) =>
      rpc<PosTopupResult>(() =>
        supabase.rpc("pos_topup_cash", {
          p_card_uid: a.card_uid ?? null,
          p_student_id: a.student_id ?? null,
          p_amount: a.amount,
          p_terminal_id: a.terminal_id,
          p_pin: a.pin,
          p_client_tx_id: a.client_tx_id,
        }),
      ),
    onSettled: refresh,
  });
}

export function usePosVoid() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (a: { tx_id: string; reason: string }) =>
      rpc<{ balance: number }>(() => supabase.rpc("pos_void", { p_tx_id: a.tx_id, p_reason: a.reason })),
    onSettled: refresh,
  });
}

export function usePinStatus() {
  return useQuery({
    queryKey: ["cashier_pin_status"],
    queryFn: () => rpc<{ has_pin: boolean; locked_until: string | null }>(() => supabase.rpc("cashier_pin_status")),
  });
}

export function useSetPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => rpc<void>(() => supabase.rpc("cashier_pin_set", { p_pin: pin })),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["cashier_pin_status"] }),
  });
}

export function useResetPin() {
  return useMutation({
    mutationFn: (profileId: string) => rpc<void>(() => supabase.rpc("cashier_pin_reset", { p_profile_id: profileId })),
  });
}

export type CashierRow = { id: string; name: string };

/** Org-wide: every account holding the cashier role (for the PIN reset list). */
export function useCashiers() {
  return useQuery({
    queryKey: ["cashiers"],
    queryFn: async (): Promise<CashierRow[]> => {
      const { data, error } = await supabase
        .from("profile_roles")
        .select("profile:profiles(id, first_name, last_name)")
        .eq("role", "cashier");
      if (error) throw error;
      return (data as unknown as { profile: { id: string; first_name: string; last_name: string } | null }[])
        .filter((r) => r.profile)
        .map((r) => ({ id: r.profile!.id, name: `${r.profile!.first_name} ${r.profile!.last_name}` }));
    },
  });
}

// Fallback lookup for org-wide staff (a cashier has no student list access).
export type StudentHit = Pick<Student, "id" | "student_code" | "prefix" | "first_name" | "last_name">;

export function useStudentSearch(term: string) {
  const t = term.trim();
  return useQuery({
    queryKey: ["card_student_search", t],
    enabled: t.length >= 2,
    queryFn: async (): Promise<StudentHit[]> => {
      const like = `%${t}%`;
      const { data, error } = await supabase
        .from("students")
        .select("id, student_code, prefix, first_name, last_name")
        .or(`first_name.ilike.${like},last_name.ilike.${like},student_code.ilike.${like}`)
        .order("student_code")
        .limit(8);
      if (error) throw error;
      return data;
    },
  });
}

// ----------------------------------------------- cards & balances (org-wide)

export type CardRow = StudentCard & { student: Pick<Student, "student_code" | "prefix" | "first_name" | "last_name"> | null };

/** Live (non-replaced) cards, keyed by student. */
export function useLiveCards() {
  return useQuery({
    queryKey: ["student_cards"],
    queryFn: async (): Promise<CardRow[]> => {
      const { data, error } = await supabase
        .from("student_cards")
        .select("*, student:students(student_code, prefix, first_name, last_name)")
        .neq("status", "replaced");
      if (error) throw error;
      return data as unknown as CardRow[];
    },
  });
}

export function useCardTransactions(studentId: string | null) {
  return useQuery({
    queryKey: ["card_transactions", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<CardTransaction[]> => {
      const { data, error } = await supabase
        .from("card_transactions")
        .select("*")
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

/** Org-wide: one student's balance / limit / card state (the ledger list above is capped, so never sum it). */
export function useStudentLookup(studentId: string | null) {
  return useQuery({
    queryKey: ["card_transactions", "lookup", studentId],
    enabled: !!studentId,
    queryFn: () => posLookup({ student_id: studentId! }),
  });
}

export function useBindCard() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (a: { student_id: string; card_uid: string }) =>
      rpc<void>(() => supabase.rpc("card_bind", { p_student_id: a.student_id, p_card_uid: a.card_uid })),
    onSettled: refresh,
  });
}

export function useSetCardStatus() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: async (a: { id: string; status: Exclude<StudentCardStatus, "replaced"> }) => {
      const { error } = await supabase.from("student_cards").update({ status: a.status }).eq("id", a.id);
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

export function useRefundWithdraw() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (a: { student_id: string; amount: number; note: string | null }) =>
      rpc<{ balance: number }>(() =>
        supabase.rpc("card_refund_withdraw", { p_student_id: a.student_id, p_amount: a.amount, p_note: a.note }),
      ),
    onSettled: refresh,
  });
}

// ------------------------------------------- parent / student portal (0108)

export type PortalStudent = Pick<Student, "id" | "student_code" | "prefix" | "first_name" | "last_name" | "avatar_path" | "updated_at">;

/** RLS scopes this to the signed-in parent's children, or the student themself. */
export function useMyCardStudents() {
  return useQuery({
    queryKey: ["card_my_students"],
    queryFn: async (): Promise<PortalStudent[]> => {
      const { data, error } = await supabase
        .from("students")
        .select("id, student_code, prefix, first_name, last_name, avatar_path, updated_at")
        .order("student_code");
      if (error) throw error;
      return data;
    },
  });
}

export function usePortalSummary(studentId: string | null) {
  return useQuery({
    queryKey: ["card_transactions", "summary", studentId],
    enabled: !!studentId,
    queryFn: () => rpc<CardPortalSummary>(() => supabase.rpc("card_portal_summary", { p_student_id: studentId! })),
  });
}

export function useSetDailyLimit() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (a: { student_id: string; limit: number | null }) =>
      rpc<void>(() => supabase.rpc("card_parent_set_limit", { p_student_id: a.student_id, p_limit: a.limit })),
    onSettled: refresh,
  });
}

export function useSetFrozen() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (a: { student_id: string; frozen: boolean }) =>
      rpc<void>(() => supabase.rpc("card_parent_set_frozen", { p_student_id: a.student_id, p_frozen: a.frozen })),
    onSettled: refresh,
  });
}

// ------------------------------------------------------------------- slips

export type SlipRow = CardSlipRequest & { student: Pick<Student, "student_code" | "prefix" | "first_name" | "last_name"> | null };

/** RLS: org-wide sees every request, a parent only their own children's. */
export function useSlipRequests() {
  return useQuery({
    queryKey: ["card_slip_requests"],
    queryFn: async (): Promise<SlipRow[]> => {
      const { data, error } = await supabase
        .from("card_slip_requests")
        .select("*, student:students(student_code, prefix, first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as unknown as SlipRow[];
    },
  });
}

export function useSubmitSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { student_id: string; requested_by: string; amount: number; transferred_at: string; file: File }) => {
      if (!navigator.onLine) throw new Error(NET_ERR);
      const path = `${a.student_id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("card-slips")
        .upload(path, await compressImage(a.file, 1600, 0.85), { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error } = await supabase.from("card_slip_requests").insert({
        student_id: a.student_id,
        requested_by: a.requested_by,
        amount: a.amount,
        transferred_at: a.transferred_at,
        slip_path: path,
      });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["card_slip_requests"] }),
  });
}

/** Private bucket — sign a short-lived URL on demand. */
export async function slipImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("card-slips").createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export function useReviewSlip() {
  const qc = useQueryClient();
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: async (a: { id: string; amount?: number; reject_reason?: string }) => {
      if (a.reject_reason !== undefined) {
        await rpc<void>(() => supabase.rpc("card_slip_reject", { p_request_id: a.id, p_reason: a.reject_reason! }));
      } else {
        await rpc<unknown>(() => supabase.rpc("card_slip_approve", { p_request_id: a.id, p_amount: a.amount ?? null }));
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["card_slip_requests"] });
      refresh();
    },
  });
}

// ------------------------------------------------------------------ report (0109)

export function useCardReport(from: string, to: string) {
  return useQuery({
    queryKey: ["card_transactions", "report", from, to],
    enabled: !!from && !!to && from <= to,
    queryFn: () => rpc<CardReport>(() => supabase.rpc("card_report", { p_from: from, p_to: to })),
  });
}
