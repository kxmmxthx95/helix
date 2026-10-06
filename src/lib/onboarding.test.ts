import { describe, expect, it } from "vitest";
import type { Student } from "@/lib/database.types";
import { missingOnboardingStep } from "@/lib/onboarding";

const complete: Student = {
  id: "s1",
  student_code: "1001",
  national_id: "1234567890123",
  prefix: "เด็กชาย",
  first_name: "สมชาย",
  last_name: "ใจดี",
  department_id: "dept1",
  grade_level_id: "grade1",
  status: "studying",
  profile_id: "profile1",
  phone: "0812345678",
  email: "somchai@example.com",
  house_no: "1",
  village_no: null,
  alley: null,
  road: null,
  subdistrict: "ตำบล",
  district: "อำเภอ",
  province: "จังหวัด",
  postal_code: "10000",
  family_status: "อยู่ด้วยกัน",
  blood_type: "unknown",
  chronic_disease: "ไม่มี",
  drug_allergy: "ไม่มี",
  food_allergy: "ไม่มี",
  created_at: "",
  updated_at: "",
};

describe("missingOnboardingStep", () => {
  it("sends must-change-password students straight to the password step, before anything else", () => {
    expect(missingOnboardingStep(true, complete, 2)).toBe("password");
  });

  it("stops at identity when national_id or a required address field is missing", () => {
    expect(missingOnboardingStep(false, { ...complete, national_id: null }, 2)).toBe("identity");
    expect(missingOnboardingStep(false, { ...complete, province: "" }, 2)).toBe("identity");
    // village_no/alley/road are legitimately optional
    expect(missingOnboardingStep(false, complete, 2)).not.toBe("identity");
  });

  it("stops at contact when phone or email is missing", () => {
    expect(missingOnboardingStep(false, { ...complete, phone: null }, 2)).toBe("contact");
  });

  it("stops at guardians below the required count, with an 'other' guardian counting fine", () => {
    expect(missingOnboardingStep(false, complete, 1)).toBe("guardians");
    expect(missingOnboardingStep(false, complete, 0)).toBe("guardians");
  });

  it("stops at health when any of the health fields is missing", () => {
    expect(missingOnboardingStep(false, { ...complete, blood_type: null }, 2)).toBe("health");
    expect(missingOnboardingStep(false, { ...complete, chronic_disease: "" }, 2)).toBe("health");
  });

  it("returns null once every step is satisfied", () => {
    expect(missingOnboardingStep(false, complete, 2)).toBeNull();
  });
});
