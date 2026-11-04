import { describe, expect, it } from "vitest";
import { passwordFromDob, passwordFromNationalId } from "@/lib/password";

describe("passwordFromDob", () => {
  it("formats as DDMMYYYY in พ.ศ., not the stored ค.ศ. value", () => {
    expect(passwordFromDob("2001-08-15")).toBe("15082544");
  });
});

describe("passwordFromNationalId", () => {
  it("keeps a foreign G-number, upper-cased", () => {
    expect(passwordFromNationalId("g695600001686")).toBe("G695600001686");
  });

  it("strips non-digit characters", () => {
    expect(passwordFromNationalId("1-2345-67890-12-3")).toBe("1234567890123");
  });
});
