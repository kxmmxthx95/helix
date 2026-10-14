import { describe, expect, it } from "vitest";
import { canManage, canManageAcademic, canManageHr, isDeptHead, isOrgWide } from "@/lib/roles";

describe("dept_director", () => {
  it("is dept-scoped like dept_head, never org-wide or org-level HR", () => {
    expect(isDeptHead(["dept_director"])).toBe(true);
    expect(isDeptHead(["dept_head"])).toBe(true);
    expect(canManage(["dept_director"])).toBe(true);
    expect(canManageAcademic(["dept_director"])).toBe(true);
    expect(isOrgWide(["dept_director"])).toBe(false);
    expect(canManageHr(["dept_director"])).toBe(false);
  });
});
