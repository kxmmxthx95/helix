import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { BriefcaseIcon, Plus, Search, Upload as UploadIcon, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, BuddhistDateSelect, Card, EmptyState, Field, Input, Pagination, Select, Spinner } from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
import { summarizeAttendance } from "@/hooks/useAttendance";
import { useStaffAttendanceRange } from "@/hooks/useStaffAttendance";
import { STATUS_LABEL, STATUS_STYLE } from "@/routes/Attendance";
import { bangkokTime } from "@/routes/TimeTracking";
import {
  employeeDocumentSignedUrl,
  useChangeEmployeeStatus,
  useContracts,
  useCreateContract,
  useDeleteContract,
  useDeleteEmployeeDocument,
  useEmployeeDocuments,
  useEmployees,
  useEmployeeStatusHistory,
  useSalaryGrades,
  useUpdateEmployeeCompensation,
  useUpdateEmployeePosition,
  useUploadEmployeeDocument,
  type EmployeeFilters,
  type EmployeeRow,
} from "@/hooks/useEmployees";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments, usePositionTitles } from "@/hooks/useProfiles";
import {
  CONTRACT_TYPE_LABEL,
  DOCUMENT_CATEGORY_LABEL,
  EMPLOYEE_STATUS_LABEL,
  profileFullName,
  type AttendanceStatus,
  type Contract,
  type ContractType,
  type DocumentCategory,
  type EmployeeStatus,
  type ProfileWithRoles,
} from "@/lib/database.types";
import { canManage, canManageHr } from "@/lib/roles";
import { textareaClass } from "@/routes/Roster";
import { cn } from "@/lib/utils";

const EMPTY: EmployeeFilters = { search: "", departmentId: "", status: "" };

type Tab = "position" | "compensation" | "status" | "contracts" | "documents" | "attendance";
const TABS: { key: Tab; label: string }[] = [
  { key: "position", label: "ตำแหน่งงาน" },
  { key: "compensation", label: "เงินเดือน" },
  { key: "status", label: "สถานะ" },
  { key: "contracts", label: "สัญญาจ้าง" },
  { key: "documents", label: "เอกสาร" },
  { key: "attendance", label: "การมาทำงาน" },
];

export function Employees() {
  const { profile: me } = useAuth();
  const [filters, setFilters] = useState<EmployeeFilters>(EMPTY);
  const [selected, setSelected] = useState<EmployeeRow | null>(null);

  const { data: departments = [] } = useDepartments();
  const { data: positionTitles = [] } = usePositionTitles();
  const { data: rows, isLoading, error } = useEmployees(filters);
  const { page, setPage, pageCount, pageRows } = usePagination(rows ?? [], [filters]);

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const titleName = useMemo(() => new Map(positionTitles.map((t) => [t.id, t.name])), [positionTitles]);
  const employeeName = useMemo(() => new Map((rows ?? []).map((r) => [r.id, profileFullName(r)])), [rows]);

  // Re-select the freshly refetched row after a mutation invalidates ["employees"],
  // so the open sheet doesn't keep showing stale data.
  const selectedFresh = selected ? ((rows ?? []).find((r) => r.id === selected.id) ?? selected) : null;

  if (!me) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="ค้นหาชื่อพนักงาน"
            className="pl-9"
            type="search"
          />
        </div>
        <Select
          className="w-32 shrink-0"
          value={filters.departmentId}
          onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}
          placeholder="ทุกแผนก"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select
          className="w-32 shrink-0"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value as EmployeeStatus | "" })}
          placeholder="ทุกสถานะ"
        >
          {(Object.keys(EMPLOYEE_STATUS_LABEL) as EmployeeStatus[]).map((s) => (
            <option key={s} value={s}>
              {EMPLOYEE_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {error && <Card className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</Card>}

      {rows && rows.length === 0 && (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่พบพนักงานตามเงื่อนไขที่เลือก" icon={BriefcaseIcon} />
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          <ul className="space-y-2 lg:hidden">
            {pageRows.map((row) => {
              const name = profileFullName(row);
              return (
                <li key={row.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(row);
                      }
                    }}
                    className="rounded-lg border border-border p-3 active:bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={name} src={avatarUrl(row)} className="h-10 w-10 text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {row.position.job_title_id ? (titleName.get(row.position.job_title_id) ?? "—") : "—"}
                          {" · "}
                          {row.department_id ? (deptName.get(row.department_id) ?? "—") : "ทุกแผนก"}
                        </p>
                      </div>
                      <StatusBadge status={row.position.employee_status} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card lg:block">
            <table className="w-full text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">ชื่อ</th>
                  <th className="px-3 py-2 font-medium">ตำแหน่งงาน</th>
                  <th className="px-3 py-2 font-medium">แผนก</th>
                  <th className="px-3 py-2 font-medium">หัวหน้างาน</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="cursor-pointer border-t border-border active:bg-muted"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={profileFullName(row)} src={avatarUrl(row)} className="h-7 w-7 shrink-0 text-[10px]" />
                        <p className="truncate font-medium">{profileFullName(row)}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.position.job_title_id ? (titleName.get(row.position.job_title_id) ?? "—") : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.department_id ? (deptName.get(row.department_id) ?? "—") : "ทุกแผนก"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.position.manager_id ? (employeeName.get(row.position.manager_id) ?? "—") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={row.position.employee_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      <EmployeeDetailSheet
        row={selectedFresh}
        employees={rows ?? []}
        me={me}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: EmployeeStatus }) {
  const tone =
    status === "active"
      ? "bg-success/15 text-success"
      : status === "onboarding"
        ? "bg-accent/15 text-accent"
        : status === "suspended"
          ? "bg-amber-500/15 text-amber-600"
          : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] ${tone}`}>{EMPLOYEE_STATUS_LABEL[status]}</span>;
}

function EmployeeDetailSheet({
  row,
  employees,
  me,
  onClose,
}: {
  row: EmployeeRow | null;
  employees: EmployeeRow[];
  me: ProfileWithRoles;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("position");
  const mayManageHr = canManageHr(me.roles);
  const isSelf = row?.id === me.id;
  const canSeeSensitive = isSelf || mayManageHr;
  // Attendance is day-to-day ops data (same access level as time_clock_records
  // itself — self or canManage()), not confidential HR data like
  // salary/contract/status/document, so it uses a wider gate than those.
  const canSeeAttendance = isSelf || canManage(me.roles);

  const visibleTabs = TABS.filter((t) =>
    t.key === "position" ? true : t.key === "attendance" ? canSeeAttendance : canSeeSensitive,
  );

  return (
    <Sheet
      open={row !== null}
      onOpenChange={(open) => !open && onClose()}
      title={row ? profileFullName(row) : ""}
    >
      {row && (
        <div className="space-y-4">
          <div className="flex gap-1 overflow-x-auto">
            {visibleTabs.map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={tab === t.key ? "default" : "outline"}
                onClick={() => setTab(t.key)}
                className="shrink-0"
              >
                {t.label}
              </Button>
            ))}
          </div>

          {tab === "position" && <PositionPanel row={row} employees={employees} mayManageHr={mayManageHr} />}
          {tab === "compensation" && canSeeSensitive && <CompensationPanel row={row} mayManageHr={mayManageHr} />}
          {tab === "status" && canSeeSensitive && <StatusPanel row={row} mayManageHr={mayManageHr} me={me} />}
          {tab === "contracts" && canSeeSensitive && <ContractsPanel row={row} mayManageHr={mayManageHr} me={me} />}
          {tab === "documents" && canSeeSensitive && <DocumentsPanel row={row} mayManageHr={mayManageHr} me={me} />}
          {tab === "attendance" && canSeeAttendance && <AttendancePanel row={row} />}
        </div>
      )}
    </Sheet>
  );
}

function PositionPanel({
  row,
  employees,
  mayManageHr,
}: {
  row: EmployeeRow;
  employees: EmployeeRow[];
  mayManageHr: boolean;
}) {
  const toast = useToast();
  const { data: positionTitles = [] } = usePositionTitles();
  const update = useUpdateEmployeePosition();
  const [draft, setDraft] = useState<{
    manager_id: string | null;
    job_title_id: string | null;
    career_path_notes: string | null;
  } | null>(null);

  const current = draft ?? {
    manager_id: row.position.manager_id,
    job_title_id: row.position.job_title_id,
    career_path_notes: row.position.career_path_notes,
  };
  const dirty = draft !== null;
  const managerOptions = employees.filter((e) => e.id !== row.id);

  function save() {
    update.mutate(
      { profileId: row.id, ...current },
      {
        onSuccess: () => {
          toast("บันทึกตำแหน่งงานสำเร็จ");
          setDraft(null);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <div className="space-y-3">
      <Field label="ตำแหน่งงาน">
        <Select
          value={current.job_title_id ?? ""}
          onChange={(e) => setDraft({ ...current, job_title_id: e.target.value || null })}
          placeholder="ไม่ระบุ"
          disabled={!mayManageHr}
        >
          {positionTitles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="หัวหน้างาน (สายบังคับบัญชา)">
        <Select
          value={current.manager_id ?? ""}
          onChange={(e) => setDraft({ ...current, manager_id: e.target.value || null })}
          placeholder="ไม่ระบุ"
          disabled={!mayManageHr}
        >
          {managerOptions.map((e) => (
            <option key={e.id} value={e.id}>
              {profileFullName(e)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="เส้นทางความก้าวหน้า">
        <textarea
          className={textareaClass}
          value={current.career_path_notes ?? ""}
          onChange={(e) => setDraft({ ...current, career_path_notes: e.target.value || null })}
          disabled={!mayManageHr}
        />
      </Field>

      {mayManageHr && (
        <Button className="w-full" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
        </Button>
      )}
    </div>
  );
}

function CompensationPanel({ row, mayManageHr }: { row: EmployeeRow; mayManageHr: boolean }) {
  const toast = useToast();
  const { data: salaryGrades = [] } = useSalaryGrades();
  const update = useUpdateEmployeeCompensation();
  const [draft, setDraft] = useState<string | null | undefined>(undefined);
  const current = draft === undefined ? row.salaryGradeId : draft;
  const dirty = draft !== undefined;

  function save() {
    update.mutate(
      { profileId: row.id, salaryGradeId: current },
      {
        onSuccess: () => {
          toast("บันทึกข้อมูลเงินเดือนสำเร็จ");
          setDraft(undefined);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <div className="space-y-3">
      <Field label="กลุ่มเงินเดือน (Salary grade)">
        <Select
          value={current ?? ""}
          onChange={(e) => setDraft(e.target.value || null)}
          placeholder="ไม่ระบุ"
          disabled={!mayManageHr}
        >
          {salaryGrades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>

      {mayManageHr && (
        <Button className="w-full" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
        </Button>
      )}
    </div>
  );
}

function StatusPanel({ row, mayManageHr, me }: { row: EmployeeRow; mayManageHr: boolean; me: ProfileWithRoles }) {
  const toast = useToast();
  const { data: history = [], isLoading } = useEmployeeStatusHistory(row.id);
  const change = useChangeEmployeeStatus();
  const [nextStatus, setNextStatus] = useState<EmployeeStatus | "">("");
  const [reason, setReason] = useState("");

  function submit() {
    if (!nextStatus || !reason.trim()) return;
    change.mutate(
      { profileId: row.id, status: nextStatus, reason: reason.trim(), changedBy: me.id },
      {
        onSuccess: () => {
          toast("เปลี่ยนสถานะสำเร็จ");
          setNextStatus("");
          setReason("");
        },
        onError: (err) => toast(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <span className="text-sm">สถานะปัจจุบัน</span>
        <StatusBadge status={row.position.employee_status} />
      </div>

      {mayManageHr && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <Field label="เปลี่ยนเป็นสถานะ">
            <Select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as EmployeeStatus)}
              placeholder="เลือกสถานะ"
            >
              {(Object.keys(EMPLOYEE_STATUS_LABEL) as EmployeeStatus[]).map((s) => (
                <option key={s} value={s}>
                  {EMPLOYEE_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="เหตุผล">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ระบุเหตุผลการเปลี่ยนสถานะ" />
          </Field>
          <Button className="w-full" onClick={submit} disabled={!nextStatus || !reason.trim() || change.isPending}>
            {change.isPending ? <Spinner className="h-3 w-3" /> : "บันทึกการเปลี่ยนสถานะ"}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">ประวัติการเปลี่ยนสถานะ</p>
        {isLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
        {!isLoading && history.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีประวัติ</p>}
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.id} className="rounded-lg border border-border p-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">{EMPLOYEE_STATUS_LABEL[h.status]}</span>
                <span className="text-muted-foreground">{new Date(h.created_at).toLocaleDateString("th-TH")}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{h.reason}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const ATTENDANCE_MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("th-TH", { month: "long" }).format(new Date(2000, i, 1)),
);
const attendanceDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const ATTENDANCE_STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];

/** Read-only — derived from staff_attendance_status() (migration 0062), nothing to edit here. */
function AttendancePanel({ row }: { row: EmployeeRow }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear() + 543); // พ.ศ.
  const [month, setMonth] = useState(now.getMonth() + 1);
  const ceYear = year - 543;
  const startDate = `${ceYear}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${ceYear}-${String(month).padStart(2, "0")}-${String(attendanceDaysInMonth(ceYear, month)).padStart(2, "0")}`;
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() + 543 - i);

  const { data: allRows = [], isLoading } = useStaffAttendanceRange(startDate, endDate);
  const rows = allRows.filter((r) => r.profile_id === row.id);
  const counts = summarizeAttendance(rows);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select className="w-32" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
          {ATTENDANCE_MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </Select>
        <Select className="w-24" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}

      {!isLoading && (
        <div className="grid grid-cols-4 gap-2">
          {ATTENDANCE_STATUS_ORDER.map((st) => (
            <div key={st} className={cn("rounded-lg px-2 py-1.5 text-center text-[10px] font-medium", STATUS_STYLE[st])}>
              <p>{STATUS_LABEL[st]}</p>
              <p className="mt-0.5 text-sm tabular-nums">{counts[st]}</p>
            </div>
          ))}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">ไม่มีข้อมูลการมาทำงานในเดือนนี้</p>
      )}
      {rows.length > 0 && (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
          {rows.map((r) => (
            <li key={r.date} className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5">
              <span className="tabular-nums">{r.date}</span>
              <span className="text-muted-foreground tabular-nums">
                {r.clock_in_time ? bangkokTime(r.clock_in_time) : "—"}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px]", STATUS_STYLE[r.status])}>
                {STATUS_LABEL[r.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContractsPanel({ row, mayManageHr, me }: { row: EmployeeRow; mayManageHr: boolean; me: ProfileWithRoles }) {
  const toast = useToast();
  const { data: contracts = [], isLoading } = useContracts(row.id);
  const create = useCreateContract();
  const del = useDeleteContract();
  const uploadDoc = useUploadEmployeeDocument();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<ContractType>("probation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!startDate) return;
    let documentId: string | null = null;
    if (file) {
      try {
        const doc = await uploadDoc.mutateAsync({ file, profileId: row.id, category: "contract", uploadedBy: me.id });
        documentId = doc.id;
      } catch (err) {
        toast(err instanceof Error ? err.message : "อัปโหลดไฟล์ไม่สำเร็จ", "error");
        return;
      }
    }
    create.mutate(
      { profile_id: row.id, contract_type: type, start_date: startDate, end_date: endDate || null, document_id: documentId },
      {
        onSuccess: () => {
          toast("เพิ่มสัญญาจ้างสำเร็จ");
          setAdding(false);
          setStartDate("");
          setEndDate("");
          setFile(null);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "เพิ่มสัญญาไม่สำเร็จ", "error"),
      },
    );
  }

  function removeContract(c: Contract) {
    if (confirm("ลบสัญญาจ้างนี้? กู้คืนไม่ได้")) {
      del.mutate({ id: c.id, profile_id: c.profile_id });
    }
  }

  return (
    <div className="space-y-3">
      {mayManageHr && !adding && (
        <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3" /> เพิ่มสัญญาจ้าง
        </Button>
      )}

      {adding && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <Field label="ประเภทสัญญา">
            <Select value={type} onChange={(e) => setType(e.target.value as ContractType)}>
              {(Object.keys(CONTRACT_TYPE_LABEL) as ContractType[]).map((t) => (
                <option key={t} value={t}>
                  {CONTRACT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="วันที่เริ่มสัญญา" required>
            <BuddhistDateSelect value={startDate} onChange={setStartDate} required />
          </Field>
          <Field label="วันที่สิ้นสุดสัญญา (เว้นว่าง = ไม่มีกำหนด)">
            <BuddhistDateSelect value={endDate} onChange={setEndDate} />
          </Field>
          <Field label="ไฟล์แนบสัญญา (ถ้ามี)">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {file ? file.name : "เลือกไฟล์"}
            </Button>
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setAdding(false)}>
              ยกเลิก
            </Button>
            <Button
              className="flex-1"
              onClick={submit}
              disabled={!startDate || create.isPending || uploadDoc.isPending}
            >
              {create.isPending || uploadDoc.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
            </Button>
          </div>
        </div>
      )}

      {isLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
      {!isLoading && contracts.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีสัญญาจ้าง</p>}
      <ul className="space-y-2">
        {contracts.map((c) => (
          <li key={c.id} className="rounded-lg border border-border p-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium">{CONTRACT_TYPE_LABEL[c.contract_type]}</span>
              {mayManageHr && (
                <Button variant="ghost" size="icon" aria-label="ลบสัญญา" onClick={() => removeContract(c)}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <p className="mt-1 text-muted-foreground">
              {new Date(c.start_date).toLocaleDateString("th-TH")}
              {" – "}
              {c.end_date ? new Date(c.end_date).toLocaleDateString("th-TH") : "ไม่มีกำหนด"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentsPanel({ row, mayManageHr, me }: { row: EmployeeRow; mayManageHr: boolean; me: ProfileWithRoles }) {
  const toast = useToast();
  const { data: documents = [], isLoading } = useEmployeeDocuments(row.id);
  const upload = useUploadEmployeeDocument();
  const del = useDeleteEmployeeDocument();
  const [category, setCategory] = useState<DocumentCategory>("other");
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    try {
      await upload.mutateAsync({ file, profileId: row.id, category, uploadedBy: me.id });
      toast("อัปโหลดเอกสารสำเร็จ");
    } catch (err) {
      toast(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ", "error");
    }
  }

  async function download(path: string) {
    const url = await employeeDocumentSignedUrl(path);
    if (!url) {
      toast("เปิดไฟล์ไม่สำเร็จ", "error");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function removeDocument(id: string, filePath: string, fileName: string, profileId: string) {
    if (confirm(`ลบ "${fileName}"? กู้คืนไม่ได้`)) {
      del.mutate({ id, file_path: filePath, profile_id: profileId });
    }
  }

  return (
    <div className="space-y-3">
      {mayManageHr && (
        <div className="flex gap-2">
          <Select className="min-w-0 flex-1" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
            {(Object.keys(DOCUMENT_CATEGORY_LABEL) as DocumentCategory[]).map((c) => (
              <option key={c} value={c}>
                {DOCUMENT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void pick(f);
            }}
          />
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            aria-label="อัปโหลดเอกสาร"
          >
            {upload.isPending ? <Spinner className="h-3 w-3" /> : <UploadIcon className="h-3 w-3" />}
          </Button>
        </div>
      )}

      {isLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
      {!isLoading && documents.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีเอกสาร</p>}
      <ul className="space-y-2">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-xs">
            <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => void download(d.file_path)}>
              <span className="font-medium">{DOCUMENT_CATEGORY_LABEL[d.category]}</span>
              <span className="ml-2 truncate text-muted-foreground">{d.file_name}</span>
            </button>
            {mayManageHr && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="ลบเอกสาร"
                onClick={() => removeDocument(d.id, d.file_path, d.file_name, d.profile_id)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
