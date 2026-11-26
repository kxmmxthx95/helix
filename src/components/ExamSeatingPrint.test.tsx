import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-dom", async (orig) => ({ ...(await orig<typeof import("react-dom")>()), createPortal: (node: unknown) => node })); // portal into <body> is irrelevant here
vi.mock("@/components/icons", () => ({ PrintIcon: () => null })); // react-icons render legacy elements under vitest
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ profile: { department_id: "d1" } }) }));
vi.mock("@/hooks/useSchedule", () => ({ useRooms: () => ({ data: [{ id: "v1", name: "อาคาร 1/2" }] }) }));
vi.mock("@/hooks/useExams", () => ({ useSessionSets: () => ({ data: new Map([["S", [{ subject_id: "sub" }]]]) }) }));
vi.mock("@/hooks/useExamBank", () => ({ useSubjectsByIds: () => ({ data: [{ id: "sub", code: "ค21101", name_th: "คณิตศาสตร์" }] }) }));
import { ExamSeatingPrintSheet, type PrintRoom } from "./ExamSeatingPrint";

const room: PrintRoom = {
  id: "R",
  position: 1,
  physicalRoomId: "v1",
  rows: 2,
  cols: 3,
  seats: [
    { label: "A1", row: 1, col: 1, code: "10", name: "สมชาย ใจดี" },
    { label: "B1", row: 1, col: 2, code: "9", name: "สมหญิง รักเรียน" },
    { label: "A2", row: 2, col: 1, code: "20", name: "ก ข" },
  ],
  specials: [{ no: 1, code: "5", name: "นักเรียน พิเศษ" }],
};

it("prints a seat-plan page and a roster page per room, roster sorted by code with seats", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  await act(async () =>
    createRoot(el).render(<ExamSeatingPrintSheet session={{ id: "S", title: "สอบ", exam_type: "กลางภาค", round: 1, opens_at: "2026-12-01T02:00:00Z", closes_at: "2026-12-01T03:00:00Z" } as never} rooms={[room]} onDone={() => {}} />),
  );
  const papers = el.querySelectorAll(".print-sheet .paper");
  expect(papers.length).toBe(2);
  expect(papers[0]!.textContent).toContain("ผังที่นั่งสอบ ห้อง อาคาร 1/2");
  expect(papers[0]!.textContent).toContain("หน้าห้อง");
  expect(papers[0]!.textContent).toContain("ที่นั่งพิเศษ");
  expect(papers[0]!.textContent).toContain("A1");
  expect(papers[0]!.textContent).toContain("ค21101 คณิตศาสตร์");
  const rows = [...papers[1]!.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent).join("|"));
  // sorted by code, numerically (9 before 10); the list is split into two side-by-side tables, left half first
  expect(rows).toEqual(["1|5|นักเรียน พิเศษ|พิเศษ 1", "2|9|สมหญิง รักเรียน|B1", "3|10|สมชาย ใจดี|A1", "4|20|ก ข|A2"]);
  if (process.env.SEATPRINT_OUT) (await import("node:fs")).writeFileSync(process.env.SEATPRINT_OUT, el.innerHTML);
});

it("two full rooms print as four pages worth of papers", async () => {
  const names = ["สมชาย", "สมหญิง", "ณัฐวุฒิ", "กัญญาณัฐ", "ปรเมศวร์", "วิภาวรรณ"];
  const big = (id: string, position: number, n: number): PrintRoom => ({
    id,
    position,
    physicalRoomId: null,
    rows: 6,
    cols: 6,
    seats: Array.from({ length: n }, (_, i) => ({ label: `${String.fromCharCode(65 + (i % 6))}${Math.floor(i / 6) + 1}`, row: Math.floor(i / 6) + 1, col: (i % 6) + 1, code: String(14800 + i + position * 100), name: `${names[i % 6]} ${names[(i + 2) % 6]}นามสกุลยาว` })),
    specials: [{ no: 1, code: "14999", name: "ธนวัฒน์ ศรีสุวรรณพิทักษ์" }, { no: 2, code: "14998", name: "ก ข" }],
  });
  const el = document.createElement("div");
  document.body.appendChild(el);
  await act(async () =>
    createRoot(el).render(<ExamSeatingPrintSheet session={{ id: "S", title: "สอบ", exam_type: "ปลายภาค", round: null, opens_at: "2026-12-01T02:00:00Z", closes_at: "2026-12-01T03:00:00Z" } as never} rooms={[big("R1", 1, 36), big("R2", 2, 30)]} onDone={() => {}} />),
  );
  expect(el.querySelectorAll(".print-sheet .paper").length).toBe(4);
  if (process.env.SEATPRINT_BIG_OUT) (await import("node:fs")).writeFileSync(process.env.SEATPRINT_BIG_OUT, el.innerHTML);
});
