import { describe, expect, it } from "vitest";
import { assignmentStatus } from "@/hooks/useAssignments";
import type { AssignmentSubmission } from "@/lib/database.types";

const item = (dueDate: string | null) => ({ due_date: dueDate, requires_submission: true });

const submission = (submittedAt: string): AssignmentSubmission => ({
  id: "s1",
  score_item_id: "i1",
  student_id: "st1",
  content: null,
  submitted_at: submittedAt,
  reopened: false,
  created_at: submittedAt,
  updated_at: submittedAt,
});

describe("assignmentStatus", () => {
  it("is missing with no submission and no grade", () => {
    expect(assignmentStatus(item("2026-08-20"), null, false)).toBe("missing");
  });

  it("is submitted when turned in on or before the due date", () => {
    expect(assignmentStatus(item("2026-08-20"), submission("2026-08-19T10:00:00Z"), false)).toBe("submitted");
  });

  it("is late when turned in after the due date", () => {
    expect(assignmentStatus(item("2026-08-20"), submission("2026-08-21T10:00:00Z"), false)).toBe("late");
  });

  it("is submitted (not late) when there's no due date at all", () => {
    expect(assignmentStatus(item(null), submission("2026-08-21T10:00:00Z"), false)).toBe("submitted");
  });

  it("is graded once a score exists, even if it was submitted late", () => {
    expect(assignmentStatus(item("2026-08-20"), submission("2026-08-21T10:00:00Z"), true)).toBe("graded");
  });
});
