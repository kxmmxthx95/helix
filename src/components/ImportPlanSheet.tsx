import { useRef, useState } from "react";
import { AlertTriangle, DownloadIcon, Upload } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Spinner } from "@/components/ui";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useImportPlan, type PlanImportEntry, type PlanImportOutcome } from "@/hooks/usePlan";
import { downloadCsv, readTable, type CsvIssue } from "@/lib/csv";

const COLUMNS = [
  { key: "subject", header: "วิชา", required: true },
  { key: "grade", header: "ระดับชั้น", required: true },
  { key: "lesson", header: "บทเรียน", required: true },
  { key: "topic", header: "หัวข้อ" },
];

const TEMPLATE = [
  COLUMNS.map((c) => c.header).join(","),
  "วิทยาศาสตร์,M1,บทที่ 1 สิ่งมีชีวิต,เซลล์ของสิ่งมีชีวิต",
  "วิทยาศาสตร์,M1,บทที่ 1 สิ่งมีชีวิต,การจัดระบบสิ่งมีชีวิต",
  "วิทยาศาสตร์,M2,บทที่ 1 แรงและการเคลื่อนที่,",
].join("\n");

type Resolved = { entry: PlanImportEntry; row: number } | { issue: string; row: number };

/**
 * One CSV row -> one import entry, or why it can't be. Pure and exported so the grade lookup
 * and the "บทเรียน only" row (empty หัวข้อ) have a test that needs no rendered sheet.
 */
export function resolvePlanRow(row: Record<string, string>, lineNo: number, gradeByLabel: Map<string, string>): Resolved {
  const gradeLevelId = gradeByLabel.get((row.grade ?? "").trim().toLowerCase());
  if (!gradeLevelId) return { row: lineNo, issue: `ไม่รู้จักระดับชั้น "${row.grade}"` };
  const subject = (row.subject ?? "").trim();
  const lesson = (row.lesson ?? "").trim();
  if (!subject || !lesson) return { row: lineNo, issue: "ต้องมีวิชาและบทเรียน" };
  if (subject.length > 200 || lesson.length > 200 || (row.topic ?? "").trim().length > 200) {
    return { row: lineNo, issue: "ชื่อยาวเกิน 200 ตัวอักษร" };
  }
  return { row: lineNo, entry: { subject, gradeLevelId, lesson, topic: (row.topic ?? "").trim() || null } };
}

/** Pick file → preview → confirm. Nothing is written before the confirm. */
export function ImportPlanSheet({
  open,
  onOpenChange,
  departmentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
}) {
  const { data: grades = [] } = useGradeLevels(departmentId);
  const importPlan = useImportPlan(departmentId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ resolved: Resolved[]; issues: CsvIssue[] } | null>(null);
  const [outcome, setOutcome] = useState<PlanImportOutcome | null>(null);
  const [failed, setFailed] = useState(false);

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
    const gradeByLabel = new Map<string, string>();
    for (const g of grades) {
      gradeByLabel.set(g.code.trim().toLowerCase(), g.id);
      gradeByLabel.set(g.name.trim().toLowerCase(), g.id);
    }
    const { rows, issues } = readTable(await file.text(), COLUMNS);
    setParsed({ resolved: rows.map((r, i) => resolvePlanRow(r, i + 2, gradeByLabel)), issues });
  }

  const ready = (parsed?.resolved ?? []).filter((r): r is { entry: PlanImportEntry; row: number } => "entry" in r);
  const unresolved = (parsed?.resolved ?? []).filter((r): r is { issue: string; row: number } => "issue" in r);
  const problems = [...(parsed?.issues.map((i) => ({ row: i.row, issue: i.message })) ?? []), ...unresolved];

  async function confirm() {
    try {
      setOutcome(await importPlan.mutateAsync(ready.map((r) => r.entry)));
      setParsed(null);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="นำเข้าเนื้อหาจาก CSV"
      description="เพิ่มวิชา บทเรียน และหัวข้อจากไฟล์ CSV"
      footer={
        parsed ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={reset}>
              เลือกไฟล์ใหม่
            </Button>
            <Button className="flex-1" onClick={confirm} disabled={ready.length === 0 || importPlan.isPending}>
              {importPlan.isPending ? <Spinner /> : `นำเข้า ${ready.length} แถว`}
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
            <Card className="space-y-2 text-xs text-muted-foreground">
              <p className="text-sm font-medium text-foreground">คอลัมน์ในไฟล์</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <b className="text-foreground">วิชา</b> ชื่อวิชา (ถ้ายังไม่มีในผังจะสร้างให้)
                </li>
                <li>
                  <b className="text-foreground">ระดับชั้น</b> รหัสหรือชื่อระดับชั้น เช่น{" "}
                  <span className="font-mono">{grades[0]?.code ?? "M1"}</span>
                  {grades.length > 0 && <> (ใช้ได้: {grades.map((g) => g.code).join(", ")})</>}
                </li>
                <li>
                  <b className="text-foreground">บทเรียน</b> ชื่อบท (ถ้ามีอยู่แล้วในวิชาและชั้นนั้นจะใช้บทเดิม)
                </li>
                <li>
                  <b className="text-foreground">หัวข้อ</b> ไม่บังคับ — เว้นว่างถ้าต้องการสร้างแค่บทเรียน
                </li>
              </ul>
              <p>หัวข้อที่ชื่อซ้ำในบทเดียวกันจะถูกข้าม และของใหม่จะต่อท้ายตามลำดับในไฟล์ ระบบแสดงตัวอย่างก่อนยืนยัน</p>
            </Card>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => downloadCsv("helix-curriculum-map-template.csv", TEMPLATE)}
              >
                <DownloadIcon className="h-3 w-3" />
                ดาวน์โหลด template
              </Button>
              <Button size="lg" className="flex-1" onClick={() => fileInput.current?.click()} disabled={grades.length === 0}>
                <Upload className="h-3 w-3" />
                เลือกไฟล์ CSV
              </Button>
            </div>
            <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </>
        )}

        {parsed && (
          <>
            {problems.length > 0 && (
              <Card className="space-y-1 border-warning/40">
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  ข้ามไป {problems.length} แถว
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {problems.slice(0, 5).map((p, i) => (
                    <li key={i}>
                      บรรทัด {p.row}: {p.issue}
                    </li>
                  ))}
                  {problems.length > 5 && <li>และอีก {problems.length - 5} แถว</li>}
                </ul>
              </Card>
            )}
            {ready.length > 0 ? (
              <div className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-card">
                <table className="w-full min-w-[24rem] text-xs">
                  <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 font-medium">วิชา</th>
                      <th className="px-2 py-2 font-medium">ชั้น</th>
                      <th className="px-2 py-2 font-medium">บทเรียน</th>
                      <th className="px-2 py-2 font-medium">หัวข้อ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ready.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-2">{r.entry.subject}</td>
                        <td className="px-2 py-2">{grades.find((g) => g.id === r.entry.gradeLevelId)?.code}</td>
                        <td className="px-2 py-2">{r.entry.lesson}</td>
                        <td className="px-2 py-2 text-muted-foreground">{r.entry.topic ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Card className="text-sm text-destructive">ไม่มีแถวที่นำเข้าได้</Card>
            )}
            {failed && <p className="text-sm text-destructive">นำเข้าไม่สำเร็จ ลองใหม่อีกครั้ง</p>}
          </>
        )}

        {outcome && (
          <Card className="space-y-1">
            <p className="text-lg font-semibold text-success">นำเข้าสำเร็จ</p>
            <p className="text-sm text-muted-foreground">
              เพิ่มวิชา {outcome.subjects} · บทเรียน {outcome.lessons} · หัวข้อ {outcome.topics}
            </p>
          </Card>
        )}
      </div>
    </Sheet>
  );
}
