import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Character, GAME_TEXT, GameFrame, GameIcon, useArt } from "@/components/game/parts";
import { AirplaneIcon, BookIcon, CalendarIcon, CheckmarkCircleIcon, ClipboardIcon, DocumentTextIcon, RibbonIcon, SettingsIcon, TimetableIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Avatar } from "@/components/ui";
import { useActiveTerm } from "@/hooks/useAcademicTerms";
import { assignmentStatus, useMyAssignments, useMyItemScores, useMySubmissions } from "@/hooks/useAssignments";
import { summarizeAttendance, useAttendanceRange } from "@/hooks/useAttendance";
import { avatarUrl } from "@/hooks/useAvatar";
import { STARTING_SCORE, summarizeBehaviorScore, useBehaviorRecords } from "@/hooks/useBehaviorRecords";
import { profileFullName } from "@/lib/database.types";
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
  { to: "/documents", name: "nav-documents", label: "เอกสาร", icon: DocumentTextIcon },
] as const;

function Stat({ iconName, icon, value }: { iconName: string; icon: typeof BookIcon; value: string }) {
  return (
    <div className="flex h-9 flex-1 items-center justify-center gap-1.5">
      <GameIcon name={iconName} fallback={icon} className="h-8 w-8 shrink-0 drop-shadow" />
      <span className={`font-game text-base font-bold ${GAME_TEXT}`}>{value}</span>
    </div>
  );
}

function SideSign({ name, label, icon, onClick }: { name: string; label: string; icon: typeof BookIcon; onClick: () => void }) {
  return (
    <GameFrame kind="sign" as="button" type="button" onClick={onClick} className="tappable flex w-[4.5rem] flex-col items-center gap-0.5 px-1 py-1.5">
      <GameIcon name={name} fallback={icon} className="h-11 w-11 drop-shadow" />
      <span className={`font-game text-[11px] font-bold ${GAME_TEXT}`}>{label}</span>
    </GameFrame>
  );
}

function RoundBtn({ name, label, icon, onClick }: { name: string; label: string; icon: typeof BookIcon; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tappable flex flex-col items-center gap-1">
      <GameFrame kind="sign" className="flex h-16 w-16 items-center justify-center rounded-full">
        <GameIcon name={name} fallback={icon} className="h-11 w-11 drop-shadow" />
      </GameFrame>
      <GameFrame kind="sign" className="px-3 py-0.5">
        <span className={`font-game text-sm font-bold ${GAME_TEXT}`}>{label}</span>
      </GameFrame>
    </button>
  );
}

function ModeCard({
  name,
  icon,
  label,
  badge,
  tone,
  className,
  onClick,
  art: artName,
}: {
  name: string;
  icon: typeof BookIcon;
  label: string;
  badge?: number;
  tone: string;
  className?: string;
  onClick: () => void;
  /** public/game/{art}.webp scene (no text); gradient `tone` shows until it loads. */
  art: string;
}) {
  const art = useArt(artName);
  return (
    <button
      type="button"
      onClick={onClick}
      style={art ? { backgroundImage: `url(/game/${artName}.webp)`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      className={`tappable relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-white/70 shadow-[inset_0_0_18px_rgba(255,255,255,0.35)] ${art ? "" : tone} ${className ?? ""}`}
    >
      <GameIcon name={name} fallback={icon} className="h-[40%] max-h-28 min-h-12 drop-shadow-lg" />
      <span
        className={`font-game text-2xl font-bold ${art ? "text-[#2b0f3a] [text-shadow:0_1px_0_rgb(255_255_255/0.8)]" : "text-white [text-shadow:0_2px_0_rgb(43_15_58)]"}`}
      >
        {label}
      </span>
      {badge ? (
        <span className="absolute right-2 top-2 rounded-full border-2 border-white bg-[#ee2b8c] px-2 font-game text-sm font-bold text-white">{badge}</span>
      ) : null}
    </button>
  );
}

function DockIcon({ name, label, icon, onClick }: { name: string; label: string; icon: typeof BookIcon; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tappable flex w-20 flex-col items-center gap-0.5">
      <GameIcon name={name} fallback={icon} className="h-14 w-14 drop-shadow-lg" />
      <span className={`font-game text-sm font-bold ${GAME_TEXT}`}>{label}</span>
    </button>
  );
}

export function GameHome() {
  const { profile, myStudent } = useAuth();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel | null>(null);

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

  let termPct: number | null = null;
  if (term?.start_date && term.end_date) {
    const total = Date.parse(term.end_date) - Date.parse(term.start_date);
    termPct = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - Date.parse(term.start_date)) / total) * 100)) : null;
  }

  const name = myStudent ? `${myStudent.first_name} ${myStudent.last_name}` : profile ? profileFullName(profile) : "";

  return (
    <>
    <div className="flex min-h-full flex-1 flex-col gap-3 pt-2 min-[431px]:landscape:hidden">
      <GameFrame kind="hud" className="flex flex-col gap-2 px-2 py-2">
        <div className="flex items-center gap-1">
          {profile && <Avatar name={profileFullName(profile)} src={avatarUrl(profile)} className="h-10 w-10 shrink-0 border-2 border-white/70" />}
          <Stat iconName="nav-behavior" icon={RibbonIcon} value={`${summarizeBehaviorScore(behavior)}/${STARTING_SCORE}`} />
          <Stat iconName="nav-attendance" icon={CheckmarkCircleIcon} value={attendancePct} />
          <Stat iconName="tab-assignments" icon={BookIcon} value={String(pending)} />
          <button type="button" aria-label="โปรไฟล์" onClick={() => navigate("/profile")} className="tappable shrink-0 px-1">
            <SettingsIcon className="h-4 text-white [.game-art_&]:text-[#2b0f3a]" />
          </button>
        </div>
        {term && (
          <div className="px-1">
            <p className={`font-game text-sm font-bold ${GAME_TEXT}`}>
              ปีการศึกษา {term.academic_year} · {term.term_type === "term1" ? "ภาคเรียน 1" : term.term_type === "term2" ? "ภาคเรียน 2" : "ภาคฤดูร้อน"}
            </p>
            {termPct !== null && (
              <div className="mt-1 h-2.5 overflow-hidden rounded-full border border-white/40 bg-[#2b0f3a]/60">
                <div className="h-full rounded-full bg-gradient-to-r from-[#ff8fc0] to-[#ffc83d] shadow-[0_0_8px_#ffc83d]" style={{ width: `${termPct}%` }} />
              </div>
            )}
          </div>
        )}
      </GameFrame>

      <div className="grid flex-1 grid-cols-[auto_1fr_auto] gap-1">
        <div className="flex flex-col justify-center gap-3">
          {SIDE_LEFT.map(({ panel: p, name, label, icon }) => (
            <SideSign key={p} name={name} label={label} icon={icon} onClick={() => setPanel(p)} />
          ))}
        </div>

        <div className="flex flex-col items-center justify-end">
          <Character />
          <GameFrame kind="sign" className="mt-1 px-4 py-1">
            <p className={`font-game text-lg font-bold ${GAME_TEXT}`}>{name}</p>
          </GameFrame>
        </div>

        <div className="flex flex-col justify-center gap-3">
          {SIDE_RIGHT.map(({ to, name, label, icon }) => (
            <SideSign key={to} name={name} label={label} icon={icon} onClick={() => navigate(to)} />
          ))}
        </div>
      </div>

      <GameFrame
        kind="button"
        as="button"
        type="button"
        onClick={() => navigate("/assignments")}
        className="tappable mx-auto mb-2 w-64 py-2 text-center font-game text-xl font-bold text-[#2b0f3a]"
      >
        {pending > 0 ? `ทำงานที่ค้าง (${pending})` : "ดูงานทั้งหมด"}
      </GameFrame>
    </div>

    <div className="relative hidden min-h-full flex-1 min-[431px]:landscape:block">
      <button
        type="button"
        onClick={() => navigate("/profile")}
        className="tappable absolute left-0 top-3 flex items-center gap-2"
      >
        <GameFrame kind="sign" className="flex items-center gap-3 py-1 pl-1 pr-5 text-left">
          {profile && <Avatar name={profileFullName(profile)} src={avatarUrl(profile)} className="h-14 w-14 border-2 border-white/70" />}
          <span className={`flex flex-col font-game font-bold ${GAME_TEXT}`}>
            <span className="text-lg leading-tight">{name}</span>
            {myStudent && <span className="text-xs opacity-90">รหัส {myStudent.student_code}</span>}
          </span>
        </GameFrame>
      </button>

      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 gap-3">
        {[
          { iconName: "nav-behavior", icon: RibbonIcon, value: `${summarizeBehaviorScore(behavior)}/${STARTING_SCORE}` },
          { iconName: "nav-attendance", icon: CheckmarkCircleIcon, value: attendancePct },
          { iconName: "tab-assignments", icon: BookIcon, value: String(pending) },
        ].map((st) => (
          <GameFrame key={st.iconName} kind="sign" className="flex h-12 w-40 items-center gap-2 rounded-full pl-1 pr-4">
            <GameIcon name={st.iconName} fallback={st.icon} className="h-10 w-10 shrink-0 drop-shadow" />
            <span className={`flex-1 text-center font-game text-lg font-bold ${GAME_TEXT}`}>{st.value}</span>
          </GameFrame>
        ))}
      </div>

      <button type="button" aria-label="โปรไฟล์" onClick={() => navigate("/profile")} className="tappable absolute right-0 top-3">
        <GameFrame kind="sign" className="flex h-12 w-12 items-center justify-center rounded-full">
          <SettingsIcon className="h-5 text-white [.game-art_&]:text-[#2b0f3a]" />
        </GameFrame>
      </button>

      <div className="absolute left-0 top-1/2 flex -translate-y-1/2 flex-col gap-6">
        {SIDE_LEFT.slice(0, 2).map(({ panel: p, name: n, label, icon }) => (
          <RoundBtn key={p} name={n} label={label} icon={icon} onClick={() => setPanel(p)} />
        ))}
      </div>

      <div className="absolute bottom-3 left-[14%] flex flex-col items-center gap-1">
        <Character />
        <GameFrame kind="sign" className="px-5 py-1">
          <p className={`font-game text-base font-bold ${GAME_TEXT}`}>
            {term
              ? `ปีการศึกษา ${term.academic_year} · ${term.term_type === "term1" ? "ภาคเรียน 1" : term.term_type === "term2" ? "ภาคเรียน 2" : "ภาคฤดูร้อน"}${termPct !== null ? ` · ${Math.round(termPct)}%` : ""}`
              : name}
          </p>
        </GameFrame>
      </div>

      <GameFrame kind="hud" className="absolute right-0 top-[17%] h-[56%] w-[46%] p-2">
        <div className="grid h-full grid-cols-2 grid-rows-[3fr_2fr] gap-2">
          <ModeCard art="card-assignments" name="tab-assignments" icon={ClipboardIcon} label="งาน" badge={pending} tone="bg-gradient-to-br from-[#ffd95a] to-[#ff8a3d]" onClick={() => navigate("/assignments")} />
          <ModeCard art="card-exams" name="tab-exams" icon={DocumentTextIcon} label="สอบ" tone="row-span-2 bg-gradient-to-b from-[#ff8fc0] to-[#b04ad8]" onClick={() => navigate("/exams")} />
          <ModeCard art="card-timetable" name="tab-timetable" icon={TimetableIcon} label="ตารางเรียน" tone="bg-gradient-to-br from-[#8fd3ff] to-[#6a7bff]" onClick={() => navigate("/timetable")} />
        </div>
      </GameFrame>

      <div className="absolute bottom-3 right-0 flex gap-4">
        <DockIcon name={SIDE_RIGHT[0].name} label={SIDE_RIGHT[0].label} icon={SIDE_RIGHT[0].icon} onClick={() => navigate(SIDE_RIGHT[0].to)} />
        <DockIcon name={SIDE_LEFT[2].name} label={SIDE_LEFT[2].label} icon={SIDE_LEFT[2].icon} onClick={() => setPanel("leave")} />
        <DockIcon name={SIDE_RIGHT[1].name} label={SIDE_RIGHT[1].label} icon={SIDE_RIGHT[1].icon} onClick={() => navigate(SIDE_RIGHT[1].to)} />
        <DockIcon name={SIDE_RIGHT[2].name} label={SIDE_RIGHT[2].label} icon={SIDE_RIGHT[2].icon} onClick={() => navigate(SIDE_RIGHT[2].to)} />
      </div>
    </div>

      <Sheet open={panel !== null} onOpenChange={(o) => !o && setPanel(null)} title={SIDE_LEFT.find((s) => s.panel === panel)?.label ?? ""}>
        {myStudent && profile && panel === "attendance" && <AttendanceSummarySection student={myStudent} />}
        {myStudent && profile && panel === "behavior" && <BehaviorScoreSection student={myStudent} />}
        {myStudent && profile && panel === "leave" && <StudentLeaveSection student={myStudent} submittedBy={profile.id} />}
      </Sheet>
    </>
  );
}
