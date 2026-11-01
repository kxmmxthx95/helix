import { describe, expect, it } from "vitest";
import { parseSwipe } from "@/lib/cardSwipe";
import { findDuplicateSlips, parseAmount, reportCsv } from "@/lib/cardTopup";

describe("parseSwipe", () => {
  it("prefers track 2, dropping everything after =", () => {
    expect(parseSwipe("%B4111^DOE/JOHN^2512?;1234567890=2512?")).toBe("1234567890");
  });
  it("accepts track 2 without = or a closing ?", () => {
    expect(parseSwipe(";98765?")).toBe("98765");
    expect(parseSwipe(";98765")).toBe("98765");
  });
  it("falls back to the track 1 PAN", () => {
    expect(parseSwipe("%B4111222233^DOE/JOHN^2512?")).toBe("4111222233");
  });
  it("falls back to the trimmed raw input (typed or pasted number)", () => {
    expect(parseSwipe("  ABC123 \n")).toBe("ABC123");
    expect(parseSwipe("")).toBe("");
  });
});

describe("parseAmount", () => {
  it("accepts whole baht inside the bounds only", () => {
    expect(parseAmount("20", 20, 5000)).toBe(20);
    expect(parseAmount(" 5000 ", 20, 5000)).toBe(5000);
    expect(parseAmount("19", 20, 5000)).toBeNull();
    expect(parseAmount("5001", 20, 5000)).toBeNull();
    expect(parseAmount("12.5", 1, 500)).toBeNull();
    expect(parseAmount("", 1, 500)).toBeNull();
    expect(parseAmount("abc", 1, 500)).toBeNull();
  });
});

describe("findDuplicateSlips", () => {
  const slip = (id: string, at: string, over: Partial<{ student_id: string; amount: number; status: string }> = {}) => ({
    id,
    student_id: "s1",
    amount: 100,
    transferred_at: at,
    status: "pending",
    ...over,
  });
  const base = slip("a", "2026-01-01T10:00:00Z");
  it("flags same student + amount within 10 minutes, pending or approved", () => {
    const all = [base, slip("b", "2026-01-01T10:09:00Z"), slip("c", "2026-01-01T09:51:00Z", { status: "approved" })];
    expect(findDuplicateSlips(base, all).map((x) => x.id)).toEqual(["b", "c"]);
  });
  it("ignores other amounts, students, rejected slips and times beyond 10 minutes", () => {
    const all = [
      base,
      slip("b", "2026-01-01T10:11:00Z"),
      slip("c", "2026-01-01T10:01:00Z", { amount: 50 }),
      slip("d", "2026-01-01T10:01:00Z", { student_id: "s2" }),
      slip("e", "2026-01-01T10:01:00Z", { status: "rejected" }),
    ];
    expect(findDuplicateSlips(base, all)).toEqual([]);
  });
});

describe("reportCsv", () => {
  it("lists terminals with a total row, cashiers and voids, quoting cells that need it", () => {
    const csv = reportCsv({
      totals: { sales_count: 2, sales_total: 70, cash_topup_total: 100, slip_topup_total: 0, refund_total: 0 },
      by_terminal: [{ terminal_id: "t", name: "โรงอาหาร, 1", sales_count: 2, sales_total: 70, cash_topup_total: 100, slip_topup_total: 0 }],
      by_cashier: [{ profile_id: "p", name: "สมชาย ใจดี", sales_count: 2, sales_total: 70, cash_topup_total: 100 }],
      voids: [{ id: "v", type: "sale", amount: -30, created_at: "", voided_at: "", void_reason: 'ทอน "ผิด"', cashier: "สมชาย ใจดี", student_name: "ด.ช.เอ" }],
    }).split("\n");
    expect(csv[1]).toBe('"โรงอาหาร, 1",2,70,100,0');
    expect(csv[2]).toBe("รวม,2,70,100,0");
    expect(csv[5]).toBe("สมชาย ใจดี,2,70,100");
    expect(csv[8]).toBe('ด.ช.เอ,ซื้อสินค้า,30,สมชาย ใจดี,"ทอน ""ผิด"""');
  });
});
