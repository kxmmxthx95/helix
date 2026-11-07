import { describe, expect, it } from "vitest";
import { groundAt, rng } from "@/components/scene/iso";

describe("groundAt", () => {
  it("canvas centre is the world origin", () => {
    const [x, z] = groundAt(200, 300, 400, 600);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(0);
  });
  it("moving down the screen moves toward the camera (+x,+z)", () => {
    const [x, z] = groundAt(200, 400, 400, 600);
    expect(x).toBeGreaterThan(0);
    expect(z).toBeGreaterThan(0);
  });
  it("moving right moves +x / -z", () => {
    const [x, z] = groundAt(300, 300, 400, 600);
    expect(x).toBeGreaterThan(0);
    expect(z).toBeLessThan(0);
  });
});

describe("rng", () => {
  it("is deterministic per seed", () => expect(rng("a")()).toBe(rng("a")()));
  it("differs across seeds", () => expect(rng("a")()).not.toBe(rng("b")()));
});
