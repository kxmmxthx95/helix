import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Select, Spinner, Switch } from "@/components/ui";
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
import { useDepartments } from "@/hooks/useProfiles";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import {
  useDeletePeriodDefinition,
  useDepartmentPeriods,
  useGeneratePeriods,
  usePeriodsForGrade,
  useSavePeriodDefinition,
  type PeriodDefinitionDraft,
} from "@/hooks/usePeriodDefinitions";
import { generatePeriods, type PeriodBreakConfig } from "@/lib/periodGenerator";
import { getCurrentPosition } from "@/lib/geofence";
import {
  useDeleteLeaveType,
  useLeaveTypes,
  useSaveLeaveType,
  type LeaveTypeDraft,
} from "@/hooks/useLeave";
import {
  useDeleteSalaryGrade,
  useSalaryGrades,
  useSaveSalaryGrade,
  type SalaryGradeDraft,
} from "@/hooks/useEmployees";
import type {
  AcademicTerm,
  LeaveType,
  PeriodDefinition,
  PeriodType,
  SalaryGrade,
  TermStatus,
  TermType,
} from "@/lib/database.types";
import { canManageHr, isOrgWide, ROLE_LABEL, ROLES, type Role } from "@/lib/roles";
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

function SchoolSettingsCard() {
  const toast = useToast();
  const { data: settings, isLoading } = useSchoolSettings();
  const update = useUpdateSchoolSettings();
  const upload = useUploadLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<SchoolSettingsEdit | null>(null);

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
      <Card className="flex justify-center py-8">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </Card>
    );
  }

  const logoUrl = schoolLogoUrl(settings);

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          {logoUrl ? (
            <img src={logoUrl} alt="โลโก้โรงเรียน" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">ไม่มีโลโก้</span>
          )}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {upload.isPending ? <Spinner className="h-3.5 w-3.5" /> : "อัปโหลดโลโก้"}
          </Button>
          <p className="text-xs text-muted-foreground">ใช้สร้าง Header เอกสาร</p>
        </div>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(form, { onSuccess: () => toast("บันทึกสำเร็จ") });
        }}
      >
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

        <Card className="space-y-2">
          <p className="text-sm font-medium">เปิดใช้งานบันทึกเวลาทำงานสำหรับบทบาท</p>
          <p className="text-xs text-muted-foreground">ไม่ติ๊ก = บทบาทนั้นไม่เห็นเมนู "เวลาทำงาน"</p>
          <div className="space-y-1.5">
            {STAFF_ROLES.map((role) => (
              <label key={role} className="flex items-center justify-between gap-2 py-0.5 text-sm">
                {ROLE_LABEL[role]}
                <Switch
                  size="sm"
                  checked={form.time_tracking_roles.includes(role)}
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
            ))}
          </div>
        </Card>

        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
        </Button>
      </form>
    </Card>
  );
}

function DepartmentSettingsCard({ departmentId, departmentName }: { departmentId: string; departmentName: string }) {
  const toast = useToast();
  const { data: settings, isLoading } = useDepartmentSettings(departmentId);
  const update = useUpdateDepartmentSettings(departmentId);
  const [form, setForm] = useState<DepartmentSettingsEdit | null>(null);

  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        score_collect_pct: settings.score_collect_pct,
        score_exam_pct: settings.score_exam_pct,
        min_periods_per_week: settings.min_periods_per_week,
        max_periods_per_week: settings.max_periods_per_week,
        work_start_time: settings.work_start_time,
        checkin_lat: settings.checkin_lat,
        checkin_lng: settings.checkin_lng,
        checkin_radius_m: settings.checkin_radius_m,
      });
    }
  }, [settings]);

  if (isLoading || !form) {
    return (
      <Card className="flex justify-center py-8">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </Card>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate(form, { onSuccess: () => toast("บันทึกสำเร็จ") });
      }}
    >
      {departmentName && <p className="text-sm text-muted-foreground">{departmentName}</p>}

      <Card className="space-y-2">
        <p className="text-sm font-medium">สัดส่วนคะแนนเก็บ : สอบ</p>
        <p className="text-xs text-muted-foreground">
          ค่า default ของแผนก — แต่ละวิชากำหนดสัดส่วนของตัวเองแทนได้ภายหลัง
        </p>
        <div className="flex items-center gap-3">
          <Field label="เก็บ (%)">
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="ยังไม่กำหนด"
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
          </Field>
          <span className="pt-6 text-sm text-muted-foreground">สอบ {form.score_exam_pct ?? "—"}%</span>
        </div>
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-medium">เกณฑ์คาบสอน/สัปดาห์ (แจ้งเตือนภาระงาน)</p>
        <p className="text-xs text-muted-foreground">ไม่กำหนด = ไม่มีการแจ้งเตือน</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ต่ำสุด (คาบ)">
            <Input
              type="number"
              min={0}
              placeholder="ไม่กำหนด"
              value={form.min_periods_per_week ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  min_periods_per_week: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="สูงสุด (คาบ)">
            <Input
              type="number"
              min={0}
              placeholder="ไม่กำหนด"
              value={form.max_periods_per_week ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  max_periods_per_week: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-medium">เวลาทำงาน (บันทึกเวลาเข้า-ออกงาน)</p>
        <p className="text-xs text-muted-foreground">
          ไม่กำหนดตำแหน่ง = ไม่บล็อกการลงเวลา ไม่ว่าจะอยู่ที่ไหน
        </p>
        <Field label="เวลาเข้างานมาตรฐาน">
          <Input
            type="time"
            value={form.work_start_time ?? ""}
            onChange={(e) => setForm({ ...form, work_start_time: e.target.value || null })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ละติจูด">
            <Input
              type="number"
              step="any"
              placeholder="ยังไม่กำหนด"
              value={form.checkin_lat ?? ""}
              onChange={(e) =>
                setForm({ ...form, checkin_lat: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </Field>
          <Field label="ลองจิจูด">
            <Input
              type="number"
              step="any"
              placeholder="ยังไม่กำหนด"
              value={form.checkin_lng ?? ""}
              onChange={(e) =>
                setForm({ ...form, checkin_lng: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <div className="flex items-end gap-3">
          <Field label="รัศมี (เมตร)">
            <Input
              type="number"
              min={1}
              placeholder="ยังไม่กำหนด"
              value={form.checkin_radius_m ?? ""}
              onChange={(e) =>
                setForm({ ...form, checkin_radius_m: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            size="sm"
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
      </Card>

      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
      </Button>
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

function AcademicTermsCard({
  departmentId,
  orgWide,
  creating,
  onCreatingChange,
}: {
  departmentId: string;
  orgWide: boolean;
  creating: boolean;
  onCreatingChange: (open: boolean) => void;
}) {
  const { data: terms = [], isLoading } = useAcademicTerms(departmentId);
  const [editing, setEditing] = useState<AcademicTerm | null>(null);

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

  if (isLoading) {
    return (
      <Card className="flex justify-center py-8">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </Card>
    );
  }

  if (terms.length === 0) {
    return (
      <>
        <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีภาคเรียน" />
        {sheets}
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {terms.map((t) => (
          <Card
            key={t.id}
            onClick={() => setEditing(t)}
            className="cursor-pointer space-y-2 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {t.academic_year} · {TERM_TYPE_LABEL[t.term_type]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.start_date ?? "—"} – {t.end_date ?? "—"}
                </p>
              </div>
              <TermStatusControl term={t} orgWide={orgWide} />
            </div>
          </Card>
        ))}
      </div>
      {sheets}
    </>
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

const DAY_LABEL: Record<number, string> = {
  1: "จันทร์",
  2: "อังคาร",
  3: "พุธ",
  4: "พฤหัสบดี",
  5: "ศุกร์",
  6: "เสาร์",
};

const PERIOD_TYPE_LABEL: Record<PeriodType, string> = {
  teaching: "คาบสอน",
  break: "พัก/กิจกรรม",
};

/** grade_level_id null = ทั้งแผนก (default) — ระดับชั้นไหนไม่ตั้งเองก็ fallback มาใช้ค่านี้ (migration 0031). */
function PeriodsTab({ departmentId }: { departmentId: string }) {
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const [gradeTab, setGradeTab] = useState<string | null>(null);

  useEffect(() => {
    setGradeTab(null);
  }, [departmentId]);

  return (
    <div className="space-y-3">
      <div className="flex w-full gap-0 overflow-x-auto border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={gradeTab === null}
          onClick={() => setGradeTab(null)}
          className={lineTab(gradeTab === null)}
        >
          <span className="truncate">ทั้งแผนก (default)</span>
        </button>
        {gradeLevels.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={gradeTab === g.id}
            onClick={() => setGradeTab(g.id)}
            className={lineTab(gradeTab === g.id)}
          >
            <span className="truncate">{g.name}</span>
          </button>
        ))}
      </div>
      <PeriodDefinitionsCard
        key={`periods-${departmentId}-${gradeTab ?? "default"}`}
        departmentId={departmentId}
        gradeLevelId={gradeTab}
      />
    </div>
  );
}

function PeriodDefinitionsCard({
  departmentId,
  gradeLevelId,
}: {
  departmentId: string;
  gradeLevelId: string | null;
}) {
  const defaultPeriods = useDepartmentPeriods(gradeLevelId === null ? departmentId : null);
  const gradePeriods = usePeriodsForGrade(gradeLevelId !== null ? departmentId : null, gradeLevelId);
  const { data: periods = [], isLoading } = gradeLevelId === null ? defaultPeriods : gradePeriods;
  const [editing, setEditing] = useState<PeriodDefinition | null>(null);
  const [creating, setCreating] = useState(false);
  const [quickSetup, setQuickSetup] = useState(false);

  const days = [...new Set(periods.map((p) => p.day_of_week))].sort((a, b) => a - b);
  const maxPeriodNo = periods.reduce((m, p) => Math.max(m, p.period_no), 0);
  const periodAt = new Map(periods.map((p) => [`${p.day_of_week}-${p.period_no}`, p]));

  const sheets = (
    <>
      <PeriodSheet
        mode="edit"
        period={editing}
        open={editing !== null}
        departmentId={departmentId}
        gradeLevelId={gradeLevelId}
        onClose={() => setEditing(null)}
      />
      <PeriodSheet
        mode="create"
        period={null}
        open={creating}
        departmentId={departmentId}
        gradeLevelId={gradeLevelId}
        onClose={() => setCreating(false)}
      />
      <QuickSetupSheet
        open={quickSetup}
        departmentId={departmentId}
        gradeLevelId={gradeLevelId}
        onClose={() => setQuickSetup(false)}
      />
    </>
  );

  const actions = (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => setQuickSetup(true)}>
        ตั้งค่าด่วน
      </Button>
      <Button size="sm" onClick={() => setCreating(true)}>
        <Plus className="h-3.5 w-3.5" />
        เพิ่มคาบ
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <Card className="flex justify-center py-8">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </Card>
    );
  }

  if (periods.length === 0) {
    return (
      <>
        <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีคาบเวลา" action={actions} />
        {sheets}
      </>
    );
  }

  return (
    <Card className="space-y-3">
      {actions}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[40rem] table-fixed text-xs">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-12 px-2 py-2 font-medium">คาบ</th>
              {days.map((d) => (
                <th key={d} className="px-2 py-2 font-medium">
                  {DAY_LABEL[d] ?? d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxPeriodNo }, (_, i) => i + 1).map((periodNo) => (
              <tr key={periodNo} className="border-t border-border align-top">
                <td className="px-2 py-2 text-center text-muted-foreground">{periodNo}</td>
                {days.map((day) => {
                  const p = periodAt.get(`${day}-${periodNo}`);
                  if (!p) return <td key={day} className="px-1 py-1" />;
                  return (
                    <td key={day} className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className={cn(
                          "tappable w-full rounded px-1.5 py-1.5 text-left",
                          p.period_type === "teaching" ? "bg-muted hover:bg-muted/70" : "bg-warning/15 hover:bg-warning/25",
                        )}
                      >
                        {p.period_type === "break" && <p className="truncate font-medium text-warning">{p.label}</p>}
                        <p className="text-[10px] text-muted-foreground">
                          {p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}
                        </p>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sheets}
    </Card>
  );
}

function PeriodSheet({
  mode,
  period,
  open,
  departmentId,
  gradeLevelId,
  onClose,
}: {
  mode: "create" | "edit";
  period: PeriodDefinition | null;
  open: boolean;
  departmentId: string;
  gradeLevelId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSavePeriodDefinition();
  const del = useDeletePeriodDefinition();

  const blank = (): PeriodDefinitionDraft => ({
    department_id: departmentId,
    grade_level_id: gradeLevelId,
    day_of_week: 1,
    period_no: 1,
    period_type: "teaching",
    label: "",
    start_time: "08:30",
    end_time: "09:20",
  });

  const [draft, setDraft] = useState<PeriodDefinitionDraft>(blank);

  useEffect(() => {
    if (!open) return;
    setDraft(
      period
        ? {
            department_id: period.department_id,
            grade_level_id: period.grade_level_id,
            day_of_week: period.day_of_week,
            period_no: period.period_no,
            period_type: period.period_type,
            label: period.label,
            start_time: period.start_time.slice(0, 5),
            end_time: period.end_time.slice(0, 5),
          }
        : blank(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.label.trim()) return;
    save.mutate(
      { id: period?.id, ...draft },
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
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={mode === "create" ? "เพิ่มคาบเวลา" : "แก้ไขคาบเวลา"}
      footer={
        period ? (
          <Button
            variant="outline"
            className="w-full text-destructive"
            onClick={() => del.mutate(period.id, { onSuccess: onClose })}
          >
            ลบคาบเวลา
          </Button>
        ) : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="วัน">
            <Select
              value={draft.day_of_week}
              onChange={(e) => setDraft({ ...draft, day_of_week: Number(e.target.value) })}
            >
              {Object.entries(DAY_LABEL).map(([d, label]) => (
                <option key={d} value={d}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="คาบที่">
            <Input
              type="number"
              min={1}
              value={draft.period_no}
              onChange={(e) => setDraft({ ...draft, period_no: Number(e.target.value) })}
              required
            />
          </Field>
        </div>

        <Field label="ประเภท">
          <Select
            value={draft.period_type}
            onChange={(e) => setDraft({ ...draft, period_type: e.target.value as PeriodType })}
          >
            {(Object.keys(PERIOD_TYPE_LABEL) as PeriodType[]).map((t) => (
              <option key={t} value={t}>
                {PERIOD_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="ชื่อคาบ">
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="เวลาเริ่ม">
            <Input
              type="time"
              value={draft.start_time}
              onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
              required
            />
          </Field>
          <Field label="เวลาสิ้นสุด">
            <Input
              type="time"
              value={draft.end_time}
              onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
              required
            />
          </Field>
        </div>

        <Button type="submit" className="w-full" disabled={!draft.label.trim() || save.isPending}>
          {save.isPending ? <Spinner className="h-3 w-3" /> : mode === "create" ? "เพิ่ม" : "บันทึก"}
        </Button>
      </form>
    </Sheet>
  );
}

const DEFAULT_DAYS = [1, 2, 3, 4, 5];

/** Bulk-generate a day's period grid from a few parameters instead of adding rows one at a time. */
function QuickSetupSheet({
  open,
  departmentId,
  gradeLevelId,
  onClose,
}: {
  open: boolean;
  departmentId: string;
  gradeLevelId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const generate = useGeneratePeriods();

  const [startTime, setStartTime] = useState("08:30");
  const [periodsPerDay, setPeriodsPerDay] = useState(8);
  const [minutesPerPeriod, setMinutesPerPeriod] = useState(50);
  const [days, setDays] = useState<number[]>(DEFAULT_DAYS);
  const [recess, setRecess] = useState<PeriodBreakConfig>({
    enabled: false,
    afterPeriod: 2,
    minutes: 15,
    label: "พักเบรก",
  });
  const [lunch, setLunch] = useState<PeriodBreakConfig>({
    enabled: true,
    afterPeriod: 4,
    minutes: 60,
    label: "พักกลางวัน",
  });

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (days.length === 0) return;
    const rows = generatePeriods({
      startTime,
      periodsPerDay,
      minutesPerPeriod,
      recess,
      lunch,
      days,
    });
    const dayNames = days.map((d) => DAY_LABEL[d]).join(", ");
    if (!confirm(`จะลบคาบเดิมของ${gradeLevelId ? "ระดับชั้นนี้" : "ทั้งแผนก"}ในวัน ${dayNames} แล้วสร้างใหม่ ${rows.length} รายการ ยืนยัน?`)) {
      return;
    }
    generate.mutate(
      {
        departmentId,
        gradeLevelId,
        days,
        rows: rows.map((r) => ({ ...r, department_id: departmentId, grade_level_id: gradeLevelId })),
      },
      {
        onSuccess: () => {
          toast(`สร้างตารางคาบสำเร็จ (${rows.length} รายการ)`);
          onClose();
        },
        onError: (err) => toast(err instanceof Error ? err.message : "สร้างตารางไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="ตั้งค่าตารางคาบด่วน"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" form="quick-setup-periods" className="flex-1" disabled={days.length === 0 || generate.isPending}>
            {generate.isPending ? <Spinner className="h-3 w-3" /> : "สร้างตาราง"}
          </Button>
        </div>
      }
    >
      <form id="quick-setup-periods" className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="เวลาเริ่มคาบแรก">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </Field>
          <Field label="จำนวนคาบต่อวัน (ไม่รวมพัก)">
            <Input
              type="number"
              min={1}
              value={periodsPerDay}
              onChange={(e) => setPeriodsPerDay(Number(e.target.value))}
              required
            />
          </Field>
        </div>

        <Field label="นาทีต่อคาบ">
          <Input
            type="number"
            min={1}
            value={minutesPerPeriod}
            onChange={(e) => setMinutesPerPeriod(Number(e.target.value))}
            required
          />
        </Field>

        <Field label="วันที่ใช้ตารางนี้">
          <div className="flex flex-wrap gap-2">
            {Object.entries(DAY_LABEL).map(([d, label]) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(Number(d))}
                className={cn(
                  "tappable rounded-full border px-3 py-1 text-xs",
                  days.includes(Number(d))
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <BreakConfigFields title="พักระหว่างเรียน" value={recess} onChange={setRecess} periodsPerDay={periodsPerDay} />
        <BreakConfigFields title="พักรับประทานอาหารกลางวัน" value={lunch} onChange={setLunch} periodsPerDay={periodsPerDay} />
      </form>
    </Sheet>
  );
}

function BreakConfigFields({
  title,
  value,
  onChange,
  periodsPerDay,
}: {
  title: string;
  value: PeriodBreakConfig;
  onChange: (v: PeriodBreakConfig) => void;
  periodsPerDay: number;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{title}</p>
        <Switch checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} size="sm" />
      </div>
      {value.enabled && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="หลังคาบที่">
            <Select
              value={value.afterPeriod}
              onChange={(e) => onChange({ ...value, afterPeriod: Number(e.target.value) })}
            >
              {Array.from({ length: periodsPerDay }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="นาที">
            <Input
              type="number"
              min={1}
              value={value.minutes}
              onChange={(e) => onChange({ ...value, minutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="ชื่อ">
            <Input value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}

function LeaveTypesCard() {
  const { data: types = [], isLoading } = useLeaveTypes();
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [creating, setCreating] = useState(false);

  const sheets = (
    <>
      <LeaveTypeSheet mode="edit" leaveType={editing} open={editing !== null} onClose={() => setEditing(null)} />
      <LeaveTypeSheet mode="create" leaveType={null} open={creating} onClose={() => setCreating(false)} />
    </>
  );

  if (isLoading) {
    return (
      <Card className="flex justify-center py-8">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </Card>
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
    <Card className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          เพิ่มประเภท
        </Button>
      </div>
      <ul className="divide-y divide-border text-sm">
        {types.map((t) => (
          <li
            key={t.id}
            onClick={() => setEditing(t)}
            className="flex cursor-pointer items-center justify-between gap-2 py-1.5"
          >
            <span>
              {t.name}
              <span className="block text-xs text-muted-foreground">
                {t.max_days_per_year !== null ? `${t.max_days_per_year} วัน/ปี` : "ไม่จำกัดโควตา"}
                {t.requires_attachment_after_days !== null &&
                  ` · บังคับแนบไฟล์ถ้าเกิน ${t.requires_attachment_after_days} วัน`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {sheets}
    </Card>
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

function SalaryGradesCard() {
  const { data: grades = [], isLoading } = useSalaryGrades();
  const [editing, setEditing] = useState<SalaryGrade | null>(null);
  const [creating, setCreating] = useState(false);

  const sheets = (
    <>
      <SalaryGradeSheet mode="edit" salaryGrade={editing} open={editing !== null} onClose={() => setEditing(null)} />
      <SalaryGradeSheet mode="create" salaryGrade={null} open={creating} onClose={() => setCreating(false)} />
    </>
  );

  if (isLoading) {
    return (
      <Card className="flex justify-center py-8">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </Card>
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
    <Card className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          เพิ่มระดับ
        </Button>
      </div>
      <ul className="divide-y divide-border text-sm">
        {grades.map((g) => (
          <li
            key={g.id}
            onClick={() => setEditing(g)}
            className="flex cursor-pointer items-center justify-between gap-2 py-1.5"
          >
            <span>
              {g.name}
              <span className="block text-xs text-muted-foreground">
                {g.min_salary !== null || g.max_salary !== null
                  ? `${g.min_salary ?? "?"} – ${g.max_salary ?? "?"} บาท`
                  : "ไม่ระบุช่วงเงินเดือน"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {sheets}
    </Card>
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

type SettingsTab = "school" | "department" | "terms" | "periods" | "leave_types" | "salary_grades";

const lineTab = (active: boolean, grow = false) =>
  cn(
    "inline-flex h-8 min-w-0 items-center justify-center border-b-2 px-3 text-xs font-medium transition-colors -mb-px",
    grow ? "flex-1" : "shrink-0",
    active
      ? "border-foreground text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
  );

export function Settings() {
  const { profile } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = profile ? isOrgWide(profile.roles) : false;
  const isDeptHead = profile ? profile.roles.includes("dept_head") : false;
  const canDept = orgWide || isDeptHead;
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
          { id: "periods" as const, label: "ตารางคาบเวลา" },
        ]
      : []),
  ];

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "";
  const deptSettingsId = orgWide ? pickedDept : profile?.department_id ?? "";
  const showDeptPicker =
    orgWide && tab !== "school" && tab !== "leave_types" && tab !== "salary_grades" && departments.length > 0;

  if (!orgWide && !isDeptHead) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์ตั้งค่าระบบ</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex w-full gap-0 overflow-x-auto border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setCreatingTerm(false);
            }}
            className={lineTab(tab === t.id, true)}
          >
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      {(showDeptPicker || tab === "terms") && (
        <div className="flex flex-wrap items-center gap-2">
          {showDeptPicker && (
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
          )}
          {tab === "terms" && deptSettingsId && (
            <Button size="sm" className="ml-auto shrink-0" onClick={() => setCreatingTerm(true)}>
              <Plus className="h-3.5 w-3.5" />
              เพิ่มเทอม
            </Button>
          )}
        </div>
      )}

      {tab === "school" && orgWide && <SchoolSettingsCard />}

      {tab === "leave_types" && orgWide && <LeaveTypesCard />}

      {tab === "salary_grades" && mayManageHr && <SalaryGradesCard />}

      {tab === "department" && deptSettingsId && (
        <DepartmentSettingsCard
          key={deptSettingsId}
          departmentId={deptSettingsId}
          departmentName={orgWide ? "" : deptName(deptSettingsId)}
        />
      )}

      {tab === "terms" && deptSettingsId && (
        <AcademicTermsCard
          key={`terms-${deptSettingsId}`}
          departmentId={deptSettingsId}
          orgWide={orgWide}
          creating={creatingTerm}
          onCreatingChange={setCreatingTerm}
        />
      )}

      {tab === "periods" && deptSettingsId && <PeriodsTab key={`periods-${deptSettingsId}`} departmentId={deptSettingsId} />}
    </div>
  );
}
