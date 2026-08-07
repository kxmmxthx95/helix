import { describe, expect, it } from "vitest";
import { resolveUserRow } from "@/components/ImportUsersSheet";

const lookups = {
  deptByCode: new Map([["PRI", "dept-1"]]),
  titleByName: new Map([["หัวหน้าฝ่ายวิชาการ", "title-1"]]),
};

const base = {
  phone: "0812345678",
  password: "changeme123",
  national_id: "1234567890123",
  date_of_birth: "1990-01-15",
};

describe("resolveUserRow", () => {
  it("resolves a plain single-role row", () => {
    const result = resolveUserRow(
      { ...base, first_name: "สมชาย", last_name: "ใจดี", roles: "ครูผู้สอน", department_code: "PRI" },
      2,
      lookups,
    );
    expect(result).toEqual({
      row: 2,
      invite: {
        kind: "staff",
        loginId: "0812345678",
        password: "changeme123",
        prefix: null,
        first_name: "สมชาย",
        last_name: "ใจดี",
        email: null,
        national_id: "1234567890123",
        date_of_birth: "1990-01-15",
        department_id: "dept-1",
        roles: ["teacher"],
        positionTitleIds: [],
      },
    });
  });

  it("splits multi-value roles and titles on '/'", () => {
    const result = resolveUserRow(
      {
        ...base,
        first_name: "ก",
        last_name: "ข",
        roles: "ครูผู้สอน/ผู้บริหารแผนก",
        position_titles: "หัวหน้าฝ่ายวิชาการ",
        department_code: "PRI",
      },
      3,
      lookups,
    );
    expect(result).toEqual({
      row: 3,
      invite: {
        kind: "staff",
        loginId: "0812345678",
        password: "changeme123",
        prefix: null,
        first_name: "ก",
        last_name: "ข",
        email: null,
        national_id: "1234567890123",
        date_of_birth: "1990-01-15",
        department_id: "dept-1",
        // dept_head itself is dropped — it's implied by positionTitleIds instead.
        roles: ["teacher"],
        positionTitleIds: ["title-1"],
      },
    });
  });

  it("rejects an unrecognized role label instead of silently dropping it", () => {
    const result = resolveUserRow(
      { ...base, first_name: "ก", last_name: "ข", roles: "ผู้จัดการทั่วไป" },
      4,
      lookups,
    );
    expect(result).toEqual({ row: 4, issue: 'ไม่รู้จักสิทธิ์ "ผู้จัดการทั่วไป"' });
  });

  it("rejects an unrecognized position title", () => {
    const result = resolveUserRow(
      { ...base, first_name: "ก", last_name: "ข", roles: "ครูผู้สอน", position_titles: "หัวหน้าไม่มีจริง" },
      5,
      lookups,
    );
    expect(result).toEqual({ row: 5, issue: 'ไม่รู้จักตำแหน่ง "หัวหน้าไม่มีจริง"' });
  });

  it("rejects an unrecognized department code", () => {
    const result = resolveUserRow(
      { ...base, first_name: "ก", last_name: "ข", roles: "ครูผู้สอน", department_code: "XX" },
      6,
      lookups,
    );
    expect(result).toEqual({ row: 6, issue: 'ไม่รู้จักรหัสแผนก "XX"' });
  });

  it("leaves department_id null for an org-wide role with no department column", () => {
    const result = resolveUserRow({ ...base, first_name: "ก", last_name: "ข", roles: "ธุรการ" }, 7, lookups);
    expect(result).toEqual({
      row: 7,
      invite: {
        kind: "staff",
        loginId: "0812345678",
        password: "changeme123",
        prefix: null,
        first_name: "ก",
        last_name: "ข",
        email: null,
        national_id: "1234567890123",
        date_of_birth: "1990-01-15",
        department_id: null,
        roles: ["staff"],
        positionTitleIds: [],
      },
    });
  });

  it("carries an optional contact email through unchanged", () => {
    const result = resolveUserRow(
      { ...base, first_name: "ก", last_name: "ข", roles: "ครูผู้สอน", email: "contact@school.ac.th" },
      8,
      lookups,
    );
    expect(result).toMatchObject({ invite: { email: "contact@school.ac.th" } });
  });
});
