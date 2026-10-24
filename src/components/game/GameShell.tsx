import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { MENU } from "@/components/game/GameHud";
import { GameFrame } from "@/components/game/parts";
import { CloudOff, X } from "@/components/icons";
import { MobileHeaderProvider } from "@/components/MobileHeaderSlot";
import { useOutboxSync } from "@/hooks/useOutboxSync";
import { ROLE_LABEL } from "@/lib/roles";

const TITLES: Record<string, string> = {
  "/academic-events": "ปฏิทินกิจกรรม",
  "/subjects": "คลังรายวิชา",
};

/**
 * Student-only shell (grill decision, 2026-10-06): phone-width column, game skin. Home = mascot + HUD quick menu; every other route is a window over it.
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
  const title = TITLES[location.pathname] ?? MENU.find((m) => m.to === location.pathname)?.label ?? "";

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
      <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden min-[431px]:max-w-none">
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

        {isHome ? null : (
          <main className="relative z-10 flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-safe">
            <GameFrame kind="panel" className="mx-auto flex max-h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden !p-0 text-foreground">
              <div className="flex shrink-0 items-center gap-2">
                <GameFrame kind="title" className="flex min-h-11 flex-1 items-center px-4">
                  <h1 className="font-game text-lg font-bold text-[#2b0f3a]">{title}</h1>
                </GameFrame>
                <GameFrame kind="button" as="button" type="button" aria-label="ปิดหน้าต่าง" onClick={() => navigate("/")} className="tappable mr-1 flex h-11 w-11 items-center justify-center !rounded-xl !shadow-none">
                  <X className="h-4 w-4 text-[#2b0f3a]" />
                </GameFrame>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                <Outlet />
              </div>
            </GameFrame>
          </main>
        )}
      </div>
    </div>
  );
}
