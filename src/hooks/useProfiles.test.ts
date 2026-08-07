import { describe, expect, it } from "vitest";
import { diffProfileRoles } from "@/hooks/useProfiles";

describe("diffProfileRoles", () => {
  it("adds a plain role that isn't held yet", () => {
    const { toDeleteIds, toInsert } = diffProfileRoles([], ["teacher"], []);
    expect(toDeleteIds).toEqual([]);
    expect(toInsert).toEqual([{ role: "teacher", position_title_id: null }]);
  });

  it("leaves an already-held plain role untouched", () => {
    const existing = [{ id: "r1", role: "teacher" as const, position_title_id: null }];
    const { toDeleteIds, toInsert } = diffProfileRoles(existing, ["teacher"], []);
    expect(toDeleteIds).toEqual([]);
    expect(toInsert).toEqual([]);
  });

  it("removes a plain role that was unchecked", () => {
    const existing = [{ id: "r1", role: "teacher" as const, position_title_id: null }];
    const { toDeleteIds, toInsert } = diffProfileRoles(existing, [], []);
    expect(toDeleteIds).toEqual(["r1"]);
    expect(toInsert).toEqual([]);
  });

  it("keeps two dept_head titles independent — dropping one doesn't touch the other", () => {
    const existing = [
      { id: "r1", role: "dept_head" as const, position_title_id: "academic" },
      { id: "r2", role: "dept_head" as const, position_title_id: "budget" },
    ];
    const { toDeleteIds, toInsert } = diffProfileRoles(existing, [], ["academic"]);
    expect(toDeleteIds).toEqual(["r2"]);
    expect(toInsert).toEqual([]);
  });

  it("adds a new dept_head title alongside an existing one", () => {
    const existing = [{ id: "r1", role: "dept_head" as const, position_title_id: "academic" }];
    const { toDeleteIds, toInsert } = diffProfileRoles(existing, [], ["academic", "budget"]);
    expect(toDeleteIds).toEqual([]);
    expect(toInsert).toEqual([{ role: "dept_head", position_title_id: "budget" }]);
  });

  it("swaps a teacher for a student role in one diff", () => {
    const existing = [{ id: "r1", role: "teacher" as const, position_title_id: null }];
    const { toDeleteIds, toInsert } = diffProfileRoles(existing, ["student"], []);
    expect(toDeleteIds).toEqual(["r1"]);
    expect(toInsert).toEqual([{ role: "student", position_title_id: null }]);
  });
});
