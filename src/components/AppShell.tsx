import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  AirplaneIcon,
  AppsIcon,
  BarChartIcon,
  BookIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChevronBack,
  CheckmarkCircleIcon,
  ClipboardIcon,
  ChevronForward,
  CloudOff,
  CheckboxOutlineIcon,
  DocumentTextIcon,
  GraduationCap,
  HomeIcon,
  LayoutDashboard,
  LibraryIcon,
  LogOut,
  MenuIcon,
  Monitor,
  Moon,
  PersonAddIcon,
  RibbonIcon,
  SettingsIcon,
  ShieldIcon,
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
    section: "ภาพรวม",
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
    section: "บริหารจัดการ",
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
    section: "บริหารจัดการ",
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
    hideFromStudent: true,
  },
  {
    to: "/classrooms",
    label: "ห้องเรียน",
    icon: HomeIcon,
    section: "บริหารจัดการ",
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: true,
    hideFromStudent: true,
  },
  {
    to: "/status",
    label: "จัดการสถานภาพ",
    icon: AppsIcon,
    section: "บริหารจัดการ",
    managerOnly: false,
    orgWideOnly: true,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/subjects",
    label: "คลังรายวิชา",
    icon: BookIcon,
    section: "งานวิชาการ",
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
    section: "งานวิชาการ",
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
    section: "งานวิชาการ",
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
    section: "งานวิชาการ",
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
    section: "งานวิชาการ",
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/academic-events",
    label: "ปฏิทินกิจกรรม",
    icon: CalendarIcon,
    section: "งานวิชาการ",
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
    section: "การสอนและห้องเรียน",
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
    hideFromStudent: true,
  },
  {
    to: "/teaching-plan-overview",
    label: "ภาพรวมแผนการสอน",
    icon: ClipboardIcon,
    section: "การสอนและห้องเรียน",
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
    section: "การสอนและห้องเรียน",
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: true,
  },
  {
    to: "/attendance",
    label: "เช็คชื่อ",
    icon: CheckmarkCircleIcon,
    section: "การสอนและห้องเรียน",
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
    section: "การสอนและห้องเรียน",
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
    section: "การสอนและห้องเรียน",
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
    section: "สอบและแบบฝึกหัด",
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
    section: "สอบและแบบฝึกหัด",
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
    section: "สอบและแบบฝึกหัด",
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    // Own flag, not teacherOrStudentOrParentOnly (shared with /exams) —
    // a manager (canManage) also curates practice sets org/department-wide,
    // matching can_write_practice_subject's can_manage() grant (0053).
    teacherOrManagerOnly: false,
    teacherOrStudentOrParentOnly: false,
    teacherOrManagerOrStudentOrParentOnly: true,
  },
  {
    to: "/assignments",
    label: "งาน",
    icon: CheckboxOutlineIcon,
    section: "สอบและแบบฝึกหัด",
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
    studentOrParentOnly: true,
  },
  {
    to: "/time-tracking",
    label: "เวลาทำงาน",
    icon: WatchIcon,
    section: "บุคลากร",
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
    label: "จัดการลา",
    icon: AirplaneIcon,
    section: "บุคลากร",
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: true,
  },
  {
    to: "/employees",
    label: "ข้อมูลบุคลากร",
    icon: BriefcaseIcon,
    section: "บุคลากร",
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: false,
    academicManagerOnly: false,
    teacherOrManagerOnly: true,
  },
  {
    to: "/staff-attendance",
    label: "รายงานการมาทำงาน",
    icon: BarChartIcon,
    section: "บุคลากร",
    managerOnly: false,
    orgWideOnly: false,
    deptManagerOnly: true,
    academicManagerOnly: false,
    teacherOrManagerOnly: false,
  },
  {
    to: "/duty-roster",
    label: "เวรประจำวัน",
    icon: ShieldIcon,
    section: "บุคลากร",
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
    isActive ? "bg-foreground/10 text-accent" : "text-foreground",
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
  // Student homepage is deliberately blank (see Dashboard.tsx) — no title text, no header divider there.
  const isStudentHome = !!profile && profile.roles.includes("student") && location.pathname === "/";

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
      (!t.teacherOrManagerOrStudentOrParentOnly ||
        (profile &&
          (profile.roles.includes("teacher") ||
            canManage(profile.roles) ||
            profile.roles.includes("student") ||
            profile.roles.includes("parent")))) &&
      (!t.hideFromStudent || !profile || !profile.roles.includes("student")) &&
      // /time-tracking is further gated by the school-wide per-role toggle (migration 0032).
      (t.to !== "/time-tracking" ||
        (profile && profile.roles.some((r) => schoolSettings?.time_tracking_roles.includes(r)))),
  );

  const tabSections: { section: string; items: typeof tabs }[] = [];
  for (const tab of tabs) {
    const group = tabSections.find((g) => g.section === tab.section);
    if (group) group.items.push(tab);
    else tabSections.push({ section: tab.section, items: [tab] });
  }

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
      className="text-muted-foreground"
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
    <Button variant="ghost" size="icon" onClick={signOut} aria-label="ออกจากระบบ" className="text-muted-foreground">
      <LogOut className="h-3.5 w-3.5" />
    </Button>
  );

  const menuButton = (
    <Button variant="ghost" size="icon" onClick={() => setNavOpen(true)} aria-label="เมนู" title="เมนู">
      <MenuIcon className="h-3 w-3" />
    </Button>
  );

  const userLabel = (
    <button type="button" onClick={() => navigate("/profile")} className="min-w-0 text-left tappable">
      <p className="truncate text-xs font-semibold leading-tight">{displayName}</p>
      {profile && (
        <p className="truncate text-[10px] leading-tight text-muted-foreground">{roleLabels(profile.roles)}</p>
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

      {/* Desktop sidebar — fully hides (w-0) when collapsed; the toggle to bring it back lives in the main header, not in here, since this whole panel disappears. */}
      <aside
        className={cn(
          "font-ui bg-muted dark:bg-background relative z-10 hidden shrink-0 flex-col overflow-hidden transition-[width] duration-200 lg:flex",
          collapsed ? "w-0" : "w-56",
        )}
      >
        <div className="flex h-12 shrink-0 items-center px-3">
          <img src="/logo.webp" alt="Helix" className="h-6 w-auto dark:invert" />
        </div>

        <nav
          className={cn(
            "scrollbar-hidden flex flex-1 flex-col gap-4 overflow-y-auto py-2",
            collapsed ? "px-1.5" : "px-3",
          )}
        >
          {tabSections.map(({ section, items }) => (
            <div key={section}>
              {collapsed ? (
                <div className="mx-2 mb-2 border-t border-border/60" />
              ) : (
                <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">{section}</p>
              )}
              <div className="flex flex-col gap-1.5">
                {items.map(({ to, label, icon: Icon }) => (
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
                          ? "bg-foreground/10 text-accent"
                          : "text-foreground",
                      )
                    }
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "mt-auto border-t border-border/60",
            collapsed ? "flex flex-col items-center gap-1 px-1.5 py-2" : "px-3 py-2",
          )}
        >
          {collapsed ? (
            avatarButton("h-6 w-6 text-[9px]")
          ) : (
            <div className="mb-1.5 flex items-center gap-2 px-1">
              {avatarButton("h-6 w-6 text-[9px]")}
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
        </div>
      </aside>
      {avatarInput}

      {/* Main pane */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background dark:bg-muted shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.08)]">
        <header
          className={cn(
            "glass sticky top-0 z-20 shrink-0 pt-safe lg:hidden",
            !isStudentHome && "border-b border-border",
          )}
        >
          {/* Title stays leading (after menu) — never centered under the Dynamic Island */}
          <div className="flex h-12 items-center gap-2 px-shell">
            {menuButton}
            {!isStudentHome && (
              <p className="font-heading min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {pageTitle}
              </p>
            )}
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
          <nav className="flex flex-col gap-4">
            {tabSections.map(({ section, items }) => (
              <div key={section}>
                <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">{section}</p>
                <div className="flex flex-col gap-1.5">
                  {items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === "/"}
                      onClick={() => setNavOpen(false)}
                      className={navDrawerLink}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </Sheet>

        <header
          className={cn(
            "sticky top-0 z-20 hidden h-12 shrink-0 items-center gap-2 px-shell lg:flex",
            !isStudentHome && "border-b border-border/60",
          )}
        >
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
          <div className="mx-auto flex h-full w-full max-w-6xl items-center">
            {!isStudentHome && <p className="font-heading text-sm font-semibold text-foreground">{pageTitle}</p>}
            <div className="ml-auto flex items-center gap-1">
              {settingsButton}
              {themeButton}
              {signOutButton}
            </div>
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
