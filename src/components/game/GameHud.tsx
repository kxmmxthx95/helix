import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { useState } from "react";
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
  ProfileIcon,
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
import { useMyIslands, type Island } from "@/lib/islands";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { SubmitSheet } from "@/routes/Assignments";
import {
  AttendanceSummarySection,
  BehaviorScoreSection,
  StudentLeaveSection,
  currentAcademicYearRange,
  currentMonthRange,
} from "@/routes/Dashboard";
import { useOpenExamSubjectIds } from "@/routes/Exams";

type Icon = typeof BookIcon;
type Panel = "attendance" | "behavior" | "leave" | "bag" | "subjects";

const PANEL_TITLE: Record<Panel, string> = {
  attendance: "เช็คชื่อเข้าแถว",
  behavior: "พฤติกรรม",
  leave: "ลา",
  bag: "กระเป๋า",
  subjects: "วิชาของฉัน",
};

const ISLAND_KEY = "helix.island";

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

/** island-{code}.webp → island-other.webp → emoji. */
function IslandArt({ code, className }: { code: string; className?: string }) {
  const chain = code === "other" ? ["island-other"] : [`island-${code}`, "island-other"];
  const [step, setStep] = useState(0);
  const src = chain[step];
  if (src) {
    return (
      <img
        src={`/game/${src}.webp`}
        alt=""
        draggable={false}
        className={cn("pointer-events-none select-none object-contain drop-shadow-[0_14px_16px_rgba(45,10,43,0.35)]", className)}
        onError={() => setStep((s) => s + 1)}
      />
    );
  }
  return (
    <div className={cn("pointer-events-none flex select-none items-center justify-center", className)} aria-hidden>
      <span className="text-[min(7rem,26vw)] leading-none drop-shadow-[0_8px_10px_rgba(45,10,43,0.3)]">{AREA_EMOJI[code] ?? AREA_EMOJI.other}</span>
    </div>
  );
}

/* ---------- helpers ---------- */

function dueInfo(d: string | null): { label: string; tone: "late" | "soon" | "calm" | "none" } {
  if (!d) return { label: "ไม่มีกำหนดส่ง", tone: "none" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(`${d}T00:00:00`).getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: `เลยกำหนด ${-days} วัน`, tone: "late" };
  if (days === 0) return { label: "ส่งวันนี้", tone: "soon" };
  if (days <= 2) return { label: `อีก ${days} วัน`, tone: "soon" };
  return { label: `อีก ${days} วัน`, tone: "calm" };
}

function readSaved() {
  try {
    return sessionStorage.getItem(ISLAND_KEY);
  } catch {
    return null;
  }
}

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";
const FEATURE_BG = "bg-[linear-gradient(160deg,#ff7aa8_0%,#ff2d55_55%,#c2185b_100%)]";

function SectionHead({ title, onMore, more = "ดูทั้งหมด" }: { title: string; onMore?: () => void; more?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-1">
      <h2 className="font-heading text-[22px] font-bold leading-7 tracking-tight">{title}</h2>
      {onMore && (
        <button type="button" onClick={onMore} className={cn("rounded-md text-[15px] text-accent active:opacity-40", FOCUS)}>
          {more}
        </button>
      )}
    </div>
  );
}

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
  const { islands, isLoading: islandsLoading } = useMyIslands(myStudent);
  const openExamSubjects = useOpenExamSubjectIds(studentId);

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

  let termPct: number | null = null;
  if (term?.start_date && term.end_date) {
    const total = Date.parse(term.end_date) - Date.parse(term.start_date);
    termPct = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - Date.parse(term.start_date)) / total) * 100)) : null;
  }
  const termLabel = term ? (term.term_type === "term1" ? "ภาคเรียน 1" : term.term_type === "term2" ? "ภาคเรียน 2" : "ภาคฤดูร้อน") : "";

  const firstName = myStudent?.first_name ?? profile?.first_name ?? "";

  // Hero carousel: remembered by subject id for the tab session.
  const [selectedId, setSelectedId] = useState<string | null>(readSaved);
  const [dir, setDir] = useState(1);
  const found = islands.findIndex((i) => i.subject.id === selectedId);
  const index = found >= 0 ? found : 0;
  const island: Island | null = islands[index] ?? null;

  function select(i: number, d: number) {
    const target = islands[(i + islands.length) % islands.length];
    if (!target) return;
    setDir(d);
    setSelectedId(target.subject.id);
    try {
      sessionStorage.setItem(ISLAND_KEY, target.subject.id);
    } catch {
      /* storage blocked — selection just won't persist */
    }
  }
  const step = (d: number) => islands.length > 1 && select(index + d, d);
  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -60 || info.velocity.x < -400) step(1);
    else if (info.offset.x > 60 || info.velocity.x > 400) step(-1);
  }

  const hasHard = !!island && openExamSubjects.has(island.subject.id);
  const menu: { label: string; icon: Icon; color: string; onClick: () => void; badge?: number }[] = [
    { label: "งาน", icon: ClipboardIcon, color: "linear-gradient(160deg,#ff7a7a,#ff3b30)", onClick: () => navigate("/assignments"), badge: pending },
    { label: "สอบ", icon: DocumentTextIcon, color: "linear-gradient(160deg,#ffb84d,#ff9500)", onClick: () => navigate("/exams") },
    { label: "ตารางเรียน", icon: TimetableIcon, color: "linear-gradient(160deg,#5ac8fa,#007aff)", onClick: () => navigate("/timetable") },
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

  function focusIsland(i: number) {
    select(i, i >= index ? 1 : -1);
    document.getElementById("student-scroll")?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  const todayLabel = new Date().toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="pb-8">
      <div className="mx-auto max-w-5xl px-4 lg:px-8">
        {/* ===== Large title ===== */}
        <header className="pb-3 pt-[max(env(safe-area-inset-top),1rem)] lg:pt-8">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{todayLabel}</p>
            <button type="button" aria-label="โปรไฟล์" onClick={() => navigate("/profile")} className={cn("rounded-full", FOCUS)}>
              {profile && <Avatar name={profileFullName(profile)} src={avatarUrl(profile)} className="h-9 w-9" />}
            </button>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="min-w-0 flex-1 truncate font-heading text-[34px] font-bold leading-10 tracking-tight">สวัสดี {firstName}</h1>
            <button
              type="button"
              aria-label="ค้นหาวิชา"
              onClick={() => setPanel("subjects")}
              className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-accent", FOCUS)}
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPanel("bag")}
            aria-label={`เลเวล ${lvl.level} ดูกระเป๋า`}
            className={cn("mt-3 flex w-full items-center gap-3 rounded-xl text-left", FOCUS)}
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
        </header>

        <div>
          <div className="min-w-0">
            {/* ===== Featured card (Today-style) ===== */}
            <section
              className={cn("relative overflow-hidden rounded-[22px] text-white shadow-[0_8px_24px_rgba(255,45,85,0.28)]", FEATURE_BG)}
              aria-roledescription="carousel"
              aria-label="งานของแต่ละวิชา"
            >
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
              <div className="relative min-h-[14rem] p-5 lg:min-h-[15rem] lg:p-7">
                {islandsLoading && islands.length === 0 ? (
                  <div className="space-y-3 pt-2" role="status" aria-label="กำลังโหลด">
                    <div className="h-4 w-24 rounded-full bg-white/25" />
                    <div className="h-8 w-3/4 rounded-lg bg-white/25" />
                    <div className="h-4 w-1/2 rounded-full bg-white/25" />
                  </div>
                ) : !island ? (
                  <div className="pt-2">
                    <p className="text-[13px] font-semibold uppercase tracking-wide text-white/80">วิชาของฉัน</p>
                    <h2 className="mt-1 font-heading text-2xl font-bold leading-tight">ยังไม่มีวิชาในภาคเรียนนี้</h2>
                    <p className="mt-2 text-sm text-white/85">เมื่อครูเพิ่มวิชาให้ งานที่ต้องส่งจะมาแสดงที่นี่</p>
                  </div>
                ) : (
                  <AnimatePresence mode="wait" custom={dir} initial={false}>
                    <motion.div
                      key={island.subject.id}
                      drag={islands.length > 1 ? "x" : false}
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.25}
                      onDragEnd={onDragEnd}
                      initial={reduce ? false : { opacity: 0, x: dir * 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -40 }}
                      transition={{ duration: 0.22 }}
                      className="relative flex min-h-[11.5rem] touch-pan-y flex-col lg:min-h-[12rem]"
                    >
                      <IslandArt code={island.areaCode} className="absolute -right-2 -top-1 h-32 w-32 opacity-95 lg:right-2 lg:h-48 lg:w-48" />
                      <p className="relative max-w-[62%] text-[13px] font-semibold uppercase leading-tight tracking-wide text-white/85">
                        {island.next ? "งานถัดไป" : "เรียบร้อย"} · {island.subject.code}
                      </p>
                      <p className="relative mt-0.5 max-w-[62%] truncate text-[15px] font-medium text-white/95">{island.subject.name_th}</p>
                      <div className="relative mt-auto pt-14 lg:max-w-[65%]">
                        <h2 className="font-heading text-[26px] font-bold leading-[1.15] tracking-tight lg:text-[32px]">
                          {island.next ? island.next.label : "เคลียร์งานวิชานี้แล้ว 🎉"}
                        </h2>
                        <p className="mt-1.5 text-[15px] text-white/90">
                          {island.next ? `${dueInfo(island.next.due_date).label} · ` : ""}ส่งแล้ว {island.submitted}/{island.total}
                          {termPct !== null ? ` · ${termLabel} ผ่านไป ${Math.round(termPct)}%` : ""}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {island.next ? (
                            <button
                              type="button"
                              onClick={() => setBattle(island.next)}
                              className={cn("h-10 rounded-full bg-white px-6 text-[15px] font-semibold text-[#ff2d55] transition-transform active:scale-95", FOCUS)}
                            >
                              ส่งงาน
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => navigate("/assignments")}
                              className={cn("h-10 rounded-full bg-white px-6 text-[15px] font-semibold text-[#ff2d55] transition-transform active:scale-95", FOCUS)}
                            >
                              ดูงานทั้งหมด
                            </button>
                          )}
                          {hasHard && (
                            <button
                              type="button"
                              onClick={() => navigate(`/exams?subject=${encodeURIComponent(island.subject.code)}`)}
                              className={cn("h-10 rounded-full bg-white/25 px-5 text-[15px] font-semibold backdrop-blur-sm transition-colors hover:bg-white/35", FOCUS)}
                            >
                              มีสอบ
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
              {islands.length > 1 && (
                <div className="absolute right-4 top-4 flex items-center gap-1 lg:right-6 lg:top-6" role="group" aria-label="เลือกวิชา">
                  {islands.slice(0, 7).map((isl, i) => (
                    <button
                      key={isl.subject.id}
                      type="button"
                      aria-label={`วิชา ${isl.subject.name_th}`}
                      aria-current={i === index ? "true" : undefined}
                      onClick={() => select(i, i >= index ? 1 : -1)}
                      className="flex h-5 items-center px-0.5"
                    >
                      <span className={cn("block h-1.5 w-1.5 rounded-full bg-white transition-opacity", i === index ? "opacity-100" : "opacity-45")} />
                    </button>
                  ))}
                </div>
              )}
            </section>

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

            {/* ===== Subjects ===== */}
            {islands.length > 0 && (
              <section className="mt-8" aria-label="วิชาของฉัน">
                <SectionHead title="วิชาของฉัน" onMore={() => setPanel("subjects")} />
                <ul className="scrollbar-hidden -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
                  {islands.map((isl, i) => {
                    const ratio = isl.total ? isl.submitted / isl.total : 0;
                    return (
                      <li key={isl.subject.id} className="w-[9.5rem] shrink-0 snap-start lg:w-auto">
                        <button
                          type="button"
                          aria-label={`${isl.subject.name_th} ${isl.pending.length ? `ค้าง ${isl.pending.length} งาน` : "ไม่มีงานค้าง"}`}
                          onClick={() => focusIsland(i)}
                          className={cn(
                            "relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-[20px] bg-gradient-to-br p-3 text-left text-white transition-transform active:scale-[0.97]",
                            gradientOf(isl.areaCode),
                            FOCUS,
                          )}
                        >
                          <span className="absolute -right-3 -top-1 text-[4.5rem] leading-none opacity-90 drop-shadow-md" aria-hidden>
                            {AREA_EMOJI[isl.areaCode] ?? AREA_EMOJI.other}
                          </span>
                          {isl.pending.length > 0 ? (
                            <span className="relative w-fit rounded-full bg-white px-2 text-xs font-bold leading-5 text-primary">ค้าง {isl.pending.length}</span>
                          ) : (
                            <span className="relative w-fit rounded-full bg-white/25 px-2 text-xs font-bold leading-5">{isl.total ? "ส่งครบ ✓" : "ไม่มีงาน"}</span>
                          )}
                          <span className="relative">
                            <span className="line-clamp-2 block text-[15px] font-semibold leading-snug">{isl.subject.name_th}</span>
                            <span className="mt-0.5 block text-xs text-white/85">{isl.subject.code}</span>
                            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-black/20">
                              <span className="block h-full rounded-full bg-white" style={{ width: `${Math.round(ratio * 100)}%` }} />
                            </span>
                            <span className="mt-1 block text-[11px] tabular-nums text-white/90">
                              ส่งแล้ว {isl.submitted}/{isl.total}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>

      <Sheet open={panel !== null} onOpenChange={(o) => !o && setPanel(null)} title={panel ? PANEL_TITLE[panel] : ""}>
        {myStudent && profile && panel === "attendance" && <AttendanceSummarySection student={myStudent} />}
        {myStudent && profile && panel === "behavior" && <BehaviorScoreSection student={myStudent} />}
        {myStudent && profile && panel === "leave" && <StudentLeaveSection student={myStudent} submittedBy={profile.id} />}
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
                        focusIsland(islands.indexOf(isl));
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
