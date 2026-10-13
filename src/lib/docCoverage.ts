import type { CoverageLesson, CoverageRow } from "@/hooks/useDocuments";

export type CoverageStatus = "empty" | "partial" | "complete";

export type CoverageStats = {
  lessons: number;
  topics: number;
  files: number;
  /** Percent 0-100: lessons vs target when a target is set, else share of lessons that have a file. */
  progress: number;
  status: CoverageStatus;
  last: CoverageLesson | undefined;
};

/** empty = no เนื้อหาหลัก; complete = target met (when set) and every เนื้อหาหลัก has a file; else partial. */
export function coverageStats(r: Pick<CoverageRow, "lessons" | "lessonTarget">): CoverageStats {
  const lessons = r.lessons.length;
  const withFiles = r.lessons.filter((l) => l.fileCount > 0).length;
  const targetMet = r.lessonTarget === 0 || lessons >= r.lessonTarget;
  return {
    lessons,
    topics: r.lessons.reduce((n, l) => n + l.topicCount, 0),
    files: r.lessons.reduce((n, l) => n + l.fileCount, 0),
    progress: Math.round(
      (r.lessonTarget > 0 ? Math.min(1, lessons / r.lessonTarget) : lessons ? withFiles / lessons : 0) * 100,
    ),
    status: !lessons ? "empty" : withFiles === lessons && targetMet ? "complete" : "partial",
    last: [...r.lessons].sort((a, b) => a.lastAt.localeCompare(b.lastAt)).at(-1),
  };
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** CSV with a BOM so Excel opens the Thai text as UTF-8. */
export function coverageCsv(rows: CoverageRow[], nameOf: (id: string | null) => string, statusLabel: Record<CoverageStatus, string>) {
  const head = ["รหัสวิชา", "ชื่อวิชา", "ระดับชั้น", "เนื้อหาหลัก", "เป้าหมายเนื้อหาหลัก", "เนื้อหาย่อย", "เป้าหมายเนื้อหาย่อย", "ไฟล์", "อัปโหลดล่าสุด", "ผู้บันทึกล่าสุด", "ความคืบหน้า (%)", "สถานะ"];
  const lines = rows.map((r) => {
    const s = coverageStats(r);
    return [r.code, r.nameTh, r.gradeName, s.lessons, r.lessonTarget, s.topics, r.topicTarget, s.files, s.last?.lastAt.slice(0, 10) ?? "", nameOf(s.last?.lastBy ?? null), s.progress, statusLabel[s.status]];
  });
  return `﻿${[head, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n")}`;
}
