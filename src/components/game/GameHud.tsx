import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Character, GAME_TEXT, GameFrame, GameIcon } from "@/components/game/parts";
import {
  AirplaneIcon,
  BookIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckmarkCircleIcon,
  ClipboardIcon,
  DocumentTextIcon,
  GraduationCap,
  RibbonIcon,
  TimetableIcon,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Avatar } from "@/components/ui";
import { useActiveTerm } from "@/hooks/useAcademicTerms";
import { assignmentStatus, useMyAssignments, useMyItemScores, useMySubmissions } from "@/hooks/useAssignments";
import { summarizeAttendance, useAttendanceRange } from "@/hooks/useAttendance";
import { avatarUrl } from "@/hooks/useAvatar";
import { STARTING_SCORE, summarizeBehaviorScore, useBehaviorRecords } from "@/hooks/useBehaviorRecords";
import { profileFullName } from "@/lib/database.types";
import { deriveBadges, expFromCounts, levelFromExp, rankFromExp } from "@/lib/exp";
import { supabase } from "@/lib/supabase";
import {
  AttendanceSummarySection,
  BehaviorScoreSection,
  StudentLeaveSection,
  currentAcademicYearRange,
  currentMonthRange,
} from "@/routes/Dashboard";

type Icon = typeof BookIcon;
type Panel = "attendance" | "behavior" | "leave" | "bag";

/** Every student feature, one tap from the HUD. `to` = route window, `panel` = Sheet over the home. */
export const MENU: readonly ({ name: string; label: string; icon: Icon } & ({ to: string; panel?: never } | { panel: Panel; to?: never }))[] = [
  { to: "/assignments", name: "tab-assignments", label: "งาน", icon: ClipboardIcon },
  { to: "/exams", name: "tab-exams", label: "สอบ", icon: DocumentTextIcon },
  { to: "/timetable", name: "tab-timetable", label: "ตารางเรียน", icon: TimetableIcon },
  { to: "/academic-events", name: "nav-calendar", label: "ปฏิทิน", icon: CalendarIcon },
  { to: "/practice", name: "nav-practice", label: "แบบฝึกหัด", icon: BookIcon },
  { to: "/documents", name: "nav-documents", label: "เอกสาร", icon: DocumentTextIcon },
  { to: "/profile", name: "tab-profile", label: "โปรไฟล์", icon: GraduationCap },
  { panel: "attendance", name: "nav-attendance", label: "เช็คชื่อ", icon: CheckmarkCircleIcon },
  { panel: "behavior", name: "nav-behavior", label: "พฤติกรรม", icon: RibbonIcon },
  { panel: "leave", name: "nav-leave", label: "ลา", icon: AirplaneIcon },
  { panel: "bag", name: "nav-bag", label: "กระเป๋า", icon: BriefcaseIcon },
];

function Stat({ iconName, icon, value }: { iconName: string; icon: Icon; value: string }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-1">
      <GameIcon name={iconName} fallback={icon} className="h-7 w-7 shrink-0 drop-shadow" />
      <span className={`font-game text-base font-bold ${GAME_TEXT}`}>{value}</span>
    </div>
  );
}

/** Lifetime counts for the caller only (RPC resolves the student from auth.uid()). */
function useLifetimeExp() {
  return useQuery({
    queryKey: ["student_lifetime_exp"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("student_lifetime_exp");
      if (error) throw error;
      return data[0];
    },
  });
}

function Inventory({ badges, rank, exp }: { badges: ReturnType<typeof deriveBadges>; rank: ReturnType<typeof rankFromExp>; exp: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-[#fff0f7] p-3">
        <GameIcon name={`rank-${rank.id}`} fallback={RibbonIcon} className="h-12 w-12 shrink-0" />
        <div className="leading-relaxed">
          <p className="text-xs text-[#6b2a8a]">แรงก์สะสมตลอดการเรียน</p>
          <p className="text-lg font-bold">{rank.label}</p>
          <p className="text-xs">{exp.toLocaleString()} EXP</p>
        </div>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {badges.map((b) => (
          <li
            key={b.id}
            aria-label={`${b.label} ${b.unlocked ? "ปลดล็อกแล้ว" : "ยังไม่ปลดล็อก"}`}
            className={`flex min-h-[6.5rem] flex-col items-center justify-start gap-1 rounded-2xl border-2 p-2 text-center ${b.unlocked ? "border-[#ffc83d] bg-[#fff8dc]" : "border-black/10 bg-black/5 opacity-60 grayscale"}`}
          >
            <GameIcon name={`badge-${b.id}`} fallback={RibbonIcon} className="h-10 w-10" />
            <span className="text-xs font-bold leading-snug">{b.label}</span>
            <span className="text-[11px] leading-snug text-black/60">{b.unlocked ? "ปลดล็อกแล้ว" : b.progress ? `${b.progress.now}/${b.progress.goal}` : b.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Home screen: mascot on the shell background + the HUD (status, EXP-style term bar, quick menu). */
export function GameHud() {
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
  const termRange = term?.start_date && term.end_date ? { start: term.start_date, end: term.end_date } : year;
  const { data: termAttendance = [] } = useAttendanceRange({ studentId: studentId ?? "", startDate: termRange.start, endDate: termRange.end });
  const { data: termBehavior = [] } = useBehaviorRecords({ studentId: studentId ?? "", startDate: termRange.start, endDate: termRange.end });
  const { data: life } = useLifetimeExp();

  const counts = summarizeAttendance(attendance);
  const days = attendance.length;
  const attendancePct = days ? `${Math.round(((counts.present + counts.late) / days) * 100)}%` : "-";
  const pending = items.filter((item) => {
    const st = assignmentStatus(item, submissions?.get(item.id) ?? null, scores?.has(item.id) ?? false);
    return st === "missing" || st === "late";
  }).length;

  let onTime = 0;
  let late = 0;
  let submissionsInTerm = 0;
  for (const sub of submissions?.values() ?? []) {
    const day = sub.submitted_at.slice(0, 10);
    if (day < termRange.start || day > termRange.end) continue;
    submissionsInTerm++;
    const due = items.find((i) => i.id === sub.score_item_id)?.due_date;
    if (due && day > due) late++;
    else onTime++;
  }
  const termCounts = summarizeAttendance(termAttendance);
  const behaviorRemaining = summarizeBehaviorScore(termBehavior);
  const termExp = expFromCounts({ onTime, late, present: termCounts.present, lateArrival: termCounts.late, behaviorRemaining });
  const lvl = levelFromExp(termExp);
  const lifeExp = life
    ? expFromCounts({
        onTime: life.sub_on_time,
        late: life.sub_late,
        present: life.att_present,
        lateArrival: life.att_late,
        behaviorRemaining: STARTING_SCORE + life.behavior_points, // ponytail: one 100 for all years; per-year if ranks need to reward each clean year
      })
    : termExp;
  const badges = deriveBadges({
    submissions: life ? life.sub_on_time + life.sub_late : submissionsInTerm,
    level: levelFromExp(Math.max(termExp, lifeExp)).level,
    monthAttendance: counts,
    behaviorRemaining,
    behaviorStart: STARTING_SCORE,
  });

  let termPct: number | null = null;
  if (term?.start_date && term.end_date) {
    const total = Date.parse(term.end_date) - Date.parse(term.start_date);
    termPct = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - Date.parse(term.start_date)) / total) * 100)) : null;
  }

  const name = myStudent ? `${myStudent.first_name} ${myStudent.last_name}` : profile ? profileFullName(profile) : "";

  return (
    <>
      <div className="flex min-h-0 flex-1 items-end justify-center overflow-hidden pt-safe">
        <Character />
      </div>

      <GameFrame kind="hud" className="mx-auto mb-[max(0.5rem,env(safe-area-inset-bottom))] flex w-full max-w-2xl shrink-0 flex-col gap-2 px-2 py-2">
        <div className="flex items-center gap-2">
          {profile && <Avatar name={profileFullName(profile)} src={avatarUrl(profile)} className="h-11 w-11 shrink-0 border-2 border-[#ffc83d]" />}
          <div className={`min-w-0 flex-1 font-game font-bold leading-tight ${GAME_TEXT}`}>
            <p className="truncate text-base">{name}</p>
            {myStudent && <p className="text-xs opacity-90">รหัส {myStudent.student_code}</p>}
          </div>
          <Stat iconName="nav-behavior" icon={RibbonIcon} value={`${summarizeBehaviorScore(behavior)}/${STARTING_SCORE}`} />
          <Stat iconName="nav-attendance" icon={CheckmarkCircleIcon} value={attendancePct} />
        </div>

        <div role="progressbar" aria-label="EXP" aria-valuemin={0} aria-valuemax={lvl.span} aria-valuenow={lvl.into}>
          <div className={`flex items-center gap-2 font-game text-sm font-bold ${GAME_TEXT}`}>
            <span className="rounded-full border-2 border-[#fff3b0] bg-[#ee2b8c] px-2 leading-6">Lv.{lvl.level}</span>
            <span className="flex-1 text-xs">
              EXP {lvl.into}/{lvl.span}
            </span>
            <span className="text-xs">อีก {lvl.next} ถึงเลเวลถัดไป</span>
          </div>
          <div className="mt-0.5 h-4 overflow-hidden rounded-full border-2 border-[#fff3b0] bg-[#2b0f3a]/60">
            <div className="h-full rounded-full bg-gradient-to-r from-[#ffe58a] to-[#ffb43d] shadow-[0_0_8px_#ffc83d] transition-[width] motion-reduce:transition-none" style={{ width: `${(lvl.into / lvl.span) * 100}%` }} />
          </div>
        </div>
        {term && (
          <p className={`font-game text-[11px] leading-snug opacity-80 ${GAME_TEXT}`}>
            ปีการศึกษา {term.academic_year} · {term.term_type === "term1" ? "ภาคเรียน 1" : term.term_type === "term2" ? "ภาคเรียน 2" : "ภาคฤดูร้อน"}
            {termPct !== null && ` · ผ่านไป ${Math.round(termPct)}%`}
          </p>
        )}

        <nav aria-label="เมนูลัด" className="grid grid-cols-5 gap-1.5">
          {MENU.map(({ to, panel: p, name: n, label, icon }) => (
            <GameFrame
              key={label}
              kind="sign"
              as="button"
              type="button"
              onClick={() => (to ? navigate(to) : setPanel(p ?? null))}
              className="tappable relative flex min-h-[4.25rem] flex-col items-center justify-center gap-0.5 px-0.5 py-1"
            >
              <GameIcon name={n} fallback={icon} className="h-9 w-9 drop-shadow" />
              <span className={`font-game text-[11px] font-bold leading-tight ${GAME_TEXT}`}>{label}</span>
              {to === "/assignments" && pending > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full border-2 border-white bg-[#ee2b8c] px-1 text-center font-game text-xs font-bold leading-4 text-white">{pending}</span>
              )}
            </GameFrame>
          ))}
        </nav>
      </GameFrame>

      <Sheet open={panel !== null} onOpenChange={(o) => !o && setPanel(null)} title={MENU.find((m) => m.panel === panel)?.label ?? ""}>
        {myStudent && profile && panel === "attendance" && <AttendanceSummarySection student={myStudent} />}
        {myStudent && profile && panel === "behavior" && <BehaviorScoreSection student={myStudent} />}
        {myStudent && profile && panel === "leave" && <StudentLeaveSection student={myStudent} submittedBy={profile.id} />}
        {panel === "bag" && <Inventory badges={badges} rank={rankFromExp(lifeExp)} exp={lifeExp} />}
      </Sheet>
    </>
  );
}
