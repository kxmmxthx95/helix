import { AlertTriangle, DownloadIcon, FileUp } from "@/components/icons";
import { useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Spinner } from "@/components/ui";
import { useDepartments, usePositionTitles, useInviteUsers, type UserInvite } from "@/hooks/useProfiles";
import { downloadCsv, readTable, type CsvIssue } from "@/lib/csv";
import { PREFIXES, ROLE_LABEL, ROLES, type Role } from "@/lib/roles";

/** Multiple roles/ตำแหน่ง in one cell are "/"-separated — commas are already the CSV delimiter. */
const MULTI_SEP = "/";

// Staff/teacher/etc. only — student logins are created from the Roster page,
// where student_code and department are already on file.
const COLUMNS = [
  { key: "phone", header: "เบอร์โทร (รหัสผู้ใช้)", required: true },
  { key: "password", header: "รหัสผ่าน", required: true },
  { key: "prefix", header: "คำนำหน้า" },
  { key: "first_name", header: "ชื่อ", required: true },
  { key: "last_name", header: "นามสกุล", required: true },
  { key: "national_id", header: "เลขบัตรประชาชน", required: true },
  { key: "date_of_birth", header: "วันเดือนปีเกิด (YYYY-MM-DD)", required: true },
  { key: "email", header: "อีเมล (ข้อมูลติดต่อ)" },
  { key: "department_code", header: "รหัสแผนก" },
  { key: "roles", header: "สิทธิ์", required: true },
  { key: "position_titles", header: "ตำแหน่ง" },
];

const TEMPLATE_HEADER = COLUMNS.map((c) => c.header).join(",");
const TEMPLATE_EXAMPLE = [
  "0812345678",
  "changeme123",
  "นาย",
  "สมชาย",
  "ใจดี",
  "1234567890123",
  "1990-01-15",
  "somchai@school.ac.th",
  "PRI",
  `ครูผู้สอน${MULTI_SEP}ผู้บริหารแผนก`,
  "หัวหน้าฝ่ายวิชาการ",
].join(",");
const TEMPLATE = `${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}`;

const ROLE_BY_LABEL = new Map<string, Role>(ROLES.map((r) => [ROLE_LABEL[r], r]));

type Parsed = { rows: Record<string, string>[]; issues: CsvIssue[] };
type Resolved = { invite: UserInvite; row: number } | { issue: string; row: number };

/**
 * Turns one parsed CSV row into a UserInvite, or the reason it can't become
 * one. Pure and exported so the label→role/title/department lookups (a
 * security-relevant path — get it wrong and someone's granted the wrong
 * role) have a test that doesn't need a rendered sheet.
 */
export function resolveUserRow(
  row: Record<string, string>,
  lineNo: number,
  lookups: { deptByCode: Map<string, string>; titleByName: Map<string, string> },
): Resolved {
  const roleNames = (row.roles ?? "").split(MULTI_SEP).map((s) => s.trim()).filter(Boolean);
  const roles = roleNames.map((name) => ROLE_BY_LABEL.get(name));
  const badRole = roleNames[roles.findIndex((r) => !r)];
  if (badRole) return { row: lineNo, issue: `ไม่รู้จักสิทธิ์ "${badRole}"` };

  const titleNames = (row.position_titles ?? "").split(MULTI_SEP).map((s) => s.trim()).filter(Boolean);
  const titleIds = titleNames.map((name) => lookups.titleByName.get(name));
  const badTitle = titleNames[titleIds.findIndex((t) => !t)];
  if (badTitle) return { row: lineNo, issue: `ไม่รู้จักตำแหน่ง "${badTitle}"` };

  let departmentId: string | null = null;
  if (row.department_code) {
    const found = lookups.deptByCode.get(row.department_code);
    if (!found) return { row: lineNo, issue: `ไม่รู้จักรหัสแผนก "${row.department_code}"` };
    departmentId = found;
  }

  return {
    row: lineNo,
    invite: {
      kind: "staff",
      loginId: row.phone!,
      password: row.password!,
      mustChangePassword: false, // CSV always supplies a real password column
      prefix: row.prefix || null,
      first_name: row.first_name!,
      last_name: row.last_name!,
      email: row.email || null,
      national_id: row.national_id!,
      date_of_birth: row.date_of_birth!,
      department_id: departmentId,
      roles: (roles as Role[]).filter((r) => r !== "dept_head"),
      positionTitleIds: titleIds as string[],
      // Not collected via CSV — teacher rows need these added afterward via
      // the edit sheet (the DB rejects role=teacher without learning_area_id).
      teacher_code: null,
      learning_area_id: null,
    },
  };
}

/** Pick file → preview → confirm. Nothing is written before the confirm. */
export function ImportUsersSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: departments = [] } = useDepartments();
  const { data: positionTitles = [] } = usePositionTitles();
  const invite = useInviteUsers();
  const fileInput = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [outcome, setOutcome] = useState<{ inserted: number; skipped: string[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const deptByCode = new Map(departments.map((d) => [d.code, d.id]));
  const titleByName = new Map(positionTitles.map((t) => [t.name, t.id]));

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
    ? parsed.rows.map((r, i) => resolveUserRow(r, i + 2, { deptByCode, titleByName }))
    : [];
  const ready = resolved.filter((r): r is { invite: UserInvite; row: number } => "invite" in r);
  const unresolved = resolved.filter((r): r is { issue: string; row: number } => "issue" in r);

  async function confirm() {
    if (ready.length === 0) return;
    try {
      const result = await invite.mutateAsync(ready.map((r) => r.invite));
      setOutcome({
        inserted: result.inserted,
        skipped: result.skipped.map((s) => `${s.loginId}: ${s.reason}`),
      });
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
      title="นำเข้ารายชื่อผู้ใช้งาน"
      description="ไฟล์ CSV — export จาก Google Sheet ได้เลย (File → Download → CSV)"
      footer={
        parsed ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={reset}>
              เลือกไฟล์ใหม่
            </Button>
            <Button className="flex-1" onClick={confirm} disabled={ready.length === 0 || invite.isPending}>
              {invite.isPending ? <Spinner /> : `สร้างบัญชี ${ready.length} คน`}
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
                คอลัมน์ที่จำเป็น: เบอร์โทร, รหัสผ่าน, ชื่อ, นามสกุล, เลขบัตรประชาชน, วันเดือนปีเกิด, สิทธิ์ —
                สิทธิ์/ตำแหน่งหลายค่าใช้ "{MULTI_SEP}" คั่น เช่น "ครูผู้สอน{MULTI_SEP}ผู้บริหารแผนก" —
                คำนำหน้าที่รู้จัก: {PREFIXES.join(", ")} — เบอร์โทรเป็นรหัสผู้ใช้เข้าระบบของแต่ละคน
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv("helix-users-template.csv", TEMPLATE)}
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
            <Button size="lg" className="w-full" onClick={() => fileInput.current?.click()}>
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
                  ข้ามไป {unresolved.length} แถว (สิทธิ์/ตำแหน่ง/แผนกไม่ถูกต้อง)
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
                  จะสร้างบัญชี {ready.length} คน — ตัวอย่าง {preview.length} แถวแรก
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[28rem] text-xs">
                    <thead className="bg-muted text-left text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 font-medium">เบอร์โทร</th>
                        <th className="px-2 py-2 font-medium">ชื่อ-นามสกุล</th>
                        <th className="px-2 py-2 font-medium">สิทธิ์</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-2 font-mono">{r.phone}</td>
                          <td className="px-2 py-2">
                            {r.first_name} {r.last_name}
                          </td>
                          <td className="px-2 py-2 text-muted-foreground">{r.roles}</td>
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
            <p className="text-lg font-semibold text-success">สร้างบัญชีสำเร็จ {outcome.inserted} คน</p>
            {outcome.skipped.length > 0 && (
              <div className="space-y-0.5 text-sm text-muted-foreground">
                <p>ข้าม {outcome.skipped.length} คน:</p>
                <ul className="space-y-0.5 text-xs">
                  {outcome.skipped.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
      </div>
    </Sheet>
  );
}
