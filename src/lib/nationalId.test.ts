import { describe, expect, it } from "vitest";
import { isValidNationalId, normalizeNationalId } from "@/lib/nationalId";

describe("national ID", () => {
  it("normalizes spaces, hyphens and case", () => {
    expect(normalizeNationalId(" g6956-0000 1686 ")).toBe("G695600001686");
  });
  it("accepts Thai 13 digits and foreign G-number/passport", () => {
    expect(isValidNationalId("1234567890123")).toBe(true);
    expect(isValidNationalId("G695600001686")).toBe(true);
    expect(isValidNationalId("AB123456")).toBe(true);
  });
  it("rejects too short, too long, or symbols", () => {
    expect(isValidNationalId("12345")).toBe(false);
    expect(isValidNationalId("A".repeat(21))).toBe(false);
    expect(isValidNationalId("AB#12345")).toBe(false);
  });
});
