import { describe, expect, it } from "vitest";
import { planCopy } from "./examSeatCopy";

const base = { roomId: "R", rows: 2, cols: 2, srcSpecials: [], roster: new Set(["a", "b", "c"]), keep: [], held: new Set<string>() };
const seat = (student_id: string, seat_row: number, seat_col: number) => ({ student_id, seat_row, seat_col });

describe("planCopy", () => {
  it("copies seats of students on the destination roster to the same cells", () => {
    const p = planCopy({ ...base, srcSeats: [seat("a", 1, 1), seat("b", 2, 2)] });
    expect(p.seats).toEqual([{ student_id: "a", room: "R", seat_row: 1, seat_col: 1 }, { student_id: "b", room: "R", seat_row: 2, seat_col: 2 }]);
    expect(p).toMatchObject({ copied: 2, skipped: 0 });
  });
  it("drops students who are not on the destination roster, leaving new roster students unseated", () => {
    const p = planCopy({ ...base, srcSeats: [seat("a", 1, 1), seat("gone", 1, 2)] });
    expect(p.seats.map((x) => x.student_id)).toEqual(["a"]);
    expect(p.skipped).toBe(1);
  });
  it("skips cells held by another session and cells outside the grid", () => {
    const p = planCopy({ ...base, held: new Set(["1:2"]), srcSeats: [seat("a", 1, 1), seat("b", 1, 2), seat("c", 3, 1)] });
    expect(p.seats.map((x) => x.student_id)).toEqual(["a"]);
    expect(p.skipped).toBe(2);
  });
  it("keeps seats in the destination's other rooms and does not seat those students again", () => {
    const keep = [{ student_id: "a", room: "OTHER", seat_row: 1, seat_col: 1 }];
    const p = planCopy({ ...base, keep, srcSeats: [seat("a", 1, 1), seat("b", 1, 2)] });
    expect(p.seats).toEqual([...keep, { student_id: "b", room: "R", seat_row: 1, seat_col: 2 }]);
    expect(p.skipped).toBe(1);
  });
  it("recreates special seats in order, empty where the student cannot be seated, capped at 10", () => {
    const srcSpecials = [
      { special_no: 2, student_id: "gone" },
      { special_no: 1, student_id: "b" },
      { special_no: 3, student_id: null },
    ];
    const p = planCopy({ ...base, srcSeats: [], srcSpecials });
    expect(p.specials).toEqual(["b", null, null]);
    expect(p).toMatchObject({ copied: 1, skipped: 1 });
    const many = Array.from({ length: 12 }, (_, n) => ({ special_no: n + 1, student_id: null }));
    expect(planCopy({ ...base, srcSeats: [], srcSpecials: many }).specials).toHaveLength(10);
  });
  it("does not put a student in both the grid and a special seat", () => {
    const p = planCopy({ ...base, srcSeats: [seat("a", 1, 1)], srcSpecials: [{ special_no: 1, student_id: "a" }] });
    expect(p.specials).toEqual([null]);
  });
});
