import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { GameFrame, GameIcon, FRAMES, frameStyle, useArt } from "@/components/game/parts";
import {
  ChevronBack,
  ClipboardIcon,
  CloudOff,
  DocumentTextIcon,
  GraduationCap,
  HomeIcon,
  TimetableIcon,
} from "@/components/icons";
import { MobileHeaderProvider } from "@/components/MobileHeaderSlot";
import { useOutboxSync } from "@/hooks/useOutboxSync";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", name: "tab-home", label: "หน้าหลัก", icon: HomeIcon },
  { to: "/assignments", name: "tab-assignments", label: "งาน", icon: ClipboardIcon },
  { to: "/exams", name: "tab-exams", label: "สอบ", icon: DocumentTextIcon },
  { to: "/timetable", name: "tab-timetable", label: "ตารางเรียน", icon: TimetableIcon },
  { to: "/profile", name: "tab-profile", label: "โปรไฟล์", icon: GraduationCap },
] as const;

function TabLink({ to, name, label, icon }: (typeof TABS)[number]) {
  const art = useArt("frame-tab");
  return (
    <NavLink
      to={to}
      end={to === "/"}
      style={({ isActive }) => (isActive && art ? frameStyle("tab") : undefined)}
      className={({ isActive }) =>
        cn(
          "tappable flex flex-col items-center gap-0.5 py-1 font-game text-[10px] font-bold text-white",
          isActive ? !art && FRAMES.tab.fallback : "opacity-80",
        )
      }
    >
      <GameIcon name={name} fallback={icon} className="h-9 w-9 drop-shadow" />
      {label}
    </NavLink>
  );
}

const TITLES: Record<string, string> = {
  "/practice": "แบบฝึกหัด",
  "/academic-events": "ปฏิทินกิจกรรม",
  "/subjects": "คลังรายวิชา",
};

/**
 * Student-only shell (grill decision, 2026-10-06): phone-width column, game skin, bottom tab bar.
 * `.theme-game` goes on <html> — Sheets/Toasts portal outside this tree.
 */
export function GameShell() {
  useEffect(() => {
    document.documentElement.classList.add("theme-game");
    return () => document.documentElement.classList.remove("theme-game");
  }, []);

  return (
    <MobileHeaderProvider>
      <GameShellInner />
    </MobileHeaderProvider>
  );
}

function GameShellInner() {
  const { actualRoles, viewAsRole, setViewAsRole } = useAuth();
  const { online } = useOutboxSync();
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";
  const title = TABS.find((t) => t.to === location.pathname)?.label ?? TITLES[location.pathname] ?? "";

  return (
    <div className="fixed inset-0 flex justify-center overflow-hidden overscroll-none bg-[#f3b6d4]">
      {/* Desktop backdrop; lazy + hidden on phones so it is never fetched there. */}
      <img
        src="/game/bg-desktop.webp"
        alt=""
        aria-hidden
        draggable={false}
        loading="lazy"
        className="absolute inset-0 hidden h-full w-full object-cover min-[431px]:block"
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
      <div className={cn("relative flex h-full w-full max-w-[430px] flex-col overflow-hidden", isHome && "min-[431px]:landscape:max-w-none")}>
        <img
          src="/game/bg-home.webp"
          alt=""
          aria-hidden
          draggable={false}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover min-[431px]:hidden"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <div className="absolute inset-0 -z-0 bg-gradient-to-t from-[#2b0f3a]/50 via-transparent to-transparent min-[431px]:hidden" aria-hidden />

        {!online && (
          <div className="relative z-10 flex items-center justify-center gap-2 bg-warning/90 py-1 pt-safe text-xs font-bold text-white">
            <CloudOff className="h-3.5 w-3.5" />
            ออฟไลน์
          </div>
        )}
        {actualRoles.includes("super_admin") && viewAsRole && (
          <div className="relative z-10 flex items-center justify-center gap-2 bg-accent py-1 text-xs font-bold text-white">
            มุมมอง {ROLE_LABEL[viewAsRole]}
            <button type="button" className="underline" onClick={() => setViewAsRole(null)}>
              กลับเป็นตัวเอง
            </button>
          </div>
        )}

        {!isHome && (
          <header className="relative z-10 flex h-12 shrink-0 items-center gap-2 px-3 pt-safe">
            <GameFrame kind="sign" as="button" type="button" aria-label="กลับ" onClick={() => navigate(-1)} className="tappable flex h-9 w-9 items-center justify-center">
              <ChevronBack className="h-3 w-3 text-white [.game-art_&]:text-[#2b0f3a]" />
            </GameFrame>
            <p className="font-game text-lg font-bold text-white [text-shadow:0_2px_0_rgb(43_15_58)]">{title}</p>
          </header>
        )}

        <main className={cn("relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3", isHome && "pt-safe")}>
          {isHome ? (
            <Outlet />
          ) : (
            <GameFrame kind="panel" className="mb-3 p-2 text-foreground">
              <Outlet />
            </GameFrame>
          )}
        </main>

        <GameFrame kind="bar" as="div" className={cn("relative z-10 grid shrink-0 grid-cols-5 gap-1 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]", isHome && "min-[431px]:landscape:hidden")} role="navigation">
          {TABS.map((t) => (
            <TabLink key={t.to} {...t} />
          ))}
        </GameFrame>
      </div>
    </div>
  );
}
