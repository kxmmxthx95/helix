import { MotionConfig } from "framer-motion";
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import {
  BookIcon,
  CalendarIcon,
  ChevronBack,
  ClipboardIcon,
  CloudOff,
  DocumentTextIcon,
  GraduationCap,
  HomeIcon,
  LibraryIcon,
  PricetagIcon,
  ProfileIcon,
  TimetableIcon,
} from "@/components/icons";
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
  "/card-topup": "บัตรเติมเงิน",
  "/subjects": "คลังรายวิชา",
};

type Icon = typeof BookIcon;
type NavItem = { to: string; label: string; icon: Icon };

/** Mobile bottom bar. */
const TABS: readonly NavItem[] = [
  { to: "/", label: "หน้าแรก", icon: HomeIcon },
  { to: "/timetable", label: "ตารางเรียน", icon: TimetableIcon },
  { to: "/exams", label: "สอบ", icon: DocumentTextIcon },
  { to: "/practice", label: "แบบฝึกหัด", icon: BookIcon },
  { to: "/profile", label: "โปรไฟล์", icon: ProfileIcon },
];

/** Desktop sidebar. */
const SIDE: readonly NavItem[] = [
  { to: "/", label: "หน้าแรก", icon: HomeIcon },
  { to: "/assignments", label: "งาน", icon: ClipboardIcon },
  { to: "/exams", label: "สอบ", icon: DocumentTextIcon },
  { to: "/timetable", label: "ตารางเรียน", icon: TimetableIcon },
  { to: "/practice", label: "แบบฝึกหัด", icon: BookIcon },
  { to: "/academic-events", label: "ปฏิทินกิจกรรม", icon: CalendarIcon },
  { to: "/documents", label: "เอกสาร", icon: LibraryIcon },
  { to: "/card-topup", label: "บัตรเติมเงิน", icon: PricetagIcon },
  { to: "/profile", label: "โปรไฟล์", icon: ProfileIcon },
];

const isActive = (pathname: string, to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`));
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[#e0398a] focus-visible:ring-offset-2";

/**
 * Student-only shell. Mobile: scrolling page + bottom tab bar. Desktop (lg): left sidebar + wide content.
 * `.theme-game` goes on <html> (pink tokens) — Sheets/Toasts portal outside this tree.
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
  const isHome = location.pathname === "/";
  const title = TITLES[location.pathname] ?? "";

  return (
    <div className="fixed inset-0 flex overflow-hidden overscroll-none bg-background">
      <Sidebar pathname={location.pathname} />

      <div className="relative flex min-w-0 flex-1 flex-col">
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

        {!isHome && (
          <header className="relative z-10 flex h-14 shrink-0 items-center gap-1 border-b border-border bg-background/90 px-2 pt-safe backdrop-blur-md lg:h-16 lg:px-6">
            <button
              type="button"
              aria-label="กลับหน้าแรก"
              onClick={() => navigate("/")}
              className={cn("flex h-10 w-10 items-center justify-center rounded-full text-[#9c1f63] hover:bg-secondary lg:hidden", FOCUS)}
            >
              <ChevronBack className="h-5 w-5" />
            </button>
            <h1 className="font-heading min-w-0 flex-1 truncate text-lg font-semibold tracking-tight lg:text-xl">{title}</h1>
          </header>
        )}

        <main id="student-scroll" className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", !isHome && "flex flex-col")}>
          {isHome ? (
            <Outlet />
          ) : (
            <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col p-3 lg:p-6">
              <Outlet />
            </div>
          )}
        </main>

        <TabBar pathname={location.pathname} />
      </div>
    </div>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff7ab8] to-[#c0267a] text-white shadow-sm">
          <GraduationCap className="h-5 w-5" />
        </span>
        <span className="font-heading text-lg font-bold tracking-tight">Helix</span>
      </div>
      <nav aria-label="เมนูหลัก" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {SIDE.map(({ to, label, icon: Icon }) => {
          const active = isActive(pathname, to);
          return (
            <button
              key={to}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => navigate(to)}
              className={cn(
                "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                active ? "bg-[#fde3f0] text-[#9c1f63]" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                FOCUS,
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  return (
    <nav
      aria-label="เมนูหลัก"
      className="relative z-20 shrink-0 border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-[480px] grid-cols-5">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = isActive(pathname, to);
          return (
            <li key={to}>
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => navigate(to)}
                className={cn("flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl transition-colors", FOCUS)}
              >
                <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-colors", active ? "bg-[#fde3f0] text-[#c0267a]" : "text-muted-foreground")}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className={cn("text-[11px] font-medium leading-tight", active ? "text-[#9c1f63]" : "text-muted-foreground")}>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
