import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { summarizeAttendance, useAttendanceRange, useMyChildren } from "@/hooks/useAttendance";
import { STARTING_SCORE, summarizeBehaviorScore, useBehaviorRecords } from "@/hooks/useBehaviorRecords";
import { useClockIn, useClockOut, useMyTimeClock } from "@/hooks/useTimeClock";
import {
  useCancelStudentLeaveRequest,
  useRequestStudentLeave,
  useStudentLeaveRequests,
} from "@/hooks/useStudentLeave";
import { useSchoolSettings } from "@/hooks/useSettings";
import type { AttendanceStatus, StudentLeaveStatus, Student } from "@/lib/database.types";
import { roleLabels } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/routes/Attendance";

const LEAVE_STATUS_LABEL: Record<StudentLeaveStatus, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิกแล้ว",
};

const LEAVE_STATUS_STYLE: Record<StudentLeaveStatus, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];
const MONTH_LABEL = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(new Date());

function currentMonthRange() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

function currentAcademicYearRange() {
  const now = new Date();
  return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
}

export function Dashboard() {
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const { data: schoolSettings } = useSchoolSettings();
  const showClockWidget =
    !!profile && profile.roles.some((r) => schoolSettings?.time_tracking_roles.includes(r));

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted-foreground">สิทธิ์การใช้งาน</p>
        <p className="text-lg font-semibold">{profile && roleLabels(profile.roles)}</p>
      </Card>

      {showClockWidget && profile && (
        <QuickClockCard profileId={profile.id} departmentId={profile.department_id} />
      )}

      {myStudent && profile && <StudentLeaveCard student={myStudent} submittedBy={profile.id} />}
      {children.map(
        (child) => profile && <StudentLeaveCard key={child.id} student={child} submittedBy={profile.id} />,
      )}

      {myStudent && <AttendanceSummaryCard student={myStudent} />}
      {children.map((child) => (
        <AttendanceSummaryCard key={child.id} student={child} />
      ))}
      {myStudent && <BehaviorScoreCard student={myStudent} />}
      {children.map((child) => (
        <BehaviorScoreCard key={child.id} student={child} />
      ))}
      {/* Stat tiles land here once the dashboard design is settled. */}
    </div>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Quick access to the full workspace at /time-tracking (history, ขอออกนอกโรงเรียน, approvals). */
function QuickClockCard({ profileId, departmentId }: { profileId: string; departmentId: string | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const date = todayIso();
  const { data: record, isLoading } = useMyTimeClock(profileId, date);
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  function onClockIn() {
    clockIn.mutate(
      { profileId, departmentId, date },
      {
        onSuccess: () => toast("บันทึกเวลาเข้างานสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  function onClockOut() {
    clockOut.mutate(
      { profileId, departmentId, date },
      {
        onSuccess: () => toast("บันทึกเวลาออกงานสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">เวลาทำงานวันนี้</p>
        <button
          type="button"
          className="tappable text-xs text-accent underline"
          onClick={() => navigate("/time-tracking")}
        >
          ดูทั้งหมด
        </button>
      </div>
      {isLoading ? (
        <Spinner className="mt-2 h-4 w-4 text-muted-foreground" />
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={!!record?.clock_in_time || clockIn.isPending}
            onClick={onClockIn}
          >
            {clockIn.isPending ? <Spinner className="h-3.5 w-3.5" /> : "เข้างาน"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={!record?.clock_in_time || !!record?.clock_out_time || clockOut.isPending}
            onClick={onClockOut}
          >
            {clockOut.isPending ? <Spinner className="h-3.5 w-3.5" /> : "ออกงาน"}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** role="student"/"parent" only — teacher/admin get the full check-in workspace at /attendance instead. */
function AttendanceSummaryCard({ student }: { student: Student }) {
  const { start, end } = currentMonthRange();
  const { data: records = [], isLoading } = useAttendanceRange({
    studentId: student.id,
    startDate: start,
    endDate: end,
  });
  const counts = summarizeAttendance(records);

  return (
    <Card>
      <p className="text-sm text-muted-foreground">
        การมาเรียนของ {student.first_name} {student.last_name} · {MONTH_LABEL}
      </p>
      {isLoading ? (
        <Spinner className="mt-2 h-4 w-4 text-muted-foreground" />
      ) : (
        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          {STATUS_ORDER.map((st) => (
            <div key={st}>
              <p className="text-lg font-semibold">{counts[st]}</p>
              <p className="text-xs text-muted-foreground">{STATUS_LABEL[st]}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** role="student"/"parent" only — teacher/admin get the roster workspace at /behavior instead. */
function BehaviorScoreCard({ student }: { student: Student }) {
  const { start, end } = currentAcademicYearRange();
  const { data: records = [], isLoading } = useBehaviorRecords({
    studentId: student.id,
    startDate: start,
    endDate: end,
  });
  const score = summarizeBehaviorScore(records);

  return (
    <Card>
      <p className="text-sm text-muted-foreground">
        คะแนนพฤติกรรมของ {student.first_name} {student.last_name}
      </p>
      {isLoading ? (
        <Spinner className="mt-2 h-4 w-4 text-muted-foreground" />
      ) : (
        <p className={cn("mt-1 text-2xl font-semibold", score < STARTING_SCORE ? "text-destructive" : "text-success")}>
          {score} <span className="text-sm font-normal text-muted-foreground">/ {STARTING_SCORE}</span>
        </p>
      )}
    </Card>
  );
}

/** role="student"/"parent" only — teacher/admin approve these at Attendance.tsx's "คำขอลา" view instead. */
function StudentLeaveCard({ student, submittedBy }: { student: Student; submittedBy: string }) {
  const toast = useToast();
  const { data: requests = [], isLoading } = useStudentLeaveRequests(student.id);
  const request = useRequestStudentLeave();
  const cancel = useCancelStudentLeaveRequest();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  function reset() {
    setStartDate("");
    setEndDate("");
    setReason("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate || !reason.trim()) return;
    request.mutate(
      { studentId: student.id, submittedBy, startDate, endDate, reason: reason.trim() },
      {
        onSuccess: () => {
          toast("ส่งคำขอลาสำเร็จ");
          reset();
          setOpen(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          การลาของ {student.first_name} {student.last_name}
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          + ขอลา
        </Button>
      </div>

      {isLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
      {!isLoading && requests.length === 0 && (
        <p className="text-xs text-muted-foreground">ยังไม่มีคำขอลา</p>
      )}
      {requests.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {requests.slice(0, 5).map((r) => {
            const cancellable = r.status === "pending";
            return (
              <li key={r.id} className="space-y-1 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {r.start_date} – {r.end_date} ({r.days} วัน)
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", LEAVE_STATUS_STYLE[r.status])}>
                    {LEAVE_STATUS_LABEL[r.status]}
                  </span>
                </div>
                {cancellable && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancel.mutate(r.id)}
                    disabled={cancel.isPending}
                  >
                    ยกเลิก
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
        title={`ขอลา — ${student.first_name} ${student.last_name}`}
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              type="submit"
              form={`request-student-leave-${student.id}`}
              className="flex-1"
              disabled={!startDate || !endDate || !reason.trim() || request.isPending}
            >
              {request.isPending ? <Spinner className="h-3 w-3" /> : "ส่งคำขอ"}
            </Button>
          </div>
        }
      >
        <form id={`request-student-leave-${student.id}`} className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="วันเริ่ม">
              <Input
                type="date"
                value={startDate}
                min={todayIso()}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </Field>
            <Field label="วันสิ้นสุด">
              <Input
                type="date"
                value={endDate}
                min={startDate || todayIso()}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="เหตุผล">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="เช่น ลาป่วย มีไข้"
            />
          </Field>
        </form>
      </Sheet>
    </Card>
  );
}
