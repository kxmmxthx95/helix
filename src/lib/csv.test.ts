import { describe, expect, it } from "vitest";
import { parseCsv, readTable } from "@/lib/csv";

describe("parseCsv", () => {
  it("keeps commas and newlines that live inside quoted fields", () => {
    const text = 'code,name\n001,"สมชาย, ใจดี"\n002,"บรรทัด\nสอง"';
    expect(parseCsv(text)).toEqual([
      ["code", "name"],
      ["001", "สมชาย, ใจดี"],
      ["002", "บรรทัด\nสอง"],
    ]);
  });

  it("unescapes doubled quotes and drops the Excel BOM", () => {
    expect(parseCsv('﻿a,b\n1,"say ""hi"""')).toEqual([
      ["a", "b"],
      ["1", 'say "hi"'],
    ]);
  });

  it("ignores blank lines and CRLF endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

const columns = [
  { key: "student_code", header: "รหัสนักเรียน", required: true },
  { key: "first_name", header: "ชื่อ", required: true },
  { key: "class_level", header: "ชั้น" },
];

describe("readTable", () => {
  it("maps rows by header name, not column position", () => {
    const text = "ชื่อ,รหัสนักเรียน\nสมชาย,001";
    const { rows, issues } = readTable(text, columns);

    expect(issues).toEqual([]);
    expect(rows).toEqual([{ student_code: "001", first_name: "สมชาย", class_level: "" }]);
  });

  it("reports the line number of a row missing a required value and skips it", () => {
    const text = "รหัสนักเรียน,ชื่อ\n001,สมชาย\n,สมหญิง";
    const { rows, issues } = readTable(text, columns);

    expect(rows).toHaveLength(1);
    expect(issues).toEqual([{ row: 3, message: '"รหัสนักเรียน" ว่าง' }]);
  });

  it("refuses the whole file when a required column is absent", () => {
    const { rows, issues } = readTable("ชื่อ\nสมชาย", columns);

    expect(rows).toEqual([]);
    expect(issues[0]?.message).toContain("รหัสนักเรียน");
  });
});
