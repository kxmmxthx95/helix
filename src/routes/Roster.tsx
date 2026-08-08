import { KeyIcon, Plus, Search, SlidersHorizontal, Upload } from "@/components/icons";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ImportSheet } from "@/components/ImportSheet";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { useAllGradeLevels, useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments, useInviteUsers, type UserInvite } from "@/hooks/useProfiles";
import {
  useSaveStudent,
  useStudents,
  type StudentDraft,
  type StudentFilters,
} from "@/hooks/useStudents";
import type { Student, StudentStatus } from "@/lib/database.types";
import { canManage, canManageUsers, isOrgWide } from "@/lib/roles";

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
  const [creatingLoginFor, setCreatingLoginFor] = useState<Student | null>(null);

  const { data: departments = [] } = useDepartments();
  const { data: rows, isLoading, error } = useStudents(filters);
  const { data: allGradeLevels = [] } = useAllGradeLevels();

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const gradeLevelName = useMemo(
    () => new Map(allGradeLevels.map((g) => [g.id, g.name])),
    [allGradeLevels],
  );
  const mayEdit = me ? canManage(me.roles) : false;
  const mayManageUsers = me ? canManageUsers(me.roles) : false;

  const activeFilterCount = [filters.departmentId, filters.status].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {mayEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setImportOpen(true)} aria-label="นำเข้า CSV">
              <Upload className="h-3 w-3" />
            </Button>
            <Button size="icon" onClick={() => setEditing("new")} aria-label="เพิ่มนักเรียน">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
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
          <SlidersHorizontal className="h-3 w-3" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner className="h-5 w-5 text-muted-foreground" />
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
                {mayManageUsers && <th className="px-3 py-2 font-medium">บัญชี</th>}
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
                  <td className="px-3 py-3 text-muted-foreground">
                    {row.grade_level_id ? gradeLevelName.get(row.grade_level_id) ?? "—" : "—"}
                  </td>
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
                  {mayManageUsers && (
                    <td className="px-3 py-3">
                      {row.profile_id ? (
                        <span className="text-xs text-muted-foreground">มีบัญชีแล้ว</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreatingLoginFor(row);
                          }}
                        >
                          <KeyIcon className="h-3.5 w-3.5" />
                          สร้างบัญชี
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="ตัวกรอง">
        <div className="space-y-4">
          {me && isOrgWide(me.roles) && (
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
      <CreateStudentLoginSheet student={creatingLoginFor} onClose={() => setCreatingLoginFor(null)} />
    </div>
  );
}

function blankDraft(departmentId: string): StudentDraft {
  return {
    student_code: "",
    first_name: "",
    last_name: "",
    department_id: departmentId,
    grade_level_id: null,
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
  const { data: gradeLevels = [] } = useGradeLevels(current?.department_id ?? null);

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
              onChange={(e) =>
                setDraft({ ...current, department_id: e.target.value, grade_level_id: null })
              }
              required
              disabled={!me || !isOrgWide(me.roles)}
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
              <Select
                value={current.grade_level_id ?? ""}
                onChange={(e) => setDraft({ ...current, grade_level_id: e.target.value || null })}
              >
                <option value="">ยังไม่จัดชั้น</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
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
    grade_level_id: s.grade_level_id,
    status: s.status,
    national_id: s.national_id,
    guardian_name: s.guardian_name,
    guardian_phone: s.guardian_phone,
  };
}

type StudentLoginDraft = {
  password: string;
  national_id: string;
  date_of_birth: string;
};

function blankStudentLoginDraft(s: Student): StudentLoginDraft {
  return { password: "", national_id: s.national_id ?? "", date_of_birth: "" };
}

/**
 * Creates a login for an existing roster row — student_code becomes the
 * login id, name/department come straight from the roster (fix those there,
 * not here). super_admin-only, same as every other account-creation path.
 */
function CreateStudentLoginSheet({
  student,
  onClose,
}: {
  student: Student | null;
  onClose: () => void;
}) {
  const invite = useInviteUsers();
  const [draft, setDraft] = useState<StudentLoginDraft | null>(null);
  const [failReason, setFailReason] = useState<string | null>(null);

  const current = draft ?? (student ? blankStudentLoginDraft(student) : null);

  function close() {
    setDraft(null);
    setFailReason(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!student || !current) return;
    setFailReason(null);

    const payload: UserInvite = {
      kind: "student",
      loginId: student.student_code,
      password: current.password,
      prefix: null,
      first_name: student.first_name,
      last_name: student.last_name,
      email: null,
      national_id: current.national_id || null,
      date_of_birth: current.date_of_birth || null,
      department_id: student.department_id,
      roles: [],
      positionTitleIds: [],
      studentRowId: student.id,
    };

    const outcome = await invite.mutateAsync([payload]);
    if (outcome.inserted > 0) {
      close();
    } else {
      setFailReason(outcome.skipped[0]?.reason ?? "สร้างบัญชีไม่สำเร็จ");
    }
  }

  return (
    <Sheet
      open={student !== null}
      onOpenChange={(open) => !open && close()}
      title="สร้างบัญชีเข้าใช้"
      description={student ? `${student.first_name} ${student.last_name}` : undefined}
    >
      {student && current && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            รหัสนักเรียน <span className="font-mono">{student.student_code}</span>{" "}
            จะเป็นรหัสผู้ใช้เข้าระบบ
          </p>

          <Field label="รหัสผ่าน">
            <Input
              type="password"
              value={current.password}
              onChange={(e) => setDraft({ ...current, password: e.target.value })}
              minLength={8}
              required
            />
          </Field>

          <Field label="เลขบัตรประชาชน (ใช้ยืนยันตอนลืมรหัสผ่าน)">
            <Input
              value={current.national_id}
              onChange={(e) => setDraft({ ...current, national_id: e.target.value })}
              required
            />
          </Field>

          <Field label="วันเดือนปีเกิด">
            <Input
              type="date"
              value={current.date_of_birth}
              onChange={(e) => setDraft({ ...current, date_of_birth: e.target.value })}
              required
            />
          </Field>

          {failReason && <p className="text-sm text-destructive">{failReason}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              ยกเลิก
            </Button>
            <Button type="submit" className="flex-1" disabled={invite.isPending}>
              {invite.isPending ? <Spinner /> : "สร้างบัญชี"}
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
