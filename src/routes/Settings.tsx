import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
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
import {
  useDeletePeriodDefinition,
  useDepartmentPeriods,
  useSavePeriodDefinition,
  type PeriodDefinitionDraft,
} from "@/hooks/usePeriodDefinitions";
import type { AcademicTerm, PeriodDefinition, PeriodType, TermStatus, TermType } from "@/lib/database.types";
import { isOrgWide } from "@/lib/roles";
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

function SchoolSettingsCard() {
  const toast = useToast();
  const { data: settings, isLoading } = useSchoolSettings();
  const update = useUpdateSchoolSettings();
  const upload = useUploadLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<SchoolSettingsEdit | null>(null);

  useEffect(() => {
    if (settings) setForm({ name_th: settings.name_th, name_en: settings.name_en });
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

  useEffect(() => {
    if (settings) {
      setForm({
        score_collect_pct: settings.score_collect_pct,
        score_exam_pct: settings.score_exam_pct,
        min_periods_per_week: settings.min_periods_per_week,
        max_periods_per_week: settings.max_periods_per_week,
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

function PeriodDefinitionsCard({ departmentId }: { departmentId: string }) {
  const { data: periods = [], isLoading } = useDepartmentPeriods(departmentId);
  const [editing, setEditing] = useState<PeriodDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  const byDay = new Map<number, PeriodDefinition[]>();
  for (const p of periods) byDay.set(p.day_of_week, [...(byDay.get(p.day_of_week) ?? []), p]);

  const sheets = (
    <>
      <PeriodSheet
        mode="edit"
        period={editing}
        open={editing !== null}
        departmentId={departmentId}
        onClose={() => setEditing(null)}
      />
      <PeriodSheet
        mode="create"
        period={null}
        open={creating}
        departmentId={departmentId}
        onClose={() => setCreating(false)}
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

  if (periods.length === 0) {
    return (
      <>
        <EmptyState
          title="ไม่พบข้อมูล"
          description="ยังไม่มีคาบเวลา"
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />
              เพิ่มคาบ
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
          เพิ่มคาบ
        </Button>
      </div>

      <div className="space-y-3">
        {[...byDay.entries()].map(([day, dayPeriods]) => (
          <div key={day}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{DAY_LABEL[day] ?? day}</p>
            <ul className="divide-y divide-border text-sm">
              {dayPeriods.map((p) => (
                <li
                  key={p.id}
                  onClick={() => setEditing(p)}
                  className="flex cursor-pointer items-center justify-between gap-2 py-1.5"
                >
                  <span>
                    คาบ {p.period_no} · {p.label}
                    <span className="block text-xs text-muted-foreground">
                      {p.start_time.slice(0, 5)} – {p.end_time.slice(0, 5)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs",
                      p.period_type === "teaching"
                        ? "bg-muted text-muted-foreground"
                        : "bg-warning/15 text-warning",
                    )}
                  >
                    {PERIOD_TYPE_LABEL[p.period_type]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
  onClose,
}: {
  mode: "create" | "edit";
  period: PeriodDefinition | null;
  open: boolean;
  departmentId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSavePeriodDefinition();
  const del = useDeletePeriodDefinition();

  const blank = (): PeriodDefinitionDraft => ({
    department_id: departmentId,
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

type SettingsTab = "school" | "department" | "terms" | "periods";

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

  const tabs: { id: SettingsTab; label: string }[] = [
    ...(orgWide ? [{ id: "school" as const, label: "ตั้งค่าส่วนกลาง" }] : []),
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
  const showDeptPicker = orgWide && tab !== "school" && departments.length > 0;

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

      {tab === "periods" && deptSettingsId && (
        <PeriodDefinitionsCard key={`periods-${deptSettingsId}`} departmentId={deptSettingsId} />
      )}
    </div>
  );
}
