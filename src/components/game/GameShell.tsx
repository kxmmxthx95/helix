import { motion, MotionConfig, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { GameFrame, GameIcon } from "@/components/game/parts";
import { BookIcon, CloudOff, DocumentTextIcon, GraduationCap, TimetableIcon, X } from "@/components/icons";
import { MobileHeaderProvider } from "@/components/MobileHeaderSlot";
import { useOutboxSync } from "@/hooks/useOutboxSync";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** Route window titles. */
const TITLES: Record<string, string> = {
  "/assignments": "งาน",
  "/exams": "สอบ",
  "/timetable": "ตารางเรียน",
  "/academic-events": "ปฏิทินกิจกรรม",
  "/practice": "แบบฝึกหัด",
  "/documents": "เอกสาร",
  "/profile": "โปรไฟล์",
  "/subjects": "คลังรายวิชา",
};

type Icon = typeof BookIcon;
const TABS: readonly { to: string; label: string; name?: string; icon?: Icon }[] = [
  { to: "/timetable", label: "ตารางเรียน", name: "tab-timetable", icon: TimetableIcon },
  { to: "/exams", label: "สอบ", name: "tab-exams", icon: DocumentTextIcon },
  { to: "/", label: "เกาะ" },
  { to: "/practice", label: "แบบฝึกหัด", name: "nav-practice", icon: BookIcon },
  { to: "/profile", label: "โปรไฟล์", name: "tab-profile", icon: GraduationCap },
];

/**
 * Student-only shell (island home, docs/design/student-portal-island.md): portrait column on a CSS sky,
 * bottom tab bar always visible; every non-home route is a window over the sky.
 * `.theme-game` goes on <html> — Sheets/Toasts portal outside this tree.
 */
export function GameShell() {
  useEffect(() => {
    document.documentElement.classList.add("theme-game");
    return () => document.documentElement.classList.remove("theme-game");
  }, []);

  return (
    <MobileHeaderProvider>
      <MotionConfig reducedMotion="user">
        <GameShellInner />
      </MotionConfig>
    </MobileHeaderProvider>
  );
}

function GameShellInner() {
  const { actualRoles, viewAsRole, setViewAsRole } = useAuth();
  const { online } = useOutboxSync();
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const isHome = location.pathname === "/";
  const title = TITLES[location.pathname] ?? "";

  return (
    <div className="game-sky-wide fixed inset-0 flex justify-center overflow-hidden overscroll-none">
      <div
        className={cn(
          "game-sky relative flex h-full w-full flex-col overflow-hidden pt-safe min-[481px]:shadow-[0_0_60px_rgba(31,33,80,0.35)]",
          isHome ? "max-w-[480px]" : "max-w-3xl",
        )}
      >
        <Sparkles />

        {!online && (
          <div className="relative z-20 flex items-center justify-center gap-2 bg-warning/90 py-1 text-xs font-bold text-white">
            <CloudOff className="h-3.5 w-3.5" />
            ออฟไลน์
          </div>
        )}
        {actualRoles.includes("super_admin") && viewAsRole && (
          <div className="relative z-20 flex items-center justify-center gap-2 bg-accent py-1 text-xs font-bold text-white">
            มุมมอง {ROLE_LABEL[viewAsRole]}
            <button type="button" className="underline" onClick={() => setViewAsRole(null)}>
              กลับเป็นตัวเอง
            </button>
          </div>
        )}

        {isHome ? (
          <main className="relative z-10 flex min-h-0 flex-1 flex-col">
            <Outlet />
          </main>
        ) : (
          <main className="relative z-10 flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-3 py-2">
            <motion.div
              key={location.pathname}
              initial={reduce ? false : { opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="mx-auto flex max-h-full min-h-0 w-full max-w-3xl flex-col"
            >
              <GameFrame kind="panel" className="flex max-h-full min-h-0 flex-col overflow-hidden !p-0 text-foreground">
                <div className="flex shrink-0 items-center gap-2 border-b-[3px] border-[#1f2150] bg-gradient-to-b from-[#3a3d7a] to-[#2b2d5c] py-1 pl-4 pr-1.5">
                  <h1 className="game-outline min-w-0 flex-1 truncate font-game text-lg font-bold">{title}</h1>
                  <button
                    type="button"
                    aria-label="ปิดหน้าต่าง"
                    onClick={() => navigate("/")}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#fff3b0] bg-gradient-to-b from-[#ffe066] to-[#ffc21a] shadow-[0_3px_0_#b07a00] outline-none transition-transform active:translate-y-[3px] active:shadow-none focus-visible:ring-4 focus-visible:ring-white/80 motion-reduce:transition-none"
                  >
                    <X className="h-5 w-5 text-[#1f2150]" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                  <Outlet />
                </div>
              </GameFrame>
            </motion.div>
          </main>
        )}

        <TabBar pathname={location.pathname} />
      </div>
    </div>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  return (
    <nav
      aria-label="เมนูหลัก"
      className="relative z-20 mx-auto w-full max-w-[480px] shrink-0 rounded-t-[1.75rem] border-t-2 border-white/15 bg-[#2b2d5c]/90 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(31,33,80,0.35)] backdrop-blur-md"
    >
      <ul className="grid grid-cols-5 items-end">
        {TABS.map(({ to, label, name, icon }) => {
          const active = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
          const home = to === "/";
          return (
            <li key={to} className="flex justify-center">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => navigate(to)}
                className={cn(
                  "group flex min-h-14 w-full flex-col items-center justify-end gap-0.5 rounded-2xl pb-1.5 pt-1 outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-[#ffd23f] motion-reduce:transition-none",
                  home && "-mt-7",
                )}
              >
                {home ? (
                  <span
                    className={cn(
                      "flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-[1.4rem] border-[3px] text-4xl shadow-[0_5px_0_#1f2150,0_0_18px_rgba(255,210,63,0.55)]",
                      active ? "border-[#fff3b0] bg-gradient-to-b from-[#ffe066] to-[#ff9f3d]" : "border-white/40 bg-gradient-to-b from-[#5a5ea8] to-[#3a3d7a]",
                    )}
                    aria-hidden
                  >
                    🏝️
                  </span>
                ) : (
                  <span
                    className={cn(
                      "flex h-10 w-12 items-center justify-center rounded-xl transition-colors",
                      active ? "bg-white/15 shadow-[inset_0_-3px_0_#ffd23f]" : "group-hover:bg-white/10",
                    )}
                  >
                    {icon && name && <GameIcon name={name} fallback={icon} className={cn("h-8 w-8 drop-shadow", active ? "text-[#ffd23f]" : "text-white/85")} />}
                  </span>
                )}
                <span className={cn("font-game text-[11px] font-bold leading-tight", active ? "text-[#ffd23f]" : "text-white/85", home && "game-outline text-xs")}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const SPARKS = [
  { x: "12%", y: "18%", s: 6, d: 0 },
  { x: "82%", y: "14%", s: 4, d: 0.8 },
  { x: "68%", y: "32%", s: 5, d: 1.6 },
  { x: "22%", y: "46%", s: 4, d: 0.4 },
  { x: "90%", y: "52%", s: 6, d: 2.2 },
  { x: "8%", y: "66%", s: 5, d: 1.2 },
  { x: "56%", y: "8%", s: 3, d: 2.8 },
  { x: "40%", y: "60%", s: 3, d: 1.9 },
];

/** Soft twinkles on the sky; static dots under reduced motion. */
function Sparkles() {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {SPARKS.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-white shadow-[0_0_8px_3px_rgba(255,255,255,0.7)]"
          style={{ left: p.x, top: p.y, width: p.s, height: p.s }}
          initial={{ opacity: 0.5 }}
          animate={reduce ? { opacity: 0.5 } : { opacity: [0.15, 0.9, 0.15], scale: [0.7, 1.15, 0.7] }}
          transition={reduce ? undefined : { duration: 3.2, repeat: Infinity, delay: p.d, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
