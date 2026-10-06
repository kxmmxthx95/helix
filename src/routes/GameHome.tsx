import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Character, ClassPicker, GameIcon } from "@/components/game/parts";
import { AirplaneIcon, BookIcon, CalendarIcon, CheckmarkCircleIcon, RibbonIcon, SettingsIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Avatar } from "@/components/ui";
import { useActiveTerm } from "@/hooks/useAcademicTerms";
import { assignmentStatus, useMyAssignments, useMyItemScores, useMySubmissions } from "@/hooks/useAssignments";
import { summarizeAttendance, useAttendanceRange } from "@/hooks/useAttendance";
import { avatarUrl } from "@/hooks/useAvatar";
import { STARTING_SCORE, summarizeBehaviorScore, useBehaviorRecords } from "@/hooks/useBehaviorRecords";
import { profileFullName } from "@/lib/database.types";
import { CHARACTER_CLASSES, isCharacterClass } from "@/lib/game";
import {
  AttendanceSummarySection,
  BehaviorScoreSection,
  StudentLeaveSection,
  currentAcademicYearRange,
  currentMonthRange,
} from "@/routes/Dashboard";

type Panel = "attendance" | "behavior" | "leave";

const SIDE_LEFT = [
  { panel: "attendance", name: "nav-attendance", label: "เช็คชื่อ", icon: CheckmarkCircleIcon },
  { panel: "behavior", name: "nav-behavior", label: "พฤติกรรม", icon: RibbonIcon },
  { panel: "leave", name: "nav-leave", label: "ลา", icon: AirplaneIcon },
] as const;

const SIDE_RIGHT = [
  { to: "/academic-events", name: "nav-calendar", label: "ปฏิทิน", icon: CalendarIcon },
  { to: "/practice", name: "nav-practice", label: "แบบฝึกหัด", icon: BookIcon },
] as const;

const sideBtn =
  "tappable flex w-16 flex-col items-center gap-0.5 text-[11px] font-bold text-white [text-shadow:0_2px_0_rgb(43_15_58)]";

function StatChip({ iconName, icon, value }: { iconName: string; icon: typeof BookIcon; value: string }) {
  return (
    <div className="flex h-9 flex-1 items-center gap-1.5 rounded-full border-2 border-[#2b0f3a] bg-[#2b0f3a]/80 pl-1 pr-3 text-white">
      <GameIcon name={iconName} fallback={icon} className="h-7 w-7 shrink-0" />
      <span className="text-sm font-extrabold">{value}</span>
    </div>
  );
}

export function GameHome() {
  const { profile, myStudent } = useAuth();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const studentId = myStudent?.id ?? null;
  const month = currentMonthRange();
  const year = currentAcademicYearRange();
  const { data: attendance = [] } = useAttendanceRange({ studentId: studentId ?? "", startDate: month.start, endDate: month.end });
  const { data: behavior = [] } = useBehaviorRecords({ studentId: studentId ?? "", startDate: year.start, endDate: year.end });
  const { data: items = [] } = useMyAssignments(studentId ?? "");
  const { data: scores } = useMyItemScores(studentId ?? "");
  const { data: submissions } = useMySubmissions(studentId ?? "");
  const { data: term } = useActiveTerm(profile?.department_id ?? null);

  const counts = summarizeAttendance(attendance);
  const days = attendance.length;
  const attendancePct = days ? `${Math.round(((counts.present + counts.late) / days) * 100)}%` : "-";
  const pending = items.filter((item) => {
    const st = assignmentStatus(item, submissions?.get(item.id) ?? null, scores?.has(item.id) ?? false);
    return st === "missing" || st === "late";
  }).length;

  const cls = isCharacterClass(myStudent?.character_class ?? null) ? (myStudent!.character_class as typeof CHARACTER_CLASSES[number]["id"]) : null;
  const clsLabel = CHARACTER_CLASSES.find((c) => c.id === cls)?.label;

  let termPct: number | null = null;
  if (term?.start_date && term.end_date) {
    const total = Date.parse(term.end_date) - Date.parse(term.start_date);
    termPct = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - Date.parse(term.start_date)) / total) * 100)) : null;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col gap-3 pt-2">
      <div className="flex items-center gap-2">
        {profile && <Avatar name={profileFullName(profile)} src={avatarUrl(profile)} className="h-10 w-10 border-2 border-[#2b0f3a]" />}
        <StatChip iconName="nav-behavior" icon={RibbonIcon} value={`${summarizeBehaviorScore(behavior)}/${STARTING_SCORE}`} />
        <StatChip iconName="nav-attendance" icon={CheckmarkCircleIcon} value={attendancePct} />
        <StatChip iconName="tab-assignments" icon={BookIcon} value={String(pending)} />
        <button type="button" aria-label="โปรไฟล์" onClick={() => navigate("/profile")} className="tappable text-white">
          <SettingsIcon className="h-4" />
        </button>
      </div>

      {term && (
        <div className="rounded-2xl border-2 border-[#2b0f3a] bg-[#5b2a86]/90 px-4 py-2 text-white">
          <p className="text-sm font-extrabold">
            ปีการศึกษา {term.academic_year} · {term.term_type === "term1" ? "ภาคเรียน 1" : term.term_type === "term2" ? "ภาคเรียน 2" : "ภาคฤดูร้อน"}
          </p>
          {termPct !== null && (
            <div className="mt-1 h-2.5 overflow-hidden rounded-full border border-[#2b0f3a] bg-[#2b0f3a]/60">
              <div className="h-full bg-[#ffc83d]" style={{ width: `${termPct}%` }} />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 items-center justify-between">
        <div className="flex flex-col gap-4 rounded-2xl bg-[#2b0f3a]/40 p-2">
          {SIDE_LEFT.map(({ panel: p, name, label, icon }) => (
            <button key={p} type="button" className={sideBtn} onClick={() => setPanel(p)}>
              <GameIcon name={name} fallback={icon} className="h-12 w-12" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center">
          <Character cls={cls} prefix={myStudent?.prefix ?? null} onClick={() => !cls && setPickerOpen(true)} />
          <p className="mt-1 text-lg font-extrabold text-white [text-shadow:0_2px_0_rgb(43_15_58)]">
            {myStudent ? `${myStudent.first_name} ${myStudent.last_name}` : profile ? profileFullName(profile) : ""}
          </p>
          {clsLabel && (
            <button type="button" onClick={() => setPickerOpen(true)} className="tappable text-xs font-bold text-white/90 underline">
              {clsLabel} · เปลี่ยนอาชีพ
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-2xl bg-[#2b0f3a]/40 p-2">
          {SIDE_RIGHT.map(({ to, name, label, icon }) => (
            <button key={to} type="button" className={sideBtn} onClick={() => navigate(to)}>
              <GameIcon name={name} fallback={icon} className="h-12 w-12" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate("/assignments")}
        className="tappable mx-auto mb-2 w-64 rounded-2xl border-4 border-[#2b0f3a] bg-[#ffc83d] py-3 text-center text-xl font-extrabold text-[#2b0f3a] shadow-[0_6px_0_#b0207a]"
      >
        {pending > 0 ? `ทำงานที่ค้าง (${pending})` : "ดูงานทั้งหมด"}
      </button>

      <Sheet open={panel !== null} onOpenChange={(o) => !o && setPanel(null)} title={SIDE_LEFT.find((s) => s.panel === panel)?.label ?? ""}>
        {myStudent && profile && panel === "attendance" && <AttendanceSummarySection student={myStudent} />}
        {myStudent && profile && panel === "behavior" && <BehaviorScoreSection student={myStudent} />}
        {myStudent && profile && panel === "leave" && <StudentLeaveSection student={myStudent} submittedBy={profile.id} />}
      </Sheet>
      <ClassPicker open={pickerOpen} onOpenChange={setPickerOpen} />
    </div>
  );
}
