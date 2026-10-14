import { AlertTriangle, BookIcon, CheckmarkCircleIcon, DownloadIcon, InfoIcon, Upload } from "@/components/icons";
import { useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Spinner } from "@/components/ui";
import { useImportSubjects, type SubjectDraft } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { downloadCsv, readTable, type CsvIssue } from "@/lib/csv";
import type { LearningArea, SubjectType } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const SUBJECT_TYPE_BY_LABEL = new Map<string, SubjectType>([
  ["พื้นฐาน", "basic"],
  ["เพิ่มเติม", "additional"],
  ["กิจกรรม", "activity"],
]);

const COLUMNS = [
  { key: "code", header: "รหัสวิชา", required: true, hint: "รหัสประจำวิชา เช่น sci101" },
  { key: "name_th", header: "ชื่อวิชา (ไทย)", required: true, hint: "ชื่อวิชาภาษาไทย เช่น วิทยาศาสตร์พื้นฐาน 1" },
  { key: "name_en", header: "ชื่อวิชา (อังกฤษ)", hint: "ชื่อวิชาภาษาอังกฤษ เช่น Basic Science 1" },
  { key: "learning_area_code", header: "รหัสกลุ่มสาระ", required: true, hint: "รหัสหรือชื่อกลุ่มสาระ เช่น science" },
  { key: "subject_type", header: "ประเภทวิชา", required: true, hint: "พื้นฐาน, เพิ่มเติม หรือ กิจกรรม" },
  { key: "credits", header: "หน่วยกิต", required: true, hint: "จำนวนหน่วยกิต เช่น 1.5" },
  { key: "hours_per_week", header: "ชั่วโมง/สัปดาห์", required: true, hint: "จำนวนชั่วโมงต่อสัปดาห์ (จำนวนเต็ม) เช่น 3" },
  { key: "suggested_grade_level_code", header: "ระดับชั้นที่แนะนำ (รหัส)", hint: "รหัสระดับชั้น เช่น M1" },
  { key: "suggested_term", header: "เทอมที่แนะนำ", hint: "เทอม 1 หรือ 2" },
];

const TEMPLATE_HEADER = COLUMNS.map((c) => c.header).join(",");
const TEMPLATE_EXAMPLE = ["sci101", "วิทยาศาสตร์พื้นฐาน 1", "Basic Science 1", "science", "พื้นฐาน", "1.5", "3", "M1", "1"].join(
  ",",
);
const TEMPLATE = `${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}`;
const EXAMPLE_ROWS = [
  TEMPLATE_EXAMPLE.split(","),
  ["art101", "ศิลปะพื้นฐาน 1", "Basic Art 1", "art", "พื้นฐาน", "1", "2", "M1", "2"],
];

const CARD = "rounded-xl border p-4";
const SECTION_TITLE = "flex items-center gap-2 text-sm font-semibold";

type Parsed = { rows: Record<string, string>[]; issues: CsvIssue[] };
type Resolved = { draft: SubjectDraft; row: number } | { issue: string; row: number };

/**
 * Turns one parsed CSV row into a SubjectDraft, or the reason it can't
 * become one. Pure and exported so the code/label lookups have a test that
 * doesn't need a rendered sheet — same shape as resolveUserRow.
 */
export function resolveSubjectRow(
  row: Record<string, string>,
  lineNo: number,
  departmentId: string,
  lookups: { areaByLabel: Map<string, string>; gradeByLabel: Map<string, string> },
): Resolved {
  const areaId = lookups.areaByLabel.get((row.learning_area_code ?? "").trim().toLowerCase());
  if (!areaId) return { row: lineNo, issue: `ไม่รู้จักกลุ่มสาระ "${row.learning_area_code}"` };

  const subjectType = SUBJECT_TYPE_BY_LABEL.get((row.subject_type ?? "").trim());
  if (!subjectType) return { row: lineNo, issue: `ไม่รู้จักประเภทวิชา "${row.subject_type}"` };

  const credits = Number(row.credits);
  if (!Number.isFinite(credits) || credits < 0) {
    return { row: lineNo, issue: `หน่วยกิตไม่ถูกต้อง "${row.credits}"` };
  }

  const hoursPerWeek = Number(row.hours_per_week);
  if (!Number.isInteger(hoursPerWeek) || hoursPerWeek < 0) {
    return { row: lineNo, issue: `ชั่วโมง/สัปดาห์ไม่ถูกต้อง "${row.hours_per_week}"` };
  }

  let suggestedGradeLevelId: string | null = null;
  if (row.suggested_grade_level_code) {
    const found = lookups.gradeByLabel.get(row.suggested_grade_level_code.trim().toLowerCase());
    if (!found) return { row: lineNo, issue: `ไม่รู้จักระดับชั้น "${row.suggested_grade_level_code}"` };
    suggestedGradeLevelId = found;
  }

  let suggestedTerm: number | null = null;
  if (row.suggested_term) {
    const t = Number(row.suggested_term);
    if (t !== 1 && t !== 2) return { row: lineNo, issue: `เทอมที่แนะนำต้องเป็น 1 หรือ 2, ได้ "${row.suggested_term}"` };
    suggestedTerm = t;
  }

  return {
    row: lineNo,
    draft: {
      code: row.code!,
      name_th: row.name_th!,
      name_en: row.name_en || null,
      department_id: departmentId,
      learning_area_id: areaId,
      subject_type: subjectType,
      // Same default the manual form suggests — editable afterward via Subjects.
      grading_method: subjectType === "activity" ? "pass_fail" : "graded",
      credits,
      hours_per_week: hoursPerWeek,
      is_active: true,
      suggested_grade_level_id: suggestedGradeLevelId,
      suggested_term: suggestedTerm,
    },
  };
}

/** Pick file → preview → confirm. Nothing is written before the confirm. */
export function ImportSubjectsSheet({
  open,
  onOpenChange,
  departmentId,
  learningAreas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  learningAreas: LearningArea[];
}) {
  const importSubjects = useImportSubjects();
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [outcome, setOutcome] = useState<{ inserted: number; skipped: string[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const areaByLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of learningAreas) {
      map.set(a.code.trim().toLowerCase(), a.id);
      map.set(a.name.trim().toLowerCase(), a.id);
    }
    return map;
  }, [learningAreas]);
  const gradeByLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of gradeLevels) {
      map.set(g.code.trim().toLowerCase(), g.id);
      map.set(g.name.trim().toLowerCase(), g.id);
    }
    return map;
  }, [gradeLevels]);

  function reset() {
    setParsed(null);
    setOutcome(null);
    setFailed(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOutcome(null);
    setFailed(false);
    setParsed(readTable(await file.text(), COLUMNS));
  }

  const resolved = parsed
    ? parsed.rows.map((r, i) => resolveSubjectRow(r, i + 2, departmentId, { areaByLabel, gradeByLabel }))
    : [];
  const ready = resolved.filter((r): r is { draft: SubjectDraft; row: number } => "draft" in r);
  const unresolved = resolved.filter((r): r is { issue: string; row: number } => "issue" in r);

  async function confirm() {
    if (ready.length === 0) return;
    try {
      const result = await importSubjects.mutateAsync(ready.map((r) => r.draft));
      setOutcome(result);
      setParsed(null);
    } catch {
      setFailed(true);
    }
  }

  const preview = ready.slice(0, 5);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="นำเข้ารายวิชา"
      description="นำเข้าข้อมูลรายวิชาจากไฟล์ CSV ตามรูปแบบที่กำหนด"
      wide
      footer={
        parsed ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={reset}>
              เลือกไฟล์ใหม่
            </Button>
            <Button className="flex-1" onClick={confirm} disabled={ready.length === 0 || importSubjects.isPending}>
              {importSubjects.isPending ? <Spinner /> : `นำเข้า ${ready.length} วิชา`}
            </Button>
          </div>
        ) : outcome ? (
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            เสร็จสิ้น
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {!parsed && !outcome && (
          <>
            <section className={cn(CARD, "space-y-3 border-primary/20 bg-primary/5")}>
              <div>
                <h3 className={cn(SECTION_TITLE, "text-primary")}>
                  <InfoIcon className="h-4 w-4" />
                  คอลัมน์ในไฟล์
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  หัวคอลัมน์ต้องตรงตามนี้ เรียงลำดับได้ตามต้องการ
                </p>
              </div>
              <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {COLUMNS.map((c, i) => (
                  <li key={c.key} className="flex items-start gap-3 px-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {c.header}
                        {!c.required && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal text-muted-foreground">
                            ไม่บังคับ
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.hint}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className={cn(CARD, "space-y-2 border-success/40 bg-success/10")}>
              <h3 className={cn(SECTION_TITLE, "text-success")}>
                <CheckmarkCircleIcon className="h-4 w-4" />
                รูปแบบที่รองรับ
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground marker:text-success">
                <li>รหัสกลุ่มสาระใช้รหัสหรือชื่อกลุ่มสาระ/สาระย่อยก็ได้ (เช่น "science" หรือ "ฟิสิกส์")</li>
                {learningAreas.some((a) => !a.parent_id) && (
                  <li>
                    รหัสกลุ่มสาระที่ใช้ได้:
                    <ul data-selectable className="mt-1 list-disc space-y-0.5 pl-5 marker:text-success">
                      {learningAreas.filter((a) => !a.parent_id).map((a) => (
                        <li key={a.id}>
                          <span className="font-mono text-foreground">{a.code}</span> · {a.name}
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
                <li>ประเภทวิชา: พื้นฐาน, เพิ่มเติม, กิจกรรม</li>
                <li>ระดับชั้นที่แนะนำใช้รหัสหรือชื่อระดับชั้น เช่น "M1"</li>
              </ul>
            </section>

            <section className={cn(CARD, "space-y-2 border-primary/20")}>
              <h3 className={SECTION_TITLE}>
                <BookIcon className="h-4 w-4 text-primary" />
                ตัวอย่างไฟล์ CSV
              </h3>
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table data-selectable className="w-full min-w-[40rem] text-xs">
                  <thead className="bg-muted text-left text-muted-foreground">
                    <tr>
                      {COLUMNS.map((c) => (
                        <th key={c.key} className="px-2 py-2 font-medium">
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {EXAMPLE_ROWS.map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-2">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={cn(CARD, "space-y-2 border-warning/40 bg-warning/10")}>
              <h3 className={cn(SECTION_TITLE, "text-warning")}>
                <AlertTriangle className="h-4 w-4" />
                ข้อควรระวัง
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground marker:text-warning">
                <li>ไฟล์ต้องเป็นนามสกุล .csv เท่านั้น</li>
                <li>รหัสวิชาที่ซ้ำกับที่มีอยู่แล้วในแผนกนี้จะถูกข้าม</li>
                <li>หน่วยกิตและชั่วโมง/สัปดาห์ต้องเป็นตัวเลข</li>
                <li>เทอมที่แนะนำต้องเป็น 1 หรือ 2</li>
                <li>ระบบแสดงตัวอย่างให้ตรวจก่อนยืนยัน ยังไม่บันทึกข้อมูลทันที</li>
              </ul>
            </section>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => downloadCsv("helix-subjects-template.csv", TEMPLATE)}
              >
                <DownloadIcon className="h-3 w-3" />
                ดาวน์โหลด template
              </Button>
              <Button size="lg" className="flex-1" onClick={() => fileInput.current?.click()} disabled={!departmentId}>
                <Upload className="h-3 w-3" />
                เลือกไฟล์ CSV
              </Button>
            </div>

            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="hidden"
            />
          </>
        )}

        {parsed && (
          <>
            {parsed.issues.length > 0 && (
              <Card className="space-y-1 border-warning/40">
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  ข้ามไป {parsed.issues.length} แถว (รูปแบบไฟล์)
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {parsed.issues.slice(0, 5).map((issue, i) => (
                    <li key={i}>
                      บรรทัด {issue.row}: {issue.message}
                    </li>
                  ))}
                  {parsed.issues.length > 5 && <li>และอีก {parsed.issues.length - 5} แถว</li>}
                </ul>
              </Card>
            )}

            {unresolved.length > 0 && (
              <Card className="space-y-1 border-warning/40">
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  ข้ามไป {unresolved.length} แถว (ข้อมูลไม่ถูกต้อง)
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {unresolved.slice(0, 5).map((u, i) => (
                    <li key={i}>
                      บรรทัด {u.row}: {u.issue}
                    </li>
                  ))}
                  {unresolved.length > 5 && <li>และอีก {unresolved.length - 5} แถว</li>}
                </ul>
              </Card>
            )}

            {ready.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  จะนำเข้า {ready.length} วิชา — ตัวอย่าง {preview.length} แถวแรก
                </p>
                <div className="overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full min-w-[24rem] text-xs">
                    <thead className="bg-muted text-left text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 font-medium">รหัส</th>
                        <th className="px-2 py-2 font-medium">ชื่อวิชา</th>
                        <th className="px-2 py-2 font-medium">หน่วยกิต</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-2 font-mono">{r.draft.code}</td>
                          <td className="px-2 py-2">{r.draft.name_th}</td>
                          <td className="px-2 py-2 text-muted-foreground">{r.draft.credits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <Card className="text-sm text-destructive">ไม่มีแถวที่นำเข้าได้</Card>
            )}

            {failed && <p className="text-sm text-destructive">นำเข้าไม่สำเร็จ ลองใหม่อีกครั้ง</p>}
          </>
        )}

        {outcome && (
          <Card className="space-y-1">
            <p className="text-lg font-semibold text-success">นำเข้าสำเร็จ {outcome.inserted} วิชา</p>
            {outcome.skipped.length > 0 && (
              <p className="text-sm text-muted-foreground">
                ข้าม {outcome.skipped.length} วิชา เพราะรหัสวิชาซ้ำกับที่มีอยู่แล้วในแผนกนี้: {outcome.skipped.join(", ")}
              </p>
            )}
          </Card>
        )}
      </div>
    </Sheet>
  );
}
