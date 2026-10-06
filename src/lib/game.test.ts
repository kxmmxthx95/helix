import { describe, expect, it } from "vitest";
import { bodyType, characterSrc } from "@/lib/game";

describe("game", () => {
  it("maps prefix to body type, unknown falls back to boy", () => {
    expect(bodyType("เด็กหญิง")).toBe("girl");
    expect(bodyType("นางสาว")).toBe("girl");
    expect(bodyType("เด็กชาย")).toBe("boy");
    expect(bodyType(null)).toBe("boy");
    expect(bodyType("ด.ช.")).toBe("boy");
  });

  it("builds the asset path from class + body", () => {
    expect(characterSrc("math", "เด็กหญิง")).toBe("/game/char-math-girl.webp");
  });
});
