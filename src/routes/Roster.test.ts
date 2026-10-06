import { describe, expect, it } from "vitest";
import { splitLoginEligibility } from "@/routes/Roster";
import type { Student } from "@/lib/database.types";

function student(overrides: Partial<Student>): Student {
  return {
    id: overrides.id ?? "s1",
    student_code: "1001",
    national_id: null,
    prefix: null,
    first_name: "สมชาย",
    last_name: "ใจดี",
    department_id: "dept-1",
    grade_level_id: null,
    status: "studying",
    profile_id: null,
    phone: null,
    email: null,
    house_no: null,
    village_no: null,
    alley: null,
    road: null,
    subdistrict: null,
    district: null,
    province: null,
    postal_code: null,
    family_status: null,
    blood_type: null,
    chronic_disease: null,
    drug_allergy: null,
    food_allergy: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("splitLoginEligibility", () => {
  it("puts a student with a 13-digit national ID and no account into ready", () => {
    const s = student({ id: "s1", national_id: "1234567890123" });
    expect(splitLoginEligibility([s])).toEqual({ ready: [s], skipped: [] });
  });

  it("skips a student with no national ID", () => {
    const s = student({ id: "s2", national_id: null });
    expect(splitLoginEligibility([s])).toEqual({ ready: [], skipped: [s] });
  });

  it("skips a student with a malformed national ID", () => {
    const s = student({ id: "s3", national_id: "123" });
    expect(splitLoginEligibility([s])).toEqual({ ready: [], skipped: [s] });
  });

  it("excludes a student who already has an account, even without skipping them", () => {
    const s = student({ id: "s4", national_id: "1234567890123", profile_id: "profile-1" });
    expect(splitLoginEligibility([s])).toEqual({ ready: [], skipped: [] });
  });
});
