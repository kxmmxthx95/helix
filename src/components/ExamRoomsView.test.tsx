import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { RoomsView } from "@/components/ExamRoomsView";

const at = (day: string, hm: string) => `2026-12-${day}T${hm}:00+07:00`;
const base = { title: "สอบ", exam_type: "กลางภาค", round: null, subject_id: "s" } as const;
const sessions = [
  { ...base, id: "a", opens_at: at("01", "09:00"), closes_at: at("01", "10:00") },
  { ...base, id: "b", opens_at: at("01", "09:30"), closes_at: at("01", "10:30") },
  { ...base, id: "c", opens_at: at("01", "13:00"), closes_at: at("01", "14:00") },
  { ...base, id: "d", opens_at: at("02", "09:00"), closes_at: at("02", "10:00") },
] as never[];

it("one column per used room, hides empty rooms, shows gaps and clashes, switches day", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const roomIdsOf = new Map([["a", ["r1"]], ["b", ["r1"]], ["c", ["r1"]], ["d", ["r2"]]]);
  const opened: string[] = [];
  await act(async () =>
    createRoot(el).render(
      <RoomsView
        sessions={sessions}
        roomIdsOf={roomIdsOf}
        venues={[{ id: "r1", name: "101" }, { id: "r2", name: "202" }, { id: "r3", name: "303" }]}
        subjectsOf={() => []}
        seatBadge={() => null}
        clashing={new Set(["a", "b"])}
        onOpen={(s) => opened.push(s.id)}
      />,
    ),
  );
  const tabs = el.querySelectorAll('[role="tab"]');
  expect(tabs.length).toBe(2);
  await act(async () => (tabs[0] as HTMLElement).click());
  expect(el.querySelectorAll("section").length).toBe(1); // 202 has nothing on day 1, 303 nothing at all
  expect(el.textContent).toContain("ห้อง 101");
  expect(el.textContent).not.toContain("ห้อง 303");
  expect(el.textContent).toContain("ซ้อนเวลา");
  expect(el.textContent).toMatch(/ว่าง 10:30 – 13:00/);
  await act(async () => (el.querySelector('[role="button"]') as HTMLElement).click());
  expect(opened).toEqual(["a"]);
  await act(async () => (tabs[1] as HTMLElement).click());
  expect(el.textContent).toContain("ห้อง 202");
  expect(el.textContent).not.toContain("ห้อง 101");
});
