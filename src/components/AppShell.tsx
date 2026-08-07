import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  ChevronBack,
  ChevronForward,
  CloudOff,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  SettingsIcon,
  Sun,
  Users,
} from "@/components/icons";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { Avatar, Button } from "@/components/ui";
import { useOutboxSync } from "@/hooks/useOutboxSync";
import { profileFullName } from "@/lib/database.types";
import { canManageUsers, isOrgWide, roleLabels } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "หน้าหลัก", icon: LayoutDashboard, managerOnly: false },
  { to: "/users", label: "ผู้ใช้งาน", icon: Users, managerOnly: true },
  { to: "/roster", label: "นักเรียน", icon: GraduationCap, managerOnly: false },
];

const SIDEBAR_KEY = "helix-sidebar-collapsed";

/**
 * Adaptive shell:
 * - phone / tablet (< lg): top header + bottom tabs, shared px-3
 * - desktop (lg+): equal p-2 gutter; sidebar can collapse to icon rail
 * Outer frame never scrolls — only the main pane does.
 */
export function AppShell() {
  const { profile, signOut } = useAuth();
  const displayName = profile ? profileFullName(profile) : "Helix";
  const { preference, cycle } = useTheme();
  const { online } = useOutboxSync();
  const location = useLocation();
  const navigate = useNavigate();
  const maySeeSettings = !!profile && (isOrgWide(profile.roles) || profile.roles.includes("dept_head"));
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

  const tabs = TABS.filter((t) => !t.managerOnly || (profile && canManageUsers(profile.roles)));

  const themeButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`Theme: ${preference}. Tap to cycle.`}
      title={`Theme: ${preference}`}
    >
      {preference === "system" ? (
        <Monitor className="h-4 w-4" />
      ) : preference === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );

  const settingsButton = maySeeSettings && (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate("/settings")}
      aria-label="ตั้งค่าระบบ"
      title="ตั้งค่าระบบ"
      className={location.pathname === "/settings" ? "text-foreground" : "text-muted-foreground"}
    >
      <SettingsIcon className="h-4 w-4" />
    </Button>
  );

  const signOutButton = (
    <Button variant="ghost" size="icon" onClick={signOut} aria-label="ออกจากระบบ">
      <LogOut className="h-4 w-4" />
    </Button>
  );

  const userLabel = (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">{displayName}</p>
      {profile && (
        <p className="truncate text-xs text-muted-foreground">{roleLabels(profile.roles)}</p>
      )}
    </div>
  );

  return (
    <div className="relative flex h-dvh overflow-hidden overscroll-none max-lg:flex-col max-lg:gap-0 max-lg:p-0 lg:flex-row lg:gap-2 lg:p-2">
      <div className="absolute inset-0 z-0 bg-background" aria-hidden />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "glass-sidebar relative z-10 hidden shrink-0 flex-col rounded-2xl transition-[width] duration-200 lg:flex",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex h-12 shrink-0 items-center",
            collapsed ? "justify-center px-1" : "justify-between gap-2 px-3",
          )}
        >
          {!collapsed && <p className="truncate text-sm font-bold tracking-tight">Helix</p>}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "ขยายแถบด้านข้าง" : "หุบแถบด้านข้าง"}
            aria-expanded={!collapsed}
            title={collapsed ? "ขยายแถบด้านข้าง" : "หุบแถบด้านข้าง"}
          >
            {collapsed ? (
              <ChevronForward className="h-4 w-4" />
            ) : (
              <ChevronBack className="h-4 w-4" />
            )}
          </Button>
        </div>

        <nav className={cn("flex flex-1 flex-col gap-1 py-2", collapsed ? "px-1.5" : "px-3")}>
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={label}
              className={({ isActive }) =>
                cn(
                  "tappable flex items-center rounded-lg text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2",
                  isActive
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div
          className={cn(
            "mt-auto border-t border-border/60",
            collapsed ? "flex flex-col items-center gap-1 px-1.5 py-3" : "px-3 py-3",
          )}
        >
          {collapsed ? (
            <Avatar name={displayName} className="h-8 w-8 text-[10px]" />
          ) : (
            <div className="mb-2 flex items-center gap-3 px-1">
              <Avatar name={displayName} />
              {userLabel}
            </div>
          )}
          <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
            {settingsButton}
            {themeButton}
            {signOutButton}
          </div>
        </div>
      </aside>

      {/* Main pane: no frosted frame — work area is max-w-6xl column */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="glass sticky top-0 z-20 shrink-0 border-b border-border pt-safe lg:hidden">
          <div className={cn("flex h-12 items-center justify-between", "px-3")}>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={displayName} className="h-8 w-8 text-[10px]" />
              {userLabel}
            </div>
            <div className="flex items-center gap-1">
              {themeButton}
              {signOutButton}
            </div>
          </div>
        </header>

        <header className="sticky top-0 z-20 hidden h-12 shrink-0 border-b border-border/60 lg:block">
          <div className={cn("mx-auto flex h-full w-full max-w-6xl items-center", "px-3")}>
            <p className="text-sm text-muted-foreground">ระบบจัดการสถานศึกษา</p>
          </div>
        </header>

        {!online && (
          <div
            className={cn(
              "flex shrink-0 items-center justify-center gap-2 bg-warning/15 py-1.5 text-xs text-warning",
              "px-3",
            )}
          >
            <CloudOff className="h-3.5 w-3.5" />
            ออฟไลน์ — บันทึกไว้ในเครื่อง จะซิงก์เมื่อกลับมาออนไลน์
          </div>
        )}

        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className={cn("mx-auto w-full max-w-6xl py-4", "px-3")}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Outlet />
            </motion.div>
          </div>
        </main>

        <nav className="glass z-20 shrink-0 border-t border-border pb-safe lg:hidden">
          <div className={cn("mx-auto flex h-16 max-w-2xl items-stretch", "px-3")}>
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "tappable flex flex-1 flex-col items-center justify-center gap-1 text-xs",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
