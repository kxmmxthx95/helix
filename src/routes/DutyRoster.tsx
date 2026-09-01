import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { X } from "@/components/icons";
import { Button, Card, EmptyState, Input, Select, Skeleton } from "@/components/ui";
import { useAcademicEvents } from "@/hooks/useAcademicTerms";
import {
  summarizeDutyCounts,
  useAssignDuty,
  useCancelDutyTransfer,
  useDecideDutyTransfer,
  useDutyAssignmentsRange,
  useDutyPoints,
  useDutyTransferApprovals,
  useIncomingDutyTransfers,
  useMyDutyTransferRequests,
  useRemoveDutyAssignment,
  useRequestDutyTransfer,
  useRespondDutyTransfer,
} from "@/hooks/useDutyRoster";
import { useDepartments, useProfiles } from "@/hooks/useProfiles";
import { profileFullName, type DutyTransferRequest, type DutyTransferStatus } from "@/lib/database.types";
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

type View = "assign" | "mine" | "requests" | "summary";

export function DutyRoster() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>("mine");
  const [departmentId, setDepartmentId] = useState("");
  const { data: departments = [] } = useDepartments();

  if (!profile) return null;
  const mayManage = canManage(profile.roles);
  const orgWide = isOrgWide(profile.roles);

  return (
    <div className="page-fill">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-48" value={view} onChange={(e) => setView(e.target.value as View)}>
          <option value="mine">เวรของฉัน</option>
          {mayManage && <option value="assign">จัดตารางเวร</option>}
          {mayManage && <option value="requests">คำขอโอนเวร</option>}
          {mayManage && <option value="summary">สรุปรายเดือน</option>}
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

// ------------------------------------------------------------------- assign
function AssignView({ departmentId, createdBy }: { departmentId: string; createdBy: string }) {
  const [date, setDate] = useState(todayIso());
  const { data: points = [], isLoading: pointsLoading } = useDutyPoints();
  const { data: assignments = [], isLoading: assignmentsLoading } = useDutyAssignmentsRange(date, date);
  const { data: events = [] } = useAcademicEvents();
  const staff = useEligibleStaff(departmentId);
  const nameById = useNameById(departmentId);

  const activePoints = points.filter((p) => p.active);
  const isLoading = pointsLoading || assignmentsLoading;
  const isHoliday = events.some(
    (e) => !e.staff_attend && e.departmentIds.length === 0 && date >= e.start_date && date <= e.end_date,
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
        <EmptyState title="ยังไม่มีจุดเวร" description="เพิ่มจุดเวรได้ที่ ตั้งค่าระบบ > จุดเวร" />
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
}: {
  pointId: string;
  pointName: string;
  date: string;
  assignments: { id: string; staff_id: string }[];
  staff: { id: string }[];
  nameById: Map<string, string>;
  createdBy: string;
}) {
  const toast = useToast();
  const assign = useAssignDuty();
  const remove = useRemoveDutyAssignment();
  const [picked, setPicked] = useState("");

  const assignedIds = new Set(assignments.map((a) => a.staff_id));
  const options = staff.filter((p) => !assignedIds.has(p.id));

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

  return (
    <Card className="space-y-2">
      <p className="text-sm font-medium">{pointName}</p>
      <div className="flex flex-wrap gap-1.5">
        {assignments.length === 0 && <span className="text-xs text-muted-foreground">ยังไม่มีคนเข้าเวร</span>}
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
      {options.length > 0 && (
        <div className="flex gap-2">
          <Select className="w-56" value={picked} onChange={(e) => setPicked(e.target.value)} placeholder="เพิ่มคนเข้าเวร">
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
      )}
    </Card>
  );
}

// --------------------------------------------------------------------- mine
function MineView({ profileId }: { profileId: string }) {
  const toast = useToast();
  const start = addDays(todayIso(), -30);
  const end = addDays(todayIso(), 60);
  const { data: assignments = [], isLoading } = useDutyAssignmentsRange(start, end, profileId);
  const { data: incoming = [] } = useIncomingDutyTransfers(profileId);
  const { data: myRequests = [] } = useMyDutyTransferRequests(profileId);
  const { data: points = [] } = useDutyPoints();
  const staff = useEligibleStaff("");
  const nameById = useNameById("");
  const respond = useRespondDutyTransfer();
  const cancel = useCancelDutyTransfer();
  const request = useRequestDutyTransfer();
  const [transferTarget, setTransferTarget] = useState<{ assignmentId: string; pointName: string; date: string } | null>(
    null,
  );

  const pointName = (id: string) => points.find((p) => p.id === id)?.name ?? "—";
  const pendingIncoming = incoming.filter((r) => r.status === "pending_target");

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
    <div className={cn("flex flex-col gap-4", !isLoading && assignments.length === 0 && "flex-1")}>
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

      <div className={cn("flex flex-col gap-2", !isLoading && assignments.length === 0 && "flex-1")}>
        <p className="text-sm font-medium">เวรของฉัน</p>
        {isLoading && (
          <Card className="space-y-2" role="status" aria-label="กำลังโหลด">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </Card>
        )}
        {!isLoading && assignments.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState title="ไม่มีเวร" description="ยังไม่มีเวรที่ได้รับมอบหมาย" />
          </div>
        )}
        {!isLoading && assignments.length > 0 && (
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
                {assignments.map((a) => {
                  const req = latestByAssignment.get(a.id);
                  const openReq = req && (req.status === "pending_target" || req.status === "pending_admin");
                  const canRequest = !openReq && a.date >= todayIso();
                  return (
                    <tr key={a.id} className="border-t border-border">
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
                              setTransferTarget({ assignmentId: a.id, pointName: pointName(a.duty_point_id), date: a.date })
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
            { assignmentId: transferTarget.assignmentId, requesterId: profileId, targetStaffId },
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

function RequestTransferSheet({
  open,
  target,
  staff,
  nameById,
  onClose,
  onSubmit,
}: {
  open: boolean;
  target: { assignmentId: string; pointName: string; date: string } | null;
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
  const nameById = useNameById(departmentId);

  const counts = useMemo(
    () => summarizeDutyCounts(assignments.filter((a) => nameById.has(a.staff_id))),
    [assignments, nameById],
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
