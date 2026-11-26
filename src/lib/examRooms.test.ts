import { describe, expect, it } from "vitest";
import { roomClashes } from "./examRooms";

const s = (id: string, from: string, to: string | null) => ({ id, opens_at: `2026-12-01T${from}:00Z`, closes_at: to ? `2026-12-01T${to}:00Z` : null });
const rooms = (m: Record<string, string[]>) => new Map(Object.entries(m));

describe("roomClashes", () => {
  it("flags both sessions that overlap in one room", () => {
    const out = roomClashes([s("a", "09:00", "10:00"), s("b", "09:30", "10:30")], rooms({ a: ["r1"], b: ["r1"] }));
    expect([...out].sort()).toEqual(["a", "b"]);
  });
  it("ignores overlaps across different rooms", () => {
    expect(roomClashes([s("a", "09:00", "10:00"), s("b", "09:30", "10:30")], rooms({ a: ["r1"], b: ["r2"] })).size).toBe(0);
  });
  it("does not flag sessions that only touch", () => {
    expect(roomClashes([s("a", "09:00", "10:00"), s("b", "10:00", "11:00")], rooms({ a: ["r1"], b: ["r1"] })).size).toBe(0);
  });
  it("flags a long session that swallows a later one, and treats a missing close as a point", () => {
    const out = roomClashes([s("a", "09:00", "12:00"), s("b", "10:00", null), s("c", "13:00", null)], rooms({ a: ["r1"], b: ["r1"], c: ["r1"] }));
    expect([...out].sort()).toEqual(["a", "b"]);
  });
  it("catches a session in any of its several rooms", () => {
    const out = roomClashes([s("a", "09:00", "10:00"), s("b", "09:00", "10:00")], rooms({ a: ["r1", "r2"], b: ["r2"] }));
    expect([...out].sort()).toEqual(["a", "b"]);
  });
  it("skips sessions without a room or a start", () => {
    expect(roomClashes([s("a", "09:00", "10:00"), { id: "b", opens_at: null, closes_at: null }], rooms({ b: ["r1"] })).size).toBe(0);
  });
});
