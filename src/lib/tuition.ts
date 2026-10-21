import type { TuitionInvoice, TuitionPayment } from "@/lib/database.types";

export type InvoiceState = "cancelled" | "paid" | "partial" | "overdue" | "unpaid";

export const INVOICE_STATE_LABEL: Record<InvoiceState, string> = {
  cancelled: "ยกเลิก",
  paid: "ชำระแล้ว",
  partial: "ชำระบางส่วน",
  overdue: "ค้างชำระ",
  unpaid: "รอชำระ",
};

export const PAYMENT_METHOD_LABEL = { cash: "เงินสด", transfer: "โอน", other: "อื่น ๆ" } as const;

/** Derived, never stored (see migration 0095): voided payments don't count. `today` is an ISO date. */
export function summarizeInvoice(
  invoice: Pick<TuitionInvoice, "amount" | "status" | "due_date">,
  payments: Pick<TuitionPayment, "amount" | "voided_at">[],
  today: string,
): { paid: number; balance: number; state: InvoiceState } {
  // Round to satang so float noise can't make "paid in full" read as partial.
  const paid = Math.round(payments.filter((p) => !p.voided_at).reduce((s, p) => s + p.amount * 100, 0)) / 100;
  const balance = Math.round((invoice.amount - paid) * 100) / 100;
  const state: InvoiceState =
    invoice.status === "cancelled"
      ? "cancelled"
      : balance <= 0
        ? "paid"
        : invoice.due_date && invoice.due_date < today
          ? "overdue"
          : paid > 0
            ? "partial"
            : "unpaid";
  return { paid, balance, state };
}

export const formatBaht = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type StudentTuitionState = "none" | "unpaid" | "overdue" | "paid";

export const STUDENT_TUITION_LABEL: Record<StudentTuitionState, string> = {
  none: "ยังไม่มีใบแจ้งหนี้",
  unpaid: "รอชำระ",
  overdue: "ค้างชำระ",
  paid: "ชำระครบ",
};

/** One row of the staff table: cancelled invoices don't count; any overdue invoice makes the student overdue. */
export function summarizeStudent(
  invoices: { invoice: Pick<TuitionInvoice, "amount" | "status" | "due_date">; payments: Pick<TuitionPayment, "amount" | "voided_at">[] }[],
  today: string,
): { count: number; total: number; outstanding: number; state: StudentTuitionState } {
  const live = invoices
    .map((i) => ({ ...i.invoice, ...summarizeInvoice(i.invoice, i.payments, today) }))
    .filter((i) => i.state !== "cancelled");
  const total = Math.round(live.reduce((s, i) => s + i.amount * 100, 0)) / 100;
  const outstanding = Math.round(live.reduce((s, i) => s + Math.max(i.balance, 0) * 100, 0)) / 100;
  const state: StudentTuitionState =
    live.length === 0 ? "none" : live.some((i) => i.state === "overdue") ? "overdue" : outstanding > 0 ? "unpaid" : "paid";
  return { count: live.length, total, outstanding, state };
}
