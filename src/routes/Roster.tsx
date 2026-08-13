import { AlertTriangle, CheckmarkCircleIcon, KeyIcon, Plus, Search, SlidersHorizontal, Upload, X } from "@/components/icons";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ImportSheet } from "@/components/ImportSheet";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Avatar, Card, EmptyState, Field, Input, Pagination, Select, Spinner } from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
import { useAllGradeLevels, useGradeLevels } from "@/hooks/useCurriculumStructure";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments, useInviteUsers, type InviteOutcome, type UserInvite } from "@/hooks/useProfiles";
import { passwordFromNationalId } from "@/lib/password";
import {
  useDeleteStudentContact,
  useGuardianFinancials,
  useSaveGuardianFinancial,
  useSaveStudentContact,
  useSetPrimaryContact,
  useStudentContacts,
  type StudentContactDraft,
} from "@/hooks/useStudentContacts";
import {
  useDeleteStudent,
  useSaveStudent,
  useStudents,
  type StudentDraft,
  type StudentFilters,
} from "@/hooks/useStudents";
import type {
  AddressFields,
  BloodType,
  GuardianRelationship,
  Student,
  StudentContact,
  StudentStatus,
} from "@/lib/database.types";
import { canManage, canManageUsers, isOrgWide, STUDENT_PREFIXES } from "@/lib/roles";
import { gradeShortLabel } from "@/lib/gradeLevels";

const EMPTY: StudentFilters = { search: "", departmentId: "", status: "studying" };

const STATUS_LABEL: Record<StudentStatus, string> = {
  studying: "กำลังศึกษา",
  transferred: "ย้ายออก",
  graduated: "จบการศึกษา",
  dropped: "พ้นสภาพ",
};

/** Derive เพศ from Thai student name title (no separate gender column). */
function studentGender(prefix: string | null): "ชาย" | "หญิง" | null {
  if (prefix === "เด็กชาย" || prefix === "นาย") return "ชาย";
  if (prefix === "เด็กหญิง" || prefix === "นางสาว") return "หญิง";
  return null;
}

export const RELATIONSHIP_LABEL: Record<GuardianRelationship, string> = {
  father: "บิดา",
  mother: "มารดา",
  other: "ผู้ปกครอง (อื่นๆ)",
};

export const BLOOD_TYPE_LABEL: Record<BloodType, string> = {
  "A+": "A+",
  "A-": "A-",
  "B+": "B+",
  "B-": "B-",
  "AB+": "AB+",
  "AB-": "AB-",
  "O+": "O+",
  "O-": "O-",
  unknown: "ไม่ทราบ",
};

// สถานภาพครอบครัว — free text column (0015), UI narrows it to a fixed
// list to avoid typo'd variants of the same status; adjust the list
// freely since nothing else depends on exact values.
export const FAMILY_STATUSES = [
  "อยู่ด้วยกัน",
  "หย่าร้าง",
  "แยกกันอยู่",
  "บิดาเสียชีวิต",
  "มารดาเสียชีวิต",
  "เสียชีวิตทั้งคู่",
  "อื่นๆ",
];

export const textareaClass =
  "flex min-h-16 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-50";

export const ADDRESS_KEYS: (keyof AddressFields)[] = [
  "house_no",
  "village_no",
  "alley",
  "road",
  "subdistrict",
  "district",
  "province",
  "postal_code",
];

export function pickAddress(v: AddressFields): AddressFields {
  return Object.fromEntries(ADDRESS_KEYS.map((k) => [k, v[k]])) as AddressFields;
}

/**
 * Standard Thai postal address — บ้านเลขที่/หมู่ที่/ตรอกซอย/ถนน/ตำบล/อำเภอ/
 * จังหวัด/รหัสไปรษณีย์. `required` marks which subfields are mandatory —
 * หมู่ที่/ตรอกซอย/ถนน are legitimately blank for many addresses (grill
 * decision, migration 0022's onboarding gate uses this to require only 5/8).
 */
export function AddressInputs({
  value,
  onChange,
  required = [],
}: {
  value: AddressFields;
  onChange: (patch: Partial<AddressFields>) => void;
  required?: (keyof AddressFields)[];
}) {
  const isRequired = (k: keyof AddressFields) => required.includes(k);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="บ้านเลขที่">
          <Input
            value={value.house_no ?? ""}
            onChange={(e) => onChange({ house_no: e.target.value || null })}
            required={isRequired("house_no")}
          />
        </Field>
        <Field label="หมู่ที่">
          <Input
            value={value.village_no ?? ""}
            onChange={(e) => onChange({ village_no: e.target.value || null })}
            required={isRequired("village_no")}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ตรอก/ซอย">
          <Input
            value={value.alley ?? ""}
            onChange={(e) => onChange({ alley: e.target.value || null })}
            required={isRequired("alley")}
          />
        </Field>
        <Field label="ถนน">
          <Input
            value={value.road ?? ""}
            onChange={(e) => onChange({ road: e.target.value || null })}
            required={isRequired("road")}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ตำบล/แขวง">
          <Input
            value={value.subdistrict ?? ""}
            onChange={(e) => onChange({ subdistrict: e.target.value || null })}
            required={isRequired("subdistrict")}
          />
        </Field>
        <Field label="อำเภอ/เขต">
          <Input
            value={value.district ?? ""}
            onChange={(e) => onChange({ district: e.target.value || null })}
            required={isRequired("district")}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="จังหวัด">
          <Input
            value={value.province ?? ""}
            onChange={(e) => onChange({ province: e.target.value || null })}
            required={isRequired("province")}
          />
        </Field>
        <Field label="รหัสไปรษณีย์">
          <Input
            value={value.postal_code ?? ""}
            onChange={(e) => onChange({ postal_code: e.target.value || null })}
            required={isRequired("postal_code")}
          />
        </Field>
      </div>
    </div>
  );
}

/**
 * Splits a roster page's rows into who a bulk login-creation pass can act
 * on. Excludes anyone with an account already (not this action's business)
 * and anyone without a well-formed 13-digit national ID — student login
 * passwords are derived from it (passwordFromNationalId), so there's no
 * password to issue without one. Pure and exported so this — the only real
 * decision in the bulk-create flow — has a test without a rendered sheet.
 */
export function splitLoginEligibility(students: Student[]): { ready: Student[]; skipped: Student[] } {
  const ready: Student[] = [];
  const skipped: Student[] = [];
  for (const s of students) {
    if (s.profile_id) continue;
    if (s.national_id && /^\d{13}$/.test(s.national_id)) ready.push(s);
    else skipped.push(s);
  }
  return { ready, skipped };
}

export function Roster() {
  const { profile: me } = useAuth();
  const [filters, setFilters] = useState<StudentFilters>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [creatingLoginFor, setCreatingLoginFor] = useState<Student | null>(null);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);

  const { data: departments = [] } = useDepartments();
  const { data: rows, isLoading, error } = useStudents(filters);
  const { data: allGradeLevels = [] } = useAllGradeLevels();

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const gradeLevelName = useMemo(
    () => new Map(allGradeLevels.map((g) => [g.id, gradeShortLabel(g.code)])),
    [allGradeLevels],
  );
  const mayEdit = me ? canManage(me.roles) : false;
  const mayManageUsers = me ? canManageUsers(me.roles) : false;
  const deleteStudent = useDeleteStudent();
  const { page, setPage, pageCount, pageRows } = usePagination(rows ?? [], [filters]);

  const activeFilterCount = [filters.departmentId, filters.status].filter(Boolean).length;

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
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
          className="relative shrink-0"
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
        {mayManageUsers && (
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setBulkCreateOpen(true)}
            aria-label="สร้างบัญชีทุกคน"
          >
            <KeyIcon className="h-3 w-3" />
          </Button>
        )}
        {mayEdit && (
          <>
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => setImportOpen(true)} aria-label="นำเข้า CSV">
              <Upload className="h-3 w-3" />
            </Button>
            <Button size="icon" className="shrink-0" onClick={() => setEditing("new")} aria-label="เพิ่มนักเรียน">
              <Plus className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>

      {isLoading && (
        <div className="flex flex-1 items-center justify-center py-12">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {error && <Card className="shrink-0 text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</Card>}

      {rows && rows.length === 0 && (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่พบนักเรียนตามเงื่อนไขที่เลือก" />
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          <ul className="space-y-2 lg:hidden">
            {pageRows.map((row) => {
              const gender = studentGender(row.prefix);
              const fullName = `${row.first_name} ${row.last_name}`;
              return (
              <li key={row.id}>
                <div
                  role={mayEdit ? "button" : undefined}
                  tabIndex={mayEdit ? 0 : undefined}
                  onClick={() => mayEdit && setEditing(row)}
                  onKeyDown={(e) => {
                    if (!mayEdit) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditing(row);
                    }
                  }}
                  className={
                    mayEdit
                      ? "rounded-lg border border-border p-3 active:bg-muted"
                      : "rounded-lg border border-border p-3"
                  }
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      name={fullName}
                      src={row.profile ? avatarUrl(row.profile) : null}
                      className="h-10 w-10 text-xs"
                    />
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{fullName}</p>
                        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate">{row.student_code}</span>
                          {gender && (
                            <span
                              className={
                                gender === "ชาย"
                                  ? "inline-flex shrink-0 items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-500"
                                  : "inline-flex shrink-0 items-center rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] text-pink-500"
                              }
                            >
                              {gender}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {deptName.get(row.department_id) ?? "—"}
                          {" · "}
                          {row.grade_level_id ? (gradeLevelName.get(row.grade_level_id) ?? "—") : "—"}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs">
                        <span
                          className={
                            row.status === "studying"
                              ? "size-2 rounded-full bg-success"
                              : "size-2 rounded-full bg-muted-foreground"
                          }
                        />
                        {STATUS_LABEL[row.status]}
                      </span>
                    </div>
                  </div>
                  {(mayManageUsers || mayEdit) && (
                    <div className="mt-2 flex items-center gap-2">
                      {mayManageUsers &&
                        (row.profile_id ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-500">
                            <CheckmarkCircleIcon className="size-3" />
                            มีบัญชีแล้ว
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreatingLoginFor(row);
                            }}
                          >
                            <KeyIcon className="h-3 w-3" />
                            สร้างบัญชี
                          </Button>
                        ))}
                      {mayEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-auto"
                          aria-label="ลบนักเรียน"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              confirm(
                                `ลบ "${row.first_name} ${row.last_name}" ถาวร? ข้อมูลผู้ปกครอง, ประวัติลงทะเบียน, และการจัดห้องของนักเรียนคนนี้จะถูกลบไปด้วยทั้งหมด กู้คืนไม่ได้`,
                              )
                            ) {
                              deleteStudent.mutate(row.id);
                            }
                          }}
                          disabled={deleteStudent.isPending}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <table className="w-full text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัส</th>
                  <th className="px-3 py-2 font-medium">คำนำหน้า</th>
                  <th className="px-3 py-2 font-medium">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-2 font-medium">แผนก</th>
                  <th className="px-3 py-2 font-medium">ชั้น</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  {mayManageUsers && <th className="px-3 py-2 font-medium">บัญชี</th>}
                  {mayEdit && <th className="px-3 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => mayEdit && setEditing(row)}
                    className={
                      mayEdit
                        ? "h-[40px] cursor-pointer border-t border-border active:bg-muted"
                        : "h-[40px] border-t border-border"
                    }
                  >
                    <td className="px-3 py-0 text-xs">{row.student_code}</td>
                    <td className="px-3 py-0">{row.prefix ?? "—"}</td>
                    <td className="px-3 py-0 font-medium">
                      {row.first_name} {row.last_name}
                    </td>
                    <td className="px-3 py-0">
                      {deptName.get(row.department_id) ?? "—"}
                    </td>
                    <td className="px-3 py-0">
                      {row.grade_level_id ? gradeLevelName.get(row.grade_level_id) ?? "—" : "—"}
                    </td>
                    <td className="px-3 py-0">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={
                            row.status === "studying"
                              ? "size-2 rounded-full bg-success"
                              : "size-2 rounded-full bg-muted-foreground"
                          }
                        />
                        <span className="text-xs">
                          {STATUS_LABEL[row.status]}
                        </span>
                      </span>
                    </td>
                    {mayManageUsers && (
                      <td className="px-3 py-0">
                        {row.profile_id ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-500">
                            <CheckmarkCircleIcon className="size-3" />
                            มีบัญชีแล้ว
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreatingLoginFor(row);
                            }}
                          >
                            <KeyIcon className="h-3 w-3" />
                            สร้างบัญชี
                          </Button>
                        )}
                      </td>
                    )}
                    {mayEdit && (
                      <td className="px-3 py-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="ลบนักเรียน"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              confirm(
                                `ลบ "${row.first_name} ${row.last_name}" ถาวร? ข้อมูลผู้ปกครอง, ประวัติลงทะเบียน, และการจัดห้องของนักเรียนคนนี้จะถูกลบไปด้วยทั้งหมด กู้คืนไม่ได้`,
                              )
                            ) {
                              deleteStudent.mutate(row.id);
                            }
                          }}
                          disabled={deleteStudent.isPending}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      <Sheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="ตัวกรอง"
        footer={
          <div className="flex gap-2">
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
        }
      >
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
        </div>
      </Sheet>

      <EditStudentSheet target={editing} onClose={() => setEditing(null)} />
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} />
      <CreateStudentLoginSheet student={creatingLoginFor} onClose={() => setCreatingLoginFor(null)} />
      <BulkCreateLoginsSheet
        open={bulkCreateOpen}
        students={rows ?? []}
        onClose={() => setBulkCreateOpen(false)}
      />
    </div>
  );
}

function blankDraft(departmentId: string): StudentDraft {
  return {
    student_code: "",
    prefix: null,
    first_name: "",
    last_name: "",
    department_id: departmentId,
    grade_level_id: null,
    status: "studying",
    national_id: null,
    phone: null,
    email: null,
    house_no: null,
    village_no: null,
    alley: null,
    road: null,
    subdistrict: null,
    district: null,
    province: null,
    postal_code: null,
    family_status: null,
    blood_type: null,
    chronic_disease: null,
    drug_allergy: null,
    food_allergy: null,
  };
}

type Section = "basic" | "health" | "guardian";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "basic", label: "พื้นฐาน" },
  { key: "health", label: "สุขภาพ" },
  { key: "guardian", label: "ผู้ปกครอง" },
];

function EditStudentSheet({
  target,
  onClose,
}: {
  target: Student | "new" | null;
  onClose: () => void;
}) {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data: departments = [] } = useDepartments();
  const save = useSaveStudent();
  const [draft, setDraft] = useState<StudentDraft | null>(null);
  const [section, setSection] = useState<Section>("basic");

  const isNew = target === "new";
  const base: StudentDraft | null =
    target === null
      ? null
      : isNew
        ? blankDraft(
            me && isOrgWide(me.roles) ? (me.department_id ?? "") : (me?.department_id ?? departments[0]?.id ?? ""),
          )
        : pickDraft(target);
  const current = draft ?? base;
  const { data: gradeLevels = [] } = useGradeLevels(current?.department_id ?? null);

  function close() {
    setDraft(null);
    setSection("basic");
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (
      !current.student_code.trim() ||
      !current.prefix ||
      !current.first_name.trim() ||
      !current.last_name.trim() ||
      !current.department_id ||
      !current.grade_level_id
    ) {
      setSection("basic");
      return;
    }
    save.mutate(
      { ...current, ...(isNew ? {} : { id: (target as Student).id }) },
      {
        onSuccess: () => toast("บันทึกข้อมูลนักเรียนสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
    close();
  }

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => !open && close()}
      title={isNew ? "เพิ่มนักเรียน" : "แก้ไขข้อมูลนักเรียน"}
      footer={
        current ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              ยกเลิก
            </Button>
            <Button type="submit" form="edit-student" className="flex-1">
              บันทึก
            </Button>
          </div>
        ) : undefined
      }
    >
      {current && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                className={
                  section === s.key
                    ? "rounded-full border border-foreground bg-foreground/10 px-3 py-1 text-xs text-foreground transition-colors"
                    : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                }
              >
                {s.label}
              </button>
            ))}
          </div>

          <form id="edit-student" onSubmit={submit} className="space-y-4">
            {section === "basic" && (
              <>
                <Field label="รหัสนักเรียน">
                  <Input
                    value={current.student_code}
                    onChange={(e) => setDraft({ ...current, student_code: e.target.value })}
                    required
                  />
                </Field>

                <Field label="เลขบัตรประจำตัวประชาชน">
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    value={current.national_id ?? ""}
                    onChange={(e) =>
                      setDraft({ ...current, national_id: e.target.value.replace(/\D/g, "").slice(0, 13) || null })
                    }
                    pattern="[0-9]{13}"
                    maxLength={13}
                    title="เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก"
                  />
                </Field>

                <Field label="คำนำหน้า">
                  <Select
                    value={current.prefix ?? ""}
                    onChange={(e) => setDraft({ ...current, prefix: e.target.value || null })}
                    required
                    placeholder="เลือกคำนำหน้า"
                  >
                    {STUDENT_PREFIXES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
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
                    placeholder="เลือกแผนก"
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
                      required
                      placeholder="เลือกชั้น"
                    >
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

                <Field label="เบอร์โทรศัพท์">
                  <Input
                    type="tel"
                    value={current.phone ?? ""}
                    onChange={(e) => setDraft({ ...current, phone: e.target.value || null })}
                  />
                </Field>

                <Field label="อีเมล">
                  <Input
                    type="email"
                    value={current.email ?? ""}
                    onChange={(e) => setDraft({ ...current, email: e.target.value || null })}
                  />
                </Field>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">ที่อยู่</p>
                  <AddressInputs value={current} onChange={(patch) => setDraft({ ...current, ...patch })} />
                </div>
              </>
            )}

            {section === "health" && (
              <>
                <Field label="หมู่เลือด">
                  <Select
                    value={current.blood_type ?? ""}
                    onChange={(e) =>
                      setDraft({ ...current, blood_type: (e.target.value || null) as BloodType | null })
                    }
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {(Object.keys(BLOOD_TYPE_LABEL) as BloodType[]).map((b) => (
                      <option key={b} value={b}>
                        {BLOOD_TYPE_LABEL[b]}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="โรคประจำตัว">
                  <textarea
                    className={textareaClass}
                    value={current.chronic_disease ?? ""}
                    onChange={(e) => setDraft({ ...current, chronic_disease: e.target.value || null })}
                  />
                </Field>

                <Field label="ยาที่แพ้">
                  <textarea
                    className={textareaClass}
                    value={current.drug_allergy ?? ""}
                    onChange={(e) => setDraft({ ...current, drug_allergy: e.target.value || null })}
                  />
                </Field>

                <Field label="อาหารที่แพ้">
                  <textarea
                    className={textareaClass}
                    value={current.food_allergy ?? ""}
                    onChange={(e) => setDraft({ ...current, food_allergy: e.target.value || null })}
                  />
                </Field>
              </>
            )}
          </form>

          {section === "guardian" && (
            <div className="space-y-4">
              <Field label="สถานภาพครอบครัว">
                <Select
                  form="edit-student"
                  value={current.family_status ?? ""}
                  onChange={(e) => setDraft({ ...current, family_status: e.target.value || null })}
                >
                  <option value="">— ไม่ระบุ —</option>
                  {FAMILY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>

              {isNew ? (
                <p className="text-sm text-muted-foreground">
                  บันทึกข้อมูลนักเรียนก่อน แล้วค่อยเพิ่มผู้ปกครอง
                </p>
              ) : (
                <GuardianSection
                  studentId={(target as Student).id}
                  studentAddress={pickAddress(current)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function pickDraft(s: Student): StudentDraft {
  return {
    student_code: s.student_code,
    prefix: s.prefix,
    first_name: s.first_name,
    last_name: s.last_name,
    department_id: s.department_id,
    grade_level_id: s.grade_level_id,
    status: s.status,
    national_id: s.national_id,
    phone: s.phone,
    email: s.email,
    house_no: s.house_no,
    village_no: s.village_no,
    alley: s.alley,
    road: s.road,
    subdistrict: s.subdistrict,
    district: s.district,
    province: s.province,
    postal_code: s.postal_code,
    family_status: s.family_status,
    blood_type: s.blood_type,
    chronic_disease: s.chronic_disease,
    drug_allergy: s.drug_allergy,
    food_allergy: s.food_allergy,
  };
}

// ------------------------------------------------------------- guardians

function GuardianSection({
  studentId,
  studentAddress,
}: {
  studentId: string;
  studentAddress: AddressFields;
}) {
  const { data: contacts = [] } = useStudentContacts(studentId);
  const contactIds = useMemo(() => contacts.map((c) => c.id), [contacts]);
  const { data: financials = [] } = useGuardianFinancials(contactIds);
  const financialByContact = useMemo(
    () => new Map(financials.map((f) => [f.contact_id, f])),
    [financials],
  );
  const setPrimary = useSetPrimaryContact();
  const deleteContact = useDeleteStudentContact();
  const [editingContact, setEditingContact] = useState<StudentContact | NewContact | null>(null);

  if (editingContact) {
    return (
      <ContactForm
        studentId={studentId}
        studentAddress={studentAddress}
        target={editingContact}
        financial={"id" in editingContact ? financialByContact.get(editingContact.id) : undefined}
        onDone={() => setEditingContact(null)}
      />
    );
  }

  const hasFather = contacts.some((c) => c.relationship === "father");
  const hasMother = contacts.some((c) => c.relationship === "mother");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">รายชื่อผู้ปกครอง</h3>
        <Button
          type="button"
          size="sm"
          onClick={() => setEditingContact({ new: true, relationship: "other" })}
        >
          <Plus className="h-3.5 w-3.5" />
          เพิ่ม
        </Button>
      </div>

      {(!hasFather || !hasMother) && (
        <div className="flex gap-2">
          {!hasFather && (
            <button
              type="button"
              className="flex-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => setEditingContact({ new: true, relationship: "father" })}
            >
              + เพิ่มข้อมูลบิดา
            </button>
          )}
          {!hasMother && (
            <button
              type="button"
              className="flex-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => setEditingContact({ new: true, relationship: "mother" })}
            >
              + เพิ่มข้อมูลมารดา
            </button>
          )}
        </div>
      )}

      {contacts.length === 0 && (
        <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลผู้ปกครอง</p>
      )}

      <ul className="divide-y divide-border">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span>
                  {RELATIONSHIP_LABEL[c.relationship]}
                  {c.relationship === "other" && c.relationship_note ? ` (${c.relationship_note})` : ""}
                </span>
                {c.is_primary && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
                    หลัก
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.prefix}
                {c.first_name} {c.last_name} · {c.phone || "—"}
              </div>
            </div>
            {!c.is_primary && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPrimary.mutate(c.id)}
                disabled={setPrimary.isPending}
              >
                ตั้งเป็นหลัก
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setEditingContact(c)}>
              แก้ไข
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="ลบผู้ปกครอง"
              onClick={() => {
                if (confirm(`ลบข้อมูล "${c.first_name} ${c.last_name}" ออกจากรายชื่อผู้ปกครอง?`)) {
                  deleteContact.mutate(c.id);
                }
              }}
              disabled={deleteContact.isPending}
            >
              <X className="h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type NewContact = { new: true; relationship: GuardianRelationship };

function ContactForm({
  studentId,
  studentAddress,
  target,
  financial,
  onDone,
}: {
  studentId: string;
  studentAddress: AddressFields;
  target: StudentContact | NewContact;
  financial: { occupation: string | null; workplace: string | null; monthly_income: number | null } | undefined;
  onDone: () => void;
}) {
  const isNew = !("id" in target);
  const toast = useToast();
  const save = useSaveStudentContact();
  const saveFinancial = useSaveGuardianFinancial();

  const [draft, setDraft] = useState<StudentContactDraft>(() =>
    isNew
      ? {
          student_id: studentId,
          relationship: target.relationship,
          relationship_note: null,
          prefix: null,
          first_name: "",
          last_name: "",
          phone: null,
          email: null,
          house_no: null,
          village_no: null,
          alley: null,
          road: null,
          subdistrict: null,
          district: null,
          province: null,
          postal_code: null,
        }
      : {
          student_id: target.student_id,
          relationship: target.relationship,
          relationship_note: target.relationship_note,
          prefix: target.prefix,
          first_name: target.first_name,
          last_name: target.last_name,
          phone: target.phone,
          email: target.email,
          ...pickAddress(target),
        },
  );
  const [occupation, setOccupation] = useState(financial?.occupation ?? "");
  const [workplace, setWorkplace] = useState(financial?.workplace ?? "");
  const [monthlyIncome, setMonthlyIncome] = useState(financial?.monthly_income?.toString() ?? "");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const contact = await save.mutateAsync({
        ...draft,
        ...(isNew ? {} : { id: (target as StudentContact).id }),
      });
      const hasFinancial = occupation.trim() || workplace.trim() || monthlyIncome.trim();
      if (hasFinancial) {
        await saveFinancial.mutateAsync({
          contact_id: contact.id,
          occupation: occupation.trim() || null,
          workplace: workplace.trim() || null,
          monthly_income: monthlyIncome.trim() ? Number(monthlyIncome) : null,
        });
      }
      toast("บันทึกข้อมูลผู้ปกครองสำเร็จ");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Button type="button" variant="outline" size="sm" onClick={onDone}>
        ← กลับ
      </Button>

      <Field label="ความสัมพันธ์">
        <Select
          value={draft.relationship}
          onChange={(e) =>
            setDraft({ ...draft, relationship: e.target.value as GuardianRelationship })
          }
        >
          {(Object.keys(RELATIONSHIP_LABEL) as GuardianRelationship[]).map((r) => (
            <option key={r} value={r}>
              {RELATIONSHIP_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>

      {draft.relationship === "other" && (
        <Field label="ระบุความสัมพันธ์">
          <Input
            value={draft.relationship_note ?? ""}
            onChange={(e) => setDraft({ ...draft, relationship_note: e.target.value || null })}
            placeholder="เช่น ปู่, ย่า, ญาติ, ผู้อุปการะ"
            required
          />
        </Field>
      )}

      <Field label="คำนำหน้า">
        <Select
          value={draft.prefix ?? ""}
          onChange={(e) => setDraft({ ...draft, prefix: e.target.value || null })}
        >
          <option value="">— ไม่ระบุ —</option>
          <option value="นาย">นาย</option>
          <option value="นาง">นาง</option>
          <option value="นางสาว">นางสาว</option>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ชื่อ">
          <Input
            value={draft.first_name}
            onChange={(e) => setDraft({ ...draft, first_name: e.target.value })}
            required
          />
        </Field>
        <Field label="นามสกุล">
          <Input
            value={draft.last_name}
            onChange={(e) => setDraft({ ...draft, last_name: e.target.value })}
            required
          />
        </Field>
      </div>

      <Field label="เบอร์โทรศัพท์">
        <Input
          type="tel"
          value={draft.phone ?? ""}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value || null })}
        />
      </Field>

      <Field label="อีเมล">
        <Input
          type="email"
          value={draft.email ?? ""}
          onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
        />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">ที่อยู่</p>
          <button
            type="button"
            className="text-xs text-accent-foreground underline"
            onClick={() => setDraft({ ...draft, ...studentAddress })}
          >
            ใช้ที่อยู่เดียวกับนักเรียน
          </button>
        </div>
        <AddressInputs value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
      </div>

      <Field label="อาชีพ">
        <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} />
      </Field>

      <Field label="สถานที่ทำงาน">
        <Input value={workplace} onChange={(e) => setWorkplace(e.target.value)} />
      </Field>

      <Field label="เงินเดือน">
        <Input
          type="number"
          min="0"
          value={monthlyIncome}
          onChange={(e) => setMonthlyIncome(e.target.value)}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
      </Button>
    </form>
  );
}

type StudentLoginDraft = {
  national_id: string;
};

function blankStudentLoginDraft(s: Student): StudentLoginDraft {
  return { national_id: s.national_id ?? "" };
}

/**
 * Creates a login for an existing roster row — student_code becomes the
 * login id, name/department come straight from the roster (fix those there,
 * not here). super_admin-only, same as every other account-creation path.
 * Initial password is derived from national_id; the student is forced to
 * set a real password (and fill the rest of their profile) on first login —
 * see must_change_password / Onboarding.
 */
function CreateStudentLoginSheet({
  student,
  onClose,
}: {
  student: Student | null;
  onClose: () => void;
}) {
  const invite = useInviteUsers();
  const toast = useToast();
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
    const nationalId = current.national_id.replace(/\D/g, "");
    if (nationalId.length !== 13) {
      setFailReason("เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก");
      return;
    }

    const payload: UserInvite = {
      kind: "student",
      loginId: student.student_code,
      password: passwordFromNationalId(nationalId),
      mustChangePassword: true,
      prefix: student.prefix,
      first_name: student.first_name,
      last_name: student.last_name,
      email: null,
      national_id: nationalId,
      date_of_birth: null,
      department_id: student.department_id,
      roles: [],
      positionTitleIds: [],
      studentRowId: student.id,
      teacher_code: null,
      learning_area_id: null,
    };

    const outcome = await invite.mutateAsync([payload]);
    if (outcome.inserted > 0) {
      toast("สร้างบัญชีเข้าใช้สำเร็จ");
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
      footer={
        student && current ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              ยกเลิก
            </Button>
            <Button type="submit" form="create-student-login" className="flex-1" disabled={invite.isPending}>
              {invite.isPending ? <Spinner /> : "สร้างบัญชี"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {student && current && (
        <form id="create-student-login" onSubmit={submit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            รหัสนักเรียน <span className="font-mono">{student.student_code}</span>{" "}
            จะเป็นรหัสผู้ใช้เข้าระบบ
          </p>

          <Field label="เลขบัตรประชาชน (ใช้เป็นรหัสผ่านเริ่มต้น)">
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={current.national_id}
              onChange={(e) => setDraft({ ...current, national_id: e.target.value.replace(/\D/g, "").slice(0, 13) })}
              pattern="[0-9]{13}"
              minLength={13}
              maxLength={13}
              title="เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก"
              required
            />
          </Field>

          {failReason && <p className="text-sm text-destructive">{failReason}</p>}
        </form>
      )}
    </Sheet>
  );
}

const BULK_LOGIN_CHUNK_SIZE = 50;

function studentToInvite(s: Student): UserInvite {
  return {
    kind: "student",
    loginId: s.student_code,
    password: passwordFromNationalId(s.national_id!),
    mustChangePassword: true,
    prefix: s.prefix,
    first_name: s.first_name,
    last_name: s.last_name,
    email: null,
    national_id: s.national_id,
    // No source for a student's date of birth anywhere in the roster (grill
    // decision, 2026-08-11) — these accounts just can't use self-service
    // "ลืมรหัสผ่าน" (needs national_id + date_of_birth both) until a
    // super_admin fills it in later; reset stays a manual admin job for them.
    date_of_birth: null,
    department_id: s.department_id,
    roles: [],
    positionTitleIds: [],
    studentRowId: s.id,
    teacher_code: null,
    learning_area_id: null,
  };
}

/**
 * Creates logins for every eligible student currently in view (grill
 * decision: scoped to the roster's active filters, not the whole school).
 * Sent in chunks — invite-user creates auth users one at a time server-side,
 * so a filtered set of several hundred students in one request risks the
 * edge function's own timeout.
 */
function BulkCreateLoginsSheet({
  open,
  students,
  onClose,
}: {
  open: boolean;
  students: Student[];
  onClose: () => void;
}) {
  const invite = useInviteUsers();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null);
  const [failed, setFailed] = useState(false);

  const { ready, skipped } = useMemo(() => splitLoginEligibility(students), [students]);

  function reset() {
    setRunning(false);
    setDone(0);
    setOutcome(null);
    setFailed(false);
  }

  async function confirm() {
    setRunning(true);
    setFailed(false);
    const result: InviteOutcome = { inserted: 0, skipped: [] };
    try {
      for (let i = 0; i < ready.length; i += BULK_LOGIN_CHUNK_SIZE) {
        const batch = ready.slice(i, i + BULK_LOGIN_CHUNK_SIZE).map(studentToInvite);
        const batchOutcome = await invite.mutateAsync(batch);
        result.inserted += batchOutcome.inserted;
        result.skipped.push(...batchOutcome.skipped);
        setDone(Math.min(i + BULK_LOGIN_CHUNK_SIZE, ready.length));
      }
      setOutcome(result);
    } catch {
      setFailed(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
      title="สร้างบัญชีทุกคน"
      description="ตามรายชื่อที่กรองอยู่ในหน้านี้"
      footer={
        outcome ? (
          <Button className="w-full" onClick={onClose}>
            เสร็จสิ้น
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={running}>
              ยกเลิก
            </Button>
            <Button className="flex-1" onClick={confirm} disabled={ready.length === 0 || running}>
              {running ? <Spinner /> : `สร้างบัญชี ${ready.length} คน`}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {!outcome && (
          <>
            {skipped.length > 0 && (
              <Card className="space-y-1 border-warning/40">
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  ข้าม {skipped.length} คน (ไม่มีเลขบัตรประชาชน 13 หลัก)
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {skipped.slice(0, 5).map((s) => (
                    <li key={s.id}>
                      {s.student_code} — {s.first_name} {s.last_name}
                    </li>
                  ))}
                  {skipped.length > 5 && <li>และอีก {skipped.length - 5} คน</li>}
                </ul>
              </Card>
            )}

            {ready.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                จะสร้างบัญชีให้ {ready.length} คน — รหัสผ่านเริ่มต้นคือเลขบัตรประชาชนของแต่ละคน
                นักเรียนตั้งรหัสผ่านใหม่ของตัวเองตอน login ครั้งแรก
              </p>
            ) : (
              <Card className="text-sm text-destructive">ไม่มีนักเรียนที่จะสร้างบัญชีได้ในรายการนี้</Card>
            )}

            {running && (
              <p className="text-sm text-muted-foreground">
                กำลังสร้างบัญชี... {done}/{ready.length}
              </p>
            )}

            {failed && <p className="text-sm text-destructive">สร้างบัญชีไม่สำเร็จ ลองใหม่อีกครั้ง</p>}
          </>
        )}

        {outcome && (
          <Card className="space-y-1">
            <p className="text-lg font-semibold text-success">สร้างบัญชีสำเร็จ {outcome.inserted} คน</p>
            {outcome.skipped.length > 0 && (
              <div className="space-y-0.5 text-sm text-muted-foreground">
                <p>ข้าม {outcome.skipped.length} คน:</p>
                <ul className="space-y-0.5 text-xs">
                  {outcome.skipped.map((s, i) => (
                    <li key={i}>
                      {s.loginId}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
      </div>
    </Sheet>
  );
}
