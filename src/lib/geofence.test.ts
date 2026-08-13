import { describe, expect, it } from "vitest";
import { distanceMeters } from "@/lib/geofence";

describe("distanceMeters", () => {
  it("returns 0 for the same point", () => {
    expect(distanceMeters(13.7563, 100.5018, 13.7563, 100.5018)).toBe(0);
  });

  it("returns ~111.2km per degree of latitude", () => {
    const d = distanceMeters(13.0, 100.0, 14.0, 100.0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("matches a known short distance (~100m apart)", () => {
    // Bangkok office block, ~0.0009 deg latitude apart (~100m)
    const d = distanceMeters(13.7563, 100.5018, 13.7572, 100.5018);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });
});
