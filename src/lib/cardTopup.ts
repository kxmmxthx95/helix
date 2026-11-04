import type { CardReport, CardTransactionType } from "@/lib/database.types";

// Mirrors the bounds enforced in the pos_* functions (migration 0107) — the database is the boundary.
/** Slip top-up is switched off for now (UI only — the RLS from 0108/0123 still allows inserts). Flip to true to reopen. */
export const TOPUP_OPEN = false;
export const TOPUP_MIN = 20;
export const TOPUP_MAX = 5000;
export const SALE_MIN = 1;
export const SALE_MAX = 500;

export const TX_TYPE_LABEL: Record<CardTransactionType, string> = {
  topup_cash: "เติมเงินสด",
  topup_slip: "เติมผ่านสลิป",
  sale: "ซื้อสินค้า",
  refund_withdraw: "ถอนคืนเงิน",
};

/** Whole baht inside [min, max]; null when the typed text isn't one. */
export function parseAmount(text: string, min: number, max: number): number | null {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

const DUP_WINDOW_MS = 10 * 60 * 1000;

/** Other live slips for the same student with the same amount and a transfer time within 10 minutes — a warning, never a block. */
export function findDuplicateSlips<T extends { id: string; student_id: string; amount: number; transferred_at: string; status: string }>(
  req: T,
  all: T[],
): T[] {
  const at = Date.parse(req.transferred_at);
  return all.filter(
    (o) =>
      o.id !== req.id &&
      o.student_id === req.student_id &&
      o.status !== "rejected" &&
      o.amount === req.amount &&
      Math.abs(Date.parse(o.transferred_at) - at) <= DUP_WINDOW_MS,
  );
}

const csvCell = (v: string | number | null) => {
  const t = String(v ?? "");
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Flat CSV of the report: one section per grouping, so it opens as-is in Excel. */
export function reportCsv(r: CardReport): string {
  const row = (...c: (string | number | null)[]) => c.map(csvCell).join(",");
  return [
    row("ตามเครื่องขาย", "จำนวนครั้งที่ขาย", "ยอดขาย", "เติมเงินสด", "เติมผ่านสลิป"),
    ...r.by_terminal.map((t) => row(t.name ?? "ไม่ระบุเครื่อง (สลิป)", t.sales_count, t.sales_total, t.cash_topup_total, t.slip_topup_total)),
    row("รวม", r.totals.sales_count, r.totals.sales_total, r.totals.cash_topup_total, r.totals.slip_topup_total),
    "",
    row("ตามแคชเชียร์", "จำนวนครั้งที่ขาย", "ยอดขาย", "เติมเงินสด"),
    ...r.by_cashier.map((c) => row(c.name, c.sales_count, c.sales_total, c.cash_topup_total)),
    "",
    row("รายการที่ยกเลิก", "ประเภท", "จำนวนเงิน", "ผู้ทำรายการ", "เหตุผล"),
    ...r.voids.map((v) => row(v.student_name, TX_TYPE_LABEL[v.type], Math.abs(v.amount), v.cashier, v.void_reason)),
  ].join("\n");
}
