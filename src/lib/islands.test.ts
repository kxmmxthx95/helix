import { describe, expect, it } from "vitest";
import type { MyAssignment } from "@/hooks/useAssignments";
import type { AssignmentSubmission } from "@/lib/database.types";
import { areaCodeMap, islandsFor } from "@/lib/islands";

const subj = (id: string, code: string, area = "a1") => ({
  id,
  code,
  name_th: code,
  learning_area_id: area,
});
const asg = (id: string, subjectId: string, due: string | null) =>
  ({
    id,
    subjectId,
    due_date: due,
    requires_submission: true,
  }) as unknown as MyAssignment;
const sub = (due: string) =>
  ({ submitted_at: `${due}T00:00:00Z` }) as AssignmentSubmission;

describe("islandsFor", () => {
  it("orders pending-first by next due, then by code; counts and area codes", () => {
    const subjects = [
      subj("1", "A"),
      subj("2", "B", "a2"),
      subj("3", "C", "zz"),
      subj("4", "D"),
    ];
    const assignments = [
      asg("x", "2", "2026-01-05"),
      asg("y", "4", "2026-01-02"),
      asg("z", "4", "2026-01-01"),
      asg("w", "1", "2026-01-09"),
    ];
    const submissions = new Map([["w", sub("2026-01-08")]]);
    const areas = areaCodeMap([
      { id: "a0", code: "MATH", parent_id: null },
      { id: "a1", code: "SCI", parent_id: null },
      { id: "a2", code: "SUB", parent_id: "a0" },
    ]);
    const r = islandsFor(subjects, assignments, submissions, new Map(), areas);
    expect(r.map((i) => i.subject.code)).toEqual(["D", "B", "A", "C"]);
    expect(r[0]).toMatchObject({ total: 2, submitted: 0, areaCode: "SCI" });
    expect(r[0]!.pending.map((a) => a.id)).toEqual(["z", "y"]);
    expect(r[0]!.next?.id).toBe("z");
    expect(r[1]!.areaCode).toBe("MATH");
    expect(r[2]).toMatchObject({ submitted: 1, next: null });
    expect(r[3]).toMatchObject({ total: 0, areaCode: "other" });
  });
});
