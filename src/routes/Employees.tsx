import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { BriefcaseIcon, Plus, Search, Upload as UploadIcon, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, BuddhistDateSelect, Card, EmptyState, Field, FormSection, Input, Pagination, Select, Skeleton, Spinner } from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
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
  type Contract,
  type ContractType,
  type DocumentCategory,
  type EmployeeStatus,
  type ProfileWithRoles,
} from "@/lib/database.types";
import { canManageHr } from "@/lib/roles";
import { departmentTone, paletteTone } from "@/lib/gradeLevels";

const EMPTY: EmployeeFilters = { search: "", departmentId: "", status: "" };

type Tab = "position" | "compensation" | "status" | "contracts" | "documents";
const TABS: { key: Tab; label: string }[] = [
  { key: "position", label: "ตำแหน่งงาน" },
  { key: "compensation", label: "เงินเดือน" },
  { key: "status", label: "สถานะ" },
  { key: "contracts", label: "สัญญาจ้าง" },
  { key: "documents", label: "เอกสาร" },
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
  const titleTone = useMemo(() => new Map(positionTitles.map((t, i) => [t.id, paletteTone(i)])), [positionTitles]);
  const employeeById = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);

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
        <div role="status" aria-label="กำลังโหลด" className="space-y-2">
          <ul className="space-y-2 lg:hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-14 shrink-0 rounded-full" />
                </div>
              </li>
            ))}
          </ul>

          <div className="table-panel hidden rounded-none border-t border-border shadow-none lg:flex"><div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">ตำแหน่งงาน</th>
                  <th className="px-4 py-3">แผนก</th>
                  <th className="px-4 py-3">หัวหน้างาน</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className="h-14 border-t border-border first:border-t-0">
                    <td className="px-4 py-0">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-20" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-16" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-20" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-4 w-14 rounded-full" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
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

          <div className="table-panel hidden rounded-none border-t border-border shadow-none lg:flex"><div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">ตำแหน่งงาน</th>
                  <th className="px-4 py-3">แผนก</th>
                  <th className="px-4 py-3">หัวหน้างาน</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="h-14 cursor-pointer border-t border-border first:border-t-0"
                  >
                    <td className="px-4 py-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={profileFullName(row)} src={avatarUrl(row)} className="h-9 w-9 shrink-0 text-xs" />
                        <p className="truncate font-medium">{profileFullName(row)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-0">
                      {row.position.job_title_id ? (
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${titleTone.get(row.position.job_title_id) ?? "bg-secondary text-muted-foreground"}`}>
                          {titleName.get(row.position.job_title_id) ?? "—"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-0">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${departmentTone(row.department_id ?? undefined)}`}>
                        {row.department_id ? (deptName.get(row.department_id) ?? "—") : "ทุกแผนก"}
                      </span>
                    </td>
                    <td className="px-4 py-0">
                      {(() => {
                        const m = row.position.manager_id ? employeeById.get(row.position.manager_id) : undefined;
                        if (!m) return "—";
                        return (
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar name={profileFullName(m)} src={avatarUrl(m)} className="h-9 w-9 shrink-0 text-xs" />
                            <p className="truncate font-medium">{profileFullName(m)}</p>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-0">
                      <StatusBadge status={row.position.employee_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>

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
      ? { pill: "bg-success/10 text-success", dot: "bg-success" }
      : status === "onboarding"
        ? { pill: "bg-accent/10 text-accent", dot: "bg-accent" }
        : status === "suspended"
          ? { pill: "bg-amber-500/10 text-amber-600", dot: "bg-amber-500" }
          : { pill: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone.pill}`}>
      <span className={`size-1.5 rounded-full ${tone.dot}`} />
      {EMPLOYEE_STATUS_LABEL[status]}
    </span>
  );
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
  const isSelf = row?.id === me.id;
  // ponytail: dept_director is also blocked by the DB from director/super_admin/dept_director targets (can_manage_hr_of, 0082) —
  // not mirrored here since target roles aren't on the row; such an edit just fails with a toast.
  const mayManageHr =
    canManageHr(me.roles) ||
    (me.roles.includes("dept_director") && !isSelf && !!row?.department_id && row.department_id === me.department_id);
  const canSeeSensitive = isSelf || mayManageHr;

  const visibleTabs = TABS.filter((t) => t.key === "position" || canSeeSensitive);
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : (visibleTabs[0]?.key ?? "position");

  return (
    <Sheet
      open={row !== null}
      onOpenChange={(open) => !open && onClose()}
      title={row ? profileFullName(row) : ""}
    >
      {row && (
        <div className="space-y-4">
          <Select
            className="w-full"
            value={activeTab}
            onChange={(e) => setTab(e.target.value as Tab)}
            aria-label="หมวดข้อมูลพนักงาน"
          >
            {visibleTabs.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>

          {activeTab === "position" && <PositionPanel row={row} employees={employees} mayManageHr={mayManageHr} />}
          {activeTab === "compensation" && canSeeSensitive && <CompensationPanel row={row} mayManageHr={mayManageHr} />}
          {activeTab === "status" && canSeeSensitive && <StatusPanel row={row} mayManageHr={mayManageHr} me={me} />}
          {activeTab === "contracts" && canSeeSensitive && <ContractsPanel row={row} mayManageHr={mayManageHr} me={me} />}
          {activeTab === "documents" && canSeeSensitive && <DocumentsPanel row={row} mayManageHr={mayManageHr} me={me} />}
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
  } | null>(null);

  const current = draft ?? {
    manager_id: row.position.manager_id,
    job_title_id: row.position.job_title_id,
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
    <div className="space-y-4">
      <FormSection title="ตำแหน่งงาน">
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

      <Field label="หัวหน้างาน">
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
      </FormSection>

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
  const current = row.position.employee_status;

  // Picking a status saves at once. Ending employment takes effect today; reason stays empty (column is NOT NULL, "" is allowed).
  function changeTo(next: EmployeeStatus) {
    if (next === current) return;
    change.mutate(
      {
        profileId: row.id,
        status: next,
        reason: "",
        changedBy: me.id,
        effectiveDate: new Date().toLocaleDateString("sv-SE"),
      },
      {
        onSuccess: () => toast("เปลี่ยนสถานะสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <span className="text-sm">สถานะปัจจุบัน</span>
        {mayManageHr ? (
          <Select
            className="w-auto"
            value={current}
            onChange={(e) => changeTo(e.target.value as EmployeeStatus)}
            disabled={change.isPending}
            aria-label="สถานะปัจจุบัน"
          >
            {(Object.keys(EMPLOYEE_STATUS_LABEL) as EmployeeStatus[]).map((s) => (
              <option key={s} value={s}>
                {EMPLOYEE_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        ) : (
          <StatusBadge status={current} />
        )}
      </div>
      {row.position.end_date && (
        <p className="px-1 text-xs text-muted-foreground">
          วันสุดท้ายของการทำงาน {new Date(row.position.end_date).toLocaleDateString("th-TH", { dateStyle: "long" })}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">ประวัติการเปลี่ยนสถานะ</p>
        {isLoading && (
          <ul className="space-y-2" role="status" aria-label="กำลังโหลด">
            {[0, 1].map((i) => (
              <li key={i} className="rounded-lg border border-border p-2.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="mt-1.5 h-3 w-40" />
              </li>
            ))}
          </ul>
        )}
        {!isLoading && history.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีประวัติ</p>}
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.id} className="rounded-lg border border-border p-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">{EMPLOYEE_STATUS_LABEL[h.status]}</span>
                <span className="text-muted-foreground">{new Date(h.effective_date).toLocaleDateString("th-TH")}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{h.reason}</p>
            </li>
          ))}
        </ul>
      </div>
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

      {isLoading && (
        <ul className="space-y-2" role="status" aria-label="กำลังโหลด">
          {[0, 1].map((i) => (
            <li key={i} className="rounded-lg border border-border p-2.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-1.5 h-3 w-36" />
            </li>
          ))}
        </ul>
      )}
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

      {isLoading && (
        <ul className="space-y-2" role="status" aria-label="กำลังโหลด">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5">
              <Skeleton className="h-3 w-32" />
            </li>
          ))}
        </ul>
      )}
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
