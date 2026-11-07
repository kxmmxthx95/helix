import { describe, expect, it } from "vitest";
import { fromThaiLayout } from "./scanText";

describe("fromThaiLayout", () => {
  it("restores a token typed on the Thai layout", () => {
    expect(fromThaiLayout("ๆพ๘ฟๅดจ")).toBe("qr_a1f0");
  });
  it("leaves Latin input alone", () => {
    expect(fromThaiLayout("qr_a1f0")).toBe("qr_a1f0");
    expect(fromThaiLayout("P-000123")).toBe("P-000123");
  });
});
