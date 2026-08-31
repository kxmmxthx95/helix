import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { Button, Field, Input, Skeleton, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { assignmentStatus, useMyAssignments, useMyItemScores, useMySubmissions } from "@/hooks/useAssignments";
import { summarizeAttendance, useAttendanceRange, useMyChildren } from "@/hooks/useAttendance";
import { STARTING_SCORE, summarizeBehaviorScore, useBehaviorRecords } from "@/hooks/useBehaviorRecords";
import { useClockIn, useClockOut, useMyTimeClock } from "@/hooks/useTimeClock";
import {
  useCancelStudentLeaveRequest,
  useRequestStudentLeave,
  useStudentLeaveRequests,
} from "@/hooks/useStudentLeave";
import { useSchoolSettings } from "@/hooks/useSettings";
import {
  profileFullName,
  type AttendanceStatus,
  type StudentLeaveStatus,
  type Student,
} from "@/lib/database.types";
import { roleLabels } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/routes/Attendance";
import { bangkokTime } from "@/routes/TimeTracking";

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

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "สวัสดีตอนเช้า";
  if (hour < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

export function Dashboard() {
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const isStudent = profile?.roles.includes("student") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const { data: schoolSettings } = useSchoolSettings();
  const showClockWidget =
    !!profile && profile.roles.some((r) => schoolSettings?.time_tracking_roles.includes(r));

  if (isStudent) return profile && <StudentCharacterCard />;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="font-heading text-2xl font-semibold">
          {greeting()}{profile && `, ${profileFullName(profile)}`}
        </p>
        {profile && <p className="text-sm text-muted-foreground">{roleLabels(profile.roles)}</p>}
      </div>

      {showClockWidget && profile && (
        <QuickClockSection profileId={profile.id} departmentId={profile.department_id} />
      )}

      {myStudent && profile && <StudentLeaveSection student={myStudent} submittedBy={profile.id} />}
      {children.map(
        (child) => profile && <StudentLeaveSection key={child.id} student={child} submittedBy={profile.id} />,
      )}

      {myStudent && <AssignmentSummarySection student={myStudent} />}
      {children.map((child) => (
        <AssignmentSummarySection key={child.id} student={child} />
      ))}
      {myStudent && <AttendanceSummarySection student={myStudent} />}
      {children.map((child) => (
        <AttendanceSummarySection key={child.id} student={child} />
      ))}
      {myStudent && <BehaviorScoreSection student={myStudent} />}
      {children.map((child) => (
        <BehaviorScoreSection key={child.id} student={child} />
      ))}
    </div>
  );
}

/**
 * Godot HTML5 export (assets-src/GodotProject, see grill decision) — fixed
 * GreenNinja player, no character picker. aspect-[320/176] matches the
 * project's base viewport (project.godot window/size) so Godot's own
 * stretch/aspect="keep" letterboxes correctly instead of us guessing a height.
 */
function StudentCharacterCard() {
  return (
    <div className="-mx-3 aspect-[320/176] w-[calc(100%+1.5rem)]">
      <iframe
        src="/godot-game/index.html"
        title="สนามฝึกนินจา"
        className="h-full w-full border-0"
        allow="autoplay"
      />
    </div>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Quick access to the full workspace at /time-tracking (history, ขอออกนอกโรงเรียน, approvals). */
function QuickClockSection({ profileId, departmentId }: { profileId: string; departmentId: string | null }) {
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
    <section>
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลด">
          <Skeleton className="h-4 w-56" />
        </div>
      ) : (
        <p className="text-sm">
          เวลาทำงานวันนี้ —{" "}
          {record?.clock_in_time ? (
            <>
              เข้างานเวลา <strong className="font-semibold">{bangkokTime(record.clock_in_time)}</strong>
              {record.clock_out_time && (
                <>
                  {" "}
                  ออกงานเวลา <strong className="font-semibold">{bangkokTime(record.clock_out_time)}</strong>
                </>
              )}
            </>
          ) : (
            "ยังไม่ได้บันทึกเวลาเข้างาน"
          )}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          disabled={!!record?.clock_in_time || clockIn.isPending}
          onClick={onClockIn}
        >
          {clockIn.isPending ? <Spinner className="h-3.5 w-3.5" /> : "เข้างาน"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!record?.clock_in_time || !!record?.clock_out_time || clockOut.isPending}
          onClick={onClockOut}
        >
          {clockOut.isPending ? <Spinner className="h-3.5 w-3.5" /> : "ออกงาน"}
        </Button>
        <button
          type="button"
          className="tappable ml-auto text-xs text-accent underline"
          onClick={() => navigate("/time-tracking")}
        >
          ดูทั้งหมด
        </button>
      </div>
    </section>
  );
}

/** role="student"/"parent" only — full to-do list + submit flow lives at /assignments. */
function AssignmentSummarySection({ student }: { student: Student }) {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useMyAssignments(student.id);
  const { data: scores } = useMyItemScores(student.id);
  const { data: submissions } = useMySubmissions(student.id);

  const counts = { missing: 0, submitted: 0, late: 0, graded: 0 };
  for (const item of items) {
    counts[assignmentStatus(item, submissions?.get(item.id) ?? null, scores?.has(item.id) ?? false)]++;
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          งานของ {student.first_name} {student.last_name}
        </p>
        <button type="button" className="tappable text-xs text-accent underline" onClick={() => navigate("/assignments")}>
          ดูทั้งหมด
        </button>
      </div>
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลด">
          <Skeleton className="mt-1 h-4 w-48" />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">ยังไม่มีงาน</p>
      ) : (
        <p className="mt-1 text-sm">
          <strong className="font-semibold">{counts.missing + counts.late}</strong> ยังไม่ส่ง ·{" "}
          <strong className="font-semibold">{counts.submitted}</strong> ส่งแล้ว ·{" "}
          <strong className="font-semibold">{counts.graded}</strong> ตรวจแล้ว
        </p>
      )}
    </section>
  );
}

/** role="student"/"parent" only — teacher/admin get the full check-in workspace at /attendance instead. */
function AttendanceSummarySection({ student }: { student: Student }) {
  const { start, end } = currentMonthRange();
  const { data: records = [], isLoading } = useAttendanceRange({
    studentId: student.id,
    startDate: start,
    endDate: end,
  });
  const counts = summarizeAttendance(records);

  return (
    <section>
      <p className="text-sm text-muted-foreground">
        การมาเรียนของ {student.first_name} {student.last_name} · {MONTH_LABEL}
      </p>
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลด">
          <Skeleton className="mt-1 h-4 w-40" />
        </div>
      ) : (
        <p className="mt-1 text-sm">
          {STATUS_ORDER.map((st, i) => (
            <span key={st}>
              {i > 0 && " · "}
              <strong className="font-semibold">{counts[st]}</strong> {STATUS_LABEL[st]}
            </span>
          ))}{" "}
          วัน
        </p>
      )}
    </section>
  );
}

/** role="student"/"parent" only — teacher/admin get the roster workspace at /behavior instead. */
function BehaviorScoreSection({ student }: { student: Student }) {
  const { start, end } = currentAcademicYearRange();
  const { data: records = [], isLoading } = useBehaviorRecords({
    studentId: student.id,
    startDate: start,
    endDate: end,
  });
  const score = summarizeBehaviorScore(records);

  return (
    <section>
      <p className="text-sm text-muted-foreground">
        คะแนนพฤติกรรมของ {student.first_name} {student.last_name}
      </p>
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลด">
          <Skeleton className="mt-1 h-4 w-32" />
        </div>
      ) : (
        <p className={cn("mt-1 text-sm", score < STARTING_SCORE ? "text-destructive" : "text-success")}>
          <strong className="text-lg font-semibold">{score}</strong> จาก {STARTING_SCORE} คะแนน
        </p>
      )}
    </section>
  );
}

/** role="student"/"parent" only — teacher/admin approve these at Attendance.tsx's "คำขอลา" view instead. */
function StudentLeaveSection({ student, submittedBy }: { student: Student; submittedBy: string }) {
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
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          การลาของ {student.first_name} {student.last_name}
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          + ขอลา
        </Button>
      </div>

      {isLoading && (
        <ul className="divide-y divide-border" role="status" aria-label="กำลังโหลด">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </li>
          ))}
        </ul>
      )}
      {!isLoading && requests.length === 0 && (
        <p className="text-sm">ยังไม่มีคำขอลา</p>
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
    </section>
  );
}
