import { AlertTriangle, DownloadIcon, FileUp } from "@/components/icons";
import { useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Spinner } from "@/components/ui";
import { useImportSubjects, type SubjectDraft } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { downloadCsv, readTable, type CsvIssue } from "@/lib/csv";
import type { LearningArea, SubjectType } from "@/lib/database.types";

const SUBJECT_TYPE_BY_LABEL = new Map<string, SubjectType>([
  ["พื้นฐาน", "basic"],
  ["เพิ่มเติม", "additional"],
  ["กิจกรรม", "activity"],
]);

const COLUMNS = [
  { key: "code", header: "รหัสวิชา", required: true },
  { key: "name_th", header: "ชื่อวิชา (ไทย)", required: true },
  { key: "name_en", header: "ชื่อวิชา (อังกฤษ)" },
  { key: "learning_area_code", header: "รหัสกลุ่มสาระ", required: true },
  { key: "subject_type", header: "ประเภทวิชา", required: true },
  { key: "credits", header: "หน่วยกิต", required: true },
  { key: "hours_per_week", header: "ชั่วโมง/สัปดาห์", required: true },
  { key: "suggested_grade_level_code", header: "ระดับชั้นที่แนะนำ (รหัส)" },
  { key: "suggested_term", header: "เทอมที่แนะนำ" },
];

const TEMPLATE_HEADER = COLUMNS.map((c) => c.header).join(",");
const TEMPLATE_EXAMPLE = ["sci101", "วิทยาศาสตร์พื้นฐาน 1", "Basic Science 1", "science", "พื้นฐาน", "1.5", "3", "M1", "1"].join(
  ",",
);
const TEMPLATE = `${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}`;

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
            <Card className="space-y-2">
              <p className="text-sm font-medium">คอลัมน์ที่ต้องมี</p>
              <p data-selectable className="font-mono text-xs text-muted-foreground">
                {TEMPLATE_HEADER}
              </p>
              <p className="text-xs text-muted-foreground">
                คอลัมน์ที่จำเป็น: รหัสวิชา, ชื่อวิชา (ไทย), รหัสกลุ่มสาระ, ประเภทวิชา, หน่วยกิต, ชั่วโมง/สัปดาห์ —
                รหัสกลุ่มสาระใช้รหัสหรือชื่อกลุ่มสาระ/สาระย่อยก็ได้ (เช่น "science" หรือ "ฟิสิกส์") — ประเภทวิชา:
                พื้นฐาน, เพิ่มเติม, กิจกรรม — ระดับชั้นที่แนะนำใช้รหัสระดับชั้น เช่น "M1" (ไม่บังคับ)
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv("helix-subjects-template.csv", TEMPLATE)}
              >
                <DownloadIcon className="h-3 w-3" />
                ดาวน์โหลด template
              </Button>
            </Card>

            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="hidden"
            />
            <Button size="lg" className="w-full" onClick={() => fileInput.current?.click()} disabled={!departmentId}>
              <FileUp className="h-3 w-3" />
              เลือกไฟล์ CSV
            </Button>
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
                <div className="overflow-x-auto rounded-lg border border-border">
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
