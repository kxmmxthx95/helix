import { Plus, Search, SlidersHorizontal, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ImportSheet } from "@/components/ImportSheet";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { useDepartments } from "@/hooks/useProfiles";
import {
  useSaveStudent,
  useStudents,
  type StudentDraft,
  type StudentFilters,
} from "@/hooks/useStudents";
import type { Student, StudentStatus } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";

const EMPTY: StudentFilters = { search: "", departmentId: "", status: "" };

const STATUS_LABEL: Record<StudentStatus, string> = {
  studying: "กำลังศึกษา",
  transferred: "ย้ายออก",
  graduated: "จบการศึกษา",
  dropped: "พ้นสภาพ",
};

export function Roster() {
  const { profile: me } = useAuth();
  const [filters, setFilters] = useState<StudentFilters>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Student | "new" | null>(null);

  const { data: departments = [] } = useDepartments();
  const { data: rows, isLoading, error } = useStudents(filters);

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const mayEdit = me ? canManage(me.role) : false;

  const activeFilterCount = [filters.departmentId, filters.status].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">รายชื่อนักเรียน</h2>
        {mayEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setImportOpen(true)} aria-label="นำเข้า CSV">
              <Upload className="h-4 w-4" />
            </Button>
            <Button size="icon" onClick={() => setEditing("new")} aria-label="เพิ่มนักเรียน">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="ค้นหาชื่อหรือรหัสนักเรียน"
            className="pl-9"
            type="search"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          onClick={() => setFiltersOpen(true)}
          aria-label="ตัวกรอง"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      )}

      {error && <Card className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</Card>}

      {rows && rows.length === 0 && (
        <Card className="py-10 text-center text-sm text-muted-foreground">ไม่พบนักเรียน</Card>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">รหัส</th>
                <th className="px-3 py-2 font-medium">ชื่อ-นามสกุล</th>
                <th className="px-3 py-2 font-medium">แผนก</th>
                <th className="px-3 py-2 font-medium">ชั้น</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => mayEdit && setEditing(row)}
                  className={
                    mayEdit
                      ? "tappable cursor-pointer border-t border-border active:bg-muted"
                      : "border-t border-border"
                  }
                >
                  <td className="px-3 py-3 font-mono text-xs">{row.student_code}</td>
                  <td className="px-3 py-3 font-medium">
                    {row.first_name} {row.last_name}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {deptName.get(row.department_id) ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{row.class_level ?? "—"}</td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        row.status === "studying"
                          ? "rounded-full bg-success/15 px-2 py-0.5 text-xs text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="ตัวกรอง">
        <div className="space-y-4">
          {me && isOrgWide(me.role) && (
            <Field label="แผนก">
              <Select
                value={filters.departmentId}
                onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}
              >
                <option value="">ทุกแผนก</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="สถานะ">
            <Select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value as StudentFilters["status"] })
              }
            >
              <option value="">ทั้งหมด</option>
              {(Object.keys(STATUS_LABEL) as StudentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setFilters({ ...EMPTY, search: filters.search })}
            >
              ล้างตัวกรอง
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              ดูผลลัพธ์
            </Button>
          </div>
        </div>
      </Sheet>

      <EditStudentSheet target={editing} onClose={() => setEditing(null)} />
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function blankDraft(departmentId: string): StudentDraft {
  return {
    student_code: "",
    first_name: "",
    last_name: "",
    department_id: departmentId,
    class_level: null,
    status: "studying",
    national_id: null,
    guardian_name: null,
    guardian_phone: null,
  };
}

function EditStudentSheet({
  target,
  onClose,
}: {
  target: Student | "new" | null;
  onClose: () => void;
}) {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const save = useSaveStudent();
  const [draft, setDraft] = useState<StudentDraft | null>(null);

  const isNew = target === "new";
  const base: StudentDraft | null =
    target === null
      ? null
      : isNew
        ? blankDraft(me?.department_id ?? departments[0]?.id ?? "")
        : pickDraft(target);
  const current = draft ?? base;

  function close() {
    setDraft(null);
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    save.mutate({ ...current, ...(isNew ? {} : { id: (target as Student).id }) });
    close();
  }

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => !open && close()}
      title={isNew ? "เพิ่มนักเรียน" : "แก้ไขข้อมูลนักเรียน"}
    >
      {current && (
        <form onSubmit={submit} className="space-y-4">
          <Field label="รหัสนักเรียน">
            <Input
              value={current.student_code}
              onChange={(e) => setDraft({ ...current, student_code: e.target.value })}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="ชื่อ">
              <Input
                value={current.first_name}
                onChange={(e) => setDraft({ ...current, first_name: e.target.value })}
                required
              />
            </Field>
            <Field label="นามสกุล">
              <Input
                value={current.last_name}
                onChange={(e) => setDraft({ ...current, last_name: e.target.value })}
                required
              />
            </Field>
          </div>

          <Field label="แผนก">
            <Select
              value={current.department_id}
              onChange={(e) => setDraft({ ...current, department_id: e.target.value })}
              required
              disabled={!me || !isOrgWide(me.role)}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="ชั้น">
              <Input
                value={current.class_level ?? ""}
                onChange={(e) => setDraft({ ...current, class_level: e.target.value || null })}
              />
            </Field>
            <Field label="สถานะ">
              <Select
                value={current.status}
                onChange={(e) => setDraft({ ...current, status: e.target.value as StudentStatus })}
              >
                {(Object.keys(STATUS_LABEL) as StudentStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="ชื่อผู้ปกครอง">
            <Input
              value={current.guardian_name ?? ""}
              onChange={(e) => setDraft({ ...current, guardian_name: e.target.value || null })}
            />
          </Field>

          <Field label="เบอร์ผู้ปกครอง">
            <Input
              type="tel"
              value={current.guardian_phone ?? ""}
              onChange={(e) => setDraft({ ...current, guardian_phone: e.target.value || null })}
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              ยกเลิก
            </Button>
            <Button type="submit" className="flex-1">
              บันทึก
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function pickDraft(s: Student): StudentDraft {
  return {
    student_code: s.student_code,
    first_name: s.first_name,
    last_name: s.last_name,
    department_id: s.department_id,
    class_level: s.class_level,
    status: s.status,
    national_id: s.national_id,
    guardian_name: s.guardian_name,
    guardian_phone: s.guardian_phone,
  };
}
