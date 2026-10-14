import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import {
  AirplaneIcon,
  BarChartIcon,
  AppsIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckmarkCircleIcon,
  ImageIcon,
  InfoIcon,
  LibraryIcon,
  ListIcon,
  NotificationIcon,
  PencilIcon,
  Plus,
  ProfileIcon,
  RibbonIcon,
  Search,
  SettingsIcon,
  ShieldIcon,
  TimeIcon,
  Upload,
  Users,
  X,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Pagination, Select, Skeleton, Spinner, Switch } from "@/components/ui";
import {
  useAcademicTerms,
  useSaveAcademicTerm,
  useSetAcademicTermStatus,
  type AcademicTermDraft,
} from "@/hooks/useAcademicTerms";
import {
  schoolLogoUrl,
  useDepartmentSettings,
  useSchoolSettings,
  useUpdateDepartmentSettings,
  useUpdateSchoolSettings,
  useUploadLogo,
  type DepartmentSettingsEdit,
  type SchoolSettingsEdit,
} from "@/hooks/useSettings";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments } from "@/hooks/useProfiles";
import { getCurrentPosition } from "@/lib/geofence";
import {
  useDeleteLeaveType,
  useLeaveTypes,
  useSaveLeaveType,
  type LeaveTypeDraft,
} from "@/hooks/useLeave";
import {
  useDeleteSalaryGrade,
  useDepartmentHeadcount,
  useSalaryGradeCounts,
  useSalaryGrades,
  useSaveSalaryGrade,
  type SalaryGradeDraft,
} from "@/hooks/useEmployees";
import type { AcademicTerm, LeaveType, SalaryGrade, TermStatus, TermType } from "@/lib/database.types";
import { canManageHr, isDeptHead, isOrgWide, ROLE_LABEL, ROLES, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TERM_TYPE_LABEL: Record<TermType, string> = {
  term1: "เทอม 1",
  term2: "เทอม 2",
  summer: "ภาคฤดูร้อน",
};

const TERM_STATUS_LABEL: Record<TermStatus, string> = {
  upcoming: "กำลังจะถึง",
  active: "เทอมปัจจุบัน",
  locked: "ล็อกแล้ว",
  archived: "เก็บถาวร",
};

/** ทุก role ยกเว้น student/parent — ผู้เข้าข่ายบันทึกเวลาทำงาน (migration 0032). */
const STAFF_ROLES: Role[] = ROLES.filter((r) => r !== "student" && r !== "parent");

type IconComponent = (p: { className?: string }) => React.JSX.Element;

const ROLE_ICON: Partial<Record<Role, { icon: IconComponent; tint: string }>> = {
  super_admin: { icon: RibbonIcon, tint: "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300" },
  director: { icon: ShieldIcon, tint: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" },
  staff: { icon: BriefcaseIcon, tint: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" },
  dept_director: { icon: Users, tint: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300" },
  dept_head: { icon: Users, tint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
  teacher: { icon: ProfileIcon, tint: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300" },
};

const TAB_ICON: Record<SettingsTab, IconComponent> = {
  school: SettingsIcon,
  leave_types: AirplaneIcon,
  salary_grades: BriefcaseIcon,
  department: LibraryIcon,
  terms: CalendarIcon,
};

/** A settings section: tinted icon tile + title/subtitle header, then the body. */
function SectionCard({
  icon: Icon,
  tint,
  title,
  subtitle,
  children,
}: {
  icon: IconComponent;
  tint: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tint)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SchoolSettingsCard() {
  const toast = useToast();
  const { data: settings, isLoading } = useSchoolSettings();
  const update = useUpdateSchoolSettings();
  const upload = useUploadLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Pick<
    SchoolSettingsEdit,
    "name_th" | "name_en" | "time_tracking_roles"
  > | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        name_th: settings.name_th,
        name_en: settings.name_en,
        time_tracking_roles: settings.time_tracking_roles,
      });
    }
  }, [settings]);

  if (isLoading || !form || !settings) {
    return (
      <div className="space-y-4" role="status" aria-label="กำลังโหลด">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-28" />
      </div>
    );
  }

  const logoUrl = schoolLogoUrl(settings);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate(form, { onSuccess: () => toast("บันทึกสำเร็จ") });
      }}
    >
      <SectionCard
        icon={SettingsIcon}
        tint="bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300"
        title="ข้อมูลโรงเรียน"
        subtitle="ตั้งค่าข้อมูลพื้นฐานของโรงเรียนที่ใช้ในระบบ"
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-full border border-border bg-muted text-xs text-muted-foreground">
            {logoUrl ? (
              <img src={logoUrl} alt="โลโก้โรงเรียน" className="h-full w-full object-contain" />
            ) : (
              <>
                <ImageIcon className="h-5 w-5" />
                เพิ่มโลโก้
              </>
            )}
          </div>
          <div className="flex min-w-[16rem] flex-1 items-center gap-4 rounded-xl border border-dashed border-border bg-muted/40 p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
              <Upload className="h-6 w-6" />
            </div>
            <div className="space-y-1.5">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload.mutate(file);
                  e.target.value = "";
                }}
              />
              <p className="text-sm font-bold">อัปโหลดโลโก้โรงเรียน</p>
              <p className="text-xs text-muted-foreground">รองรับไฟล์รูปภาพ ใช้สร้าง Header เอกสาร</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={upload.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {upload.isPending ? <Spinner className="h-3.5 w-3.5" /> : "เลือกไฟล์"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อโรงเรียน (ไทย)">
            <Input
              required
              value={form.name_th}
              onChange={(e) => setForm({ ...form, name_th: e.target.value })}
            />
          </Field>
          <Field label="ชื่อโรงเรียน (อังกฤษ)">
            <Input
              value={form.name_en ?? ""}
              onChange={(e) => setForm({ ...form, name_en: e.target.value || null })}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        icon={TimeIcon}
        tint="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"
        title="สิทธิ์การใช้งานบันทึกเวลาทำงาน"
        subtitle='เปิดใช้งานบันทึกเวลาทำงานสำหรับบทบาท (ไม่เปิด = บทบาทนั้นไม่เห็นเมนู "เวลาทำงาน")'
      >
        <div className="divide-y divide-border">
          {STAFF_ROLES.map((role) => {
            const meta = ROLE_ICON[role];
            return (
              <label key={role} className="flex items-center gap-3 py-2.5 text-sm">
                {meta && (
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.tint)}>
                    <meta.icon className="h-4 w-4" />
                  </span>
                )}
                <span className="flex-1 font-medium">{ROLE_LABEL[role]}</span>
                <Switch
                  checked={form.time_tracking_roles.includes(role)}
                  label={ROLE_LABEL[role]}
                  onChange={(checked) =>
                    setForm({
                      ...form,
                      time_tracking_roles: checked
                        ? [...form.time_tracking_roles, role]
                        : form.time_tracking_roles.filter((r) => r !== role),
                    })
                  }
                />
              </label>
            );
          })}
        </div>
      </SectionCard>

      <div className="flex justify-end pb-6">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Spinner className="h-3 w-3" /> : <CheckmarkCircleIcon className="h-4 w-4" />}
          บันทึกการตั้งค่า
        </Button>
      </div>
    </form>
  );
}

type DepartmentForm = Pick<
  DepartmentSettingsEdit,
  | "score_collect_pct"
  | "score_exam_pct"
  | "min_periods_per_week"
  | "max_periods_per_week"
  | "work_start_time"
  | "checkin_lat"
  | "checkin_lng"
  | "checkin_radius_m"
>;

const toDepartmentForm = (s: DepartmentForm): DepartmentForm => ({
  score_collect_pct: s.score_collect_pct,
  score_exam_pct: s.score_exam_pct,
  min_periods_per_week: s.min_periods_per_week,
  max_periods_per_week: s.max_periods_per_week,
  work_start_time: s.work_start_time,
  checkin_lat: s.checkin_lat,
  checkin_lng: s.checkin_lng,
  checkin_radius_m: s.checkin_radius_m,
});

const nullableNumber = (raw: string) => (raw === "" ? null : Number(raw));

function NoteBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted p-4 text-xs">
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <InfoIcon className="h-4 w-4" /> หมายเหตุ
      </p>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

function DepartmentSettingsCard({ departmentId, departmentName }: { departmentId: string; departmentName: string }) {
  const toast = useToast();
  const { data: settings, isLoading } = useDepartmentSettings(departmentId);
  const { data: headcount } = useDepartmentHeadcount(departmentId);
  const update = useUpdateDepartmentSettings(departmentId);
  const [form, setForm] = useState<DepartmentForm | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (settings) setForm(toDepartmentForm(settings));
  }, [settings]);

  if (isLoading || !form || !settings) {
    return (
      <div className="space-y-3" role="status" aria-label="กำลังโหลด">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  const tint = {
    chart: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
    bell: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    time: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate(form, { onSuccess: () => toast("บันทึกสำเร็จ") });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted">
            <LibraryIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{departmentName ? `ตั้งค่าแผนก${departmentName}` : "ตั้งค่าแผนก"}</h2>
            <p className="text-xs text-muted-foreground">กำหนดระบบเวลาทำงานและนโยบายการให้คะแนนของแผนก</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 dark:bg-blue-500/10">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">จำนวนบุคลากรในแผนก</p>
            <p className="text-xl font-bold">{headcount ?? "—"} คน</p>
          </div>
        </div>
      </div>

      <SectionCard
        icon={BarChartIcon}
        tint={tint.chart}
        title="สัดส่วนคะแนนเก็บ : สอบ"
        subtitle="ค่า default ของแผนก — แต่ละวิชากำหนดสัดส่วนของตัวเองแทนได้ภายหลัง"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.1fr]">
          <Field label="คะแนนเก็บ (%)">
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="ยังไม่กำหนด"
                className="pr-8"
                value={form.score_collect_pct ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setForm({ ...form, score_collect_pct: null, score_exam_pct: null });
                    return;
                  }
                  const collect = Math.min(100, Math.max(0, Number(raw)));
                  setForm({ ...form, score_collect_pct: collect, score_exam_pct: 100 - collect });
                }}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </Field>
          <Field label="คะแนนสอบ (%)">
            <div className="relative">
              <Input readOnly disabled value={form.score_exam_pct ?? ""} placeholder="คำนวณอัตโนมัติ" className="pr-8" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </Field>
          <NoteBox>ค่าดังกล่าวเป็นค่าเริ่มต้นของแผนก ครูสามารถกำหนดสัดส่วนคะแนนเฉพาะรายวิชาได้ภายหลัง</NoteBox>
        </div>
      </SectionCard>

      <SectionCard
        icon={NotificationIcon}
        tint={tint.bell}
        title="เกณฑ์คาบสอน/สัปดาห์ (แจ้งเตือนภาระงาน)"
        subtitle="ไม่กำหนด = ไม่มีการแจ้งเตือน"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="จำนวนคาบต่ำสุด (คาบ)">
            <Input
              type="number"
              min={0}
              placeholder="ไม่กำหนด"
              value={form.min_periods_per_week ?? ""}
              onChange={(e) => setForm({ ...form, min_periods_per_week: nullableNumber(e.target.value) })}
            />
          </Field>
          <Field label="จำนวนคาบสูงสุด (คาบ)">
            <Input
              type="number"
              min={0}
              placeholder="ไม่กำหนด"
              value={form.max_periods_per_week ?? ""}
              onChange={(e) => setForm({ ...form, max_periods_per_week: nullableNumber(e.target.value) })}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        icon={TimeIcon}
        tint={tint.time}
        title="เวลาทำงาน (บันทึกเวลาเข้า-ออกงาน)"
        subtitle="กำหนดเวลาเข้างานและตำแหน่งที่อนุญาตให้ลงเวลา"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.1fr]">
          <Field label="เวลาเข้างานมาตรฐาน">
            <Input
              type="time"
              value={form.work_start_time ?? ""}
              onChange={(e) => setForm({ ...form, work_start_time: e.target.value || null })}
            />
          </Field>
          <Field label="ละติจูด">
            <Input
              type="number"
              step="any"
              placeholder="ไม่กำหนด"
              value={form.checkin_lat ?? ""}
              onChange={(e) => setForm({ ...form, checkin_lat: nullableNumber(e.target.value) })}
            />
          </Field>
          <Field label="ลองจิจูด">
            <Input
              type="number"
              step="any"
              placeholder="ไม่กำหนด"
              value={form.checkin_lng ?? ""}
              onChange={(e) => setForm({ ...form, checkin_lng: nullableNumber(e.target.value) })}
            />
          </Field>
          <div className="row-span-2 hidden lg:block">
            <NoteBox>ไม่กำหนดตำแหน่ง = ไม่บังคับการลงเวลา ไม่ว่าจะอยู่ที่ไหนก็สามารถลงเวลาได้</NoteBox>
          </div>
          <Field label="รัศมี (เมตร)">
            <Input
              type="number"
              min={1}
              placeholder="ไม่กำหนด"
              value={form.checkin_radius_m ?? ""}
              onChange={(e) => setForm({ ...form, checkin_radius_m: nullableNumber(e.target.value) })}
            />
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              disabled={locating}
              onClick={async () => {
                setLocating(true);
                const pos = await getCurrentPosition();
                setLocating(false);
                if ("error" in pos) {
                  toast("หาตำแหน่งไม่สำเร็จ — เปิดสิทธิ์ location ของเบราว์เซอร์ก่อน", "error");
                  return;
                }
                setForm({ ...form, checkin_lat: pos.lat, checkin_lng: pos.lng });
              }}
            >
              {locating ? <Spinner className="h-3.5 w-3.5" /> : "ใช้ตำแหน่งปัจจุบัน"}
            </Button>
          </div>
        </div>
        <div className="lg:hidden">
          <NoteBox>ไม่กำหนดตำแหน่ง = ไม่บังคับการลงเวลา ไม่ว่าจะอยู่ที่ไหนก็สามารถลงเวลาได้</NoteBox>
        </div>
      </SectionCard>

      <div className="flex justify-end pb-6">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Spinner className="h-3 w-3" /> : <CheckmarkCircleIcon className="h-4 w-4" />}
          บันทึกการตั้งค่า
        </Button>
      </div>
    </form>
  );
}

const TERM_STATUS_DOT: Record<TermStatus, string> = {
  active: "bg-success",
  upcoming: "bg-warning",
  locked: "bg-muted-foreground/50",
  archived: "bg-destructive",
};

function TermStatusControl({ term, orgWide }: { term: AcademicTerm; orgWide: boolean }) {
  const setStatus = useSetAcademicTermStatus();
  const dot = (
    <span
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TERM_STATUS_DOT[term.status])}
      aria-hidden
    />
  );

  // UI hides what the role can't do — dept_head sees a read-only badge,
  // locked/archived is org-wide only (RLS is the real boundary, see 0018).
  if (!orgWide) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        {dot}
        {TERM_STATUS_LABEL[term.status]}
      </span>
    );
  }

  return (
    <span className="relative inline-flex shrink-0" onClick={(e) => e.stopPropagation()}>
      <span
        className={cn(
          "pointer-events-none absolute left-2.5 top-1/2 z-10 h-1.5 w-1.5 -translate-y-1/2 rounded-full",
          TERM_STATUS_DOT[term.status],
        )}
        aria-hidden
      />
      <Select
        value={term.status}
        onChange={(e) => setStatus.mutate({ id: term.id, status: e.target.value as TermStatus })}
        className="h-7 w-auto pl-6 text-xs"
      >
        {(Object.keys(TERM_STATUS_LABEL) as TermStatus[]).map((s) => (
          <option key={s} value={s}>
            {TERM_STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
    </span>
  );
}

const TERM_STATUS_HINT: Partial<Record<TermStatus, string>> = {
  active: "ใช้งานในระบบ",
  upcoming: "ยังไม่เปิดใช้งาน",
};

const TERM_STATUS_TILE: Record<TermStatus, string> = {
  active: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  upcoming: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  locked: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

const parseDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
const longDate = (iso: string) =>
  parseDate(iso).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

/** "15 พฤษภาคม 2569 – 11 ตุลาคม 2569" plus the span in days, or "—" when either date is unset. */
function termPeriod(t: AcademicTerm) {
  if (!t.start_date || !t.end_date) return { range: "—", days: null };
  const days = Math.round((parseDate(t.end_date).getTime() - parseDate(t.start_date).getTime()) / 86_400_000);
  return { range: `${longDate(t.start_date)} – ${longDate(t.end_date)}`, days };
}

function AcademicTermsCard({
  departmentId,
  orgWide,
  creating,
  onCreatingChange,
  leading,
}: {
  departmentId: string;
  orgWide: boolean;
  creating: boolean;
  onCreatingChange: (open: boolean) => void;
  /** Department picker (org-wide only) — rendered first in the toolbar so everything sits on one row. */
  leading?: React.ReactNode;
}) {
  const { data: terms = [], isLoading } = useAcademicTerms(departmentId);
  const { data: departments = [] } = useDepartments();
  const departmentName = departments.find((d) => d.id === departmentId)?.name ?? "";
  const [editing, setEditing] = useState<AcademicTerm | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TermStatus | "">("");
  const [view, setView] = useState<"list" | "grid">("list");

  const q = search.trim().toLowerCase();
  const rows = terms.filter(
    (t) =>
      (!statusFilter || t.status === statusFilter) &&
      (!q || String(t.academic_year).includes(q) || TERM_TYPE_LABEL[t.term_type].toLowerCase().includes(q)),
  );
  const { page, setPage, pageCount, pageRows } = usePagination(rows, [search, statusFilter, departmentId]);

  const sheets = (
    <>
      <EditTermSheet term={editing} onClose={() => setEditing(null)} />
      <CreateTermSheet
        open={creating}
        departmentId={departmentId}
        onClose={() => onCreatingChange(false)}
      />
    </>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {leading}
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาปีการศึกษาหรือภาคเรียน..."
          className="pl-9"
          aria-label="ค้นหาภาคเรียน"
        />
      </div>
      <Select
        className="w-44"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as TermStatus | "")}
        aria-label="สถานะ"
        placeholder="สถานะทั้งหมด"
      >
        {(Object.keys(TERM_STATUS_LABEL) as TermStatus[]).map((st) => (
          <option key={st} value={st}>
            {TERM_STATUS_LABEL[st]}
          </option>
        ))}
      </Select>
      <div className="flex h-8 rounded-lg border border-border bg-card p-0.5">
        {(["list", "grid"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-label={v === "grid" ? "มุมมองกริด" : "มุมมองรายการ"}
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={cn(
              "flex w-8 items-center justify-center rounded-md",
              view === v ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            {v === "grid" ? <AppsIcon className="h-3.5 w-3.5" /> : <ListIcon className="h-3.5 w-3.5" />}
          </button>
        ))}
      </div>
      <Button size="icon" aria-label="เพิ่มเทอม" onClick={() => onCreatingChange(true)}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {toolbar}
        <div className="space-y-3" role="status" aria-label="กำลังโหลด">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (terms.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีภาคเรียน" />
        {sheets}
      </div>
    );
  }

  function card(t: AcademicTerm) {
    const { range, days } = termPeriod(t);
    const hint = TERM_STATUS_HINT[t.status];
    return (
      <div
        key={t.id}
        onClick={() => setEditing(t)}
        className={cn(
          "cursor-pointer gap-4 rounded-2xl border border-border bg-card p-4 hover:bg-muted/40",
          view === "list" ? "grid items-center md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_auto_auto]" : "flex flex-col",
        )}
      >
        <div className="flex items-center gap-3">
          <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl", TERM_STATUS_TILE[t.status])}>
            <CalendarIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">ปีการศึกษา {t.academic_year}</p>
            <p className="truncate text-base font-bold">{TERM_TYPE_LABEL[t.term_type]}</p>
            {departmentName && <p className="truncate text-xs text-muted-foreground">แผนก: {departmentName}</p>}
          </div>
        </div>
        <div className="text-sm">
          <p className="text-xs text-muted-foreground">ช่วงเวลา</p>
          <p className="font-medium">{range}</p>
          {days !== null && <p className="text-xs text-muted-foreground">{days} วัน</p>}
        </div>
        <div className="space-y-1">
          <TermStatusControl term={t} orgWide={orgWide} />
          {hint && <p className="pl-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Button
          size="icon"
          variant="outline"
          aria-label={`แก้ไข ${TERM_TYPE_LABEL[t.term_type]} ${t.academic_year}`}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(t);
          }}
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}

      {rows.length === 0 ? (
        <EmptyState title="ไม่พบภาคเรียน" description="ลองเปลี่ยนคำค้นหาหรือสถานะ" />
      ) : (
        <div className={cn("gap-3", view === "grid" ? "grid sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col")}>
          {pageRows.map(card)}
        </div>
      )}

      <div className="space-y-2">
        <p className="px-1 text-xs text-muted-foreground">ทั้งหมด {rows.length} รายการ</p>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
      {sheets}
    </div>
  );
}

function EditTermSheet({ term, onClose }: { term: AcademicTerm | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveAcademicTerm();
  const [dates, setDates] = useState<{ start_date: string | null; end_date: string | null } | null>(null);
  const current = dates ?? (term ? { start_date: term.start_date, end_date: term.end_date } : null);

  useEffect(() => setDates(null), [term]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!term || !current) return;
    save.mutate(
      {
        id: term.id,
        department_id: term.department_id,
        academic_year: term.academic_year,
        term_type: term.term_type,
        ...current,
      },
      {
        onSuccess: () => {
          toast("บันทึกสำเร็จ");
          onClose();
        },
      },
    );
  }

  return (
    <Sheet
      open={term !== null}
      onOpenChange={(open) => !open && onClose()}
      title="แก้ไขวันที่ภาคเรียน"
      description={term ? `${term.academic_year} · ${TERM_TYPE_LABEL[term.term_type]}` : undefined}
    >
      {term && current && (
        <form onSubmit={submit} className="space-y-4">
          <Field label="วันเริ่มภาคเรียน">
            <Input
              type="date"
              value={current.start_date ?? ""}
              onChange={(e) => setDates({ ...current, start_date: e.target.value || null })}
            />
          </Field>
          <Field label="วันสิ้นสุดภาคเรียน">
            <Input
              type="date"
              value={current.end_date ?? ""}
              onChange={(e) => setDates({ ...current, end_date: e.target.value || null })}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
          </Button>
        </form>
      )}
    </Sheet>
  );
}

function CreateTermSheet({
  open,
  departmentId,
  onClose,
}: {
  open: boolean;
  departmentId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSaveAcademicTerm();
  const [draft, setDraft] = useState<Omit<AcademicTermDraft, "department_id">>({
    academic_year: new Date().getFullYear() + 543,
    term_type: "term1",
    start_date: null,
    end_date: null,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(
      { ...draft, department_id: departmentId },
      {
        onSuccess: () => {
          toast("เพิ่มภาคเรียนสำเร็จ");
          onClose();
        },
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="เพิ่มภาคเรียน">
      <form onSubmit={submit} className="space-y-4">
        <Field label="ปีการศึกษา (พ.ศ.)">
          <Input
            type="number"
            required
            value={draft.academic_year}
            onChange={(e) => setDraft({ ...draft, academic_year: Number(e.target.value) })}
          />
        </Field>
        <Field label="ภาคเรียน">
          <Select
            value={draft.term_type}
            onChange={(e) => setDraft({ ...draft, term_type: e.target.value as TermType })}
          >
            {(Object.keys(TERM_TYPE_LABEL) as TermType[]).map((t) => (
              <option key={t} value={t}>
                {TERM_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="วันเริ่มภาคเรียน">
          <Input
            type="date"
            value={draft.start_date ?? ""}
            onChange={(e) => setDraft({ ...draft, start_date: e.target.value || null })}
          />
        </Field>
        <Field label="วันสิ้นสุดภาคเรียน">
          <Input
            type="date"
            value={draft.end_date ?? ""}
            onChange={(e) => setDraft({ ...draft, end_date: e.target.value || null })}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={save.isPending}>
          {save.isPending ? <Spinner className="h-3 w-3" /> : "เพิ่ม"}
        </Button>
      </form>
    </Sheet>
  );
}

const LEAVE_TINTS = [
  "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",
];

/** Deterministic tint per leave type (no icon/color column) — same code always lands on the same color. */
function leaveTint(code: string) {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return LEAVE_TINTS[hash % LEAVE_TINTS.length]!;
}

type LeaveSort = "order" | "name" | "quota";

function LeaveTypesCard() {
  const toast = useToast();
  const { data: types = [], isLoading } = useLeaveTypes();
  const del = useDeleteLeaveType();
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LeaveSort>("order");

  const q = search.trim().toLowerCase();
  const rows = types
    .filter((t) => !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "th")
        : sort === "quota"
          ? (b.max_days_per_year ?? Infinity) - (a.max_days_per_year ?? Infinity)
          : 0,
    );
  const { page, setPage, pageCount, pageRows } = usePagination(rows, [search, sort]);
  const firstIndex = (page - 1) * 20;

  const sheets = (
    <>
      <LeaveTypeSheet mode="edit" leaveType={editing} open={editing !== null} onClose={() => setEditing(null)} />
      <LeaveTypeSheet mode="create" leaveType={null} open={creating} onClose={() => setCreating(false)} />
    </>
  );

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="กำลังโหลด">
        <Skeleton className="h-10 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (types.length === 0) {
    return (
      <>
        <EmptyState
          title="ไม่พบข้อมูล"
          description="ยังไม่มีประเภทการลา"
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />
              เพิ่มประเภท
            </Button>
          }
        />
        {sheets}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาประเภทการลา..."
            className="pl-9"
            aria-label="ค้นหาประเภทการลา"
          />
        </div>
        <Select className="w-44" value={sort} onChange={(e) => setSort(e.target.value as LeaveSort)} aria-label="เรียงตาม">
          <option value="order">เรียงตาม: ลำดับ</option>
          <option value="name">เรียงตาม: ชื่อ</option>
          <option value="quota">เรียงตาม: โควตา</option>
        </Select>
        <Button size="icon" aria-label="เพิ่มประเภทการลา" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="ไม่พบประเภทการลา" description="ลองเปลี่ยนคำค้นหา" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-16 px-4 py-3 font-medium">#</th>
                <th className="px-3 py-3 font-medium">ชื่อประเภทการลา</th>
                <th className="px-3 py-3 text-center font-medium">จำนวนวันต่อปี</th>
                <th className="px-3 py-3 text-center font-medium">ต้องแนบเอกสาร</th>
                <th className="px-3 py-3 text-center font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((t, i) => (
                <tr
                  key={t.id}
                  onClick={() => setEditing(t)}
                  className="cursor-pointer border-t border-border hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-xs font-medium">
                      {firstIndex + i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                          leaveTint(t.code),
                        )}
                      >
                        <AirplaneIcon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{t.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{t.code}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center font-medium">
                    {t.max_days_per_year !== null ? `${t.max_days_per_year} วัน` : "ไม่จำกัด"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {t.requires_attachment_after_days !== null ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <CheckmarkCircleIcon className="h-3.5 w-3.5" />
                        ต้องแนบ (เกิน {t.requires_attachment_after_days} วัน)
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        ไม่บังคับ
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`แก้ไข ${t.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(t);
                        }}
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="text-destructive"
                        aria-label={`ลบ ${t.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm(`ลบประเภทการลา "${t.name}"?`)) return;
                          del.mutate(t.id, { onError: () => toast("ลบไม่สำเร็จ อาจมีใบลาที่ใช้ประเภทนี้อยู่", "error") });
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-2">
        <p className="px-1 text-xs text-muted-foreground">ทั้งหมด {rows.length} รายการ</p>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
      {sheets}
    </div>
  );
}

function LeaveTypeSheet({
  mode,
  leaveType,
  open,
  onClose,
}: {
  mode: "create" | "edit";
  leaveType: LeaveType | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSaveLeaveType();
  const del = useDeleteLeaveType();

  const blank = (): LeaveTypeDraft => ({
    code: "",
    name: "",
    max_days_per_year: null,
    requires_attachment_after_days: null,
  });

  const [draft, setDraft] = useState<LeaveTypeDraft>(blank);

  useEffect(() => {
    if (!open) return;
    setDraft(
      leaveType
        ? {
            code: leaveType.code,
            name: leaveType.name,
            max_days_per_year: leaveType.max_days_per_year,
            requires_attachment_after_days: leaveType.requires_attachment_after_days,
          }
        : blank(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leaveType]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.code.trim() || !draft.name.trim()) return;
    save.mutate(
      { id: leaveType?.id, ...draft },
      {
        onSuccess: () => {
          toast("บันทึกสำเร็จ");
          onClose();
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={mode === "create" ? "เพิ่มประเภทการลา" : "แก้ไขประเภทการลา"}
      footer={
        leaveType ? (
          <Button
            variant="outline"
            className="w-full text-destructive"
            onClick={() => del.mutate(leaveType.id, { onSuccess: onClose })}
          >
            ลบประเภทการลา
          </Button>
        ) : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="รหัส">
          <Input
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder="เช่น sick, personal"
            required
          />
        </Field>
        <Field label="ชื่อ">
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="เช่น ลาป่วย"
            required
          />
        </Field>
        <Field label="โควตา (วัน/ปี)">
          <Input
            type="number"
            min={0}
            placeholder="ไม่จำกัด"
            value={draft.max_days_per_year ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, max_days_per_year: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </Field>
        <Field label="บังคับแนบไฟล์ถ้าลาต่อเนื่องเกิน (วัน)">
          <Input
            type="number"
            min={1}
            placeholder="ไม่บังคับ"
            value={draft.requires_attachment_after_days ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                requires_attachment_after_days: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Field>
        <Button type="submit" className="w-full" disabled={!draft.code.trim() || !draft.name.trim() || save.isPending}>
          {save.isPending ? <Spinner className="h-3 w-3" /> : mode === "create" ? "เพิ่ม" : "บันทึก"}
        </Button>
      </form>
    </Sheet>
  );
}

type GradeSort = "order" | "salary" | "people";

const baht = (n: number) => n.toLocaleString("en-US");
/** "10,000 - 12,000" · "80,000 ขึ้นไป" · "ไม่เกิน 12,000" · "-" */
function salaryRange(g: SalaryGrade) {
  if (g.min_salary !== null && g.max_salary !== null) return `${baht(g.min_salary)} - ${baht(g.max_salary)}`;
  if (g.min_salary !== null) return `${baht(g.min_salary)} ขึ้นไป`;
  if (g.max_salary !== null) return `ไม่เกิน ${baht(g.max_salary)}`;
  return "-";
}

function SalaryGradesCard() {
  const toast = useToast();
  const { data: grades = [], isLoading } = useSalaryGrades();
  const { data: counts } = useSalaryGradeCounts();
  const del = useDeleteSalaryGrade();
  const [editing, setEditing] = useState<SalaryGrade | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<GradeSort>("order");
  const [view, setView] = useState<"list" | "grid">("list");

  const q = search.trim().toLowerCase();
  const rows = grades
    .filter((g) => !q || g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "salary"
        ? (a.min_salary ?? Infinity) - (b.min_salary ?? Infinity)
        : sort === "people"
          ? (counts?.get(b.id) ?? 0) - (counts?.get(a.id) ?? 0)
          : 0,
    );
  const { page, setPage, pageCount, pageRows } = usePagination(rows, [search, sort]);
  const firstIndex = (page - 1) * 20;

  const sheets = (
    <>
      <SalaryGradeSheet mode="edit" salaryGrade={editing} open={editing !== null} onClose={() => setEditing(null)} />
      <SalaryGradeSheet mode="create" salaryGrade={null} open={creating} onClose={() => setCreating(false)} />
    </>
  );

  function actions(g: SalaryGrade) {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <Button
          size="icon"
          variant="outline"
          aria-label={`แก้ไข ${g.name}`}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(g);
          }}
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="text-destructive"
          aria-label={`ลบ ${g.name}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!confirm(`ลบระดับเงินเดือน "${g.name}"?`)) return;
            del.mutate(g.id, { onError: () => toast("ลบไม่สำเร็จ", "error") });
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="กำลังโหลด">
        <Skeleton className="h-10 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (grades.length === 0) {
    return (
      <>
        <EmptyState
          title="ไม่พบข้อมูล"
          description="ยังไม่มีระดับเงินเดือน"
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />
              เพิ่มระดับ
            </Button>
          }
        />
        {sheets}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาระดับเงินเดือน..."
            className="pl-9"
            aria-label="ค้นหาระดับเงินเดือน"
          />
        </div>
        <Select className="w-44" value={sort} onChange={(e) => setSort(e.target.value as GradeSort)} aria-label="เรียงตาม">
          <option value="order">เรียงตาม: ลำดับ</option>
          <option value="salary">เรียงตาม: เงินเดือน</option>
          <option value="people">เรียงตาม: จำนวนบุคลากร</option>
        </Select>
        <div className="flex h-8 rounded-lg border border-border bg-card p-0.5">
          {(["list", "grid"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-label={v === "grid" ? "มุมมองกริด" : "มุมมองรายการ"}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "flex w-8 items-center justify-center rounded-md",
                view === v ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              {v === "grid" ? <AppsIcon className="h-3.5 w-3.5" /> : <ListIcon className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        <Button size="icon" aria-label="เพิ่มระดับเงินเดือน" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="ไม่พบระดับเงินเดือน" description="ลองเปลี่ยนคำค้นหา" />
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-16 px-4 py-3 font-medium">#</th>
                <th className="px-3 py-3 font-medium">ชื่อระดับเงินเดือน</th>
                <th className="px-3 py-3 font-medium">ช่วงเงินเดือน (บาท)</th>
                <th className="px-3 py-3 font-medium">จำนวนบุคลากร</th>
                <th className="px-3 py-3 text-center font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((g, i) => (
                <tr
                  key={g.id}
                  onClick={() => setEditing(g)}
                  className="cursor-pointer border-t border-border hover:bg-muted/50"
                >
                  <td className="px-4 py-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-xs font-medium">
                      {firstIndex + i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium">{g.name}</td>
                  <td className="px-3 py-2.5">{salaryRange(g)}</td>
                  <td className="px-3 py-2.5">{counts?.get(g.id) ?? 0} คน</td>
                  <td className="px-3 py-2.5">{actions(g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pageRows.map((g, i) => (
            <div
              key={g.id}
              onClick={() => setEditing(g)}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted/50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium">
                {firstIndex + i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{g.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{salaryRange(g)} บาท</p>
                <p className="mt-2 text-xs text-muted-foreground">{counts?.get(g.id) ?? 0} คน</p>
              </div>
              {actions(g)}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="px-1 text-xs text-muted-foreground">ทั้งหมด {rows.length} รายการ</p>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
      {sheets}
    </div>
  );
}

function SalaryGradeSheet({
  mode,
  salaryGrade,
  open,
  onClose,
}: {
  mode: "create" | "edit";
  salaryGrade: SalaryGrade | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSaveSalaryGrade();
  const del = useDeleteSalaryGrade();

  const blank = (): SalaryGradeDraft => ({ code: "", name: "", min_salary: null, max_salary: null });

  const [draft, setDraft] = useState<SalaryGradeDraft>(blank);

  useEffect(() => {
    if (!open) return;
    setDraft(
      salaryGrade
        ? {
            code: salaryGrade.code,
            name: salaryGrade.name,
            min_salary: salaryGrade.min_salary,
            max_salary: salaryGrade.max_salary,
          }
        : blank(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, salaryGrade]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.code.trim() || !draft.name.trim()) return;
    save.mutate(
      { id: salaryGrade?.id, ...draft },
      {
        onSuccess: () => {
          toast("บันทึกสำเร็จ");
          onClose();
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={mode === "create" ? "เพิ่มระดับเงินเดือน" : "แก้ไขระดับเงินเดือน"}
      footer={
        salaryGrade ? (
          <Button
            variant="outline"
            className="w-full text-destructive"
            onClick={() => del.mutate(salaryGrade.id, { onSuccess: onClose })}
          >
            ลบระดับเงินเดือน
          </Button>
        ) : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="รหัส">
          <Input
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder="เช่น P1, P2"
            required
          />
        </Field>
        <Field label="ชื่อ">
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="เช่น ระดับปฏิบัติการ"
            required
          />
        </Field>
        <Field label="เงินเดือนต่ำสุด (บาท)">
          <Input
            type="number"
            min={0}
            placeholder="ไม่ระบุ"
            value={draft.min_salary ?? ""}
            onChange={(e) => setDraft({ ...draft, min_salary: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </Field>
        <Field label="เงินเดือนสูงสุด (บาท)">
          <Input
            type="number"
            min={0}
            placeholder="ไม่ระบุ"
            value={draft.max_salary ?? ""}
            onChange={(e) => setDraft({ ...draft, max_salary: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={!draft.code.trim() || !draft.name.trim() || save.isPending}>
          {save.isPending ? <Spinner className="h-3 w-3" /> : mode === "create" ? "เพิ่ม" : "บันทึก"}
        </Button>
      </form>
    </Sheet>
  );
}

type SettingsTab = "school" | "department" | "terms" | "leave_types" | "salary_grades";

export function Settings() {
  const { profile } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = profile ? isOrgWide(profile.roles) : false;
  const deptHead = profile ? isDeptHead(profile.roles) : false;
  const canDept = orgWide || deptHead;
  const [pickedDept, setPickedDept] = useState("");
  const [tab, setTab] = useState<SettingsTab>(orgWide ? "school" : "department");
  const [creatingTerm, setCreatingTerm] = useState(false);

  // Org-wide has no home department — default the picker to the first one.
  useEffect(() => {
    if (orgWide && !pickedDept && departments.length > 0) setPickedDept(departments[0]!.id);
  }, [orgWide, departments, pickedDept]);

  const mayManageHr = profile ? canManageHr(profile.roles) : false;

  const tabs: { id: SettingsTab; label: string }[] = [
    ...(orgWide
      ? [
          { id: "school" as const, label: "ตั้งค่าส่วนกลาง" },
          { id: "leave_types" as const, label: "ประเภทการลา" },
        ]
      : []),
    ...(mayManageHr ? [{ id: "salary_grades" as const, label: "ระดับเงินเดือน" }] : []),
    ...(canDept
      ? [
          { id: "department" as const, label: "ตั้งค่าแผนก" },
          { id: "terms" as const, label: "ภาคเรียน" },
        ]
      : []),
  ];

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "";
  const deptSettingsId = orgWide ? pickedDept : profile?.department_id ?? "";
  const showDeptPicker =
    orgWide &&
    tab !== "school" &&
    tab !== "leave_types" &&
    tab !== "salary_grades" &&
    departments.length > 0;
  const deptPicker = (
    <Select
      className="w-auto min-w-[10rem]"
      value={pickedDept}
      onChange={(e) => setPickedDept(e.target.value)}
      aria-label="แผนก"
      placeholder="เลือกแผนก"
    >
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
  );

  if (!orgWide && !deptHead) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์ตั้งค่าระบบ</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-4">
        <div role="tablist" aria-label="หมวดตั้งค่า" className="flex w-full flex-wrap border-b border-border">
          {tabs.map((t) => {
            const Icon = TAB_ICON[t.id];
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(t.id);
                  setCreatingTerm(false);
                }}
                className={cn(
                  "-mb-px flex flex-1 items-center justify-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-medium",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {showDeptPicker && tab !== "terms" && deptPicker}
      </div>

      {tab === "school" && orgWide && <SchoolSettingsCard />}

      {tab === "leave_types" && orgWide && <LeaveTypesCard />}

      {tab === "salary_grades" && mayManageHr && <SalaryGradesCard />}

      {tab === "department" && deptSettingsId && (
        <DepartmentSettingsCard
          key={deptSettingsId}
          departmentId={deptSettingsId}
          departmentName={deptName(deptSettingsId)}
        />
      )}

      {tab === "terms" && deptSettingsId && (
        <AcademicTermsCard
          key={`terms-${deptSettingsId}`}
          departmentId={deptSettingsId}
          orgWide={orgWide}
          creating={creatingTerm}
          onCreatingChange={setCreatingTerm}
          leading={showDeptPicker ? deptPicker : undefined}
        />
      )}
    </div>
  );
}
