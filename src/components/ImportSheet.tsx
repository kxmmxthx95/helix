import { AlertTriangle, FileUp } from "@/components/icons";
import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Select, Spinner } from "@/components/ui";
import { useAllGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { useImportStudents, type ImportOutcome, type StudentDraft } from "@/hooks/useStudents";
import { readTable, type CsvIssue } from "@/lib/csv";
import { isOrgWide, STUDENT_PREFIXES } from "@/lib/roles";

const COLUMNS = [
  { key: "student_code", header: "รหัสนักเรียน", required: true },
  { key: "prefix", header: "คำนำหน้า" },
  { key: "first_name", header: "ชื่อ", required: true },
  { key: "last_name", header: "นามสกุล", required: true },
  { key: "class_level", header: "ระดับชั้น" },
  { key: "department_code", header: "รหัสแผนก" },
  { key: "national_id", header: "เลขบัตรประชาชน" },
];

const TEMPLATE = COLUMNS.map((c) => c.header).join(",");

type Parsed = { rows: Record<string, string>[]; issues: CsvIssue[] };
type Resolved = { draft: StudentDraft; row: number } | { issue: string; row: number };

/**
 * Turns one parsed CSV row into a StudentDraft, or the reason it can't
 * become one. Pure and exported so the department-code lookup — the only
 * security-relevant part, since it decides which department a row lands in
 * — has a test that doesn't need a rendered sheet.
 */
export function resolveStudentRow(
  row: Record<string, string>,
  lineNo: number,
  opts: {
    deptByCode: Map<string, string>;
    gradeLevelByLabel: Map<string, string>;
    fallbackDepartmentId: string;
    // Non-org-wide users can only ever import into their own department —
    // a "รหัสแผนก" column in their CSV must never let them target another.
    allowDepartmentOverride: boolean;
  },
): Resolved {
  let departmentId = opts.fallbackDepartmentId;
  if (opts.allowDepartmentOverride && row.department_code) {
    const found = opts.deptByCode.get(row.department_code);
    if (!found) return { row: lineNo, issue: `ไม่รู้จักรหัสแผนก "${row.department_code}"` };
    departmentId = found;
  }
  if (!departmentId) return { row: lineNo, issue: "ไม่พบแผนก" };

  const gradeLevelId = row.class_level
    ? opts.gradeLevelByLabel.get(`${departmentId}::${row.class_level.trim().toLowerCase()}`) ?? null
    : null;

  return {
    row: lineNo,
    draft: {
      student_code: row.student_code!,
      prefix: row.prefix || null,
      first_name: row.first_name!,
      last_name: row.last_name!,
      department_id: departmentId,
      grade_level_id: gradeLevelId,
      status: "studying",
      national_id: row.national_id || null,
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
    },
  };
}

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

  const { data: allGradeLevels = [] } = useAllGradeLevels();
  const deptByCode = useMemo(() => new Map(departments.map((d) => [d.code, d.id])), [departments]);
  // Match the CSV's free-text "ระดับชั้น" cell against grade levels by code or
  // name — case/whitespace-insensitive, since schools' own CSVs vary. Scoped
  // per department since rows can now land in different departments.
  const gradeLevelByLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of allGradeLevels) {
      map.set(`${g.department_id}::${g.code.trim().toLowerCase()}`, g.id);
      map.set(`${g.department_id}::${g.name.trim().toLowerCase()}`, g.id);
    }
    return map;
  }, [allGradeLevels]);

  const orgWide = !!me && isOrgWide(me.roles);
  const departmentById = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const resolved = parsed
    ? parsed.rows.map((r, i) =>
        resolveStudentRow(r, i + 2, {
          deptByCode,
          gradeLevelByLabel,
          fallbackDepartmentId: departmentId,
          allowDepartmentOverride: orgWide,
        }),
      )
    : [];
  const ready = resolved.filter((r): r is { draft: StudentDraft; row: number } => "draft" in r);
  const unresolved = resolved.filter((r): r is { issue: string; row: number } => "issue" in r);

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
    if (ready.length === 0) return;
    try {
      setOutcome(await importStudents.mutateAsync(ready.map((r) => r.draft)));
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
              disabled={ready.length === 0 || importStudents.isPending}
            >
              {importStudents.isPending ? <Spinner /> : `ยืนยันนำเข้า ${ready.length} คน`}
            </Button>
          </div>
        ) : outcome ? (
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            เสร็จสิ้น
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={() => fileInput.current?.click()}>
            <FileUp className="h-3 w-3" />
            เลือกไฟล์ CSV
          </Button>
        )
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
                คอลัมน์ที่จำเป็น: รหัสนักเรียน, ชื่อ, นามสกุล — คำนำหน้าที่รู้จัก: {STUDENT_PREFIXES.join(", ")}
                {orgWide && " — รหัสแผนกใช้รหัสของแผนก เช่น PRI, SEC (ถ้าไม่ระบุจะใช้แผนกเริ่มต้นที่เลือกไว้)"}
              </p>
            </Card>

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
            {orgWide && (
              <Field label="แผนกเริ่มต้น (แถวที่ไม่มีคอลัมน์รหัสแผนก)">
                <Select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  placeholder="เลือกแผนก"
                >
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
                  ข้ามไป {unresolved.length} แถว (แผนกไม่ถูกต้อง)
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
                  จะนำเข้า {ready.length} คน — ตัวอย่าง {preview.length} แถวแรก
                </p>
                <div className="overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full min-w-[28rem] text-xs">
                    <thead className="bg-muted text-left text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 font-medium">รหัส</th>
                        <th className="px-2 py-2 font-medium">ชื่อ-นามสกุล</th>
                        <th className="px-2 py-2 font-medium">ชั้น</th>
                        <th className="px-2 py-2 font-medium">แผนก</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-2 font-mono">{r.draft.student_code}</td>
                          <td className="px-2 py-2">
                            {r.draft.prefix}
                            {r.draft.first_name} {r.draft.last_name}
                          </td>
                          <td className="px-2 py-2 text-muted-foreground">
                            {parsed.rows[r.row - 2]?.class_level || "—"}
                          </td>
                          <td className="px-2 py-2 text-muted-foreground">
                            {departmentById.get(r.draft.department_id) ?? "—"}
                          </td>
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
