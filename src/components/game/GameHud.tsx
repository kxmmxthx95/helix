import { useQuery } from "@tanstack/react-query";
import { animate, AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { GameIcon } from "@/components/game/parts";
import {
  AirplaneIcon,
  BookIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckmarkCircleIcon,
  ChevronBack,
  ChevronForward,
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
  attendance: "เช็คชื่อ",
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

/** Number that rolls up to its new value (instant under reduced motion). */
function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      prev.current = value;
      return;
    }
    const c = animate(prev.current, value, { duration: 0.9, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce]);
  return <>{shown.toLocaleString()}</>;
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
const DUE_CHIP: Record<string, string> = {
  late: "bg-red-100 text-red-700",
  soon: "bg-amber-100 text-amber-800",
  calm: "bg-[#fde3f0] text-[#9c1f63]",
  none: "bg-black/5 text-black/60",
};

function readSaved() {
  try {
    return sessionStorage.getItem(ISLAND_KEY);
  } catch {
    return null;
  }
}

const HERO_BG = "bg-[linear-gradient(165deg,#2d0a2b_0%,#6d1357_36%,#d4307f_70%,#ff7ab8_100%)]";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[#e0398a] focus-visible:ring-offset-2";

function SectionHead({ title, onMore, more = "ดูทั้งหมด" }: { title: string; onMore?: () => void; more?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
      {onMore && (
        <button type="button" onClick={onMore} className={cn("flex items-center gap-0.5 rounded-lg px-1 text-sm font-medium text-[#9c1f63]", FOCUS)}>
          {more}
          <ChevronForward className="h-4 w-4" />
        </button>
      )}
    </div>
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
  const { data: behavior = [] } = useBehaviorRecords({ studentId: studentId ?? "", startDate: year.start, endDate: year.end });
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
  const days = attendance.length;
  const attendancePct = days ? Math.round(((counts.present + counts.late) / days) * 100) : null;
  const behaviorScore = summarizeBehaviorScore(behavior);
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

  const name = myStudent ? `${myStudent.first_name} ${myStudent.last_name}` : profile ? profileFullName(profile) : "";
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
  const dueList = islands
    .flatMap((isl) => isl.pending.map((a) => ({ a, isl })))
    .sort((x, y) => (x.a.due_date ?? "9999").localeCompare(y.a.due_date ?? "9999"))
    .slice(0, 10);

  const menu: { label: string; icon: Icon; onClick: () => void; badge?: number }[] = [
    { label: "งาน", icon: ClipboardIcon, onClick: () => navigate("/assignments"), badge: pending },
    { label: "สอบ", icon: DocumentTextIcon, onClick: () => navigate("/exams") },
    { label: "ตารางเรียน", icon: TimetableIcon, onClick: () => navigate("/timetable") },
    { label: "แบบฝึกหัด", icon: BookIcon, onClick: () => navigate("/practice") },
    { label: "ปฏิทิน", icon: CalendarIcon, onClick: () => navigate("/academic-events") },
    { label: "เอกสาร", icon: LibraryIcon, onClick: () => navigate("/documents") },
    { label: "ลา", icon: AirplaneIcon, onClick: () => setPanel("leave") },
    { label: "เช็คชื่อ", icon: CheckmarkCircleIcon, onClick: () => setPanel("attendance") },
    { label: "พฤติกรรม", icon: RibbonIcon, onClick: () => setPanel("behavior") },
    { label: "บัตรเติมเงิน", icon: PricetagIcon, onClick: () => navigate("/card-topup") },
    { label: "กระเป๋า", icon: BriefcaseIcon, onClick: () => setPanel("bag") },
    { label: "โปรไฟล์", icon: ProfileIcon, onClick: () => navigate("/profile") },
  ];

  const stats: { label: string; value: React.ReactNode; hint: string; icon: Icon; onClick: () => void; alert?: boolean }[] = [
    { label: "งานค้าง", value: <CountUp value={pending} />, hint: "ชิ้น", icon: ClipboardIcon, onClick: () => navigate("/assignments"), alert: pending > 0 },
    { label: "พฤติกรรม", value: <CountUp value={behaviorScore} />, hint: `/ ${STARTING_SCORE}`, icon: RibbonIcon, onClick: () => setPanel("behavior") },
    {
      label: "มาเรียนเดือนนี้",
      value: attendancePct === null ? "-" : <CountUp value={attendancePct} />,
      hint: attendancePct === null ? "" : "%",
      icon: CheckmarkCircleIcon,
      onClick: () => setPanel("attendance"),
    },
  ];

  const shownSubjects = islands.filter((i) => {
    const q = query.trim().toLowerCase();
    return !q || i.subject.name_th.toLowerCase().includes(q) || i.subject.code.toLowerCase().includes(q);
  });

  function focusIsland(i: number) {
    select(i, i >= index ? 1 : -1);
    document.getElementById("student-scroll")?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div className="pb-8">
      {/* ===== Hero ===== */}
      <div className="lg:px-6 lg:pt-6">
        <section className={cn("relative mx-auto max-w-6xl overflow-hidden text-white lg:rounded-[2rem]", HERO_BG, "rounded-b-[2rem]")}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:radial-gradient(circle,#fff_1.2px,transparent_1.3px)] [background-size:22px_22px]"
          />
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />

          <div className="relative px-4 pb-14 pt-[max(env(safe-area-inset-top),1rem)] lg:px-8 lg:pb-12 lg:pt-6">
            {/* top row */}
            <div className="flex items-center gap-3">
              <button type="button" aria-label="โปรไฟล์" onClick={() => navigate("/profile")} className={cn("shrink-0 rounded-full", FOCUS)}>
                {profile && <Avatar name={profileFullName(profile)} src={avatarUrl(profile)} className="h-11 w-11 ring-2 ring-white/70" />}
              </button>
              <button
                type="button"
                onClick={() => setPanel("bag")}
                aria-label={`${name} เลเวล ${lvl.level} ดูกระเป๋า`}
                className={cn("min-w-0 flex-1 rounded-2xl bg-white/15 px-3 py-1.5 text-left backdrop-blur-md transition-colors hover:bg-white/20", FOCUS)}
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5">{name}</p>
                  <span className="shrink-0 rounded-full bg-white px-2 text-xs font-bold leading-5 text-[#9c1f63]">Lv.{lvl.level}</span>
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/25"
                  role="progressbar"
                  aria-label={`EXP เลเวล ${lvl.level}`}
                  aria-valuemin={0}
                  aria-valuemax={lvl.span}
                  aria-valuenow={lvl.into}
                >
                  <motion.div
                    className="h-full rounded-full bg-white"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${Math.round((lvl.into / lvl.span) * 100)}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </button>
              <button
                type="button"
                aria-label="ค้นหาวิชา"
                onClick={() => setPanel("subjects")}
                className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-colors hover:bg-white/25", FOCUS)}
              >
                <Search className="h-5 w-5" />
              </button>
            </div>

            {/* slide */}
            <div className="relative mt-6 min-h-[14.5rem] lg:min-h-[15rem]" aria-roledescription="carousel" aria-label="งานของแต่ละวิชา">
              {islandsLoading ? (
                <div className="space-y-3 pt-6" role="status" aria-label="กำลังโหลด">
                  <div className="h-4 w-24 rounded-full bg-white/20" />
                  <div className="h-8 w-3/4 rounded-lg bg-white/20" />
                  <div className="h-4 w-1/2 rounded-full bg-white/20" />
                </div>
              ) : !island ? (
                <div className="pt-8">
                  <p className="text-sm text-white/80">สวัสดี {firstName}</p>
                  <h1 className="mt-1 font-heading text-2xl font-bold leading-tight lg:text-3xl">ยังไม่มีวิชาในภาคเรียนนี้</h1>
                  <p className="mt-2 text-sm text-white/80">เมื่อครูเพิ่มวิชาให้ งานที่ต้องส่งจะมาแสดงที่นี่</p>
                </div>
              ) : (
                <AnimatePresence mode="wait" custom={dir} initial={false}>
                  <motion.div
                    key={island.subject.id}
                    custom={dir}
                    drag={islands.length > 1 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.25}
                    onDragEnd={onDragEnd}
                    initial={reduce ? false : { opacity: 0, x: dir * 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -40 }}
                    transition={{ duration: 0.22 }}
                    className="relative touch-pan-y"
                  >
                    <IslandArt code={island.areaCode} className="absolute -right-3 top-0 h-36 w-36 opacity-95 lg:right-6 lg:h-60 lg:w-60" />
                    <div className="relative max-w-[68%] pt-1 lg:max-w-[55%]">
                      <span className="inline-flex max-w-full items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm">
                        <span className="truncate">
                          {island.subject.code} · {island.subject.name_th}
                        </span>
                      </span>
                    </div>
                    <div className="relative mt-16 lg:mt-14 lg:max-w-[60%]">
                      <h1 className="font-heading text-[1.65rem] font-bold leading-tight tracking-tight lg:text-4xl">
                        {island.next ? island.next.label : "เคลียร์งานวิชานี้แล้ว 🎉"}
                      </h1>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-white/90">
                        {island.next ? (
                          <>
                            <span>{dueInfo(island.next.due_date).label}</span>
                            <span aria-hidden>·</span>
                          </>
                        ) : null}
                        <span>
                          ส่งแล้ว {island.submitted}/{island.total}
                        </span>
                        {termPct !== null && (
                          <>
                            <span aria-hidden>·</span>
                            <span>
                              {termLabel} ผ่านไป {Math.round(termPct)}%
                            </span>
                          </>
                        )}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {island.next ? (
                          <button
                            type="button"
                            onClick={() => setBattle(island.next)}
                            className={cn("h-11 rounded-full bg-white px-6 text-sm font-semibold text-[#9c1f63] shadow-lg shadow-black/10 transition-transform active:scale-95", FOCUS)}
                          >
                            ส่งงาน
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => navigate("/assignments")}
                            className={cn("h-11 rounded-full bg-white px-6 text-sm font-semibold text-[#9c1f63] transition-transform active:scale-95", FOCUS)}
                          >
                            ดูงานทั้งหมด
                          </button>
                        )}
                        {hasHard && (
                          <button
                            type="button"
                            onClick={() => navigate(`/exams?subject=${encodeURIComponent(island.subject.code)}`)}
                            className={cn("h-11 rounded-full bg-white/15 px-5 text-sm font-semibold backdrop-blur-sm transition-colors hover:bg-white/25", FOCUS)}
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
              <div className="absolute bottom-5 right-4 flex items-center gap-1.5 lg:bottom-6 lg:right-8">
                <button type="button" aria-label="วิชาก่อนหน้า" onClick={() => step(-1)} className={cn("hidden h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 lg:flex", FOCUS)}>
                  <ChevronBack className="h-4 w-4" />
                </button>
                {islands.slice(0, 7).map((isl, i) => (
                  <button
                    key={isl.subject.id}
                    type="button"
                    aria-label={`วิชา ${isl.subject.name_th}`}
                    aria-current={i === index ? "true" : undefined}
                    onClick={() => select(i, i >= index ? 1 : -1)}
                    className="flex h-5 items-center px-0.5"
                  >
                    <span className={cn("block h-1.5 rounded-full bg-white transition-all", i === index ? "w-5" : "w-1.5 opacity-50")} />
                  </button>
                ))}
                <button type="button" aria-label="วิชาถัดไป" onClick={() => step(1)} className={cn("hidden h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 lg:flex", FOCUS)}>
                  <ChevronForward className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ===== Body ===== */}
      <div className="mx-auto max-w-6xl px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-x-6 lg:px-6">
        {/* stat cards: overlap the hero on mobile, side column on desktop */}
        <div className="relative z-10 -mt-7 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:mt-6">
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3">
            {stats.map((st) => (
              <button
                key={st.label}
                type="button"
                onClick={st.onClick}
                className={cn(
                  "flex min-w-0 flex-col items-start gap-1 rounded-2xl bg-card p-3 text-left shadow-[0_6px_20px_rgba(157,31,99,0.12)] ring-1 ring-black/5 transition-transform active:scale-[0.97] lg:flex-row lg:items-center lg:gap-3 lg:p-4",
                  FOCUS,
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl lg:h-11 lg:w-11",
                    st.alert ? "bg-red-100 text-red-600" : "bg-[#fde3f0] text-[#c0267a]",
                  )}
                >
                  <st.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs text-muted-foreground">{st.label}</span>
                  <span className="block text-xl font-bold leading-tight tabular-nums">
                    {st.value}
                    <span className="ml-0.5 text-xs font-medium text-muted-foreground">{st.hint}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPanel("bag")}
            className={cn("mt-3 hidden w-full items-center gap-3 rounded-2xl bg-card p-4 text-left ring-1 ring-black/5 lg:flex", FOCUS)}
          >
            <GameIcon name={`rank-${rank.id}`} fallback={RibbonIcon} className="h-11 w-11 shrink-0 text-[#c0267a]" />
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">แรงก์สะสม</span>
              <span className="block truncate font-semibold">{rank.label}</span>
              <span className="block text-xs tabular-nums text-muted-foreground">{lifeExp.toLocaleString()} EXP</span>
            </span>
            <ChevronForward className="ml-auto h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* icon menu */}
        <nav aria-label="เมนูลัด" className="mt-5 lg:col-start-1 lg:mt-6">
          <ul className="grid grid-cols-4 gap-2.5 lg:grid-cols-6">
            {menu.map((m) => (
              <li key={m.label}>
                <button
                  type="button"
                  onClick={m.onClick}
                  className={cn(
                    "relative flex h-[5.25rem] w-full flex-col items-center justify-center gap-1.5 rounded-2xl bg-[#fde8f3] px-1 text-[#5b1442] transition-all hover:bg-[#fbd9ea] active:scale-95 dark:bg-card",
                    FOCUS,
                  )}
                >
                  <m.icon className="h-6 w-6 text-[#9c1f63]" />
                  <span className="w-full truncate text-center text-xs font-medium">{m.label}</span>
                  {!!m.badge && (
                    <span className="absolute right-1.5 top-1.5 min-w-[1.25rem] rounded-full bg-[#e11d48] px-1 text-center text-[11px] font-bold leading-5 text-white">
                      {m.badge > 99 ? "99+" : m.badge}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* due work */}
        <section className="mt-7 lg:col-start-1" aria-label="งานที่ต้องส่ง">
          <SectionHead title="งานที่ต้องส่ง" onMore={() => navigate("/assignments")} />
          {dueList.length === 0 ? (
            <div className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-black/5">
              {islandsLoading ? "กำลังโหลด…" : "ไม่มีงานค้าง เยี่ยมมาก 🎉"}
            </div>
          ) : (
            <ul className="scrollbar-hidden -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0">
              {dueList.map(({ a, isl }) => {
                const due = dueInfo(a.due_date);
                return (
                  <li key={a.id} className="w-[17.5rem] shrink-0 snap-start lg:w-auto">
                    <button
                      type="button"
                      onClick={() => setBattle(a)}
                      className={cn("flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left ring-1 ring-black/10 transition-shadow hover:shadow-md active:scale-[0.98]", FOCUS)}
                    >
                      <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl", gradientOf(isl.areaCode))} aria-hidden>
                        {AREA_EMOJI[isl.areaCode] ?? AREA_EMOJI.other}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{a.label}</span>
                        <span className="block truncate text-sm text-muted-foreground">{isl.subject.name_th}</span>
                        <span className={cn("mt-1 inline-block rounded-md px-1.5 py-0.5 text-xs font-medium", DUE_CHIP[due.tone])}>{due.label}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* subjects */}
        {islands.length > 0 && (
          <section className="mt-7 lg:col-start-1" aria-label="วิชาของฉัน">
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
                        "relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-3 text-left text-white transition-transform active:scale-[0.97]",
                        gradientOf(isl.areaCode),
                        FOCUS,
                      )}
                    >
                      <span className="absolute -right-3 -top-1 text-[4.5rem] leading-none opacity-90 drop-shadow-md" aria-hidden>
                        {AREA_EMOJI[isl.areaCode] ?? AREA_EMOJI.other}
                      </span>
                      {isl.pending.length > 0 ? (
                        <span className="relative w-fit rounded-full bg-white px-2 text-xs font-bold leading-5 text-[#c0267a]">ค้าง {isl.pending.length}</span>
                      ) : (
                        <span className="relative w-fit rounded-full bg-white/25 px-2 text-xs font-bold leading-5">{isl.total ? "ส่งครบ ✓" : "ไม่มีงาน"}</span>
                      )}
                      <span className="relative">
                        <span className="line-clamp-2 block text-sm font-semibold leading-snug drop-shadow-sm">{isl.subject.name_th}</span>
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
                      className={cn("flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left ring-1 ring-black/10", FOCUS)}
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
                        <span className="rounded-full bg-[#e11d48] px-2 text-xs font-bold leading-5 text-white">{isl.pending.length}</span>
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
