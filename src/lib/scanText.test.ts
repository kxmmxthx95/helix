import { describe, expect, it } from "vitest";
import { fromThaiLayout } from "./scanText";

describe("fromThaiLayout", () => {
  it("restores a token typed on the Thai layout", () => {
    expect(fromThaiLayout("ๆพ๘ฟๅดจ")).toBe("qr_a1f0");
  });
  it("reads a raw _ as the 3 key on the Thai layout (RFID UID 3912528834)", () => {
    expect(fromThaiLayout("_ตๅ/ถ/คค_ภ")).toBe("3912528834");
    expect(fromThaiLayout("__________")).toBe("3333333333");
  });
  it("leaves Latin input alone", () => {
    expect(fromThaiLayout("qr_a1f0")).toBe("qr_a1f0");
    expect(fromThaiLayout("P-000123")).toBe("P-000123");
  });
});
