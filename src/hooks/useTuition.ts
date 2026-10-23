import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcademicTerm, Student, TuitionInvoice, TuitionPayment, TuitionPaymentMethod, TuitionTermAmount } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ค่าเทอม — see migration 0095. RLS decides what each role sees: org-wide
// gets every invoice, a parent only their children's, so callers just pass a
// termId (or none) and never filter by role here.

export type TuitionInvoiceRow = TuitionInvoice & {
  student: Pick<Student, "student_code" | "prefix" | "first_name" | "last_name"> | null;
  term: Pick<AcademicTerm, "academic_year" | "term_type"> | null;
  tuition_payments: TuitionPayment[];
};

export function useTuitionInvoices(termId?: string | null) {
  return useQuery({
    queryKey: ["tuition_invoices", termId ?? null],
    queryFn: async (): Promise<TuitionInvoiceRow[]> => {
      let q = supabase
        .from("tuition_invoices")
        .select("*, student:students(student_code, prefix, first_name, last_name), term:academic_terms(academic_year, term_type), tuition_payments(*)")
        .order("created_at", { ascending: false });
      if (termId) q = q.eq("term_id", termId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as TuitionInvoiceRow[];
    },
  });
}

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["tuition_invoices"] });
};

export type TuitionInvoiceDraft = Pick<
  TuitionInvoice,
  "student_id" | "term_id" | "title" | "amount" | "due_date" | "file_path" | "created_by"
>;

const INVOICE_BUCKET = "tuition-invoices";
export const MAX_INVOICE_FILE_BYTES = 10 * 1024 * 1024; // mirrors the bucket's file_size_limit

/** Throws a Thai message for anything the bucket would reject anyway, so the user sees why. */
export function checkInvoiceFile(file: File) {
  if (file.type !== "application/pdf") throw new Error("อัปโหลดได้เฉพาะไฟล์ PDF");
  if (file.size > MAX_INVOICE_FILE_BYTES) throw new Error("ไฟล์ใหญ่เกิน 10 MB");
}

/** Uploads the PDF and returns its storage path. */
async function putInvoiceFile(studentId: string, file: File): Promise<string> {
  checkInvoiceFile(file);
  const path = `${studentId}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from(INVOICE_BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

/** Private bucket — sign a short-lived URL on demand. */
export async function tuitionInvoiceFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(INVOICE_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export function useCreateTuitionInvoice() {
  const invalidate = useInvalidate();
  return useMutation({
    // The PDF is required (migration 0096): upload first, then insert with its path.
    // A failed insert leaves an unreferenced file — the bucket has no delete policy by design.
    mutationFn: async ({ file, ...draft }: Omit<TuitionInvoiceDraft, "file_path"> & { file: File }) => {
      const file_path = await putInvoiceFile(draft.student_id, file);
      const { error } = await supabase.from("tuition_invoices").insert({ ...draft, file_path });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

/** Bulk create (migration 0101): no PDF yet — the invoice reads "ยังไม่มีไฟล์" until one is attached. */
export function useBulkCreateTuitionInvoices() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (drafts: Omit<TuitionInvoiceDraft, "file_path">[]) => {
      const { error } = await supabase.from("tuition_invoices").insert(drafts.map((d) => ({ ...d, file_path: null })));
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

export function useTuitionTermAmount(termId: string | null) {
  return useQuery({
    queryKey: ["tuition_term_amounts", termId],
    enabled: !!termId,
    queryFn: async (): Promise<TuitionTermAmount | null> => {
      const { data, error } = await supabase.from("tuition_term_amounts").select("*").eq("term_id", termId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSetTuitionTermAmount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { term_id: string; amount: number; updated_by: string }) => {
      const { error } = await supabase.from("tuition_term_amounts").upsert(row);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["tuition_term_amounts"] }),
  });
}

export function useUpdateTuitionInvoiceAmount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await supabase.from("tuition_invoices").update({ amount }).eq("id", id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

export function useReplaceTuitionInvoiceFile() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ invoice, file }: { invoice: { id: string; student_id: string }; file: File }) => {
      const file_path = await putInvoiceFile(invoice.student_id, file);
      const { error } = await supabase.from("tuition_invoices").update({ file_path }).eq("id", invoice.id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

export function useCancelTuitionInvoice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tuition_invoices").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

export type TuitionPaymentDraft = {
  invoice_id: string;
  amount: number;
  method: TuitionPaymentMethod;
  paid_at: string;
  note: string | null;
  recorded_by: string;
};

export function useRecordTuitionPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (draft: TuitionPaymentDraft) => {
      const { error } = await supabase.from("tuition_payments").insert(draft);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

export function useVoidTuitionPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from("tuition_payments")
        .update({ voided_at: new Date().toISOString(), void_reason: reason })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}
