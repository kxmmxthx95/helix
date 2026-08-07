import { motion } from "framer-motion";
import { CloudOff, GraduationCap, LayoutDashboard, LogOut, Monitor, Moon, Sun, Users } from "@/components/icons";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui";
import { useOutboxSync } from "@/hooks/useOutboxSync";
import { canManageUsers, ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "หน้าหลัก", icon: LayoutDashboard, managerOnly: false },
  { to: "/users", label: "ผู้ใช้งาน", icon: Users, managerOnly: true },
  { to: "/roster", label: "นักเรียน", icon: GraduationCap, managerOnly: false },
];

/**
 * Fixed-viewport app shell: the outer frame never scrolls, only the middle
 * pane does. This is what stops it feeling like a web page.
 */
export function AppShell() {
  const { profile, signOut } = useAuth();
  const { preference, cycle } = useTheme();
  const { online } = useOutboxSync();
  const location = useLocation();

  const tabs = TABS.filter((t) => !t.managerOnly || (profile && canManageUsers(profile.role)));

  return (
    <div className="flex h-screen flex-col overflow-hidden overscroll-none">
      <header className="glass sticky top-0 z-20 shrink-0 border-b border-border pt-safe">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{profile?.full_name ?? "Helix"}</p>
            {profile && (
              <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[profile.role]}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={cycle}
              aria-label={`Theme: ${preference}. Tap to cycle.`}
              title={`Theme: ${preference}`}
            >
              {preference === "system" ? (
                <Monitor className="h-5 w-5" />
              ) : preference === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="ออกจากระบบ">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {!online && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-warning/15 py-1.5 text-xs text-warning">
          <CloudOff className="h-3.5 w-3.5" />
          ออฟไลน์ — บันทึกไว้ในเครื่อง จะซิงก์เมื่อกลับมาออนไลน์
        </div>
      )}

      <main className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <Outlet />
        </motion.div>
      </main>

      <nav className="glass z-20 shrink-0 border-t border-border pb-safe">
        <div className="flex h-16 items-stretch">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "tappable flex flex-1 flex-col items-center justify-center gap-1 text-xs",
                  isActive ? "text-accent" : "text-muted-foreground",
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
