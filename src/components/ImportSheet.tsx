import { AlertTriangle, FileUp } from "@/components/icons";
import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Select, Spinner } from "@/components/ui";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { useImportStudents, type ImportOutcome, type StudentDraft } from "@/hooks/useStudents";
import { readTable, type CsvIssue } from "@/lib/csv";
import { isOrgWide } from "@/lib/roles";

const COLUMNS = [
  { key: "student_code", header: "รหัสนักเรียน", required: true },
  { key: "first_name", header: "ชื่อ", required: true },
  { key: "last_name", header: "นามสกุล", required: true },
  { key: "class_level", header: "ชั้น" },
  { key: "national_id", header: "เลขบัตรประชาชน" },
];

const TEMPLATE = COLUMNS.map((c) => c.header).join(",");

type Parsed = { rows: Record<string, string>[]; issues: CsvIssue[] };

/** Pick file → preview → confirm. Nothing is written before the confirm. */
export function ImportSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const importStudents = useImportStudents();
  const fileInput = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [departmentId, setDepartmentId] = useState(me?.department_id ?? "");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [failed, setFailed] = useState(false);

  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  // Match the CSV's free-text "ชั้น" cell against this department's grade levels
  // by code or name — case/whitespace-insensitive, since schools' own CSVs vary.
  const gradeLevelByLabel = useMemo(() => {
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

  async function confirm() {
    if (!parsed || !departmentId) return;
    const drafts: StudentDraft[] = parsed.rows.map((r) => ({
      student_code: r.student_code!,
      prefix: null,
      first_name: r.first_name!,
      last_name: r.last_name!,
      department_id: departmentId,
      grade_level_id: r.class_level ? gradeLevelByLabel.get(r.class_level.trim().toLowerCase()) ?? null : null,
      status: "studying",
      national_id: r.national_id || null,
      phone: null,
      email: null,
      address: null,
      family_status: null,
      blood_type: null,
      chronic_disease: null,
      drug_allergy: null,
      food_allergy: null,
    }));

    try {
      setOutcome(await importStudents.mutateAsync(drafts));
      setParsed(null);
    } catch {
      setFailed(true);
    }
  }

  const preview = parsed?.rows.slice(0, 5) ?? [];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="นำเข้ารายชื่อนักเรียน"
      description="ไฟล์ CSV — ตรวจสอบตัวอย่างก่อนยืนยัน"
      footer={
        parsed ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={reset}>
              เลือกไฟล์ใหม่
            </Button>
            <Button
              className="flex-1"
              onClick={confirm}
              disabled={parsed.rows.length === 0 || !departmentId || importStudents.isPending}
            >
              {importStudents.isPending ? <Spinner /> : `ยืนยันนำเข้า ${parsed.rows.length} คน`}
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
                {TEMPLATE}
              </p>
              <p className="text-xs text-muted-foreground">
                คอลัมน์ที่จำเป็น: รหัสนักเรียน, ชื่อ, นามสกุล
              </p>
            </Card>

            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="hidden"
            />
            <Button size="lg" className="w-full" onClick={() => fileInput.current?.click()}>
              <FileUp className="h-3 w-3" />
              เลือกไฟล์ CSV
            </Button>
          </>
        )}

        {parsed && (
          <>
            {me && isOrgWide(me.roles) && (
              <Field label="นำเข้าไปยังแผนก">
                <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">เลือกแผนก</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {parsed.issues.length > 0 && (
              <Card className="space-y-1 border-warning/40">
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  ข้ามไป {parsed.issues.length} แถว
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

            {parsed.rows.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  จะนำเข้า {parsed.rows.length} คน — ตัวอย่าง {preview.length} แถวแรก
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[24rem] text-xs">
                    <thead className="bg-muted text-left text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 font-medium">รหัส</th>
                        <th className="px-2 py-2 font-medium">ชื่อ-นามสกุล</th>
                        <th className="px-2 py-2 font-medium">ชั้น</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-2 font-mono">{r.student_code}</td>
                          <td className="px-2 py-2">
                            {r.first_name} {r.last_name}
                          </td>
                          <td className="px-2 py-2 text-muted-foreground">{r.class_level || "—"}</td>
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
            <p className="text-lg font-semibold text-success">นำเข้าสำเร็จ {outcome.inserted} คน</p>
            {outcome.skipped.length > 0 && (
              <p className="text-sm text-muted-foreground">
                ข้าม {outcome.skipped.length} คน เพราะรหัสนักเรียนซ้ำกับที่มีอยู่แล้ว
              </p>
            )}
          </Card>
        )}
      </div>
    </Sheet>
  );
}
