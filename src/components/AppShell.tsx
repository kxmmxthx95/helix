import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  AirplaneIcon,
  AppsIcon,
  BookIcon,
  CalendarIcon,
  ChevronBack,
  CheckmarkCircleIcon,
  ClipboardIcon,
  ChevronForward,
  CloudOff,
  CheckboxOutlineIcon,
  DocumentTextIcon,
  GraduationCap,
  LayoutDashboard,
  LibraryIcon,
  LogOut,
  MenuIcon,
  Monitor,
  Moon,
  PersonAddIcon,
  RibbonIcon,
  SettingsIcon,
  Sun,
  TimeIcon,
  TimetableIcon,
  Users,
  WatchIcon,
} from "@/components/icons";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { MobileHeaderProvider, useMobileHeaderSlot } from "@/components/MobileHeaderSlot";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Select } from "@/components/ui";
import { avatarUrl, useUploadAvatar } from "@/hooks/useAvatar";
import { useOutboxSync } from "@/hooks/useOutboxSync";
import { useSchoolSettings } from "@/hooks/useSettings";
import { profileFullName } from "@/lib/database.types";
import {
  canManage,
  canManageAcademic,
  canManageUsers,
  isOrgWide,
  ROLE_LABEL,
  ROLES,
  roleLabels,
  type Role,
} from "@/lib/roles";
import { cn } from "@/lib/utils";

const TABS = [
  {
    to: "/",
    label: "หน้าหลัก",
    icon: LayoutDashboard,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/users",
    label: "ผู้ใช้งาน",
    icon: Users,
    managerOnly: true,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/roster",
    label: "นักเรียน",
    icon: GraduationCap,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/subjects",
    label: "คลังรายวิชา",
    icon: BookIcon,
    managerOnly: false,
    orgWideOnly: true,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/curriculum",
    label: "หลักสูตร",
    icon: LibraryIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: true,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/enrollment",
    label: "ลงทะเบียน",
    icon: PersonAddIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: true,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/teaching-load",
    label: "ภาระงานสอน",
    icon: TimeIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: true,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/timetable",
    label: "ตารางสอน",
    icon: TimetableIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/teaching-plan",
    label: "แผนการสอน",
    icon: ClipboardIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/teaching-plan-overview",
    label: "ภาพรวมแผนการสอน",
    icon: ClipboardIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: true,
    teacherOrManagerOnly: false,
  },
  {
    to: "/score-recording",
    label: "บันทึกคะแนน",
    icon: DocumentTextIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: true,
  },
  {
    to: "/exam-bank",
    label: "คลังข้อสอบ",
    icon: LibraryIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: true,
  },
  {
    to: "/exams",
    label: "สอบออนไลน์",
    icon: DocumentTextIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
    teacherOrStudentOrParentOnly: true,
  },
  {
    to: "/practice",
    label: "แบบฝึกหัด",
    icon: BookIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
    teacherOrStudentOrParentOnly: true,
  },
  {
    to: "/assignments",
    label: "งาน",
    icon: CheckboxOutlineIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
    studentOrParentOnly: true,
  },
  {
    to: "/attendance",
    label: "เช็คชื่อ",
    icon: CheckmarkCircleIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: true,
  },
  {
    to: "/period-attendance",
    label: "บันทึกการเข้าเรียน",
    icon: CheckboxOutlineIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: true,
  },
  {
    to: "/behavior",
    label: "คะแนนพฤติกรรม",
    icon: RibbonIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: true,
  },
  {
    to: "/status",
    label: "จัดการสถานภาพ",
    icon: AppsIcon,
    managerOnly: false,
    orgWideOnly: true,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/academic-events",
    label: "ปฏิทินกิจกรรม",
    icon: CalendarIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/time-tracking",
    label: "เวลาทำงาน",
    icon: WatchIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    // "ทุก role ยกเว้น student/parent" คือ teacher หรือ canManage() พอดี — ไม่ต้องเพิ่ม flag ใหม่
    // (ตัดรายบทบาทเพิ่มเติมด้วย school_settings.time_tracking_roles ในตัวกรอง `tabs` ข้างล่าง)
    teacherOrManagerOnly: true,
  },
  {
    to: "/leave",
    label: "ลา",
    icon: AirplaneIcon,
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: true,
  },
];

const SIDEBAR_KEY = "helix-sidebar-collapsed";

const navDrawerLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "font-ui tappable flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
    isActive ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

/**
 * Adaptive shell:
 * - phone / tablet (< lg): top header with hamburger -> left-side nav drawer, shared px-3
 * - desktop (lg+): equal p-2 gutter; sidebar can collapse to icon rail
 * Outer frame never scrolls — only the main pane does.
 */
export function AppShell() {
  return (
    <MobileHeaderProvider>
      <AppShellInner />
    </MobileHeaderProvider>
  );
}

function AppShellInner() {
  const mobileHeaderEnd = useMobileHeaderSlot();
  const { profile, actualRoles, viewAsRole, setViewAsRole, signOut, refreshProfile } = useAuth();
  const isActualSuperAdmin = actualRoles.includes("super_admin");
  const displayName = profile ? profileFullName(profile) : "Helix";
  const { preference, cycle } = useTheme();
  const { online } = useOutboxSync();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const uploadAvatar = useUploadAvatar();
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const avatarSrc = profile ? avatarUrl(profile) : null;
  const maySeeSettings = !!profile && (isOrgWide(profile.roles) || profile.roles.includes("dept_head"));
  const { data: schoolSettings } = useSchoolSettings();

  const pickAvatar = () => avatarFileRef.current?.click();
  const onAvatarChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile) return;
    try {
      await uploadAvatar.mutateAsync({ file, profileId: profile.id });
      await refreshProfile();
    } catch {
      toast("อัปโหลดรูปไม่สำเร็จ", "error");
    }
  };

  const avatarInput = (
    <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarChosen} />
  );
  const [navOpen, setNavOpen] = useState(false);
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

  const tabs = TABS.filter(
    (t) =>
      (!t.managerOnly || (profile && canManageUsers(profile.roles))) &&
      (!t.orgWideOnly || (profile && isOrgWide(profile.roles))) &&
      (!t.deptManagerOnly || (profile && canManage(profile.roles))) &&
      (!t.academicManagerOnly || (profile && canManageAcademic(profile.roles))) &&
      (!t.teacherOrManagerOnly ||
        (profile && (profile.roles.includes("teacher") || canManage(profile.roles)))) &&
      (!t.studentOrParentOnly ||
        (profile && (profile.roles.includes("student") || profile.roles.includes("parent")))) &&
      (!t.teacherOrStudentOrParentOnly ||
        (profile &&
          (profile.roles.includes("teacher") ||
            profile.roles.includes("student") ||
            profile.roles.includes("parent")))) &&
      // /time-tracking is further gated by the school-wide per-role toggle (migration 0032).
      (t.to !== "/time-tracking" ||
        (profile && profile.roles.some((r) => schoolSettings?.time_tracking_roles.includes(r)))),
  );

  const pageTitle =
    tabs.find((t) => t.to === location.pathname || (t.to === "/" && location.pathname === "/"))?.label ??
    (location.pathname === "/settings"
      ? "ตั้งค่าระบบ"
      : location.pathname === "/profile"
        ? "โปรไฟล์"
        : "ระบบจัดการสถานศึกษา");

  const themeButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`Theme: ${preference}. Tap to cycle.`}
      title={`Theme: ${preference}`}
    >
      {preference === "system" ? (
        <Monitor className="h-3 w-3" />
      ) : preference === "dark" ? (
        <Sun className="h-3 w-3" />
      ) : (
        <Moon className="h-3 w-3" />
      )}
    </Button>
  );

  const settingsButton = maySeeSettings && (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        setNavOpen(false);
        navigate("/settings");
      }}
      aria-label="ตั้งค่าระบบ"
      title="ตั้งค่าระบบ"
      className={location.pathname === "/settings" ? "text-foreground" : "text-muted-foreground"}
    >
      <SettingsIcon className="h-3 w-3" />
    </Button>
  );

  const signOutButton = (
    <Button variant="ghost" size="icon" onClick={signOut} aria-label="ออกจากระบบ">
      <LogOut className="h-3 w-3" />
    </Button>
  );

  const menuButton = (
    <Button variant="ghost" size="icon" onClick={() => setNavOpen(true)} aria-label="เมนู" title="เมนู">
      <MenuIcon className="h-3 w-3" />
    </Button>
  );

  const userLabel = (
    <button type="button" onClick={() => navigate("/profile")} className="min-w-0 text-left tappable">
      <p className="truncate text-sm font-semibold">{displayName}</p>
      {profile && (
        <p className="truncate text-xs text-muted-foreground">{roleLabels(profile.roles)}</p>
      )}
    </button>
  );

  const avatarButton = (avatarClassName?: string) => (
    <button type="button" onClick={pickAvatar} title="เปลี่ยนรูปโปรไฟล์" className="rounded-full">
      <Avatar name={displayName} src={avatarSrc} className={avatarClassName} />
    </button>
  );

  return (
    <div className="relative flex h-dvh overflow-hidden overscroll-none max-lg:flex-col max-lg:gap-0 max-lg:p-0 lg:flex-row lg:gap-2 lg:p-2">
      <div className="absolute inset-0 z-0 bg-muted dark:bg-background" aria-hidden />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "font-ui glass-sidebar relative z-10 hidden shrink-0 flex-col overflow-hidden rounded-2xl transition-[width] duration-200 lg:flex",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex h-12 shrink-0 items-center",
            collapsed ? "justify-center px-1" : "justify-between gap-2 px-3",
          )}
        >
          {!collapsed && <img src="/logo.webp" alt="Helix" className="h-6 w-auto dark:invert" />}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "ขยายแถบด้านข้าง" : "หุบแถบด้านข้าง"}
            aria-expanded={!collapsed}
            title={collapsed ? "ขยายแถบด้านข้าง" : "หุบแถบด้านข้าง"}
          >
            {collapsed ? (
              <ChevronForward className="h-3 w-3" />
            ) : (
              <ChevronBack className="h-3 w-3" />
            )}
          </Button>
        </div>

        <nav
          className={cn(
            "scrollbar-hidden flex flex-1 flex-col gap-1 overflow-y-auto py-2",
            collapsed ? "px-1.5" : "px-3",
          )}
        >
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={label}
              className={({ isActive }) =>
                cn(
                  "font-ui tappable flex items-center rounded-lg text-xs font-semibold transition-colors",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2",
                  isActive
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-3 w-3 shrink-0" />
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
            avatarButton("h-8 w-8 text-[10px]")
          ) : (
            <div className="mb-2 flex items-center gap-3 px-1">
              {avatarButton()}
              {userLabel}
            </div>
          )}
          {isActualSuperAdmin && !collapsed && (
            <Select
              className="mb-2 h-7 text-[10px]"
              value={viewAsRole ?? ""}
              onChange={(e) => setViewAsRole((e.target.value || null) as Role | null)}
              aria-label="ดูมุมมองบทบาท"
              title="ดูมุมมองบทบาท (เมนู/สิทธิ์เท่านั้น ข้อมูลยังเป็นของผู้ดูแลระบบสูงสุด)"
            >
              <option value="">มุมมอง: ผู้ดูแลระบบสูงสุด (จริง)</option>
              {ROLES.filter((r) => r !== "super_admin").map((r) => (
                <option key={r} value={r}>
                  มุมมอง: {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
          <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
            {settingsButton}
            {themeButton}
            {signOutButton}
          </div>
        </div>
      </aside>
      {avatarInput}

      {/* Main pane: no frosted frame — work area is max-w-6xl column */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="glass sticky top-0 z-20 shrink-0 border-b border-border pt-safe lg:hidden">
          {/* Title stays leading (after menu) — never centered under the Dynamic Island */}
          <div className="flex h-12 items-center gap-2 px-shell">
            {menuButton}
            <p className="font-heading min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {pageTitle}
            </p>
            {mobileHeaderEnd ? <div className="shrink-0">{mobileHeaderEnd}</div> : null}
          </div>
        </header>

        <Sheet
          open={navOpen}
          onOpenChange={setNavOpen}
          title="เมนู"
          side="left"
          headerEnd={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNavOpen(false)}
              aria-label="หุบเมนู"
              title="หุบเมนู"
            >
              <ChevronBack className="h-3 w-3" />
            </Button>
          }
          footer={
            <div className="flex flex-col gap-0.5">
              <div className="mb-1 flex items-center gap-3 px-1 py-1">
                {avatarButton()}
                <button
                  type="button"
                  onClick={() => {
                    setNavOpen(false);
                    navigate("/profile");
                  }}
                  className="min-w-0 flex-1 text-left tappable"
                >
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  {profile && (
                    <p className="truncate text-xs text-muted-foreground">{roleLabels(profile.roles)}</p>
                  )}
                </button>
              </div>
              <div className="flex items-center justify-end gap-1 px-1 pt-1">
                {settingsButton}
                {themeButton}
                {signOutButton}
              </div>
            </div>
          }
        >
          <nav className="flex flex-col gap-0.5">
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === "/"} onClick={() => setNavOpen(false)} className={navDrawerLink}>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </nav>
        </Sheet>

        <header className="sticky top-0 z-20 hidden h-12 shrink-0 border-b border-border/60 lg:block">
          <div className="mx-auto flex h-full w-full max-w-6xl items-center px-shell">
            <p className="font-heading text-sm font-semibold text-foreground">{pageTitle}</p>
          </div>
        </header>

        {!online && (
          <div
            className={cn(
              "flex shrink-0 items-center justify-center gap-2 bg-warning/15 py-1.5 text-xs text-warning",
              "px-shell",
            )}
          >
            <CloudOff className="h-3.5 w-3.5" />
            ออฟไลน์ — บันทึกไว้ในเครื่อง จะซิงก์เมื่อกลับมาออนไลน์
          </div>
        )}

        {isActualSuperAdmin && viewAsRole && (
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 bg-accent/15 py-1.5 text-xs text-accent px-shell">
            <span>
              กำลังดูมุมมองแบบ <strong>{ROLE_LABEL[viewAsRole]}</strong> (เมนู/สิทธิ์เท่านั้น — ข้อมูลที่เห็นยังเป็นของผู้ดูแลระบบสูงสุด)
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-accent" onClick={() => setViewAsRole(null)}>
              กลับเป็นตัวเอง
            </Button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-6xl px-shell pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
      </div>
    </div>
  );
}
