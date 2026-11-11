import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { GameIcon } from "@/components/game/parts";
import {
  AirplaneIcon,
  BookIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckmarkCircleIcon,
  ClipboardIcon,
  DocumentTextIcon,
  LibraryIcon,
  ListIcon,
  ProfileIcon,
  PaletteIcon,
  Search,
  TimetableIcon,
  PricetagIcon,
  RibbonIcon,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Avatar } from "@/components/ui";
import { useActiveTerm } from "@/hooks/useAcademicTerms";
import { assignmentStatus, useMyAssignments, useMyItemScores, useMySubmissions, type MyAssignment } from "@/hooks/useAssignments";
import { summarizeAttendance, useAttendanceRange } from "@/hooks/useAttendance";
import { avatarUrl } from "@/hooks/useAvatar";
import { STARTING_SCORE, summarizeBehaviorScore, useBehaviorRecords } from "@/hooks/useBehaviorRecords";
import { profileFullName } from "@/lib/database.types";
import { deriveBadges, expFromCounts, levelFromExp, rankFromExp } from "@/lib/exp";
import { useMyIslands } from "@/lib/islands";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { SubmitSheet } from "@/routes/Assignments";
import { Timetable } from "@/routes/Timetable";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { BannerUpload } from "@/components/BannerUpload";
import { BannerAdjustOverlay, useBannerAdjust } from "@/components/BannerAdjust";
import { BANNER_PRESETS, bannerBackground, bannerStyle, useBannerColors } from "@/routes/TeacherHome";
import {
  AttendanceSummarySection,
  BehaviorScoreSection,
  StudentLeaveSection,
  currentAcademicYearRange,
  currentMonthRange,
} from "@/routes/Dashboard";

type Icon = typeof BookIcon;
type Panel = "attendance" | "behavior" | "leave" | "bag" | "subjects" | "timetable";

const PANEL_TITLE: Record<Panel, string> = {
  attendance: "เช็คชื่อเข้าแถว",
  behavior: "พฤติกรรม",
  leave: "ลา",
  bag: "กระเป๋า",
  subjects: "วิชาของฉัน",
  timetable: "ตารางเรียน",
};


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
      <div className="flex items-center gap-3 rounded-[14px] bg-card p-3">
        <GameIcon name={`rank-${rank.id}`} fallback={RibbonIcon} className="h-12 w-12 shrink-0" />
        <div className="leading-relaxed">
          <p className="text-xs text-muted-foreground">แรงก์สะสมตลอดการเรียน</p>
          <p className="text-lg font-bold">{rank.label}</p>
          <p className="text-xs">{exp.toLocaleString()} EXP</p>
        </div>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {badges.map((b) => (
          <li
            key={b.id}
            aria-label={`${b.label} ${b.unlocked ? "ปลดล็อกแล้ว" : "ยังไม่ปลดล็อก"}`}
            className={`flex min-h-[6.5rem] flex-col items-center justify-start gap-1 rounded-[14px] p-2 text-center ${b.unlocked ? "bg-card ring-1 ring-warning/60" : "bg-foreground/[0.05] opacity-60 grayscale"}`}
          >
            <GameIcon name={`badge-${b.id}`} fallback={RibbonIcon} className="h-10 w-10" />
            <span className="text-xs font-bold leading-snug">{b.label}</span>
            <span className="text-[11px] leading-snug text-muted-foreground">{b.unlocked ? "ปลดล็อกแล้ว" : b.progress ? `${b.progress.now}/${b.progress.goal}` : b.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Island art ---------- */

const AREA_EMOJI: Record<string, string> = {
  thai: "📜",
  math: "📐",
  science: "🧪",
  social: "🏛️",
  health_pe: "⚽",
  art: "🎨",
  career: "🛠️",
  foreign_lang: "🗼",
  other: "🌴",
};

/** Card / tile gradient per learning area (soft, brand-adjacent). */
const AREA_GRADIENT: Record<string, string> = {
  thai: "from-[#ff8fb8] to-[#e0398a]",
  math: "from-[#8ec5ff] to-[#4b7bec]",
  science: "from-[#7be0c3] to-[#12a38a]",
  social: "from-[#ffc47a] to-[#f08a24]",
  health_pe: "from-[#a6e66f] to-[#4cb33a]",
  art: "from-[#d7a6ff] to-[#9b51e0]",
  career: "from-[#ffb199] to-[#ef5f4a]",
  foreign_lang: "from-[#8fe3f0] to-[#1fa7c9]",
  other: "from-[#c9b6ff] to-[#7a5af0]",
};
const gradientOf = (code: string) => AREA_GRADIENT[code] ?? AREA_GRADIENT.other;

/* ---------- helpers ---------- */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

/** iOS Settings-style icon square (squircle, solid colour, white glyph). */
function IconSquare({ icon: I, color, className, glyph = "h-7 w-7" }: { icon: Icon; color: string; className?: string; glyph?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-[22%] text-white shadow-sm", className)} style={{ background: color }}>
      <I className={glyph} />
    </span>
  );
}

/* ---------- Home ---------- */

/** Student home: gradient hero (next due work), stat cards, icon menu, due-work and subject carousels. */
export function GameHud() {
  const { profile, myStudent } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [battle, setBattle] = useState<MyAssignment | null>(null);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  useEffect(() => {
    if (!avatarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAvatarOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [avatarOpen]);
  const { data: departments = [] } = useDepartments();
  const { data: gradeLevels = [] } = useGradeLevels(myStudent?.department_id ?? null);
  const gradeLevel = gradeLevels.find((g) => g.id === myStudent?.grade_level_id);
  const [bannerColors, setBannerColors] = useBannerColors(profile);
  const adjust = useBannerAdjust(profile);

  const studentId = myStudent?.id ?? null;
  const month = currentMonthRange();
  const year = currentAcademicYearRange();
  const { data: attendance = [] } = useAttendanceRange({ studentId: studentId ?? "", startDate: month.start, endDate: month.end });
  const { data: items = [] } = useMyAssignments(studentId ?? "");
  const { data: scores } = useMyItemScores(studentId ?? "");
  const { data: submissions } = useMySubmissions(studentId ?? "");
  const { data: term } = useActiveTerm(profile?.department_id ?? null);
  const termRange = term?.start_date && term.end_date ? { start: term.start_date, end: term.end_date } : year;
  const { data: termAttendance = [] } = useAttendanceRange({ studentId: studentId ?? "", startDate: termRange.start, endDate: termRange.end });
  const { data: termBehavior = [] } = useBehaviorRecords({ studentId: studentId ?? "", startDate: termRange.start, endDate: termRange.end });
  const { data: life } = useLifetimeExp();
  const { islands } = useMyIslands(myStudent);

  const counts = summarizeAttendance(attendance);
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
  const rank = rankFromExp(lifeExp);
  const badges = deriveBadges({
    submissions: life ? life.sub_on_time + life.sub_late : submissionsInTerm,
    level: levelFromExp(Math.max(termExp, lifeExp)).level,
    monthAttendance: counts,
    behaviorRemaining,
    behaviorStart: STARTING_SCORE,
  });

  const menu: { label: string; icon: Icon; color: string; onClick: () => void; badge?: number }[] = [
    { label: "งาน", icon: ClipboardIcon, color: "linear-gradient(160deg,#ff7a7a,#ff3b30)", onClick: () => navigate("/assignments"), badge: pending },
    { label: "สอบ", icon: DocumentTextIcon, color: "linear-gradient(160deg,#ffb84d,#ff9500)", onClick: () => navigate("/exams") },
    { label: "ตารางเรียน", icon: TimetableIcon, color: "linear-gradient(160deg,#5ac8fa,#007aff)", onClick: () => setPanel("timetable") },
    { label: "ผังการเรียน", icon: ListIcon, color: "linear-gradient(160deg,#ff9f7a,#ff6a3d)", onClick: () => navigate("/my-curriculum") },
    { label: "แบบฝึกหัด", icon: BookIcon, color: "linear-gradient(160deg,#6ee08a,#34c759)", onClick: () => navigate("/practice") },
    { label: "ปฏิทิน", icon: CalendarIcon, color: "linear-gradient(160deg,#ff8aa8,#ff2d55)", onClick: () => navigate("/academic-events") },
    { label: "เอกสาร", icon: LibraryIcon, color: "linear-gradient(160deg,#9aa0ff,#5856d6)", onClick: () => navigate("/documents") },
    { label: "ลา", icon: AirplaneIcon, color: "linear-gradient(160deg,#6dd5e6,#32ade6)", onClick: () => setPanel("leave") },
    { label: "เช็คชื่อเข้าแถว", icon: CheckmarkCircleIcon, color: "linear-gradient(160deg,#5de0b8,#30b0a0)", onClick: () => setPanel("attendance") },
    { label: "พฤติกรรม", icon: RibbonIcon, color: "linear-gradient(160deg,#ffd45e,#ffcc00)", onClick: () => setPanel("behavior") },
    { label: "บัตรเติมเงิน", icon: PricetagIcon, color: "linear-gradient(160deg,#d58bff,#af52de)", onClick: () => navigate("/card-topup") },
    { label: "กระเป๋า", icon: BriefcaseIcon, color: "linear-gradient(160deg,#b08f6e,#8e6e53)", onClick: () => setPanel("bag") },
    { label: "โปรไฟล์", icon: ProfileIcon, color: "linear-gradient(160deg,#a8a8b0,#6e6e78)", onClick: () => navigate("/profile") },
  ];

  const shownSubjects = islands.filter((i) => {
    const q = query.trim().toLowerCase();
    return !q || i.subject.name_th.toLowerCase().includes(q) || i.subject.code.toLowerCase().includes(q);
  });

  const focusIsland = () => navigate("/assignments");

  return (
    <div className="pb-8">
      <div className="mx-auto max-w-5xl px-4 lg:px-8">
        {/* ===== Profile card (same look as the teacher home) ===== */}
        <header className="mt-4 overflow-hidden rounded-[24px] bg-card text-card-foreground shadow-card lg:mt-8">
          <div className="relative h-24 sm:h-32" style={profile ? bannerStyle(profile, bannerColors, adjust.draft ?? undefined) : bannerBackground(bannerColors)} {...adjust.dragProps}>
            {profile && (
              <>
                <BannerAdjustOverlay adjust={adjust} />
                <button
                  type="button"
                  aria-label="เปลี่ยน Cover"
                  aria-expanded={pickerOpen}
                  onClick={() => setPickerOpen((o) => !o)}
                  className={cn("absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-accent shadow-card transition-transform active:scale-95", FOCUS)}
                >
                  <PaletteIcon className="h-5 w-5" />
                </button>
                {pickerOpen && (
                  <>
                    <button type="button" aria-label="ปิด" className="fixed inset-0 z-10 cursor-default" onClick={() => setPickerOpen(false)} />
                    <div className="absolute left-3 top-14 z-20 w-72 max-w-[calc(100vw-3rem)] space-y-3 rounded-2xl bg-card p-3 text-card-foreground shadow-lg ring-1 ring-border">
                      <p className="text-sm font-semibold">Cover</p>
                      <div className="grid grid-cols-3 gap-2">
                        {BANNER_PRESETS.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            title={p.name}
                            aria-label={p.name}
                            onClick={() => setBannerColors(p.colors, true)}
                            className={cn(
                              "h-10 rounded-xl ring-offset-2 ring-offset-card transition-shadow",
                              p.colors.join() === bannerColors.join() && "ring-2 ring-accent",
                            )}
                            style={bannerBackground(p.colors)}
                          />
                        ))}
                      </div>
                      <BannerUpload profile={profile} onAdjust={() => { setPickerOpen(false); adjust.start(); }} />
                    </div>
                  </>
                )}
              </>
            )}
            <button
              type="button"
              aria-label="ค้นหาวิชา"
              onClick={() => setPanel("subjects")}
              className={cn("absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-accent shadow-card transition-transform active:scale-95", FOCUS)}
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
          <div className="px-4 pb-4 sm:px-6 sm:pb-5">
            <button type="button" aria-label="ดูรูปโปรไฟล์ขนาดใหญ่" onClick={() => setAvatarOpen(true)} className={cn("relative z-10 -mt-10 block rounded-full sm:-mt-12", FOCUS)}>
              {profile && <Avatar name={profileFullName(profile)} src={avatarUrl(profile)} className="h-20 w-20 text-3xl ring-4 ring-card sm:h-24 sm:w-24" />}
            </button>
            <h1 className="mt-3 truncate font-heading text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
              {myStudent ? `${myStudent.first_name} ${myStudent.last_name}` : profile ? profileFullName(profile) : ""}
            </h1>
            {myStudent && (
              <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                {[
                  ["เลขประจำตัว", myStudent.student_code],
                  ["แผนก", departments.find((d) => d.id === myStudent.department_id)?.name ?? "-"],
                  ["ระดับชั้น", gradeLevel ? gradeShortLabel(gradeLevel.code) : "-"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="truncate font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <button
              type="button"
              onClick={() => setPanel("bag")}
              aria-label={`เลเวล ${lvl.level} ดูกระเป๋า`}
              className={cn("mt-4 flex w-full items-center gap-3 rounded-xl text-left", FOCUS)}
            >
              <span className="shrink-0 rounded-full bg-primary px-2.5 text-xs font-bold leading-5 text-white">Lv.{lvl.level}</span>
              <span
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10"
                role="progressbar"
                aria-label={`EXP เลเวล ${lvl.level}`}
                aria-valuemin={0}
                aria-valuemax={lvl.span}
                aria-valuenow={lvl.into}
              >
                <motion.span
                  className="block h-full rounded-full bg-primary"
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${Math.round((lvl.into / lvl.span) * 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {lvl.into}/{lvl.span} EXP
              </span>
            </button>
          </div>
        </header>

        <div className="mt-4">
          <div className="min-w-0">
            {/* ===== App-icon menu ===== */}
            <nav aria-label="เมนูลัด" className="mt-6 rounded-[22px] bg-card px-2 py-4 ">
              <ul className="grid grid-cols-4 gap-y-4 lg:grid-cols-6">
                {menu.map((m) => (
                  <li key={m.label} className="flex justify-center">
                    <button
                      type="button"
                      onClick={m.onClick}
                      className={cn("group flex w-[4.75rem] flex-col items-center gap-1.5 rounded-xl py-0.5", FOCUS)}
                    >
                      <span className="relative">
                        <IconSquare icon={m.icon} color={m.color} className="h-14 w-14 transition-transform group-active:scale-90" />
                        {!!m.badge && (
                          <span className="absolute -right-1.5 -top-1.5 min-w-[1.25rem] rounded-full bg-destructive px-1 text-center text-[12px] font-semibold leading-5 text-white ring-2 ring-card">
                            {m.badge > 99 ? "99+" : m.badge}
                          </span>
                        )}
                      </span>
                      <span className="w-full truncate text-center text-[12px] leading-4 text-foreground">{m.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {avatarOpen && profile && (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="รูปโปรไฟล์"
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setAvatarOpen(false)}
            >
              <motion.div
                initial={reduce ? false : { scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Avatar name={profileFullName(profile)} src={avatarUrl(profile)} className="h-[min(80vw,22rem)] w-[min(80vw,22rem)] text-8xl ring-4 ring-white shadow-2xl" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <Sheet
        open={panel !== null}
        onOpenChange={(o) => !o && setPanel(null)}
        title={panel ? PANEL_TITLE[panel] : ""}
        wide={panel === "timetable" ? "full" : false}
        bodyClassName="[&_.page-fill]:min-h-0 [&_.page-fill]:pb-0"
      >
        {panel === "timetable" && <Timetable />}
        {myStudent && profile && panel === "attendance" && <AttendanceSummarySection student={myStudent} />}
        {myStudent && profile && panel === "behavior" && <BehaviorScoreSection student={myStudent} showName={false} />}
        {myStudent && profile && panel === "leave" && <StudentLeaveSection student={myStudent} submittedBy={profile.id} showName={false} />}
        {panel === "bag" && <Inventory badges={badges} rank={rank} exp={lifeExp} />}
        {panel === "subjects" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาชื่อหรือรหัสวิชา"
                aria-label="ค้นหาวิชา"
                className="h-11 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 md:h-10 md:text-sm"
              />
            </div>
            {shownSubjects.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">ไม่พบวิชา</p>
            ) : (
              <ul className="space-y-2">
                {shownSubjects.map((isl) => (
                  <li key={isl.subject.id}>
                    <button
                      type="button"
                      onClick={() => {
                        focusIsland();
                        setPanel(null);
                      }}
                      className={cn("flex w-full items-center gap-3 rounded-[14px] bg-card p-3 text-left active:bg-foreground/[0.08]", FOCUS)}
                    >
                      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl", gradientOf(isl.areaCode))} aria-hidden>
                        {AREA_EMOJI[isl.areaCode] ?? AREA_EMOJI.other}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{isl.subject.name_th}</span>
                        <span className="block text-xs text-muted-foreground">
                          {isl.subject.code} · ส่งแล้ว {isl.submitted}/{isl.total}
                        </span>
                      </span>
                      {isl.pending.length > 0 && (
                        <span className="rounded-full bg-destructive px-2 text-xs font-bold leading-5 text-white">{isl.pending.length}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>

      {myStudent && (
        <SubmitSheet item={battle} student={myStudent} scoreInfo={battle ? (scores?.get(battle.id) ?? null) : null} onClose={() => setBattle(null)} />
      )}
    </div>
  );
}
