import { useQuery } from "@tanstack/react-query";
import { animate, AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { BarFill, GameIcon, useArt } from "@/components/game/parts";
import {
  AirplaneIcon,
  AlertTriangle,
  BookIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckmarkCircleIcon,
  ChevronBack,
  ChevronForward,
  ClipboardIcon,
  DocumentTextIcon,
  GlobeIcon,
  Plus,
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
type Panel = "attendance" | "behavior" | "leave" | "bag" | "map";

const PANEL_TITLE: Record<Panel, string> = {
  attendance: "เช็คชื่อ",
  behavior: "พฤติกรรม",
  leave: "ลา",
  bag: "กระเป๋า",
  map: "แผนที่เกาะ",
};

const NAVY = "bg-[#2b2d5c]/85 backdrop-blur-md border-2 border-white/15 shadow-[0_4px_0_rgba(31,33,80,0.55)]";
const FOCUS = "outline-none focus-visible:ring-4 focus-visible:ring-[#ffd23f]/80";
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

/* ---------- HUD pieces ---------- */

function CurrencyPill({
  iconName,
  icon,
  label,
  onClick,
  alert,
  children,
}: {
  iconName: string;
  icon: Icon;
  label: string;
  onClick: () => void;
  alert?: boolean;
  children: React.ReactNode;
}) {
  const pillArt = useArt("hud-pill");
  const plusArt = useArt("hud-plus");
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cn("group flex min-h-11 min-w-0 flex-1 items-center rounded-full", FOCUS)}>
      <span
        style={pillArt ? { backgroundImage: "url(/game/hud-pill.webp)", backgroundSize: "100% 100%" } : undefined}
        className={cn(
          "relative flex h-8 w-full items-center pl-7 pr-1 transition-transform group-active:scale-95 motion-reduce:transition-none",
          !pillArt && "rounded-full border-2 border-[#1f2150] bg-[#1f2150]/70 shadow-[inset_0_2px_0_rgba(255,255,255,0.12)]",
        )}
      >
        <GameIcon name={iconName} fallback={icon} className="absolute -left-1.5 top-1/2 h-9 w-9 -translate-y-1/2 text-[#ffd23f] drop-shadow-[0_2px_0_#1f2150]" />
        <span className="game-outline min-w-0 flex-1 truncate text-center font-game text-sm font-bold tabular-nums">{children}</span>
        {plusArt ? (
          <img src="/game/hud-plus.webp" alt="" draggable={false} className="h-5 w-5 shrink-0" aria-hidden />
        ) : (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#7ee06b] to-[#3fae2f] shadow-[0_2px_0_#1f6d16]" aria-hidden>
            <Plus className="h-3.5 w-3.5 text-white" />
          </span>
        )}
        {alert && (
          <span className="absolute -right-1 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-[#ff3b5c] text-[10px] font-black leading-none text-white" aria-hidden>
            !
          </span>
        )}
      </span>
    </button>
  );
}

function RailButton({ name, icon, label, onClick, big }: { name: string; icon: Icon; label: string; onClick: () => void; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex flex-col items-center gap-0.5 rounded-xl px-1 py-1 transition-transform active:scale-90 motion-reduce:transition-none", FOCUS, big ? "w-16" : "w-14")}
    >
      <GameIcon name={name} fallback={icon} className={cn("text-white drop-shadow-[0_3px_0_#1f2150]", big ? "h-11 w-11" : "h-8 w-8")} />
      <span className={cn("game-outline font-game font-bold leading-tight", big ? "text-xs" : "text-[11px]")}>{label}</span>
    </button>
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

/** island-{code}.webp → island-other.webp → CSS island. */
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
        className={cn("pointer-events-none select-none object-contain drop-shadow-[0_18px_18px_rgba(31,33,80,0.35)]", className)}
        onError={() => setStep((s) => s + 1)}
      />
    );
  }
  return (
    <div className={cn("pointer-events-none relative select-none", className)} aria-hidden>
      {/* water ring */}
      <div className="absolute inset-x-[4%] bottom-[16%] h-[34%] rounded-[50%] bg-gradient-to-b from-[#6ff0e6] to-[#1fb7c9] shadow-[inset_0_6px_0_rgba(255,255,255,0.45),0_14px_24px_rgba(31,33,80,0.3)]" />
      {/* rock underside */}
      <div className="absolute inset-x-[22%] bottom-[2%] h-[36%] rounded-b-[50%] rounded-t-[30%] bg-gradient-to-b from-[#b07a4f] to-[#6b4226]" />
      {/* grass top */}
      <div className="absolute inset-x-[16%] bottom-[28%] h-[30%] rounded-[50%] bg-gradient-to-b from-[#9be86a] to-[#4cb33a] shadow-[inset_0_5px_0_rgba(255,255,255,0.4)]" />
      <span className="absolute inset-x-0 bottom-[38%] text-center text-[min(5.5rem,20vw)] leading-none drop-shadow-[0_6px_0_rgba(31,33,80,0.25)]">
        {AREA_EMOJI[code] ?? AREA_EMOJI.other}
      </span>
    </div>
  );
}

function formatDue(d: string | null) {
  if (!d) return "ไม่มีกำหนดส่ง";
  return `ส่ง ${new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`;
}

function readSaved() {
  try {
    return sessionStorage.getItem(ISLAND_KEY);
  } catch {
    return null;
  }
}

/* ---------- Home ---------- */

/** Island home (docs/design/student-portal-island.md): HUD, side rails, floating subject island, BATTLE row. */
export function GameHud() {
  const { profile, myStudent } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const trackArt = useArt("hud-bar-track");
  const avatarArt = useArt("hud-avatar-frame");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [battle, setBattle] = useState<MyAssignment | null>(null);

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

  // Island carousel: remembered by subject id for the tab session.
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
  const doneRatio = island && island.total ? island.submitted / island.total : 0;

  return (
    <>
      {/* ===== Top HUD ===== */}
      <header className="relative z-20 shrink-0 px-3 pt-2">
        <div className={cn("grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1 rounded-2xl px-2.5 py-2", NAVY)}>
          {avatarArt ? (
            <div className="relative row-span-1 h-[3.75rem] w-[3.75rem]">
              {profile && (
                <div className="absolute inset-[15%] overflow-hidden rounded-lg">
                  <Avatar name={profileFullName(profile)} src={avatarUrl(profile)} className="h-full w-full rounded-none ring-0" />
                </div>
              )}
              <img src="/game/hud-avatar-frame.webp" alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
          ) : (
            <div className="row-span-1 rounded-xl border-[3px] border-[#ffd23f] bg-gradient-to-b from-[#ffe58a] to-[#e0a21a] p-0.5 shadow-[0_3px_0_#8a5a00]">
              {profile && <Avatar name={profileFullName(profile)} src={avatarUrl(profile)} className="h-11 w-11 rounded-lg ring-0" />}
            </div>
          )}
          <div className="min-w-0">
            <p className="game-outline truncate font-game text-base font-bold leading-tight">{name}</p>
            <div className="mt-1 flex items-center gap-1.5" role="progressbar" aria-label={`EXP เลเวล ${lvl.level}`} aria-valuemin={0} aria-valuemax={lvl.span} aria-valuenow={lvl.into}>
              <span className="game-outline shrink-0 rounded-md border-2 border-[#1f2150] bg-gradient-to-b from-[#ff6fb5] to-[#d62f86] px-1.5 font-game text-xs font-bold leading-5">
                Lv.{lvl.level}
              </span>
              <div className={cn("relative min-w-0 flex-1", trackArt ? "h-6" : "h-4 overflow-hidden rounded-full border-2 border-[#1f2150] bg-[#1f2150]/70")}>
                {trackArt && <img src="/game/hud-bar-track.webp" alt="" draggable={false} className="absolute inset-0 h-full w-full" />}
                <div className={cn("absolute", trackArt ? "inset-y-[24%] left-[9%] right-[9%]" : "inset-0")}>
                  <BarFill
                    name="hud-bar-fill-exp"
                    ratio={lvl.into / lvl.span}
                    fallback="bg-gradient-to-b from-[#9ff7ff] to-[#2fb4e8] shadow-[inset_0_2px_0_rgba(255,255,255,0.5)]"
                    transition={reduce ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                <span className="game-outline absolute inset-0 flex items-center justify-center font-game text-[10px] font-bold leading-none tabular-nums">
                  {lvl.into}/{lvl.span}
                </span>
              </div>
            </div>
          </div>
          <div className="col-span-2 mt-0.5 flex gap-2.5 pl-1.5">
            <CurrencyPill iconName="hud-energy" icon={ClipboardIcon} label={`งานค้าง ${pending} ชิ้น`} onClick={() => navigate("/assignments")} alert={pending > 0}>
              <CountUp value={pending} />
            </CurrencyPill>
            <CurrencyPill iconName="hud-coin" icon={RibbonIcon} label={`คะแนนพฤติกรรม ${behaviorScore} จาก ${STARTING_SCORE}`} onClick={() => setPanel("behavior")}>
              <CountUp value={behaviorScore} />/{STARTING_SCORE}
            </CurrencyPill>
            <CurrencyPill
              iconName="hud-gem"
              icon={CheckmarkCircleIcon}
              label={`มาเรียนเดือนนี้ ${attendancePct === null ? "ยังไม่มีข้อมูล" : `${attendancePct}%`}`}
              onClick={() => setPanel("attendance")}
            >
              {attendancePct === null ? "-" : (
                <>
                  <CountUp value={attendancePct} />%
                </>
              )}
            </CurrencyPill>
          </div>
        </div>

        {/* Term progress */}
        {termPct !== null && (
          <div
            className="relative mx-1 mt-2 h-6 overflow-hidden rounded-full border-2 border-white/60 bg-white/25 shadow-[inset_0_2px_6px_rgba(31,33,80,0.25)] backdrop-blur-sm"
            role="progressbar"
            aria-label="ความคืบหน้าภาคเรียน"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(termPct)}
          >
            <BarFill
              name="hud-bar-fill-energy"
              ratio={termPct / 100}
              fallback="bg-gradient-to-b from-[#a8f07a] to-[#3fb52f] shadow-[inset_0_2px_0_rgba(255,255,255,0.55)]"
              transition={{ duration: 1, ease: "easeOut" }}
              from0={!reduce}
            />
            <span className="game-outline absolute inset-0 flex items-center justify-center font-game text-xs font-bold">
              {termLabel} · ผ่านไป {Math.round(termPct)}%
            </span>
          </div>
        )}
      </header>

      {/* ===== Middle: rails + island ===== */}
      <section className="relative flex min-h-0 flex-1 flex-col">
        <nav aria-label="เมนูซ้าย" className={cn("absolute left-2 top-3 z-10 flex flex-col gap-1 rounded-2xl p-1", NAVY)}>
          <RailButton big name="nav-bag" icon={BriefcaseIcon} label="กระเป๋า" onClick={() => setPanel("bag")} />
          <RailButton big name="nav-calendar" icon={CalendarIcon} label="ปฏิทิน" onClick={() => navigate("/academic-events")} />
          <RailButton big name="nav-documents" icon={DocumentTextIcon} label="เอกสาร" onClick={() => navigate("/documents")} />
        </nav>
        <nav aria-label="เมนูขวา" className={cn("absolute right-2 top-3 z-10 flex flex-col gap-1 rounded-2xl p-1", NAVY)}>
          <RailButton name="nav-leave" icon={AirplaneIcon} label="ลา" onClick={() => setPanel("leave")} />
          <RailButton name="nav-attendance" icon={CheckmarkCircleIcon} label="เช็คชื่อ" onClick={() => setPanel("attendance")} />
          <RailButton name="nav-behavior" icon={RibbonIcon} label="พฤติกรรม" onClick={() => setPanel("behavior")} />
        </nav>

        <div className="flex min-h-0 flex-1 flex-col items-center px-[4.75rem] pt-4" aria-roledescription="carousel" aria-label="เกาะวิชา">
          <div className="min-h-[4.5rem] text-center" aria-live="polite">
            {island ? (
              <>
                <h2 className="game-outline-lg line-clamp-2 font-game text-[1.6rem] font-bold leading-tight">{island.subject.name_th}</h2>
                <p className="game-outline mt-1 font-game text-xs font-bold opacity-95">
                  {island.subject.code} · ส่งแล้ว {island.submitted}/{island.total}
                </p>
              </>
            ) : (
              <h2 className="game-outline-lg font-game text-xl font-bold leading-tight">{islandsLoading ? "กำลังโหลด…" : "ยังไม่มีวิชาในเทอมนี้"}</h2>
            )}
          </div>
        </div>

        {/* Island stage spans full width so swipes work edge to edge. */}
        <div className="absolute inset-x-0 bottom-12 top-[6.5rem] flex items-center justify-center overflow-hidden">
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={island?.subject.id ?? "none"}
              custom={dir}
              variants={{
                enter: (d: number) => (reduce ? { opacity: 0 } : { x: d * 260, opacity: 0, scale: 0.8 }),
                center: { x: 0, opacity: 1, scale: 1 },
                exit: (d: number) => (reduce ? { opacity: 0 } : { x: d * -260, opacity: 0, scale: 0.8 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              drag={islands.length > 1 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onDragEnd={onDragEnd}
              className={cn("flex h-full items-center justify-center", islands.length > 1 && "cursor-grab active:cursor-grabbing")}
              style={{ touchAction: "pan-y" }}
            >
              <motion.div
                animate={reduce ? undefined : { y: [0, -12, 0], rotate: [0, 0.8, 0] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                className={cn(!island && !islandsLoading && "opacity-80", islandsLoading && "animate-pulse motion-reduce:animate-none")}
              >
                <IslandArt key={island?.areaCode ?? "other"} code={island?.areaCode ?? "other"} className="aspect-square h-[min(24rem,42dvh,80vw)]" />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress + arrows */}
        {island && (
          <div className="relative z-10 mt-auto flex items-center gap-2 px-3 pb-1">
            <ArrowButton label="เกาะก่อนหน้า" disabled={islands.length < 2} onClick={() => step(-1)}>
              <ChevronBack className="h-6 w-6" />
            </ArrowButton>
            <div
              className="relative h-6 flex-1 overflow-hidden rounded-full border-2 border-[#1f2150] bg-[#1f2150]/60"
              role="progressbar"
              aria-label="งานที่ส่งแล้ว"
              aria-valuemin={0}
              aria-valuemax={island.total}
              aria-valuenow={island.submitted}
            >
              <BarFill
                name="hud-bar-fill-exp"
                ratio={doneRatio}
                fallback="bg-gradient-to-b from-[#ffe58a] to-[#ffb43d] shadow-[inset_0_2px_0_rgba(255,255,255,0.55)]"
                transition={reduce ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }}
              />
              <span className="game-outline absolute inset-0 flex items-center justify-center font-game text-xs font-bold">
                ส่งแล้ว {island.submitted}/{island.total}
                {islands.length > 1 && <span className="ml-2 opacity-80">· เกาะ {index + 1}/{islands.length}</span>}
              </span>
            </div>
            <ArrowButton label="เกาะถัดไป" disabled={islands.length < 2} onClick={() => step(1)}>
              <ChevronForward className="h-6 w-6" />
            </ArrowButton>
          </div>
        )}
      </section>

      {/* ===== Action row ===== */}
      {island && (
        <div className="relative z-10 flex shrink-0 items-center justify-center gap-3 px-3 pb-4 pt-2">
          <button
            type="button"
            aria-label="แผนที่เกาะทั้งหมด"
            onClick={() => setPanel("map")}
            className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-transform active:translate-y-1 motion-reduce:transition-none", NAVY, FOCUS)}
          >
            <GameIcon name="hud-map" fallback={GlobeIcon} className="h-9 w-9 text-[#9ff7ff] drop-shadow-[0_2px_0_#1f2150]" />
          </button>

          {island.next ? (
            <BattleButton
              title="ลุย!"
              subtitle={`${island.next.label} · ${formatDue(island.next.due_date)}`}
              onClick={() => setBattle(island.next)}
            />
          ) : (
            <BattleButton cleared title="เคลียร์แล้ว ✓" subtitle="ดูงานทั้งหมด" onClick={() => navigate("/assignments")} />
          )}

          {hasHard ? (
            <button
              type="button"
              aria-label={`สอบวิชา ${island.subject.name_th}`}
              onClick={() => navigate(`/exams?subject=${encodeURIComponent(island.subject.code)}`)}
              className={cn(
                "flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border-[3px] border-[#ffb3b3] bg-gradient-to-b from-[#ff6b6b] to-[#d81e3c] shadow-[0_5px_0_#7a0f22] transition-[transform,box-shadow] active:translate-y-[5px] active:shadow-none motion-reduce:transition-none",
                FOCUS,
              )}
            >
              <GameIcon name="btn-hard" fallback={AlertTriangle} className="h-7 w-7 text-white drop-shadow-[0_2px_0_#7a0f22]" />
              <span className="game-outline font-game text-[10px] font-black leading-none">HARD</span>
            </button>
          ) : (
            <span className="w-14 shrink-0" aria-hidden />
          )}
        </div>
      )}
      {!island && <div className="h-6 shrink-0" />}

      <Sheet open={panel !== null} onOpenChange={(o) => !o && setPanel(null)} title={panel ? PANEL_TITLE[panel] : ""}>
        {myStudent && profile && panel === "attendance" && <AttendanceSummarySection student={myStudent} />}
        {myStudent && profile && panel === "behavior" && <BehaviorScoreSection student={myStudent} />}
        {myStudent && profile && panel === "leave" && <StudentLeaveSection student={myStudent} submittedBy={profile.id} />}
        {panel === "bag" && <Inventory badges={badges} rank={rankFromExp(lifeExp)} exp={lifeExp} />}
        {panel === "map" && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {islands.map((isl, i) => (
              <li key={isl.subject.id}>
                <button
                  type="button"
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => {
                    select(i, i >= index ? 1 : -1);
                    setPanel(null);
                  }}
                  className={cn(
                    "relative flex w-full flex-col items-center gap-1 rounded-2xl border-2 p-2 text-center transition-transform active:scale-95 motion-reduce:transition-none",
                    i === index ? "border-[#ffc21a] bg-[#fff8dc]" : "border-black/10 bg-[#f3eaff]",
                    "outline-none focus-visible:ring-4 focus-visible:ring-[#ffd23f]",
                  )}
                >
                  <IslandArt code={isl.areaCode} className="aspect-square h-20" />
                  <span className="line-clamp-2 text-xs font-bold leading-snug">{isl.subject.name_th}</span>
                  <span className="text-[11px] text-black/60">{isl.subject.code}</span>
                  {isl.pending.length > 0 ? (
                    <span className="absolute right-1.5 top-1.5 min-w-6 rounded-full border-2 border-white bg-[#ff3b5c] px-1 text-xs font-bold leading-5 text-white">
                      {isl.pending.length}
                    </span>
                  ) : (
                    isl.total > 0 && <span className="absolute right-1.5 top-1.5 rounded-full bg-[#3fb52f] px-1.5 text-xs font-bold leading-5 text-white">✓</span>
                  )}
                  <span className="sr-only">{isl.pending.length ? `ค้าง ${isl.pending.length} งาน` : "ไม่มีงานค้าง"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {myStudent && (
        <SubmitSheet item={battle} student={myStudent} scoreInfo={battle ? (scores?.get(battle.id) ?? null) : null} onClose={() => setBattle(null)} />
      )}
    </>
  );
}

function ArrowButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/70 bg-white/30 text-white shadow-[0_3px_0_rgba(31,33,80,0.45)] backdrop-blur-sm transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-40 motion-reduce:transition-none [&_svg]:drop-shadow-[0_2px_0_#1f2150]",
        FOCUS,
      )}
    >
      {children}
    </button>
  );
}

/** Chunky slanted 3D button; pulsing glow and press-down travel, both off under reduced motion. */
function BattleButton({ title, subtitle, onClick, cleared }: { title: string; subtitle: string; onClick: () => void; cleared?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative min-w-0 max-w-[15rem] flex-1">
      {!reduce && (
        <motion.span
          aria-hidden
          className={cn("pointer-events-none absolute -inset-1.5 -skew-x-6 rounded-[1.4rem] blur-md", cleared ? "bg-[#7ee06b]" : "bg-[#ffd23f]")}
          animate={{ opacity: [0.35, 0.85, 0.35], scale: [0.98, 1.04, 0.98] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={reduce ? undefined : { y: 6, boxShadow: cleared ? "0 0 0 #1f6d16" : "0 0 0 #b07a00" }}
        transition={{ type: "spring", stiffness: 700, damping: 30 }}
        className={cn(
          "relative flex h-16 w-full -skew-x-6 flex-col items-center justify-center rounded-[1.2rem] border-[3px] px-3",
          cleared
            ? "border-[#d6ffc7] bg-gradient-to-b from-[#9cf07a] to-[#3fb52f] shadow-[0_6px_0_#1f6d16,0_10px_18px_rgba(31,33,80,0.35)]"
            : "border-[#fff3b0] bg-gradient-to-b from-[#ffe466] to-[#ffd23f] shadow-[0_6px_0_#b07a00,0_10px_18px_rgba(31,33,80,0.35)]",
          "outline-none focus-visible:ring-4 focus-visible:ring-white",
        )}
      >
        <span className="pointer-events-none absolute inset-x-2 top-1 h-1/3 rounded-full bg-white/35" aria-hidden />
        <span className="flex min-w-0 max-w-full skew-x-6 flex-col items-center">
          <span className="game-outline-lg font-game text-2xl font-black leading-none tracking-wide">{title}</span>
          <span className="mt-1 max-w-full truncate font-game text-[11px] font-bold leading-tight text-[#1f2150]">{subtitle}</span>
        </span>
      </motion.button>
    </div>
  );
}
