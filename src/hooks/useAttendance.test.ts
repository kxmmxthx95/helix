import { describe, expect, it } from "vitest";
import { summarizeAttendance } from "@/hooks/useAttendance";
import type { AttendanceRecord } from "@/lib/database.types";

const record = (status: AttendanceRecord["status"]): AttendanceRecord => ({
  id: "r",
  student_id: "s",
  classroom_id: "c",
  date: "2026-08-12",
  status,
  note: null,
  recorded_by: "t",
  created_at: "",
  updated_at: "",
});

describe("summarizeAttendance", () => {
  it("counts every status at zero when there are no records", () => {
    expect(summarizeAttendance([])).toEqual({ present: 0, late: 0, absent: 0, leave: 0 });
  });

  it("tallies a mix of statuses", () => {
    const records = [record("present"), record("present"), record("late"), record("absent"), record("leave")];
    expect(summarizeAttendance(records)).toEqual({ present: 2, late: 1, absent: 1, leave: 1 });
  });
});
