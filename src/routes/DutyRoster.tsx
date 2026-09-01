import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { X } from "@/components/icons";
import { Button, Card, EmptyState, Field, Input, Select, Skeleton, Spinner, Switch } from "@/components/ui";
import { useAcademicEvents } from "@/hooks/useAcademicTerms";
import {
  expandFixedDutyAssignments,
  expandWeeklyTemplateAssignments,
  summarizeDutyCounts,
  useAddWeeklyTemplateStaff,
  useAssignDuty,
  useCancelDutyTransfer,
  useDecideDutyTransfer,
  useDeleteDutyPoint,
  useDutyAssignmentsRange,
  useDutyPoints,
  useDutyTransferApprovals,
  useDutyWeeklyTemplate,
  useIncomingDutyTransfers,
  useMaterializeDutyDay,
  useMyDutyTransferRequests,
  useRemoveDutyAssignment,
  useRemoveWeeklyTemplateStaff,
  useRequestDutyTransfer,
  useRespondDutyTransfer,
  useSaveDutyPoint,
  type DutyPointDraft,
} from "@/hooks/useDutyRoster";
import { useDepartments, useProfiles } from "@/hooks/useProfiles";
import { profileFullName, type DutyPoint, type DutyTransferRequest, type DutyTransferStatus } from "@/lib/database.types";
import { canManage, isEmployeeRole, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("th-TH", { month: "long" }).format(new Date(2000, i, 1)),
);
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

// 0=อาทิตย์..6=เสาร์, matches JS Date#getDay() — see migration 0065.
const WEEKDAY_LABELS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const TRANSFER_STATUS_LABEL: Record<DutyTransferStatus, string> = {
  pending_target: "รอผู้รับยืนยัน",
  pending_admin: "รอแอดมินอนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected_by_target: "ผู้รับปฏิเสธ",
  rejected_by_admin: "แอดมินไม่อนุมัติ",
  cancelled: "ยกเลิกแล้ว",
};

const TRANSFER_STATUS_STYLE: Record<DutyTransferStatus, string> = {
  pending_target: "bg-warning/15 text-warning",
  pending_admin: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected_by_target: "bg-destructive/15 text-destructive",
  rejected_by_admin: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

type View = "assign" | "mine" | "requests" | "summary" | "points";

export function DutyRoster() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>("mine");
  const [departmentId, setDepartmentId] = useState("");
  const { data: departments = [] } = useDepartments();

  if (!profile) return null;
  const mayManage = canManage(profile.roles);
  const orgWide = isOrgWide(profile.roles);
  const canDept = orgWide || profile.roles.includes("dept_head");

  return (
    <div className="page-fill">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-48" value={view} onChange={(e) => setView(e.target.value as View)}>
          <option value="mine">เวรของฉัน</option>
          {mayManage && <option value="assign">จัดตารางเวร</option>}
          {mayManage && <option value="requests">คำขอโอนเวร</option>}
          {mayManage && <option value="summary">สรุปรายเดือน</option>}
          {canDept && <option value="points">จุดเวร</option>}
        </Select>
        {mayManage && orgWide && (view === "assign" || view === "summary") && (
          <Select
            className="ml-auto w-48"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            placeholder="ทุกแผนก"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {view === "mine" && <MineView profileId={profile.id} />}
      {view === "assign" && mayManage && <AssignView departmentId={departmentId} createdBy={profile.id} />}
      {view === "requests" && mayManage && <RequestsView />}
      {view === "summary" && mayManage && <SummaryView departmentId={departmentId} />}
      {view === "points" && canDept && <PointsView />}
    </div>
  );
}

function useEligibleStaff(departmentId: string) {
  const { data: profiles = [] } = useProfiles({ search: "", departmentId, role: "", active: "true" });
  return useMemo(() => profiles.filter((p) => isEmployeeRole(p.roles)), [profiles]);
}

function useNameById(departmentId: string) {
  const staff = useEligibleStaff(departmentId);
  return useMemo(() => new Map(staff.map((p) => [p.id, profileFullName(p)])), [staff]);
}

// -------------------------------------------------------------------- points
// Lookup table for เวรประจำวัน (migration 0063/0064) — same shape as LeaveTypesCard.
function PointsView() {
  const { data: points = [], isLoading } = useDutyPoints();
  const staff = useEligibleStaff("");
  const nameById = useNameById("");
  const [editing, setEditing] = useState<DutyPoint | null>(null);
  const [creating, setCreating] = useState(false);

  const sheets = (
    <>
      <DutyPointSheet mode="edit" dutyPoint={editing} staff={staff} nameById={nameById} open={editing !== null} onClose={() => setEditing(null)} />
      <DutyPointSheet mode="create" dutyPoint={null} staff={staff} nameById={nameById} open={creating} onClose={() => setCreating(false)} />
    </>
  );

  if (isLoading) {
    return (
      <Card className="space-y-3" role="status" aria-label="กำลังโหลด">
        <div className="flex justify-end">
          <Skeleton className="h-8 w-24" />
        </div>
        <ul className="divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <li key={i} className="py-1.5">
              <Skeleton className="h-3.5 w-32" />
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  if (points.length === 0) {
    return (
      <>
        <EmptyState
          title="ไม่พบข้อมูล"
          description="ยังไม่มีจุดเวร"
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />
              เพิ่มจุดเวร
            </Button>
          }
        />
        {sheets}
      </>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          เพิ่มจุดเวร
        </Button>
      </div>
      <ul className="divide-y divide-border text-sm">
        {points.map((p) => (
          <li
            key={p.id}
            onClick={() => setEditing(p)}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-2 py-1.5",
              !p.active && "text-muted-foreground",
            )}
          >
            <span>
              {p.name}
              {p.mode === "fixed" && (
                <span className="ml-2 text-xs text-muted-foreground">ประจำ: {nameById.get(p.fixed_staff_id ?? "") ?? "—"}</span>
              )}
            </span>
            {!p.active && <span className="text-xs">ปิดใช้งาน</span>}
          </li>
        ))}
      </ul>
      {sheets}
    </Card>
  );
}

function DutyPointSheet({
  mode,
  dutyPoint,
  staff,
  nameById,
  open,
  onClose,
}: {
  mode: "create" | "edit";
  dutyPoint: DutyPoint | null;
  staff: { id: string }[];
  nameById: Map<string, string>;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSaveDutyPoint();
  const del = useDeleteDutyPoint();

  const blank = (): DutyPointDraft => ({ name: "", active: true, mode: "rotating", fixed_staff_id: null });

  const [draft, setDraft] = useState<DutyPointDraft>(blank);

  useEffect(() => {
    if (!open) return;
    setDraft(
      dutyPoint
        ? { name: dutyPoint.name, active: dutyPoint.active, mode: dutyPoint.mode, fixed_staff_id: dutyPoint.fixed_staff_id }
        : blank(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dutyPoint]);

  const isFixed = draft.mode === "fixed";
  const canSubmit = draft.name.trim() !== "" && (!isFixed || !!draft.fixed_staff_id);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    save.mutate(
      { id: dutyPoint?.id, ...draft },
      {
        onSuccess: () => {
          toast("บันทึกสำเร็จ");
          onClose();
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={mode === "create" ? "เพิ่มจุดเวร" : "แก้ไขจุดเวร"}
      footer={
        dutyPoint ? (
          <Button
            variant="outline"
            className="w-full text-destructive"
            onClick={() =>
              del.mutate(dutyPoint.id, {
                onSuccess: onClose,
                onError: (err) => toast(err instanceof Error ? err.message : "ลบไม่สำเร็จ", "error"),
              })
            }
          >
            ลบจุดเวร
          </Button>
        ) : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="ชื่อจุดเวร">
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="เช่น เวรประตู, เวรโรงอาหาร"
            required
          />
        </Field>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <span className="text-xs font-medium">เปิดใช้งาน</span>
          <Switch checked={draft.active} onChange={(active) => setDraft({ ...draft, active })} size="sm" />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <span className="text-xs font-medium">เวรประจำ (ครูคนเดิมทุกวันเรียน)</span>
          <Switch
            checked={isFixed}
            onChange={(fixed) =>
              setDraft({ ...draft, mode: fixed ? "fixed" : "rotating", fixed_staff_id: fixed ? draft.fixed_staff_id : null })
            }
            size="sm"
          />
        </div>
        {isFixed && (
          <Field label="ครูประจำ">
            <Select
              value={draft.fixed_staff_id ?? ""}
              onChange={(e) => setDraft({ ...draft, fixed_staff_id: e.target.value || null })}
              placeholder="เลือกครู"
            >
              {staff.map((p) => (
                <option key={p.id} value={p.id}>
                  {nameById.get(p.id) ?? p.id}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Button type="submit" className="w-full" disabled={!canSubmit || save.isPending}>
          {save.isPending ? <Spinner className="h-3 w-3" /> : mode === "create" ? "เพิ่ม" : "บันทึก"}
        </Button>
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------- assign
// "จัดตารางเวร" no longer picks a calendar date by default (grill decision
// 2026-09-01) — a rotating point's roster is a weekly template (who's on
// duty each อาทิตย์-เสาร์, repeating every week). Overriding one specific
// date is still possible, just tucked behind a toggle.
function AssignView({ departmentId, createdBy }: { departmentId: string; createdBy: string }) {
  const [showOverride, setShowOverride] = useState(false);

  return (
    <div className="space-y-4">
      <WeeklyTemplateEditor departmentId={departmentId} createdBy={createdBy} />

      <div className="border-t border-border pt-3">
        <Button size="sm" variant="outline" onClick={() => setShowOverride((v) => !v)}>
          {showOverride ? "ซ่อนการแก้เฉพาะวันที่" : "แก้เฉพาะวันที่ระบุ"}
        </Button>
        {showOverride && (
          <div className="mt-3">
            <DateOverridePanel departmentId={departmentId} createdBy={createdBy} />
          </div>
        )}
      </div>
    </div>
  );
}

function WeeklyTemplateEditor({ departmentId, createdBy }: { departmentId: string; createdBy: string }) {
  const [weekday, setWeekday] = useState(() => new Date().getDay());
  const { data: points = [], isLoading: pointsLoading } = useDutyPoints();
  const { data: template = [], isLoading: templateLoading } = useDutyWeeklyTemplate();
  const staff = useEligibleStaff(departmentId);
  const nameById = useNameById(departmentId);

  const rotatingPoints = points.filter((p) => p.active && p.mode === "rotating");
  const isLoading = pointsLoading || templateLoading;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAY_ORDER.map((wd) => (
          <button
            key={wd}
            type="button"
            onClick={() => setWeekday(wd)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              wd === weekday ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {WEEKDAY_LABELS[wd]}
          </button>
        ))}
      </div>

      {isLoading && (
        <Card className="space-y-2" role="status" aria-label="กำลังโหลด">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card>
      )}

      {!isLoading && rotatingPoints.length === 0 && (
        <EmptyState title="ยังไม่มีจุดเวรแบบหมุนเวียน" description="เพิ่ม/ตั้งโหมดจุดเวรได้ที่เมนู จุดเวร" />
      )}

      {!isLoading && rotatingPoints.length > 0 && (
        <div className="space-y-2">
          {rotatingPoints.map((point) => (
            <WeekdayPointRow
              key={point.id}
              pointId={point.id}
              pointName={point.name}
              weekday={weekday}
              rows={template.filter((t) => t.duty_point_id === point.id && t.weekday === weekday && nameById.has(t.staff_id))}
              staff={staff}
              nameById={nameById}
              createdBy={createdBy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekdayPointRow({
  pointId,
  pointName,
  weekday,
  rows,
  staff,
  nameById,
  createdBy,
}: {
  pointId: string;
  pointName: string;
  weekday: number;
  rows: { id: string; staff_id: string }[];
  staff: { id: string }[];
  nameById: Map<string, string>;
  createdBy: string;
}) {
  const toast = useToast();
  const add = useAddWeeklyTemplateStaff();
  const remove = useRemoveWeeklyTemplateStaff();
  const [picked, setPicked] = useState("");

  const assignedIds = new Set(rows.map((r) => r.staff_id));
  const options = staff.filter((p) => !assignedIds.has(p.id));

  function submitAdd() {
    if (!picked) return;
    add.mutate(
      { dutyPointId: pointId, weekday, staffId: picked, createdBy },
      {
        onSuccess: () => setPicked(""),
        onError: (err) => toast(err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Card className="space-y-2">
      <p className="text-sm font-medium">{pointName}</p>
      <div className="flex flex-wrap gap-1.5">
        {rows.length === 0 && <span className="text-xs text-muted-foreground">ยังไม่มีคนเข้าเวรวันนี้</span>}
        {rows.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
            {nameById.get(r.staff_id) ?? "—"}
            <button
              type="button"
              aria-label="เอาออก"
              onClick={() => remove.mutate(r.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {options.length > 0 && (
        <div className="flex gap-2">
          <Select className="w-56" value={picked} onChange={(e) => setPicked(e.target.value)} placeholder="เพิ่มคนเข้าเวร">
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {nameById.get(p.id) ?? p.id}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="outline" onClick={submitAdd} disabled={!picked || add.isPending}>
            เพิ่ม
          </Button>
        </div>
      )}
    </Card>
  );
}

// -------------------------------------------------------- date override
// Editing one specific calendar date without touching the weekly template.
// Materializes the WHOLE day's template roster into real duty_assignments
// rows before allowing edits — see useMaterializeDutyDay's comment for why a
// partial override isn't safe here.
function DateOverridePanel({ departmentId, createdBy }: { departmentId: string; createdBy: string }) {
  const [date, setDate] = useState(todayIso());
  const { data: points = [], isLoading: pointsLoading } = useDutyPoints();
  const { data: assignments = [], isLoading: assignmentsLoading } = useDutyAssignmentsRange(date, date);
  const { data: template = [], isLoading: templateLoading } = useDutyWeeklyTemplate();
  const { data: events = [] } = useAcademicEvents();
  const staff = useEligibleStaff(departmentId);
  const nameById = useNameById(departmentId);

  const activePoints = points.filter((p) => p.active);
  const isLoading = pointsLoading || assignmentsLoading || templateLoading;
  const isHoliday = events.some(
    (e) => !e.staff_attend && e.departmentIds.length === 0 && date >= e.start_date && date <= e.end_date,
  );

  const templateForDate = useMemo(
    () => expandWeeklyTemplateAssignments(points, template, assignments, date, date),
    [points, template, assignments, date],
  );

  return (
    <div className="space-y-3">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" aria-label="วันที่" />

      {isHoliday && (
        <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning">
          วันนี้เป็นวันหยุดทั้งโรงเรียน — ตรวจสอบก่อนมอบหมายเวร
        </p>
      )}

      {isLoading && (
        <Card className="space-y-2" role="status" aria-label="กำลังโหลด">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card>
      )}

      {!isLoading && activePoints.length === 0 && (
        <EmptyState title="ยังไม่มีจุดเวร" description="เพิ่มจุดเวรได้ที่เมนู จุดเวร ด้านบน" />
      )}

      {!isLoading && activePoints.length > 0 && (
        <div className="space-y-2">
          {activePoints.map((point) => (
            <DutyPointRow
              key={point.id}
              pointId={point.id}
              pointName={point.name}
              date={date}
              assignments={assignments.filter((a) => a.duty_point_id === point.id && nameById.has(a.staff_id))}
              staff={staff}
              nameById={nameById}
              createdBy={createdBy}
              fixedStaffName={point.mode === "fixed" ? nameById.get(point.fixed_staff_id ?? "") : undefined}
              templateStaff={
                point.mode === "rotating"
                  ? templateForDate
                      .filter((v) => v.duty_point_id === point.id)
                      .map((v) => ({ id: v.staff_id, name: nameById.get(v.staff_id) ?? "—" }))
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DutyPointRow({
  pointId,
  pointName,
  date,
  assignments,
  staff,
  nameById,
  createdBy,
  fixedStaffName,
  templateStaff,
}: {
  pointId: string;
  pointName: string;
  date: string;
  assignments: { id: string; staff_id: string }[];
  staff: { id: string }[];
  nameById: Map<string, string>;
  createdBy: string;
  fixedStaffName?: string;
  templateStaff?: { id: string; name: string }[];
}) {
  const toast = useToast();
  const assign = useAssignDuty();
  const remove = useRemoveDutyAssignment();
  const materialize = useMaterializeDutyDay();
  const [picked, setPicked] = useState("");

  const assignedIds = new Set(assignments.map((a) => a.staff_id));
  const options = staff.filter((p) => !assignedIds.has(p.id));
  // Multiple people can share a rotating point on one weekday — showing one
  // of them as a real row while the rest stay virtual would hide the rest
  // everywhere else (see expandWeeklyTemplateAssignments), so editing that
  // day starts by materializing everyone the template already has.
  const templatePending = assignments.length === 0 && !fixedStaffName && (templateStaff?.length ?? 0) > 0;

  function add() {
    if (!picked) return;
    assign.mutate(
      { dutyPointId: pointId, staffId: picked, date, createdBy },
      {
        onSuccess: () => setPicked(""),
        onError: (err) => toast(err instanceof Error ? err.message : "มอบหมายไม่สำเร็จ", "error"),
      },
    );
  }

  function startOverride() {
    materialize.mutate(
      (templateStaff ?? []).map((t) => ({ dutyPointId: pointId, staffId: t.id, date, createdBy })),
      { onError: (err) => toast(err instanceof Error ? err.message : "แก้ไขไม่สำเร็จ", "error") },
    );
  }

  return (
    <Card className="space-y-2">
      <p className="text-sm font-medium">{pointName}</p>
      <div className="flex flex-wrap gap-1.5">
        {assignments.length === 0 && fixedStaffName && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
            {fixedStaffName} · ประจำ
          </span>
        )}
        {templatePending &&
          templateStaff!.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              {t.name}
            </span>
          ))}
        {assignments.length === 0 && !fixedStaffName && !templatePending && (
          <span className="text-xs text-muted-foreground">ยังไม่มีคนเข้าเวร</span>
        )}
        {assignments.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
          >
            {nameById.get(a.staff_id) ?? "—"}
            <button
              type="button"
              aria-label="เอาออก"
              onClick={() => remove.mutate(a.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {templatePending ? (
        <Button size="sm" variant="outline" onClick={startOverride} disabled={materialize.isPending}>
          {materialize.isPending ? <Spinner className="h-3 w-3" /> : "แก้เฉพาะวันนี้"}
        </Button>
      ) : (
        options.length > 0 && (
          <div className="flex gap-2">
            <Select
              className="w-56"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              placeholder={fixedStaffName && assignments.length === 0 ? "แก้เฉพาะวันนี้" : "เพิ่มคนเข้าเวร"}
            >
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {nameById.get(p.id) ?? p.id}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" onClick={add} disabled={!picked || assign.isPending}>
              เพิ่ม
            </Button>
          </div>
        )
      )}
    </Card>
  );
}

// --------------------------------------------------------------------- mine
function MineView({ profileId }: { profileId: string }) {
  const toast = useToast();
  const start = addDays(todayIso(), -30);
  const end = addDays(todayIso(), 60);
  // Unfiltered: RLS already scopes this to my own rows plus rows on duty
  // points I'm the fixed teacher for (migration 0064) — both needed to
  // compute the virtual rows below correctly.
  const { data: allAssignments = [], isLoading } = useDutyAssignmentsRange(start, end);
  const { data: template = [] } = useDutyWeeklyTemplate();
  const { data: incoming = [] } = useIncomingDutyTransfers(profileId);
  const { data: myRequests = [] } = useMyDutyTransferRequests(profileId);
  const { data: points = [] } = useDutyPoints();
  const staff = useEligibleStaff("");
  const nameById = useNameById("");
  const respond = useRespondDutyTransfer();
  const cancel = useCancelDutyTransfer();
  const request = useRequestDutyTransfer();
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null);

  const pointName = (id: string) => points.find((p) => p.id === id)?.name ?? "—";
  const pendingIncoming = incoming.filter((r) => r.status === "pending_target");

  // Rotating-template virtual days can't be transferred yet (lazy-create only
  // covers 'fixed' points, see migration 0064) — tagged so the button hides.
  const virtual = useMemo(() => {
    const fixed = expandFixedDutyAssignments(points, allAssignments, start, end)
      .filter((v) => v.staff_id === profileId)
      .map((v) => ({ ...v, source: "fixed" as const }));
    const rotating = expandWeeklyTemplateAssignments(points, template, allAssignments, start, end)
      .filter((v) => v.staff_id === profileId)
      .map((v) => ({ ...v, source: "rotating" as const }));
    return [...fixed, ...rotating];
  }, [points, template, allAssignments, start, end, profileId]);
  const rows = useMemo(
    () =>
      [
        ...allAssignments
          .filter((a) => a.staff_id === profileId)
          .map((a) => ({ id: a.id, duty_point_id: a.duty_point_id, date: a.date, source: "real" as const })),
        ...virtual.map((v) => ({ id: null, duty_point_id: v.duty_point_id, date: v.date, source: v.source })),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    [allAssignments, virtual, profileId],
  );

  // Latest attempt per assignment — that's the one whose status still applies.
  const latestByAssignment = useMemo(() => {
    const map = new Map<string, DutyTransferRequest>();
    for (const r of myRequests) {
      const current = map.get(r.assignment_id);
      if (!current || r.created_at > current.created_at) map.set(r.assignment_id, r);
    }
    return map;
  }, [myRequests]);

  return (
    <div className={cn("flex flex-col gap-4", !isLoading && rows.length === 0 && "flex-1")}>
      {pendingIncoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">คำขอให้คุณรับเวรแทน ({pendingIncoming.length})</p>
          <div className="space-y-2">
            {pendingIncoming.map((r) => (
              <Card key={r.id} className="flex items-center justify-between gap-2">
                <div className="text-xs">
                  <p className="font-medium">{pointName(r.duty_point_id)}</p>
                  <p className="text-muted-foreground">{r.date}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => respond.mutate({ id: r.id, accept: true })} disabled={respond.isPending}>
                    รับเวร
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respond.mutate({ id: r.id, accept: false })}
                    disabled={respond.isPending}
                  >
                    ปฏิเสธ
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className={cn("flex flex-col gap-2", !isLoading && rows.length === 0 && "flex-1")}>
        <p className="text-sm font-medium">เวรของฉัน</p>
        {isLoading && (
          <Card className="space-y-2" role="status" aria-label="กำลังโหลด">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </Card>
        )}
        {!isLoading && rows.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState title="ไม่มีเวร" description="ยังไม่มีเวรที่ได้รับมอบหมาย" />
          </div>
        )}
        {!isLoading && rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">วันที่</th>
                  <th className="px-3 py-2 font-medium">จุดเวร</th>
                  <th className="px-3 py-2 font-medium">การโอนเวร</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const req = a.id ? latestByAssignment.get(a.id) : undefined;
                  const openReq = req && (req.status === "pending_target" || req.status === "pending_admin");
                  const canRequest = !openReq && a.date >= todayIso() && (a.id !== null || a.source === "fixed");
                  return (
                    <tr key={`${a.duty_point_id}-${a.date}`} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{a.date}</td>
                      <td className="px-3 py-2 font-medium">{pointName(a.duty_point_id)}</td>
                      <td className="px-3 py-2">
                        {req && (
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px]", TRANSFER_STATUS_STYLE[req.status])}>
                            {TRANSFER_STATUS_LABEL[req.status]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {canRequest && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setTransferTarget(
                                a.id
                                  ? { kind: "real", assignmentId: a.id, pointName: pointName(a.duty_point_id), date: a.date }
                                  : {
                                      kind: "virtual",
                                      dutyPointId: a.duty_point_id,
                                      pointName: pointName(a.duty_point_id),
                                      date: a.date,
                                    },
                              )
                            }
                          >
                            ขอโอนเวร
                          </Button>
                        )}
                        {req?.status === "pending_target" && (
                          <Button size="sm" variant="outline" onClick={() => cancel.mutate(req.id)} disabled={cancel.isPending}>
                            ยกเลิก
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RequestTransferSheet
        open={transferTarget !== null}
        target={transferTarget}
        staff={staff.filter((p) => p.id !== profileId)}
        nameById={nameById}
        onClose={() => setTransferTarget(null)}
        onSubmit={(targetStaffId) => {
          if (!transferTarget) return;
          request.mutate(
            transferTarget.kind === "real"
              ? { assignmentId: transferTarget.assignmentId, requesterId: profileId, targetStaffId }
              : { dutyPointId: transferTarget.dutyPointId, date: transferTarget.date, requesterId: profileId, targetStaffId },
            {
              onSuccess: () => setTransferTarget(null),
              onError: (err) => toast(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ", "error"),
            },
          );
        }}
      />
    </div>
  );
}

type TransferTarget =
  | { kind: "real"; assignmentId: string; pointName: string; date: string }
  | { kind: "virtual"; dutyPointId: string; pointName: string; date: string };

function RequestTransferSheet({
  open,
  target,
  staff,
  nameById,
  onClose,
  onSubmit,
}: {
  open: boolean;
  target: TransferTarget | null;
  staff: { id: string }[];
  nameById: Map<string, string>;
  onClose: () => void;
  onSubmit: (targetStaffId: string) => void;
}) {
  const [targetStaffId, setTargetStaffId] = useState("");

  useEffect(() => {
    if (open) setTargetStaffId("");
  }, [open, target]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="ขอโอนเวร"
      description={target ? `${target.pointName} วันที่ ${target.date}` : undefined}
      footer={
        <Button className="w-full" disabled={!targetStaffId} onClick={() => onSubmit(targetStaffId)}>
          ส่งคำขอ
        </Button>
      }
    >
      <Select value={targetStaffId} onChange={(e) => setTargetStaffId(e.target.value)} placeholder="เลือกผู้รับเวร">
        {staff.map((p) => (
          <option key={p.id} value={p.id}>
            {nameById.get(p.id) ?? p.id}
          </option>
        ))}
      </Select>
    </Sheet>
  );
}

// ----------------------------------------------------------------- requests
function RequestsView() {
  const [status, setStatus] = useState<DutyTransferStatus | "">("pending_admin");
  const { data: requests = [], isLoading } = useDutyTransferApprovals(status);
  const { data: points = [] } = useDutyPoints();
  const nameById = useNameById("");
  const decide = useDecideDutyTransfer();

  const pointName = (id: string) => points.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">คำขอโอนเวร ({requests.length})</p>
        <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value as DutyTransferStatus | "")}>
          <option value="">ทุกสถานะ</option>
          {(Object.keys(TRANSFER_STATUS_LABEL) as DutyTransferStatus[]).map((s) => (
            <option key={s} value={s}>
              {TRANSFER_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && (
        <Card className="space-y-2" role="status" aria-label="กำลังโหลด">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card>
      )}
      {!isLoading && requests.length === 0 && <EmptyState title="ไม่มีคำขอ" />}
      {requests.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[42rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ผู้ขอโอน</th>
                <th className="px-3 py-2 font-medium">ผู้รับเวร</th>
                <th className="px-3 py-2 font-medium">จุดเวร</th>
                <th className="px-3 py-2 font-medium">วันที่</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{nameById.get(r.requester_id) ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">{nameById.get(r.target_staff_id) ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{pointName(r.duty_point_id)}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.date}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px]", TRANSFER_STATUS_STYLE[r.status])}>
                      {TRANSFER_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.status === "pending_admin" && (
                      <div className="flex gap-2">
                        <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: true })}>
                          อนุมัติ
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: r.id, approve: false })}
                        >
                          ไม่อนุมัติ
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ summary
function SummaryView({ departmentId }: { departmentId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear() + 543);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const ceYear = year - 543;
  const startDate = `${ceYear}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${ceYear}-${String(month).padStart(2, "0")}-${String(daysInMonth(ceYear, month)).padStart(2, "0")}`;
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() + 543 - i);

  const { data: assignments = [], isLoading } = useDutyAssignmentsRange(startDate, endDate);
  const { data: points = [] } = useDutyPoints();
  const { data: template = [] } = useDutyWeeklyTemplate();
  const nameById = useNameById(departmentId);

  const virtualFixed = useMemo(
    () => expandFixedDutyAssignments(points, assignments, startDate, endDate),
    [points, assignments, startDate, endDate],
  );
  const virtualRotating = useMemo(
    () => expandWeeklyTemplateAssignments(points, template, assignments, startDate, endDate),
    [points, template, assignments, startDate, endDate],
  );
  const counts = useMemo(
    () => summarizeDutyCounts([...assignments, ...virtualFixed, ...virtualRotating].filter((a) => nameById.has(a.staff_id))),
    [assignments, virtualFixed, virtualRotating, nameById],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select className="w-32" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTH_NAMES.map((name, i) => (
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

      {isLoading && (
        <Card className="space-y-2" role="status" aria-label="กำลังโหลด">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card>
      )}
      {!isLoading && counts.size === 0 && <EmptyState title="ไม่มีข้อมูล" description="ไม่มีเวรในเดือนนี้" />}
      {counts.size > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ชื่อ</th>
                <th className="px-3 py-2 text-right font-medium">จำนวนครั้งเข้าเวร</th>
              </tr>
            </thead>
            <tbody>
              {[...counts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([staffId, count]) => (
                  <tr key={staffId} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{nameById.get(staffId) ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
