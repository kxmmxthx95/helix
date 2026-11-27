import { describe, expect, it } from "vitest";
import { countLeaves } from "./examLeaves";

describe("countLeaves", () => {
  it("counts one switch once, however many events it fires", () => {
    expect(countLeaves(["2026-12-01T09:00:00Z", "2026-12-01T09:00:01Z"])).toBe(1);
  });
  it("counts separate switches apart and ignores input order", () => {
    expect(countLeaves(["2026-12-01T09:05:00Z", "2026-12-01T09:00:00Z", "2026-12-01T09:00:02Z"])).toBe(2);
  });
  it("is zero with no events", () => {
    expect(countLeaves([])).toBe(0);
  });
});
