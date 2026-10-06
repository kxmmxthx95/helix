import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { GameIcon } from "@/components/game/parts";
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
import { Button } from "@/components/ui";
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
    <div className="flex h-dvh justify-center overflow-hidden overscroll-none bg-[#5b2a86]">
      <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden">
        <img
          src="/game/bg-home.webp"
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <div className="absolute inset-0 -z-0 bg-gradient-to-b from-[#ff8fc0] via-[#b0207a] to-[#5b2a86] opacity-60" aria-hidden />

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
            <Button variant="ghost" size="icon" aria-label="กลับ" onClick={() => navigate(-1)} className="text-white hover:bg-white/10">
              <ChevronBack className="h-3 w-3" />
            </Button>
            <p className="font-heading text-base font-extrabold text-white [text-shadow:0_2px_0_rgb(43_15_58)]">{title}</p>
          </header>
        )}

        <main className={cn("relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3", isHome && "pt-safe")}>
          {isHome ? (
            <Outlet />
          ) : (
            <div className="mb-3 rounded-3xl border-4 border-[#2b0f3a] bg-background p-3 shadow-[0_5px_0_#2b0f3a]">
              <Outlet />
            </div>
          )}
        </main>

        <nav className="relative z-10 grid shrink-0 grid-cols-5 gap-1 border-t-4 border-[#2b0f3a] bg-[#b0207a] px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {TABS.map(({ to, name, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "tappable flex flex-col items-center gap-0.5 rounded-xl py-1 text-[10px] font-extrabold text-white",
                  isActive ? "bg-[#ff5fa2] shadow-[0_3px_0_#2b0f3a]" : "opacity-80",
                )
              }
            >
              <GameIcon name={name} fallback={icon} className="h-9 w-9" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
