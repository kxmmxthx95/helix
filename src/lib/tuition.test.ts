import { describe, expect, it } from "vitest";
import { summarizeInvoice, summarizeStudent } from "@/lib/tuition";

const inv = (amount: number, due_date: string | null = null, status: "open" | "cancelled" = "open") => ({
  amount,
  due_date,
  status,
});

describe("summarizeInvoice", () => {
  it("ignores voided payments", () => {
    const r = summarizeInvoice(inv(1000), [{ amount: 1000, voided_at: "2026-01-01" }], "2026-02-01");
    expect(r).toEqual({ paid: 0, balance: 1000, state: "unpaid" });
  });
  it("reads float-noisy full payment as paid", () => {
    const r = summarizeInvoice(inv(0.3), [{ amount: 0.1, voided_at: null }, { amount: 0.2, voided_at: null }], "2026-02-01");
    expect(r.state).toBe("paid");
  });
  it("partial vs overdue vs cancelled", () => {
    const part = [{ amount: 400, voided_at: null }];
    expect(summarizeInvoice(inv(1000, "2026-03-01"), part, "2026-02-01").state).toBe("partial");
    expect(summarizeInvoice(inv(1000, "2026-01-01"), part, "2026-02-01").state).toBe("overdue");
    expect(summarizeInvoice(inv(1000, null, "cancelled"), [], "2026-02-01").state).toBe("cancelled");
  });
});

describe("summarizeStudent", () => {
  const pay = (amount: number) => [{ amount, voided_at: null }];
  it("is none when there are no live invoices", () => {
    expect(summarizeStudent([], "2026-02-01").state).toBe("none");
    expect(summarizeStudent([{ invoice: inv(500, null, "cancelled"), payments: [] }], "2026-02-01")).toMatchObject({ count: 0, state: "none" });
  });
  it("one overdue invoice makes the student overdue; totals skip cancelled", () => {
    const r = summarizeStudent(
      [
        { invoice: inv(1000, "2026-01-01"), payments: pay(400) },
        { invoice: inv(200, "2026-03-01"), payments: pay(200) },
        { invoice: inv(999, null, "cancelled"), payments: [] },
      ],
      "2026-02-01",
    );
    expect(r).toEqual({ count: 2, total: 1200, outstanding: 600, state: "overdue" });
  });
  it("paid when nothing outstanding", () => {
    expect(summarizeStudent([{ invoice: inv(300), payments: pay(300) }], "2026-02-01").state).toBe("paid");
  });
});
