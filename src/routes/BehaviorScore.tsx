import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { BarChartIcon, Plus, SettingsIcon, SlidersHorizontal } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
import { useClassroomRoster } from "@/hooks/useAttendance";
import {
  STARTING_SCORE,
  summarizeBehaviorScore,
  useBehaviorCategories,
  useBehaviorRecords,
  useCreateBehaviorCategory,
  useDeleteBehaviorCategory,
  useDeleteBehaviorRecord,
  useSaveBehaviorRecord,
  type BehaviorRecordDraft,
} from "@/hooks/useBehaviorRecords";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { useClassrooms } from "@/hooks/useStatusManagement";
import type { BehaviorCategory, BehaviorRecord, BehaviorSeverity, Student } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

const todayIso = () => new Date().toISOString().slice(0, 10);
const currentAcademicYear = () => new Date().getFullYear() + 543;

export function BehaviorScore() {
  const { profile: me } = useAuth();
  const manager = me ? canManage(me.roles) : false;
  const orgWide = me ? isOrgWide(me.roles) : false;
  const isTeacher = me ? (me.roles.includes("teacher") as boolean) : false;
  const academicYear = currentAcademicYear();
  const years = Array.from({ length: 4 }, (_, i) => academicYear - i);
  const [year, setYear] = useState(academicYear);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Every teacher (not just homeroom) and every manager get the same
  // department → grade level → classroom cascade — any teacher may log a
  // student's behavior outside their own room (grill decision: "ครูทุกคน
  // สามารถหักคะแนนได้"), so there's no separate homeroom-only picker anymore.
  const [pickedDept, setPickedDept] = useState(!orgWide && me?.department_id ? me.department_id : "");
  const [pickedGrade, setPickedGrade] = useState("");
  const [pickedRoomId, setPickedRoomId] = useState("");
  const [mode, setMode] = useState<"roster" | "report" | "settings">("roster");
  const { data: departments = [] } = useDepartments();
  const { data: gradeLevels = [] } = useGradeLevels(pickedDept || null);
  const { data: deptClassrooms = [] } = useClassrooms(pickedGrade || null);

  useEffect(() => setPickedGrade(""), [pickedDept]);
  useEffect(() => setPickedRoomId(""), [pickedGrade]);

  const allowed = !!me && (manager || isTeacher);
  const activeDeptRooms = deptClassrooms.filter((c) => c.is_active);
  const showScopeFilters = mode !== "settings";

  const activeFilterCount = [pickedDept, pickedGrade, pickedRoomId].filter(Boolean).length +
    (year !== academicYear ? 1 : 0);

  if (!allowed) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  const classroomId = pickedRoomId;
  const ceYear = year - 543;
  const startDate = `${ceYear}-01-01`;
  const endDate = `${ceYear}-12-31`;

  const scopeFields = (
    <>
      <Field label="แผนก">
        <Select
          value={pickedDept}
          onChange={(e) => setPickedDept(e.target.value)}
          aria-label="แผนก"
          placeholder="เลือกแผนก"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ชั้น">
        <Select
          value={pickedGrade}
          onChange={(e) => setPickedGrade(e.target.value)}
          aria-label="ชั้น"
          placeholder="เลือกชั้น"
          disabled={!pickedDept}
        >
          {gradeLevels.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ห้อง">
        <Select
          value={pickedRoomId}
          onChange={(e) => setPickedRoomId(e.target.value)}
          aria-label="ห้อง"
          placeholder="เลือกห้อง"
          disabled={!pickedGrade}
        >
          {activeDeptRooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ปีการศึกษา">
        <Select
          value={String(year)}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label="ปีการศึกษา"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center gap-2">
        {showScopeFilters && (
          <div className="hidden flex-1 grid-cols-4 gap-2 lg:grid">
            <Select
              className="min-w-0"
              value={pickedDept}
              onChange={(e) => setPickedDept(e.target.value)}
              aria-label="แผนก"
              placeholder="เลือกแผนก"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select
              className="min-w-0"
              value={pickedGrade}
              onChange={(e) => setPickedGrade(e.target.value)}
              aria-label="ชั้น"
              placeholder="เลือกชั้น"
              disabled={!pickedDept}
            >
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <Select
              className="min-w-0"
              value={pickedRoomId}
              onChange={(e) => setPickedRoomId(e.target.value)}
              aria-label="ห้อง"
              placeholder="เลือกห้อง"
              disabled={!pickedGrade}
            >
              {activeDeptRooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              className="min-w-0"
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="ปีการศึกษา"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        )}
        {mode === "settings" && <p className="flex-1 text-sm font-semibold">ตั้งค่าพฤติกรรม</p>}
        <div className="flex-1 lg:hidden" />
        {showScopeFilters && (
          <Button
            variant="outline"
            size="icon"
            className="relative shrink-0 lg:hidden"
            onClick={() => setFiltersOpen(true)}
            aria-label="ตัวกรอง"
          >
            <SlidersHorizontal className="h-3 w-3" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        )}
        <Button
          variant={mode === "report" ? "default" : "outline"}
          size="icon"
          className="shrink-0"
          onClick={() => setMode((m) => (m === "report" ? "roster" : "report"))}
          aria-label="รายงานพฤติกรรม"
          title="รายงานพฤติกรรม"
        >
          <BarChartIcon className="h-3 w-3" />
        </Button>
        {orgWide && (
          <Button
            variant={mode === "settings" ? "default" : "outline"}
            size="icon"
            className="shrink-0"
            onClick={() => setMode((m) => (m === "settings" ? "roster" : "settings"))}
            aria-label="ตั้งค่าพฤติกรรม"
            title="ตั้งค่าพฤติกรรม"
          >
            <SettingsIcon className="h-3 w-3" />
          </Button>
        )}
      </div>

      <Sheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="ตัวกรอง"
        footer={
          <Button className="w-full" onClick={() => setFiltersOpen(false)}>
            ดูผลลัพธ์
          </Button>
        }
      >
        <div className="space-y-4">{scopeFields}</div>
      </Sheet>

      {mode === "settings" ? (
        <CategorySettingsPanel />
      ) : !classroomId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกห้องเรียน" description="เลือกห้องจากตัวกรองเพื่อดูคะแนนพฤติกรรม" />
        </div>
      ) : mode === "report" ? (
        <ReportPanel
          key={`${classroomId}-${year}`}
          classroomId={classroomId}
          academicYear={year}
          startDate={startDate}
          endDate={endDate}
        />
      ) : (
        <RosterPanel
          key={`${classroomId}-${year}`}
          classroomId={classroomId}
          academicYear={year}
          startDate={startDate}
          endDate={endDate}
          recorderId={me.id}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- roster

function RosterPanel({
  classroomId,
  academicYear,
  startDate,
  endDate,
  recorderId,
}: {
  classroomId: string;
  academicYear: number;
  startDate: string;
  endDate: string;
  recorderId: string;
}) {
  const { data: roster = [], isLoading: rosterLoading } = useClassroomRoster(classroomId, academicYear);
  const { data: records = [], isLoading: recordsLoading } = useBehaviorRecords({ classroomId, startDate, endDate });
  const [openStudent, setOpenStudent] = useState<Student | null>(null);

  const byStudent = useMemo(() => {
    const map = new Map<string, BehaviorRecord[]>();
    for (const r of records) {
      const arr = map.get(r.student_id) ?? [];
      arr.push(r);
      map.set(r.student_id, arr);
    }
    return map;
  }, [records]);

  if (rosterLoading || recordsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  if (roster.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนกำลังศึกษาในห้องนี้" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto lg:hidden">
        {roster.map((s) => {
          const studentRecords = byStudent.get(s.id) ?? [];
          const score = summarizeBehaviorScore(studentRecords);
          const name = `${s.first_name} ${s.last_name}`;
          return (
            <li key={s.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.student_code}</p>
                </div>
                <p
                  className={cn(
                    "shrink-0 text-base font-semibold tabular-nums",
                    score < STARTING_SCORE ? "text-destructive" : "text-success",
                  )}
                >
                  {score}
                </p>
              </div>
              <div className="mt-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setOpenStudent(s)}>
                  รายการ
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="table-panel hidden lg:flex">
        <div className="table-panel-scroll">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                <th className="px-3 py-2 font-medium">รายชื่อ</th>
                <th className="px-3 py-2 text-right font-medium">คะแนนพฤติกรรม</th>
                <th className="w-24 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const studentRecords = byStudent.get(s.id) ?? [];
                const score = summarizeBehaviorScore(studentRecords);
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2">{s.student_code}</td>
                    <td className="px-3 py-2 font-medium">
                      {s.first_name} {s.last_name}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-semibold",
                        score < STARTING_SCORE ? "text-destructive" : "text-success",
                      )}
                    >
                      {score}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => setOpenStudent(s)}>
                        รายการ
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <BehaviorDrawer
        student={openStudent}
        records={openStudent ? (byStudent.get(openStudent.id) ?? []) : []}
        classroomId={classroomId}
        recorderId={recorderId}
        onClose={() => setOpenStudent(null)}
      />
    </div>
  );
}

// ------------------------------------------------------------------- report
// Full chronological log for the room+year — the roster table only shows
// the running total, this is the audit trail behind it.

function ReportPanel({
  classroomId,
  academicYear,
  startDate,
  endDate,
}: {
  classroomId: string;
  academicYear: number;
  startDate: string;
  endDate: string;
}) {
  const { data: roster = [], isLoading: rosterLoading } = useClassroomRoster(classroomId, academicYear);
  const { data: records = [], isLoading: recordsLoading } = useBehaviorRecords({ classroomId, startDate, endDate });

  const studentById = useMemo(() => new Map(roster.map((s) => [s.id, s])), [roster]);
  const sorted = useMemo(() => records.slice().sort((a, b) => b.date.localeCompare(a.date)), [records]);
  const positiveCount = records.filter((r) => r.points > 0).length;
  const negativeCount = records.filter((r) => r.points < 0).length;

  if (rosterLoading || recordsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีรายการคะแนนพฤติกรรมในห้องนี้" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-xs text-muted-foreground">
        ทั้งหมด {sorted.length} รายการ · <span className="text-success">บวก {positiveCount}</span> ·{" "}
        <span className="text-destructive">ลบ {negativeCount}</span>
      </p>
      <div className="table-panel flex-1">
        <div className="table-panel-scroll">
          <table className="w-full min-w-[36rem] text-xs">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-24 px-3 py-2 font-medium">วันที่</th>
                <th className="w-24 px-3 py-2 font-medium">รหัสนักเรียน</th>
                <th className="px-3 py-2 font-medium">รายชื่อ</th>
                <th className="w-16 px-3 py-2 text-right font-medium">คะแนน</th>
                <th className="px-3 py-2 font-medium">เหตุผล</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const s = studentById.get(r.student_id);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground">{r.date}</td>
                    <td className="px-3 py-2">{s?.student_code ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{s ? `${s.first_name} ${s.last_name}` : "—"}</td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-semibold",
                        r.points < 0 ? "text-destructive" : "text-success",
                      )}
                    >
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </td>
                    <td className="px-3 py-2">{r.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- drawer

function BehaviorDrawer({
  student,
  records,
  classroomId,
  recorderId,
  onClose,
}: {
  student: Student | null;
  records: BehaviorRecord[];
  classroomId: string;
  recorderId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSaveBehaviorRecord();
  const del = useDeleteBehaviorRecord();
  const { data: categories = [] } = useBehaviorCategories();
  const [date, setDate] = useState(todayIso());
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");

  function pickCategory(id: string) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    setPoints(String(cat.points));
    setReason(cat.label);
  }

  function reset() {
    setDate(todayIso());
    setPoints("");
    setReason("");
  }

  function submit() {
    if (!student) return;
    const n = Number(points);
    if (!n || !reason.trim()) return;
    const draft: BehaviorRecordDraft = {
      student_id: student.id,
      classroom_id: classroomId,
      date,
      points: n,
      reason: reason.trim(),
      recorded_by: recorderId,
    };
    save.mutate(draft, {
      onSuccess: () => {
        toast("บันทึกคะแนนพฤติกรรมสำเร็จ");
        reset();
      },
      onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
    });
  }

  function remove(id: string) {
    del.mutate(id, {
      onSuccess: () => toast("ลบรายการสำเร็จ"),
      onError: (err) => toast(err instanceof Error ? err.message : "ลบไม่สำเร็จ", "error"),
    });
  }

  return (
    <Sheet
      open={student !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
      title="คะแนนพฤติกรรม"
      description={student ? `${student.first_name} ${student.last_name} · เริ่มต้น ${STARTING_SCORE} คะแนน` : undefined}
    >
      {student && (
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border p-3">
            {categories.length > 0 && (
              <Select value="" onChange={(e) => pickCategory(e.target.value)} aria-label="เลือกจากหมวดหมู่">
                <option value="">— เลือกจากหมวดหมู่ (ถ้ามี) —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.points > 0 ? `+${c.points}` : c.points})
                  </option>
                ))}
              </Select>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="วันที่">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="คะแนน (+เพิ่ม / -หัก)">
                <Input
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="เช่น -5 หรือ 5"
                />
              </Field>
            </div>
            <Field label="เหตุผล">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ระบุเหตุผล" />
            </Field>
            <Button
              size="sm"
              className="w-full"
              onClick={submit}
              disabled={!points || !reason.trim() || save.isPending}
            >
              {save.isPending ? <Spinner className="h-3 w-3" /> : "เพิ่มรายการ"}
            </Button>
          </div>

          <div className="space-y-1">
            {records.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">ยังไม่มีรายการ</p>
            ) : (
              records
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
                    <span className="w-20 shrink-0 text-muted-foreground">{r.date}</span>
                    <span className={cn("w-10 shrink-0 font-semibold", r.points < 0 ? "text-destructive" : "text-success")}>
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </span>
                    <span className="flex-1 truncate">{r.reason}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => remove(r.id)}
                    >
                      ลบ
                    </Button>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------ category settings
// Gear toggles the whole lower page into this — one table, a tab switches
// which sign it lists (amount typed is always a positive magnitude; the
// active tab decides + or - on create).

const SIGN_TAB: { key: "negative" | "positive"; label: string }[] = [
  { key: "negative", label: "พฤติกรรมเชิงลบ" },
  { key: "positive", label: "พฤติกรรมเชิงบวก" },
];

export const SEVERITY_LABEL: Record<BehaviorSeverity, string> = {
  minor: "เบา",
  moderate: "ปานกลาง",
  severe: "รุนแรง",
};
const SEVERITY_STYLE: Record<BehaviorSeverity, string> = {
  minor: "bg-muted text-muted-foreground",
  moderate: "bg-warning/15 text-warning",
  severe: "bg-destructive/15 text-destructive",
};

function CategorySettingsPanel() {
  const toast = useToast();
  const [sign, setSign] = useState<"negative" | "positive">("negative");
  const { data: categories = [] } = useBehaviorCategories();
  const create = useCreateBehaviorCategory();
  const del = useDeleteBehaviorCategory();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [severity, setSeverity] = useState<BehaviorSeverity>("minor");

  const filtered = categories.filter((c) => (sign === "negative" ? c.points < 0 : c.points > 0));
  const tone = sign === "negative" ? "text-destructive" : "text-success";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.abs(Number(amount));
    if (!label.trim() || !n) return;
    create.mutate(
      { label: label.trim(), points: sign === "negative" ? -n : n, severity: sign === "negative" ? severity : null },
      {
        onSuccess: () => {
          setLabel("");
          setAmount("");
          setSeverity("minor");
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex w-full shrink-0 gap-0 border-b border-border" role="tablist">
        {SIGN_TAB.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={sign === t.key}
            onClick={() => setSign(t.key)}
            className={cn(
              "inline-flex h-8 flex-1 items-center justify-center border-b-2 px-3 text-xs font-medium transition-colors -mb-px",
              sign === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex shrink-0 gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="ชื่อพฤติกรรม"
          className="min-w-0 flex-1"
        />
        {sign === "negative" && (
          <Select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as BehaviorSeverity)}
            aria-label="ระดับความรุนแรง"
            className="w-28 shrink-0"
          >
            {(Object.keys(SEVERITY_LABEL) as BehaviorSeverity[]).map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
        <Input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="คะแนน"
          className="w-20 shrink-0"
        />
        <Button
          type="submit"
          size="icon"
          className="shrink-0"
          disabled={!label.trim() || !amount || create.isPending}
          aria-label="เพิ่มหมวดหมู่"
        >
          {create.isPending ? <Spinner className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </Button>
      </form>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีหมวดหมู่" description="เพิ่มหมวดหมู่ด้านบน" />
        </div>
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[20rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-16 px-3 py-2 font-medium">คะแนน</th>
                  <th className="px-3 py-2 font-medium">ชื่อพฤติกรรม</th>
                  {sign === "negative" && <th className="w-24 px-3 py-2 font-medium">ระดับ</th>}
                  <th className="w-16 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c: BehaviorCategory) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className={cn("px-3 py-2 font-semibold", tone)}>
                      {c.points > 0 ? `+${c.points}` : c.points}
                    </td>
                    <td className="px-3 py-2">{c.label}</td>
                    {sign === "negative" && (
                      <td className="px-3 py-2">
                        {c.severity && (
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px]", SEVERITY_STYLE[c.severity])}>
                            {SEVERITY_LABEL[c.severity]}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => del.mutate(c.id)}
                      >
                        ลบ
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
