import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Card, Field, Input, Spinner } from "@/components/ui";
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
import { isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

function SchoolSettingsCard() {
  const { data: settings, isLoading } = useSchoolSettings();
  const update = useUpdateSchoolSettings();
  const upload = useUploadLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<SchoolSettingsEdit | null>(null);

  useEffect(() => {
    if (settings) setForm({ name_th: settings.name_th, name_en: settings.name_en, academic_year: settings.academic_year });
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
      <h3 className="text-lg font-semibold">ตั้งค่าส่วนกลาง</h3>

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
          update.mutate(form);
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
        <Field label="ปีการศึกษาหลัก (พ.ศ.)">
          <Input
            type="number"
            required
            value={form.academic_year}
            onChange={(e) => setForm({ ...form, academic_year: Number(e.target.value) })}
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
  const { data: settings, isLoading } = useDepartmentSettings(departmentId);
  const update = useUpdateDepartmentSettings(departmentId);
  const [form, setForm] = useState<DepartmentSettingsEdit | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        semester1_start: settings.semester1_start,
        semester1_end: settings.semester1_end,
        semester2_start: settings.semester2_start,
        semester2_end: settings.semester2_end,
        score_collect_pct: settings.score_collect_pct,
        score_exam_pct: settings.score_exam_pct,
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
    <Card className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">ตั้งค่าแผนก</h3>
        <p className="text-sm text-muted-foreground">{departmentName}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(form);
        }}
      >
        <div className="space-y-2">
          <p className="text-sm font-medium">ภาคเรียนที่ 1</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="วันเปิดภาคเรียน">
              <Input
                type="date"
                value={form.semester1_start ?? ""}
                onChange={(e) => setForm({ ...form, semester1_start: e.target.value || null })}
              />
            </Field>
            <Field label="วันปิดภาคเรียน">
              <Input
                type="date"
                value={form.semester1_end ?? ""}
                onChange={(e) => setForm({ ...form, semester1_end: e.target.value || null })}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">ภาคเรียนที่ 2</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="วันเปิดภาคเรียน">
              <Input
                type="date"
                value={form.semester2_start ?? ""}
                onChange={(e) => setForm({ ...form, semester2_start: e.target.value || null })}
              />
            </Field>
            <Field label="วันปิดภาคเรียน">
              <Input
                type="date"
                value={form.semester2_end ?? ""}
                onChange={(e) => setForm({ ...form, semester2_end: e.target.value || null })}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-2">
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
            <span className="pt-6 text-sm text-muted-foreground">
              สอบ {form.score_exam_pct ?? "—"}%
            </span>
          </div>
        </div>

        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
        </Button>
      </form>
    </Card>
  );
}

export function Settings() {
  const { profile } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = profile ? isOrgWide(profile.roles) : false;
  const isDeptHead = profile ? profile.roles.includes("dept_head") : false;
  const [pickedDept, setPickedDept] = useState("");

  // Org-wide has no home department — default the picker to the first one.
  useEffect(() => {
    if (orgWide && !pickedDept && departments.length > 0) setPickedDept(departments[0]!.id);
  }, [orgWide, departments, pickedDept]);

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "";
  const deptSettingsId = orgWide ? pickedDept : profile?.department_id ?? "";

  return (
    <div className="space-y-4">
      {orgWide && <SchoolSettingsCard />}

      {orgWide && departments.length > 0 && (
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border p-1">
          {departments.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setPickedDept(d.id)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
                pickedDept === d.id
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {(orgWide || isDeptHead) && deptSettingsId && (
        <DepartmentSettingsCard
          key={deptSettingsId}
          departmentId={deptSettingsId}
          departmentName={deptName(deptSettingsId)}
        />
      )}

      {!orgWide && !isDeptHead && (
        <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์ตั้งค่าระบบ</Card>
      )}
    </div>
  );
}
