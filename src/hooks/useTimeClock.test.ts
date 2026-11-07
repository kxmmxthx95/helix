import { describe, expect, it } from "vitest";
import { clockHoliday } from "./useTimeClock";

const ev = (event_type: string, departmentIds: string[] = [], staff_attend = true) => ({ name: "X", event_type, staff_attend, departmentIds });

describe("clockHoliday", () => {
  it("locks holiday/suspended with name, scoped to department", () => {
    expect(clockHoliday("2026-11-04", [ev("holiday")], "d1")).toBe("วันหยุด · X");
    expect(clockHoliday("2026-11-04", [ev("suspended", ["d1"])], "d1")).toBe("วันหยุด · X");
    expect(clockHoliday("2026-11-04", [ev("holiday", ["d2"])], "d1")).toBeNull();
  });
  it("locks weekends, teacher_workday unlocks", () => {
    expect(clockHoliday("2026-11-07", [], "d1")).toBe("วันหยุดสุดสัปดาห์");
    expect(clockHoliday("2026-11-07", [ev("teacher_workday")], "d1")).toBeNull();
    expect(clockHoliday("2026-11-04", [ev("holiday"), ev("teacher_workday")], "d1")).toBeNull();
    expect(clockHoliday("2026-11-07", [ev("teacher_workday", [], false)], "d1")).toBe("วันหยุดสุดสัปดาห์");
  });
  it("normal weekday is open", () => {
    expect(clockHoliday("2026-11-04", [], "d1")).toBeNull();
  });
});
