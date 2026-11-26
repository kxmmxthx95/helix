import { describe, expect, it } from "vitest";
import { planFillAll } from "./examSeatFill";

const stu = (id: string, code: string) => ({ student_id: id, code });
const noShuffle = <T,>(a: T[]) => a;
const reverse = <T,>(a: T[]) => a.slice().reverse();
const room = (id: string, rows: number, cols: number, held: string[] = []) => ({ id, rows, cols, held: new Set(held) });

describe("planFillAll", () => {
  it("fills room 1 then room 2 in reading order, students by code", () => {
    const p = planFillAll({ rooms: [room("A", 1, 2), room("B", 1, 2)], seats: [], specialIds: new Set(), students: [stu("s3", "30"), stu("s1", "10"), stu("s2", "20")], order: "code", shuffle: noShuffle });
    expect(p.seats).toEqual([
      { student_id: "s1", room: "A", seat_row: 1, seat_col: 1 },
      { student_id: "s2", room: "A", seat_row: 1, seat_col: 2 },
      { student_id: "s3", room: "B", seat_row: 1, seat_col: 1 },
    ]);
    expect(p).toMatchObject({ placed: 3, left: 0 });
  });
  it("sorts codes as numbers", () => {
    const p = planFillAll({ rooms: [room("A", 1, 3)], seats: [], specialIds: new Set(), students: [stu("a", "9"), stu("b", "10"), stu("c", "2")], order: "code", shuffle: noShuffle });
    expect(p.seats.map((x) => x.student_id)).toEqual(["c", "a", "b"]);
  });
  it("leaves seated students and special-seat students alone and skips taken and held cells", () => {
    const seats = [{ student_id: "s1", room: "A", seat_row: 1, seat_col: 1 }];
    const p = planFillAll({ rooms: [room("A", 1, 4, ["1:3"])], seats, specialIds: new Set(["s2"]), students: [stu("s1", "1"), stu("s2", "2"), stu("s3", "3"), stu("s4", "4")], order: "code", shuffle: noShuffle });
    expect(p.seats).toEqual([...seats, { student_id: "s3", room: "A", seat_row: 1, seat_col: 2 }, { student_id: "s4", room: "A", seat_row: 1, seat_col: 4 }]);
    expect(p.placed).toBe(2);
  });
  it("seats as many as fit and reports the rest when capacity is short", () => {
    const p = planFillAll({ rooms: [room("A", 1, 2)], seats: [], specialIds: new Set(), students: [stu("a", "1"), stu("b", "2"), stu("c", "3")], order: "code", shuffle: noShuffle });
    expect(p).toMatchObject({ placed: 2, left: 1 });
  });
  it("uses the supplied shuffle for the random order", () => {
    const p = planFillAll({ rooms: [room("A", 1, 2)], seats: [], specialIds: new Set(), students: [stu("a", "1"), stu("b", "2")], order: "shuffle", shuffle: reverse });
    expect(p.seats.map((x) => x.student_id)).toEqual(["b", "a"]);
  });
  it("does nothing when everyone already has a seat", () => {
    const seats = [{ student_id: "a", room: "A", seat_row: 1, seat_col: 1 }];
    const p = planFillAll({ rooms: [room("A", 1, 2)], seats, specialIds: new Set(), students: [stu("a", "1")], order: "code", shuffle: noShuffle });
    expect(p).toEqual({ seats, placed: 0, left: 0 });
  });
});
