import { describe, expect, it } from "vitest";
import { groupBySharedLessons } from "./examGroups";

const links: Record<string, string[]> = { a: ["l1"], b: ["l1", "l2"], c: ["l2"], d: ["l9"] };
const lessonsOf = (s: string) => (links[s] ? new Set(links[s]) : undefined);
const g = (rows: { id: number; s: string; room: string }[]) =>
  groupBySharedLessons(rows, (r) => r.room, (r) => r.s, lessonsOf).map((x) => x.map((r) => r.id));

describe("groupBySharedLessons", () => {
  it("chains subjects that share lessons in the same room", () => {
    expect(g([{ id: 1, s: "a", room: "r1" }, { id: 2, s: "c", room: "r1" }, { id: 3, s: "b", room: "r1" }, { id: 4, s: "d", room: "r1" }])).toEqual([[1, 2, 3], [4]]);
  });
  it("never merges across rooms", () => {
    expect(g([{ id: 1, s: "a", room: "r1" }, { id: 2, s: "b", room: "r2" }])).toEqual([[1], [2]]);
  });
  it("leaves unlinked subjects alone", () => {
    expect(g([{ id: 1, s: "x", room: "r1" }, { id: 2, s: "y", room: "r1" }])).toEqual([[1], [2]]);
  });
});
