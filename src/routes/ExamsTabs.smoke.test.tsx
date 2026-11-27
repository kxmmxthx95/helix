import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Every table/RPC answers "no rows": the tabs must still render (and their lazy chunks must load) without crashing.
const rows: Record<string, unknown[]> = vi.hoisted(() => ({}));
vi.mock("@/lib/supabase", () => {
  const make = (data: unknown[]): unknown => {
    const result = { data, error: null, count: data.length };
    const builder: unknown = new Proxy(function () {}, {
      get: (_t, prop) => (prop === "then" ? (res: (v: unknown) => unknown) => Promise.resolve(result).then(res) : () => builder),
      apply: () => builder,
    });
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => make(rows[table] ?? []),
      rpc: () => make([]),
      auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      functions: { invoke: async () => ({ data: [], error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    },
  };
});
const auth = vi.hoisted(() => ({
  value: {
    profile: { id: "t1", roles: ["teacher", "dept_head"], department_id: "d1", first_name: "ครู", last_name: "ทดสอบ", avatar_path: null },
    myStudent: null as unknown,
    loading: false,
  },
}));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => auth.value,
  usePauseIdleSignOut: () => {},
}));
// The rich-text viewer drags in Plate + KaTeX (CSS imports node cannot load): a stand-in is enough for these smoke tests.
vi.mock("@/components/editor/QuestionPromptView", () => ({ QuestionPromptView: () => null }));
// react-ionicons ships its own React copy, which cannot render inside this test environment.
vi.mock("@/components/icons", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Icon = () => null;
  return Object.fromEntries(Object.entries(actual).map(([k, v]) => [k, k === "FILLED_ICON" ? new Map() : typeof v === "function" ? Icon : v]));
});

import { ToastProvider } from "@/components/Toast";
import { Exams } from "@/routes/Exams";

// jsdom has no matchMedia: report a phone (max-width queries true) or a desktop.
const setViewport = (phone: boolean) =>
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (q: string) => ({ matches: /max-width/.test(q) ? phone : !phone && /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });

const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const SESSION = {
  id: "s-1", subject_id: "sub-1", teacher_id: "t1", title: "สอบกลางภาค ครั้งที่ 1", topic_set_id: "ts-1",
  opens_at: "2026-12-01T08:30:00+07:00", closes_at: "2026-12-01T09:30:00+07:00", exam_type: "สอบกลางภาค", round: 1,
  is_enabled: false, duration_minutes: 60, max_attempts: 1, shuffle_questions: true, shuffle_choices: true, sync_to_gradebook: false,
  strict_mode: false, review_released: false, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
};

describe.each([["phone", true], ["desktop", false]])("teacher exam menu on a %s", (_name, phone) => {
  it("opens every tab without crashing, including the lazy ones", async () => {
    setViewport(phone);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => errors.push(e.error ?? e.message);
    window.addEventListener("error", onError);
    await act(async () =>
      createRoot(el).render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <ToastProvider>
              <Exams />
            </ToastProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
    await wait(300);
    const tabs = [...el.querySelectorAll('[role="tab"]')] as HTMLElement[];
    expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual(["ห้องสอบ", "ตารางสอบ", "หัวข้อการสอบ", "รายการ", "อนุมัติสอบ"]);
    const expectText: Record<string, RegExp> = {
      ห้องสอบ: /ยังไม่มีการเปิดสอบ/,
      ตารางสอบ: /ยังไม่มีตารางสอบ/,
      หัวข้อการสอบ: /ยังไม่มีวิชาที่ได้รับมอบหมาย/,
      รายการ: /ไม่มีชุดหัวข้อที่รออนุมัติ/,
      อนุมัติสอบ: /ไม่มีชุดหัวข้อที่รออนุมัติ/,
    };
    const seen: Record<string, string> = {};
    for (const tab of tabs) {
      await act(async () => tab.click());
      const name = tab.getAttribute("aria-label")!;
      // the first open of a lazy tab downloads its chunk: poll instead of guessing a delay
      for (let waited = 0; waited < 6000 && !expectText[name]!.test(el.textContent ?? ""); waited += 150) await wait(150);
      seen[name] = el.textContent ?? "";
      expect(seen[name], `tab ${name}`).toMatch(expectText[name]!);
    }
    window.removeEventListener("error", onError);
    expect(errors).toEqual([]);
  }, 60_000);

  it("shows a scheduled room in the room and timetable tabs and opens its detail page", async () => {
    setViewport(phone);
    rows.exam_sessions = [SESSION];
    try {
      const el = document.createElement("div");
      document.body.appendChild(el);
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      await act(async () =>
        createRoot(el).render(
          <QueryClientProvider client={qc}>
            <MemoryRouter>
              <ToastProvider>
                <Exams />
              </ToastProvider>
            </MemoryRouter>
          </QueryClientProvider>,
        ),
      );
      const until = async (re: RegExp) => {
        for (let waited = 0; waited < 6000 && !re.test(el.textContent ?? ""); waited += 150) await wait(150);
        expect(el.textContent).toMatch(re);
      };
      await until(/สอบกลางภาค/); // rooms tab
      const tabs = [...el.querySelectorAll('[role="tab"]')] as HTMLElement[];
      await act(async () => tabs[1]!.click()); // timetable
      await until(/08:30/);
      expect(el.textContent).toMatch(/สอบกลางภาค/);
      await act(async () => tabs[0]!.click()); // back to rooms
      await until(/สอบกลางภาค/);
      // open the room (card on a phone, row on a desktop)
      const open = (el.querySelector('[role="button"]') ?? el.querySelector("tbody tr")) as HTMLElement | null;
      expect(open, "a room to open").not.toBeNull();
      await act(async () => open!.click());
      await until(/กระดาษคำตอบ/);
      for (const heading of ["ผู้เข้าสอบ", "การจัดสอบ", "เนื้อหาข้อสอบ", "กระดาษคำตอบ"]) expect(el.textContent, heading).toContain(heading);
      expect(el.textContent).toContain("พิมพ์กระดาษคำตอบ");
      expect(el.textContent).toContain("สแกนตรวจกระดาษคำตอบ");
    } finally {
      delete rows.exam_sessions;
    }
  }, 60_000);
});

describe("student exam menu", () => {
  it("renders the exam list for a student with nothing scheduled (card and table viewports)", async () => {
    const before = auth.value;
    auth.value = { profile: { id: "p-s", roles: ["student"], department_id: "d1", first_name: "นักเรียน", last_name: "ทดสอบ", avatar_path: null }, myStudent: { id: "st-1", student_code: "1", first_name: "นักเรียน", last_name: "ทดสอบ" }, loading: false };
    try {
      for (const phone of [true, false]) {
        setViewport(phone);
        const el = document.createElement("div");
        document.body.appendChild(el);
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        await act(async () =>
          createRoot(el).render(
            <QueryClientProvider client={qc}>
              <MemoryRouter>
                <ToastProvider>
                  <Exams />
                </ToastProvider>
              </MemoryRouter>
            </QueryClientProvider>,
          ),
        );
        await wait(600);
        expect(el.textContent, phone ? "phone" : "desktop").not.toMatch(/ไม่มีสิทธิ์เข้าถึงเมนูนี้/);
        expect((el.textContent ?? "").length).toBeGreaterThan(0);
      }
    } finally {
      auth.value = before;
    }
  }, 60_000);
});
