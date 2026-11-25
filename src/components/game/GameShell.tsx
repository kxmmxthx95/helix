import { MotionConfig } from "framer-motion";
import { Fragment, useEffect, useState } from "react";
import { FiSidebar } from "react-icons/fi";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import {
  BookIcon,
  CalendarIcon,
  ChevronBack,
  CheckboxOutlineIcon,
  CloudOff,
  DocumentTextIcon,
  HomeIcon,
  LibraryIcon,
  ListIcon,
  LogOut,
  MenuIcon,
  Monitor,
  Moon,
  PricetagIcon,
  ProfileIcon,
  Sun,
  TimetableIcon,
} from "@/components/icons";
import { MobileHeaderProvider } from "@/components/MobileHeaderSlot";
import { GlyphTile, SECTION_TONE } from "@/components/IconTile";
import { Sheet } from "@/components/Sheet";
import { useTheme } from "@/components/ThemeProvider";
import { Avatar } from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
import { useRoleSubtitle } from "@/hooks/useProfiles";
import { profileFullName } from "@/lib/database.types";
import { useOutboxSync } from "@/hooks/useOutboxSync";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** Route window titles. */
const TITLES: Record<string, string> = {
  "/assignments": "งาน",
  "/exams": "สอบ",
  "/timetable": "ตารางเรียน",
  "/my-curriculum": "ผังการเรียน",
  "/academic-events": "ปฏิทินกิจกรรม",
  "/practice": "แบบฝึกหัด",
  "/documents": "เอกสาร",
  "/profile": "โปรไฟล์",
  "/card-topup": "บัตรเติมเงิน",
  "/subjects": "คลังรายวิชา",
};

type Icon = typeof BookIcon;
/** `section` only picks the tile colour — same palette as the teacher sidebar. */
type NavItem = { to: string; label: string; icon: Icon; section: string };

/** Desktop sidebar + menu sheet, grouped by section (a heading shows where the section changes). */
const SIDE: readonly NavItem[] = [
  { to: "/", label: "หน้าแรก", icon: HomeIcon, section: "" },
  { to: "/timetable", label: "ตารางเรียน", icon: TimetableIcon, section: "งานวิชาการ" },
  { to: "/my-curriculum", label: "ผังการเรียน", icon: ListIcon, section: "งานวิชาการ" },
  { to: "/academic-events", label: "ปฏิทินกิจกรรม", icon: CalendarIcon, section: "งานวิชาการ" },
  { to: "/assignments", label: "งาน", icon: CheckboxOutlineIcon, section: "สอบและแบบฝึกหัด" },
  { to: "/exams", label: "สอบ", icon: DocumentTextIcon, section: "สอบและแบบฝึกหัด" },
  { to: "/practice", label: "แบบฝึกหัด", icon: BookIcon, section: "สอบและแบบฝึกหัด" },
  { to: "/documents", label: "เอกสาร", icon: LibraryIcon, section: "สอบและแบบฝึกหัด" },
  { to: "/card-topup", label: "บัตรเติมเงิน", icon: PricetagIcon, section: "การเงิน" },
  { to: "/profile", label: "โปรไฟล์", icon: ProfileIcon, section: "บัญชี" },
];
const startsSection = (i: number) => !!SIDE[i]!.section && SIDE[i]!.section !== SIDE[i - 1]?.section;

const isActive = (pathname: string, to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`));
const SIDEBAR_KEY = "helix-sidebar-collapsed"; // shared with the teacher shell
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

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
  const { actualRoles, viewAsRole, setViewAsRole, signOut } = useAuth();
  const { online } = useOutboxSync();
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";
  // Pages that lay out their own full-width canvas (no centred max-width column).
  const isTopupForm = location.pathname.startsWith("/card-topup/");
  // Practice mode returns to the exam list with the filters the student had (passed via location.state).
  const isPractice = location.pathname.startsWith("/exams/practice/");
  const backSearch = (location.state as { search?: string } | null)?.search ?? "";
  const title = isTopupForm ? "เติมเงิน" : isPractice ? "สอบ" : (TITLES[location.pathname] ?? "");
  // iOS large title: collapses into the nav bar once the page scrolls under it.
  const [scrolled, setScrolled] = useState(false);
  // Every non-home page shows its title centered in the nav bar (the large title below is sr-only).
  const titleShown = !isHome || scrolled;
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setScrolled(false), [location.pathname]);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore quota / private mode */
    }
  }, [collapsed]);

  return (
    <div className={cn("fixed inset-0 flex overflow-hidden overscroll-none bg-background lg:p-2", collapsed ? "lg:gap-0" : "lg:gap-2")}>
      <div className="absolute inset-0 z-0 hidden bg-shell lg:block" aria-hidden />
      <div className="pointer-events-none absolute left-3 top-4 z-20 hidden lg:block">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "ขยายแถบด้านข้าง" : "หุบแถบด้านข้าง"}
          aria-expanded={!collapsed}
          className={cn("pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg text-foreground ", FOCUS)}
        >
          <FiSidebar className="h-3.5 w-3.5" />
        </button>
      </div>
      <Sidebar pathname={location.pathname} collapsed={collapsed} />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden bg-background lg:rounded-2xl lg:shadow-card">
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

        <header
          className={cn(
            "z-20 shrink-0 border-b-[0.5px] pt-safe transition-colors duration-200",
            isHome ? "relative lg:hidden" : "relative",
            scrolled ? "pointer-events-auto border-border bg-card/80 backdrop-blur-xl backdrop-saturate-150" : "border-transparent bg-background lg:border-border",
          )}
        >
          <div className="relative flex h-12 items-center justify-center px-shell">
            {isHome && (
              <button
                type="button"
                aria-label="เมนู"
                onClick={() => setMenuOpen(true)}
                className={cn("absolute left-2 flex h-10 w-10 items-center justify-center rounded-lg text-foreground active:opacity-40 lg:hidden", FOCUS)}
              >
                <MenuIcon className="h-5 w-5" />
              </button>
            )}
            {!isHome && (
              <button
                type="button"
                aria-label={isTopupForm ? "กลับบัตรเติมเงิน" : isPractice ? "กลับรายการสอบ" : "กลับหน้าแรก"}
                onClick={() => (isPractice ? navigate({ pathname: "/exams", search: backSearch }) : navigate(isTopupForm ? "/card-topup" : "/"))}
                className={cn("absolute left-2 flex h-10 w-10 items-center justify-center rounded-lg text-foreground active:opacity-40 lg:hidden", FOCUS)}
              >
                <ChevronBack className="h-5 w-5" />
              </button>
            )}
            <p
              aria-hidden={!titleShown}
              className={cn(
                "font-heading max-w-[55%] truncate text-[17px] font-semibold tracking-[-0.01em] transition-opacity duration-200 lg:max-w-none lg:text-[15px] lg:opacity-100",
                titleShown ? "opacity-100" : "opacity-0",
              )}
            >
              {isHome ? "หน้าแรก" : title}
            </p>
          </div>
        </header>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="เมนู" side="left">
          <nav aria-label="เมนูหลัก" className="flex flex-col gap-1">
            {SIDE.map(({ to, label, icon: Icon, section }, i) => (
              <Fragment key={to}>
              {startsSection(i) && <p className="px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground">{section}</p>}
              <button
                type="button"
                aria-current={isActive(location.pathname, to) ? "page" : undefined}
                onClick={() => {
                  setMenuOpen(false);
                  navigate(to);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium active:bg-muted",
                  isActive(location.pathname, to) && "bg-muted",
                  FOCUS,
                )}
              >
                <GlyphTile icon={Icon} tone={SECTION_TONE[section] ?? "bg-slate-500"} />
                {label}
              </button>
              </Fragment>
            ))}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                void signOut();
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-destructive active:bg-destructive/10",
                FOCUS,
              )}
            >
              <LogOut className="h-5 w-5 shrink-0" />
              ออกจากระบบ
            </button>
          </nav>
        </Sheet>

        <main
          id="student-scroll"
          onScroll={(e) => {
            const next = e.currentTarget.scrollTop > (isHome ? 64 : 30);
            if (next !== scrolled) setScrolled(next);
          }}
          className={cn("scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain", !isHome && "flex flex-col")}
        >
          {isHome ? (
            <Outlet />
          ) : (
            <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 flex-col px-shell pb-4 pt-3 lg:py-6">
              <h1 className="sr-only">{title}</h1>
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Sidebar({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { preference, cycle } = useTheme();
  const roleSubtitle = useRoleSubtitle(profile?.id, profile?.roles ?? []);
  const displayName = profile ? profileFullName(profile) : "Helix";
  const footerIcon = "tappable flex h-10 flex-1 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground";
  return (
    <aside className={cn("font-ui relative z-10 hidden shrink-0 flex-col overflow-hidden bg-shell transition-[width] duration-200 ease-ios lg:flex", collapsed ? "w-0" : "w-60")}>
      <div className="flex h-12 shrink-0 items-center px-3">
        <img src="/logo.webp" alt="Helix" className="ml-auto h-6 w-auto dark:invert" />
      </div>
      <nav aria-label="เมนูหลัก" className="scrollbar-hidden flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {SIDE.map(({ to, label, icon: Icon, section }, i) => {
          const active = isActive(pathname, to);
          return (
            <Fragment key={to}>
            {startsSection(i) && <p className="px-2.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">{section}</p>}
            <button
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => navigate(to)}
              className={cn(
                "group tappable flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold transition-colors",
                active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-foreground/5",
                FOCUS,
              )}
            >
              <GlyphTile icon={Icon} tone={SECTION_TONE[section] ?? "bg-slate-500"} />
              <span className="truncate">{label}</span>
            </button>
            </Fragment>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t border-border/60 p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-card p-2.5 shadow-card">
          <Avatar name={displayName} src={profile ? avatarUrl(profile) : null} className="h-9 w-9 text-xs" />
          <button type="button" onClick={() => navigate("/profile")} className="tappable min-w-0 flex-1 text-left">
            <p className="truncate text-[13px] font-semibold leading-tight">{displayName}</p>
            {profile && <p className="truncate text-[11px] leading-tight text-muted-foreground">{roleSubtitle}</p>}
          </button>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={cycle} aria-label={`Theme: ${preference}. Tap to cycle.`} className={footerIcon}>
            {preference === "system" ? <Monitor className="h-4 w-4" /> : preference === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" onClick={signOut} title="ออกจากระบบ" aria-label="ออกจากระบบ" className={cn(footerIcon, "hover:bg-destructive/10 hover:text-destructive")}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
