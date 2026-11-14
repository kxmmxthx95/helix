import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CardPortalSummary,
  CardReport,
  CardSlipRequest,
  CardTransaction,
  PosMyToday,
  PosStudentTx,
  PosProduct,
  PosStudent,
  PosTerminal,
  PinUnlockResult,
  Student,
  StudentQr,
  CardTopupRow,
  CardHistoryRow,
  CardKind,
  LiveCard,
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

/** Exact student_code → student id (cashier-safe: no partial match, no listing). */
export const posStudentByCode = (code: string) =>
  rpc<string>(() => supabase.rpc("pos_student_by_code", { p_code: code }));

export function usePosMyToday() {
  return useQuery({
    queryKey: ["pos_my_today"],
    queryFn: () => rpc<PosMyToday>(() => supabase.rpc("pos_my_today")),
  });
}

/** Last 10 transactions of the student on screen; refetched after any money movement (card_transactions key). */
export function usePosStudentRecent(studentId: string | undefined) {
  return useQuery({
    queryKey: ["card_transactions", "pos_recent", studentId],
    enabled: !!studentId,
    queryFn: () => rpc<PosStudentTx[]>(() => supabase.rpc("pos_student_recent", { p_student_id: studentId! })),
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

/** Cart sale: the server prices it from pos_products, so only ids and quantities travel. */
export function usePosSaleItems() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (a: { card_uid: string; items: { product_id: string; qty: number }[]; terminal_id: string | null; client_tx_id: string }) =>
      rpc<{ tx_id: string; amount: number; balance: number }>(() =>
        supabase.rpc("pos_sale_items", { p_card_uid: a.card_uid, p_items: a.items, p_terminal_id: a.terminal_id, p_client_tx_id: a.client_tx_id }),
      ),
    onSettled: refresh,
  });
}

// ----------------------------------------------------------------- products

/** Cashiers and org-wide read the whole catalogue; the POS filters to `active`. */
export function usePosProducts() {
  return useQuery({
    queryKey: ["pos_products"],
    queryFn: async (): Promise<PosProduct[]> => {
      const { data, error } = await supabase.from("pos_products").select("*").order("category", { nullsFirst: false }).order("name");
      if (error) throw error;
      return data;
    },
  });
}

/** Public URL of the product photo, cache-busted with updated_at so a re-upload shows at once. */
export function productImageUrl(p: Pick<PosProduct, "image_path" | "updated_at">): string | null {
  if (!p.image_path) return null;
  return `${supabase.storage.from("pos-products").getPublicUrl(p.image_path).data.publicUrl}?v=${encodeURIComponent(p.updated_at)}`;
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    // image: undefined = leave as is, null = remove, File = replace.
    mutationFn: async (p: { id?: string; name: string; price: number; category: string | null; active: boolean; image?: File | null }) => {
      const { id, image, ...fields } = p;
      const patch = { ...fields, ...(image === null ? { image_path: null } : {}) };
      const saved = id
        ? await supabase.from("pos_products").update(patch).eq("id", id).select("id").single()
        : await supabase.from("pos_products").insert(patch).select("id").single();
      if (saved.error) throw saved.error;
      if (image) {
        const pid = saved.data.id;
        const blob = await compressImage(image, 640, 0.82);
        const up = await supabase.storage.from("pos-products").upload(pid, blob, { upsert: true, contentType: "image/jpeg" });
        if (up.error) throw up.error;
        const { error } = await supabase.from("pos_products").update({ image_path: pid }).eq("id", pid);
        if (error) throw error;
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["pos_products"] }),
  });
}

/** Needs the cashier unlocked (usePinUnlock) — the server refuses otherwise. */
export function usePosTopupCash() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (a: { card_uid?: string; student_id?: string; amount: number; terminal_id: string | null; client_tx_id: string }) =>
      rpc<{ tx_id: string; amount: number; balance: number }>(() =>
        supabase.rpc("pos_topup_cash", {
          p_card_uid: a.card_uid ?? null,
          p_student_id: a.student_id ?? null,
          p_amount: a.amount,
          p_terminal_id: a.terminal_id,
          p_client_tx_id: a.client_tx_id,
        }),
      ),
    onSettled: refresh,
  });
}

/** Org-wide: top-ups in a Bangkok date range, optionally filtered by name / student code. */
export function useTopupList(from: string, to: string, q: string) {
  return useQuery({
    queryKey: ["card_transactions", "topup_list", from, to, q],
    enabled: !!from && !!to && from <= to,
    queryFn: () => rpc<CardTopupRow[]>(() => supabase.rpc("card_topup_list", { p_from: from, p_to: to, p_q: q.trim() || null })),
  });
}

/** Org-wide void of a top-up of any age; the balance may go negative. A slip top-up also marks its slip 'voided'. */
export function useVoidTopup() {
  const refresh = useRefreshMoney();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { tx_id: string; reason: string }) =>
      rpc<{ balance: number }>(() => supabase.rpc("card_void_topup", { p_tx_id: a.tx_id, p_reason: a.reason })),
    onSettled: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["card_slip_requests"] });
    },
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
    queryFn: () => rpc<{ has_pin: boolean; locked_until: string | null; unlocked_until: string | null }>(() => supabase.rpc("cashier_pin_status")),
  });
}

export function useSetPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => rpc<void>(() => supabase.rpc("cashier_pin_set", { p_pin: pin })),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["cashier_pin_status"] }),
  });
}

/** One correct PIN unlocks cash top-up for an hour (server-side, migration 0125). */
export function usePinUnlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => rpc<PinUnlockResult>(() => supabase.rpc("cashier_pin_unlock", { p_pin: pin })),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["cashier_pin_status"] }),
  });
}

export function usePinLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc<void>(() => supabase.rpc("cashier_pin_lock")),
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
export type StudentHit = Pick<Student, "id" | "student_code" | "prefix" | "first_name" | "last_name" | "avatar_path" | "updated_at">;

export function useStudentSearch(term: string) {
  const t = term.trim();
  return useQuery({
    queryKey: ["card_student_search", t],
    enabled: t.length >= 2,
    queryFn: async (): Promise<StudentHit[]> => {
      const like = `%${t}%`;
      const { data, error } = await supabase
        .from("students")
        .select("id, student_code, prefix, first_name, last_name, avatar_path, updated_at")
        .or(`first_name.ilike.${like},last_name.ilike.${like},student_code.ilike.${like}`)
        .order("student_code")
        .limit(8);
      if (error) throw error;
      return data;
    },
  });
}

// ----------------------------------------------- cards & balances (org-wide)

/** Live (non-replaced) cards, keyed by student. */
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
/** Live QR token of one student; owner, guardian and org-wide only (RPC enforces it). */
export function useStudentQr(studentId: string | null) {
  return useQuery({
    queryKey: ["student_cards", "qr", studentId],
    enabled: !!studentId,
    queryFn: () => rpc<StudentQr | null>(() => supabase.rpc("card_my_qr", { p_student_id: studentId! })),
  });
}

export function useIssueQrBulk() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (studentIds: string[]) => rpc<number>(() => supabase.rpc("card_issue_qr_bulk", { p_student_ids: studentIds })),
    onSettled: refresh,
  });
}

export function useIssueQr() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (studentId: string) => rpc<void>(() => supabase.rpc("card_issue_qr", { p_student_id: studentId })),
    onSettled: refresh,
  });
}

// ------------------------------------------- บัตรเติมเงิน page: bind / revoke / lock (0152)

/** Live cards of every student the caller may manage, grouped by student. */
export function useLiveCards() {
  return useQuery({
    queryKey: ["student_cards", "live_cards"],
    queryFn: async () => {
      const rows = await rpc<LiveCard[]>(() => supabase.rpc("card_live_cards"));
      const byStudent = new Map<string, LiveCard[]>();
      for (const c of rows) byStudent.set(c.student_id, [...(byStudent.get(c.student_id) ?? []), c]);
      return byStudent;
    },
  });
}

export function useCardHistory(studentId: string | null) {
  return useQuery({
    queryKey: ["student_cards", "history", studentId],
    enabled: !!studentId,
    queryFn: () => rpc<CardHistoryRow[]>(() => supabase.rpc("card_history", { p_student_id: studentId! })),
  });
}

function useCardMutation<A>(run: (a: A) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: A) => rpc<void>(() => run(a)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["student_cards"] }),
  });
}

export const useBindCard = () =>
  useCardMutation((a: { student_id: string; card_uid: string; kind: Exclude<CardKind, "qr"> }) =>
    supabase.rpc("card_bind", { p_student_id: a.student_id, p_card_uid: a.card_uid, p_kind: a.kind }),
  );
export const useRevokeCard = () => useCardMutation((id: string) => supabase.rpc("card_revoke", { p_card_id: id }));
export const useLockCard = () =>
  useCardMutation((a: { id: string; locked: boolean }) => supabase.rpc("card_set_locked", { p_card_id: a.id, p_locked: a.locked }));

// ------------------------------------------- parent / student portal (0108)

export type PortalStudent = Pick<Student, "id" | "student_code" | "prefix" | "first_name" | "last_name" | "avatar_path" | "updated_at" | "department_id" | "grade_level_id" | "profile_id">;

/** RLS scopes this to the signed-in parent's children, or the student themself. */
// RLS also lets anyone in a department read its whole roster, so filter to self + own children explicitly.
export function useMyCardStudents() {
  const uid = useAuth().profile?.id;
  return useQuery({
    queryKey: ["card_my_students", uid],
    enabled: !!uid,
    queryFn: async (): Promise<PortalStudent[]> => {
      const { data: gs, error: gErr } = await supabase.from("guardianships").select("student_id").eq("parent_id", uid!);
      if (gErr) throw gErr;
      const ids = gs.map((g) => g.student_id);
      const { data, error } = await supabase
        .from("students")
        .select("id, student_code, prefix, first_name, last_name, avatar_path, updated_at, department_id, grade_level_id, profile_id")
        .or(`profile_id.eq.${uid},id.in.(${ids.join(",")})`)
        .order("student_code");
      if (error) throw error;
      return data;
    },
  });
}

export function usePortalSummary(studentId: string | null) {
  const qc = useQueryClient();
  // A top-up/sale/void on this student's ledger refreshes balance + history without a reload (RLS filters what we receive).
  useEffect(() => {
    if (!studentId) return;
    const channel = supabase
      .channel(`card_tx_${studentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_transactions", filter: `student_id=eq.${studentId}` }, () =>
        void qc.invalidateQueries({ queryKey: ["card_transactions"] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [studentId, qc]);
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

/** student_id → status of the live barcode card, for the students the caller may issue barcodes to (RPC scopes it; migration 0119). */
export function useLiveCardStatus() {
  return useQuery({
    queryKey: ["student_cards", "live_status"],
    queryFn: async () => {
      const rows = await rpc<{ student_id: string; status: string }[]>(() => supabase.rpc("card_live_status"));
      return new Map(rows.map((c) => [c.student_id, c.status]));
    },
  });
}
