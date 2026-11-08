import { describe, expect, it } from "vitest";
import { IDLE_MS, shouldReload } from "./swUpdate";

describe("shouldReload", () => {
  it("needs long absence and empty outbox", () => {
    expect(shouldReload(IDLE_MS, 0)).toBe(true);
    expect(shouldReload(IDLE_MS - 1, 0)).toBe(false);
    expect(shouldReload(IDLE_MS, 1)).toBe(false);
  });
});
