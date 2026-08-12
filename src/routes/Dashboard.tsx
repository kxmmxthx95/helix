import { useAuth } from "@/auth/AuthProvider";
import { Card, Spinner } from "@/components/ui";
import { summarizeAttendance, useAttendanceRange, useMyChildren } from "@/hooks/useAttendance";
import { STARTING_SCORE, summarizeBehaviorScore, useBehaviorRecords } from "@/hooks/useBehaviorRecords";
import type { AttendanceStatus, Student } from "@/lib/database.types";
import { roleLabels } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/routes/Attendance";

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

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted-foreground">สิทธิ์การใช้งาน</p>
        <p className="text-lg font-semibold">{profile && roleLabels(profile.roles)}</p>
      </Card>

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
