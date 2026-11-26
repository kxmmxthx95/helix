import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mutate = vi.fn();
const src = { id: "S2", title: "สอบเก่า", exam_type: "กลางภาค", round: 1, opens_at: "2026-11-01T02:00:00Z" };
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ profile: { id: "t1", roles: ["teacher"] } }) }));
vi.mock("@/components/Toast", () => ({ useToast: () => () => {} }));
vi.mock("@/components/Sheet", () => ({ Sheet: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => <div>{children}{footer}</div> }));
vi.mock("@/components/ConfirmDialog", () => ({ ConfirmDialog: () => null }));
vi.mock("@/hooks/useExams", () => ({ useMyExamSessions: () => ({ data: [src, { id: "S1", title: "นี้", exam_type: null, round: null, opens_at: null }] }), useAllExamSessions: () => ({ data: undefined }) }));
vi.mock("@/hooks/useExamSeating", () => ({
  useSessionRooms: (id: string | null) => ({ data: id ? [{ id: "R2", session_id: "S2", position: 1, room_id: null, seat_rows: 2, seat_cols: 2, template_id: "T1" }] : [] }),
  useSessionSeats: (id: string | null) => ({ data: id ? [{ session_id: "S2", session_room_id: "R2", student_id: "a", seat_row: 1, seat_col: 1 }, { session_id: "S2", session_room_id: "R2", student_id: "gone", seat_row: 1, seat_col: 2 }] : [] }),
  useSpecialSeats: (id: string | null) => ({ data: id ? [{ id: "x", session_id: "S2", session_room_id: "R2", special_no: 1, student_id: "b" }] : [] }),
  useCopyRoomSeating: () => ({ mutate, isPending: false }),
  // unused by the sheet but imported by the card module
  useAddSessionRoom: () => ({}), useAddSpecialSeat: () => ({}), useDeleteSeatTemplate: () => ({}), useDeleteSpecialSeat: () => ({}), useRemoveSessionRoom: () => ({}), useRoomsConflictSeats: () => new Map(), useSaveSeatTemplate: () => ({}), useSeatTemplates: () => ({ data: [] }), useSetSpecialSeat: () => ({}), useSetRoomSeating: () => ({}), useSetSessionSeats: () => ({}),
}));
import { CopySeatingSheet } from "./ExamSeatingCard";

it("previews and runs a copy from another round, dropping students not on the roster", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const template = { id: "T1", name: "2x2", seat_rows: 2, seat_cols: 2, department_id: "d" };
  await act(async () =>
    createRoot(el).render(
      <CopySeatingSheet
        session={{ id: "S1" } as never}
        room={{ id: "R1", position: 1 } as never}
        templates={[template] as never}
        rosterIds={new Set(["a", "b", "c"])}
        studentCount={3}
        keep={[]}
        held={new Set()}
        hasExisting={false}
        onClose={() => {}}
      />,
    ),
  );
  const options = [...el.querySelectorAll("option")].map((o) => o.textContent);
  expect(options.join("|")).toContain("กลางภาค ครั้งที่ 1"); // the current session itself is not offered
  expect(options.join("|")).not.toContain("นี้");
  const select = el.querySelector("select") as HTMLSelectElement;
  await act(async () => {
    select.value = "S2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(el.textContent).toContain("นักเรียนที่จะได้ที่นั่ง 2 จาก 3 คน");
  expect(el.textContent).toContain("ข้าม 1 คน");
  expect(el.textContent).toContain("นักเรียนใหม่ 1 คน");
  const go = [...el.querySelectorAll("button")].find((b) => b.textContent === "คัดลอก") as HTMLButtonElement;
  await act(async () => go.click());
  expect(mutate).toHaveBeenCalledTimes(1);
  const arg = mutate.mock.calls[0]![0];
  expect(arg).toMatchObject({ sessionId: "S1", roomRowId: "R1", specials: ["b"] });
  expect(arg.seats).toEqual([{ student_id: "a", room: "R1", seat_row: 1, seat_col: 1 }]);
});
