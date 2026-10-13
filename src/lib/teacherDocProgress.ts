import type { CoverageRow } from "@/hooks/useDocuments";

export type LessonStatus = "complete" | "partial" | "none" | "nodata";

export type PairProgress = {
  key: string;
  row: CoverageRow | undefined;
  /** Denominator: the target when set, else the เนื้อหาหลัก that exist. */
  total: number;
  /** เนื้อหาหลัก with at least one file that wasn't returned for rework. */
  uploaded: number;
  files: number;
  percent: number | null;
};

export type TeacherLessonProgress = {
  total: number;
  uploaded: number;
  missing: number;
  files: number;
  /** null when there is nothing to measure against. */
  percent: number | null;
  status: LessonStatus;
  pairs: PairProgress[];
};

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : null);

/** Progress on one subject x grade: uploaded เนื้อหาหลัก against the target (or, when none is set, against those that exist). */
export function pairProgress(key: string, row: CoverageRow | undefined): PairProgress {
  const lessons = row?.lessons ?? [];
  const total = row && row.lessonTarget > 0 ? row.lessonTarget : lessons.length;
  const uploaded = Math.min(total, lessons.filter((l) => l.okFileCount > 0).length);
  return { key, row, total, uploaded, files: lessons.reduce((n, l) => n + l.okFileCount, 0), percent: pct(uploaded, total) };
}

/** Rolls a teacher's subject x grade pairs up by summing uploaded and total (weighted by เนื้อหา, not an average of percents). */
export function teacherLessonProgress(pairKeys: Iterable<string>, rows: Map<string, CoverageRow>): TeacherLessonProgress {
  const pairs = [...pairKeys].map((k) => pairProgress(k, rows.get(k)));
  const total = pairs.reduce((n, p) => n + p.total, 0);
  const uploaded = pairs.reduce((n, p) => n + p.uploaded, 0);
  return {
    total,
    uploaded,
    missing: total - uploaded,
    files: pairs.reduce((n, p) => n + p.files, 0),
    percent: pct(uploaded, total),
    status: !total ? "nodata" : uploaded >= total ? "complete" : uploaded === 0 ? "none" : "partial",
    pairs,
  };
}
