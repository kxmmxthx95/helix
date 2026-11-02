import { AlertTriangle, CallIcon, CheckmarkCircleIcon, HomeIcon, KeyIcon, ProfileIcon, ShieldIcon, Users as UsersIcon, Plus, Search, SlidersHorizontal, Upload, X } from "@/components/icons";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { MapPicker } from "@/components/MapPicker";
import { ImportSheet } from "@/components/ImportSheet";
import { Modal } from "@/components/Modal";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Avatar, AvatarCard, BuddhistDateSelect, Card, EmptyState, Field, FormSection, Input, Select, SheetFormContext, Skeleton, Spinner, Switch } from "@/components/ui";
import { avatarUrl, studentAvatarUrl } from "@/hooks/useAvatar";
import { useAllGradeLevels, useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useClassrooms } from "@/hooks/useStatusManagement";
import { useDepartments, useInviteUsers, type InviteOutcome, type UserInvite } from "@/hooks/useProfiles";
import { useBindCard, useLiveCards } from "@/hooks/useCardTopup";
import { parseSwipe } from "@/lib/cardSwipe";
import { addressOptions, useZipRows } from "@/lib/thaiAddress";
import { passwordFromNationalId } from "@/lib/password";
import { cn } from "@/lib/utils";
import {
  useDeleteStudentContact,
  useGuardianFinancials,
  useSaveGuardianFinancial,
  useSaveStudentContact,
  useSetPrimaryContact,
  useStudentContacts,
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
import { gradeShortLabel, levelTone } from "@/lib/gradeLevels";
import { StatCard } from "@/routes/Classrooms";

const EMPTY: StudentFilters = { search: "", departmentId: "", status: "studying", gradeLevelId: "", classroomId: "" };

const STATUS_LABEL: Record<StudentStatus, string> = {
  studying: "กำลังศึกษา",
  transferred: "ย้ายออก",
  graduated: "จบการศึกษา",
  dropped: "พ้นสภาพ",
};

const STATUS_DOT: Record<StudentStatus, string> = {
  studying: "bg-success",
  transferred: "bg-warning",
  graduated: "bg-accent",
  dropped: "bg-destructive",
};

/** Whole years and leftover months between an ISO birth date and `today`; null for an unset or future date. */
export function ageFromBirthDate(iso: string | null, today = new Date()): { years: number; months: number } | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  if (today.getDate() < d) months -= 1;
  return months < 0 ? null : { years: Math.floor(months / 12), months: months % 12 };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneOk = (v: string) => /^\d{9,10}$/.test(v.replace(/[\s-]/g, ""));

/** Field-level problems of a student draft, keyed by column; empty when it can be saved. */
export function studentErrors(d: StudentDraft): Partial<Record<keyof StudentDraft, string>> {
  const e: Partial<Record<keyof StudentDraft, string>> = {};
  if (!d.student_code.trim()) e.student_code = "กรอกรหัสนักเรียน";
  if (d.national_id && !/^\d{13}$/.test(d.national_id)) e.national_id = "ต้องเป็นตัวเลข 13 หลัก";
  if (d.date_of_birth && !ageFromBirthDate(d.date_of_birth)) e.date_of_birth = "วันเกิดไม่ถูกต้อง";
  if (!d.prefix) e.prefix = "เลือกคำนำหน้า";
  if (!d.first_name.trim()) e.first_name = "กรอกชื่อ";
  if (!d.last_name.trim()) e.last_name = "กรอกนามสกุล";
  if (!d.department_id) e.department_id = "เลือกแผนก";
  if (!d.grade_level_id) e.grade_level_id = "เลือกชั้น";
  if (d.phone && !phoneOk(d.phone)) e.phone = "เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก";
  if (d.email && !EMAIL_RE.test(d.email)) e.email = "อีเมลไม่ถูกต้อง";
  return e;
}

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
  const rows = useZipRows(value.postal_code);
  const provinces = rows ? addressOptions(rows, 0, []) : [];
  const districts = rows ? addressOptions(rows, 1, [value.province]) : [];
  const subdistricts = rows ? addressOptions(rows, 2, [value.province, value.district]) : [];

  // Only one choice left at a level → take it, so a postcode alone fills as much as it can.
  useEffect(() => {
    if (!rows) return;
    const patch: Partial<AddressFields> = {};
    if (!value.province && provinces.length === 1) patch.province = provinces[0];
    if (!value.district && districts.length === 1 && (value.province || patch.province)) patch.district = districts[0];
    if (!value.subdistrict && subdistricts.length === 1 && (value.district || patch.district)) patch.subdistrict = subdistricts[0];
    if (Object.keys(patch).length) onChange(patch);
  });

  const placeholder = rows === null ? "กำลังโหลด…" : "เลือก";
  // A value saved before this picker existed (free text) stays selectable instead of silently vanishing.
  const withCurrent = (options: string[], current: string | null) =>
    current && !options.includes(current) ? [current, ...options] : options;
  const picker = (label: string, key: "province" | "district" | "subdistrict", options: string[], clears: (keyof AddressFields)[]) => (
    <Field label={label}>
      <Select
        value={value[key] ?? ""}
        onChange={(e) =>
          onChange({ [key]: e.target.value || null, ...Object.fromEntries(clears.map((k) => [k, null])) })
        }
        placeholder={placeholder}
        required={isRequired(key)}
        disabled={rows === null || (options.length === 0 && !value[key])}
      >
        {withCurrent(options, value[key]).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <div className="space-y-3">
      {(["house_no", "village_no", "alley", "road"] as const).map((k) => (
        <div key={k} className="grid grid-cols-1 gap-3">
          <Field label={{ house_no: "บ้านเลขที่", village_no: "หมู่ที่", alley: "ตรอก/ซอย", road: "ถนน" }[k]}>
            <Input
              value={value[k] ?? ""}
              onChange={(e) => onChange({ [k]: e.target.value || null })}
              required={isRequired(k)}
            />
          </Field>
        </div>
      ))}
      <div className="grid grid-cols-1 gap-3">
        <Field label="รหัสไปรษณีย์">
          <Input
            inputMode="numeric"
            maxLength={5}
            value={value.postal_code ?? ""}
            onChange={(e) =>
              onChange({
                postal_code: e.target.value.replace(/\D/g, "").slice(0, 5) || null,
                province: null,
                district: null,
                subdistrict: null,
              })
            }
            required={isRequired("postal_code")}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3">{picker("จังหวัด", "province", provinces, ["district", "subdistrict"])}</div>
      <div className="grid grid-cols-1 gap-3">{picker("อำเภอ/เขต", "district", districts, ["subdistrict"])}</div>
      <div className="grid grid-cols-1 gap-3">{picker("ตำบล/แขวง", "subdistrict", subdistricts, [])}</div>
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
  // Teachers already have read RLS on students/student_contacts within their
  // department (see migration 0015) — the sheet just never let them click
  // through to see it. mayView opens the row read-only for them.
  const mayView = mayEdit || (me?.roles.includes("teacher") ?? false);
  const mayManageUsers = me ? canManageUsers(me.roles) : false;
  const deleteStudent = useDeleteStudent();

  const activeFilterCount = [filters.departmentId, filters.status, filters.gradeLevelId, filters.classroomId].filter(
    Boolean,
  ).length;
  // Nothing searched or filtered yet (only the default status) → show the prompt, not the full roster.
  const hasSearch =
    filters.search.trim() !== "" ||
    filters.departmentId !== EMPTY.departmentId ||
    filters.gradeLevelId !== EMPTY.gradeLevelId ||
    filters.classroomId !== EMPTY.classroomId ||
    filters.status !== EMPTY.status;

  const filterGradeLevels = filters.departmentId
    ? allGradeLevels.filter((g) => g.department_id === filters.departmentId)
    : allGradeLevels;
  const { data: filterClassrooms = [] } = useClassrooms(filters.gradeLevelId || null);

  return (
    <div className="page-fill page-flush min-h-0 pb-5 lg:h-[calc(100dvh-7.5rem)]">
      <div className="toolbar shrink-0">
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
            <Button className="shrink-0" onClick={() => setEditing("new")} aria-label="เพิ่มนักเรียน">
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">เพิ่มนักเรียน</span>
            </Button>
          </>
        )}
      </div>

      {!hasSearch && (
        <EmptyState title="ค้นหานักเรียน" description="พิมพ์ชื่อหรือรหัสนักเรียน หรือเลือกตัวกรองเพื่อแสดงรายชื่อ" />
      )}

      {hasSearch && isLoading && (
        <div className="space-y-2" role="status" aria-label="กำลังโหลด">
          <ul className="space-y-2 lg:hidden">
            {[0, 1, 2].map((i) => (
              <li key={i} className="rounded-xl bg-card p-3.5 shadow-card">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="table-panel hidden rounded-none border-t border-border shadow-none lg:flex"><div className="table-panel-scroll scrollbar-hidden">
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
                {[0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className="h-14 border-t border-border first:border-t-0">
                    <td className="px-3 py-0"><Skeleton className="h-3 w-12" /></td>
                    <td className="px-3 py-0"><Skeleton className="h-3 w-10" /></td>
                    <td className="px-3 py-0"><Skeleton className="h-3 w-32" /></td>
                    <td className="px-3 py-0"><Skeleton className="h-3 w-16" /></td>
                    <td className="px-3 py-0"><Skeleton className="h-3 w-10" /></td>
                    <td className="px-3 py-0"><Skeleton className="h-4 w-14 rounded-full" /></td>
                    {mayManageUsers && (
                      <td className="px-3 py-0"><Skeleton className="h-4 w-20 rounded-full" /></td>
                    )}
                    {mayEdit && <td className="px-3 py-0" />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </div>
      )}

      {error && <Card className="shrink-0 text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</Card>}

      {hasSearch && rows && rows.length === 0 && (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่พบนักเรียนตามเงื่อนไขที่เลือก" />
      )}

      {hasSearch && rows && rows.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <ul className="space-y-2 lg:hidden">
            {rows.map((row) => {
              const gender = studentGender(row.prefix);
              const fullName = `${row.first_name} ${row.last_name}`;
              return (
              <li key={row.id}>
                <div
                  role={mayView ? "button" : undefined}
                  tabIndex={mayView ? 0 : undefined}
                  onClick={() => mayView && setEditing(row)}
                  onKeyDown={(e) => {
                    if (!mayView) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditing(row);
                    }
                  }}
                  className={
                    mayView
                      ? "rounded-xl bg-card p-3.5 shadow-card transition-colors active:bg-muted"
                      : "rounded-xl bg-card p-3.5 shadow-card"
                  }
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      name={fullName}
                      src={studentAvatarUrl(row) ?? (row.profile ? avatarUrl(row.profile) : null)}
                      className="h-11 w-11 text-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{fullName}</p>
                        <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                          <span
                            className={
                              row.status === "studying"
                                ? "size-1.5 rounded-full bg-success"
                                : "size-1.5 rounded-full bg-muted-foreground"
                            }
                          />
                          {STATUS_LABEL[row.status]}
                        </span>
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs text-muted-foreground">{row.student_code}</span>
                        {row.grade_level_id && gradeLevelName.get(row.grade_level_id) && (
                          <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${levelTone(gradeLevelName.get(row.grade_level_id))}`}>
                            {gradeLevelName.get(row.grade_level_id)}
                          </span>
                        )}
                        {gender && (
                          <span
                            className={
                              gender === "ชาย"
                                ? "inline-flex shrink-0 items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                : "inline-flex shrink-0 items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                            }
                          >
                            {gender}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {deptName.get(row.department_id) ?? "—"}
                        {" · "}
                        {row.grade_level_id ? (gradeLevelName.get(row.grade_level_id) ?? "—") : "—"}
                      </p>
                    </div>
                  </div>
                  {(mayManageUsers || mayEdit) && (
                    <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
                      {mayManageUsers &&
                        (row.profile_id ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-1 text-[11px] font-medium text-success">
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
                          className="ml-auto text-muted-foreground hover:text-destructive"
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

          <div className="table-panel hidden rounded-none border-t border-border shadow-none lg:flex">
            <div className="table-panel-scroll scrollbar-hidden">
              <table className="w-full text-[13px]">
                <thead className="text-left text-xs">
                  <tr>
                    <th className="px-4 py-3">นักเรียน</th>
                    <th className="px-4 py-3">แผนก</th>
                    <th className="px-4 py-3">ชั้น</th>
                    <th className="px-4 py-3">สถานะ</th>
                    {mayManageUsers && <th className="px-4 py-3">บัญชี</th>}
                    {mayEdit && <th className="w-14 px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const fullName = `${row.first_name} ${row.last_name}`;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => mayView && setEditing(row)}
                        className={
                          mayView
                            ? "h-14 cursor-pointer border-t border-border first:border-t-0"
                            : "h-14 border-t border-border first:border-t-0"
                        }
                      >
                        <td className="px-4 py-0">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar
                              name={fullName}
                              src={studentAvatarUrl(row) ?? (row.profile ? avatarUrl(row.profile) : null)}
                              className="h-9 w-9 text-xs"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {row.prefix && `${row.prefix} `}
                                {fullName}
                              </p>
                              <p className="font-mono text-xs tabular-nums text-muted-foreground">{row.student_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-0 text-muted-foreground">{deptName.get(row.department_id) ?? "—"}</td>
                        <td className="px-4 py-0">
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${levelTone(row.grade_level_id ? gradeLevelName.get(row.grade_level_id) : undefined)}`}>
                            {row.grade_level_id ? (gradeLevelName.get(row.grade_level_id) ?? "—") : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-0">
                          <span
                            className={
                              row.status === "studying"
                                ? "inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
                                : "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground"
                            }
                          >
                            <span
                              className={
                                row.status === "studying"
                                  ? "size-1.5 rounded-full bg-success"
                                  : "size-1.5 rounded-full bg-muted-foreground"
                              }
                            />
                            {STATUS_LABEL[row.status]}
                          </span>
                        </td>
                        {mayManageUsers && (
                          <td className="px-4 py-0">
                            {row.profile_id ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                                <CheckmarkCircleIcon className="size-3.5" />
                                มีบัญชีแล้ว
                              </span>
                            ) : (
                              <Button
                                variant="tinted"
                                size="sm"
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
                          <td className="px-4 py-0 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive"
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {hasSearch && rows && (
        <div className="sticky bottom-0 z-10 mt-auto grid shrink-0 grid-cols-2 gap-2 bg-background pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:grid-cols-4">
          <StatCard tone="accent" icon={<UsersIcon className="h-5 w-5" />} label="ทั้งหมด" value={rows.length} unit="คน" />
          <StatCard tone="success" icon={<CheckmarkCircleIcon className="h-5 w-5" />} label="กำลังศึกษา" value={rows.filter((r) => r.status === "studying").length} unit="คน" />
          <StatCard tone="muted" icon={<ProfileIcon className="h-5 w-5" />} label="มีบัญชีแล้ว" value={rows.filter((r) => r.profile_id).length} unit="คน" />
          <StatCard tone="warning" icon={<KeyIcon className="h-5 w-5" />} label="ยังไม่มีบัญชี" value={rows.filter((r) => !r.profile_id).length} unit="คน" />
        </div>
      )}

      <Modal
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
        <FormSection>
          {me && isOrgWide(me.roles) && (
            <Field label="แผนก">
              <Select
                value={filters.departmentId}
                onChange={(e) =>
                  setFilters({ ...filters, departmentId: e.target.value, gradeLevelId: "", classroomId: "" })
                }
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

          <Field label="ระดับชั้น">
            <Select
              value={filters.gradeLevelId}
              onChange={(e) => setFilters({ ...filters, gradeLevelId: e.target.value, classroomId: "" })}
            >
              <option value="">ทุกระดับชั้น</option>
              {filterGradeLevels.map((g) => (
                <option key={g.id} value={g.id}>
                  {gradeShortLabel(g.code)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ห้อง">
            <Select
              value={filters.classroomId}
              onChange={(e) => setFilters({ ...filters, classroomId: e.target.value })}
              disabled={!filters.gradeLevelId}
            >
              <option value="">ทุกห้อง</option>
              {filterClassrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>
      </Modal>

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

type StudentTab = "general" | "contact" | "health" | "guardian";
const STUDENT_TABS: { key: StudentTab; label: string; icon: typeof ProfileIcon }[] = [
  { key: "general", label: "ข้อมูลทั่วไป", icon: ProfileIcon },
  { key: "contact", label: "ที่อยู่", icon: HomeIcon },
  { key: "health", label: "สุขภาพ", icon: ShieldIcon },
  { key: "guardian", label: "ผู้ปกครอง", icon: UsersIcon },
];

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
    date_of_birth: null,
    latitude: null,
    longitude: null,
  };
}

export function EditStudentSheet({
  target,
  onClose,
  forceReadOnly = false,
}: {
  target: Student | "new" | null;
  onClose: () => void;
  /** Callers outside the roster's own manage flow (e.g. the read-only Classrooms page) force view-only regardless of the viewer's role. */
  forceReadOnly?: boolean;
}) {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data: departments = [] } = useDepartments();
  const save = useSaveStudent();
  const [draft, setDraft] = useState<StudentDraft | null>(null);
  const [tab, setTab] = useState<StudentTab>("general");
  const [attempted, setAttempted] = useState(false); // show field errors only after the first save attempt
  // Picked photo, applied on save (the student id of a new row doesn't exist yet); "remove" clears the stored one.
  const [avatar, setAvatar] = useState<File | "remove" | null>(null);
  const [guardians, setGuardians] = useState<GuardianDrafts | null>(null);
  const [guardianSource, setGuardianSource] = useState<GuardianSource | null>(null);
  const saveGuardians = useSaveGuardians();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  // บัตรเติมเงิน: swipe into the field to bind on save (org-wide only; null = untouched).
  const [cardUid, setCardUid] = useState<string | null>(null);
  const bindCard = useBindCard();
  const { data: liveCards = [] } = useLiveCards();
  useEffect(() => {
    if (!(avatar instanceof File)) return setAvatarPreview(null);
    const url = URL.createObjectURL(avatar);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);

  const isNew = target === "new";
  // Teachers can open a row to view it (mayView in the parent) but can't
  // write — RLS blocks it server-side regardless, this just keeps the form
  // from looking editable. isNew is always opened by someone with mayEdit
  // (the "add student" button is itself gated), so only an existing target
  // can be read-only.
  const readOnly = forceReadOnly || (!isNew && !(me && canManage(me.roles)));
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
  const loadedGuardians = useLoadedGuardians(target === null || target === "new" ? null : target.id);
  const currentGuardians = guardians ?? loadedGuardians.drafts;
  const currentSource = guardianSource ?? loadedGuardians.source;
  const errors = current ? studentErrors(current) : {};
  const err = (k: keyof StudentDraft) => (attempted ? errors[k] : undefined);

  function close() {
    setDraft(null);
    setAttempted(false);
    setGuardians(null);
    setGuardianSource(null);
    setTab("general");
    setAvatar(null);
    setCardUid(null);
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    const invalid = Object.keys(errors);
    if (invalid.length) {
      setAttempted(true);
      setTab("general");
      toast(`กรอกข้อมูลให้ถูกต้อง (${invalid.length} ช่อง)`, "error");
      return;
    }
    const problem = guardianProblem(currentGuardians, currentSource);
    if (problem) {
      setTab("guardian");
      toast(problem, "error");
      return;
    }
    // Guardians are only rewritten once edited, so a slow-loading list can never be mistaken for "cleared".
    const guardiansEdited = guardians !== null || guardianSource !== null;
    const guardianDrafts = currentGuardians;
    const guardianRows = loadedGuardians.rows;
    const source = currentSource;
    const newCard = cardUid === null ? "" : parseSwipe(cardUid);
    save
      .mutateAsync({ ...current, ...(isNew ? {} : { id: (target as Student).id }), avatar: avatar ?? undefined })
      .then(async (id) => {
        if (guardiansEdited) await saveGuardians(id, guardianDrafts, guardianRows, source);
        if (newCard) await bindCard.mutateAsync({ student_id: id, card_uid: newCard });
        toast("บันทึกข้อมูลนักเรียนสำเร็จ");
      })
      .catch((err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"));
    close();
  }

  const title = isNew ? "เพิ่มนักเรียน" : readOnly ? "ข้อมูลนักเรียน" : "แก้ไขข้อมูลนักเรียน";
  const footer = current ? (
    <div className="flex gap-2">
      <Button type="button" variant="outline" className="flex-1" onClick={close}>
        {readOnly ? "ปิด" : "ยกเลิก"}
      </Button>
      {!readOnly && (
        <Button type="submit" form="edit-student" className="flex-1">
          บันทึก
        </Button>
      )}
    </div>
  ) : undefined;
  const body = (
    <>
      {current && (
        <div className="space-y-4">
          <div role="tablist" aria-label="หัวข้อข้อมูลนักเรียน" className="flex overflow-x-auto border-b border-border [container-type:inline-size] [scrollbar-width:none]">
            {STUDENT_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                title={t.label}
                onClick={() => setTab(t.key)}
                className={cn(
                  "tappable -mb-px flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold transition-colors",
                  tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="h-4 w-4 shrink-0" />
                {/* Icon-only when the tab row itself is narrow (phone, or the side drawer); text stays for screen readers. */}
                <span className="[@container(max-width:26rem)]:sr-only">{t.label}</span>
              </button>
            ))}
          </div>
          {/* Panels stay mounted (hidden) so the draft and the single form survive tab switches; a failed save jumps back to the first tab, where the invalid fields are. */}
          <form id="edit-student" onSubmit={submit} noValidate className="space-y-4">
          <fieldset disabled={readOnly} className="space-y-4">
            <div hidden={tab !== "general"} className="space-y-4">
            {!readOnly && (
              <AvatarCard
                name={`${current.first_name} ${current.last_name}`.trim()}
                src={avatar === "remove" ? null : (avatarPreview ?? (isNew ? null : studentAvatarUrl(target as Student)))}
                onPick={setAvatar}
                onRemove={() => setAvatar("remove")}
              />
            )}
            <FormSection icon={<ProfileIcon className="h-4 w-4" />}>
                <Field label="รหัสนักเรียน" required error={err("student_code")}>
                  <Input
                    value={current.student_code}
                    onChange={(e) => setDraft({ ...current, student_code: e.target.value })}
                  />
                </Field>

                <Field label="เลขบัตรประจำตัวประชาชน" error={err("national_id")}>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    value={current.national_id ?? ""}
                    onChange={(e) =>
                      setDraft({ ...current, national_id: e.target.value.replace(/\D/g, "").slice(0, 13) || null })
                    }
                    maxLength={13}
                  />
                </Field>

                {me && isOrgWide(me.roles) && !readOnly && (
                  <Field label="เลขบัตรเติมเงิน (รูดบัตรที่ช่องนี้)">
                    <Input
                      autoComplete="off"
                      placeholder="รูดบัตรเพื่อผูก/เปลี่ยนบัตร"
                      value={cardUid ?? (isNew ? "" : (liveCards.find((c) => c.student_id === (target as Student).id)?.card_uid ?? ""))}
                      onChange={(e) => setCardUid(e.target.value)}
                    />
                  </Field>
                )}

                <Field label="วันเดือนปีเกิด" error={err("date_of_birth")}>
                  <BuddhistDateSelect
                    key={isNew ? "new" : (target as Student).id}
                    value={current.date_of_birth ?? ""}
                    onChange={(v) => setDraft({ ...current, date_of_birth: v || null })}
                  />
                </Field>

                <div className="flex items-center justify-between gap-4 text-sm leading-5">
                  <span>อายุ</span>
                  <span className="text-muted-foreground">
                    {(() => {
                      const age = ageFromBirthDate(current.date_of_birth);
                      return age ? `${age.years} ปี ${age.months} เดือน` : "—";
                    })()}
                  </span>
                </div>

                <Field label="คำนำหน้า" required error={err("prefix")}>
                  <Select
                    value={current.prefix ?? ""}
                    onChange={(e) => setDraft({ ...current, prefix: e.target.value || null })}
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
                  <Field label="ชื่อ" required error={err("first_name")}>
                    <Input
                      value={current.first_name}
                      onChange={(e) => setDraft({ ...current, first_name: e.target.value })}
                    />
                  </Field>
                  <Field label="นามสกุล" required error={err("last_name")}>
                    <Input
                      value={current.last_name}
                      onChange={(e) => setDraft({ ...current, last_name: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="แผนก" required error={err("department_id")}>
                  <Select
                    value={current.department_id}
                    onChange={(e) =>
                      setDraft({ ...current, department_id: e.target.value, grade_level_id: null })
                    }
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
                  <Field label="ชั้น" required error={err("grade_level_id")}>
                    <Select
                      value={current.grade_level_id ?? ""}
                      onChange={(e) => setDraft({ ...current, grade_level_id: e.target.value || null })}
                      placeholder="เลือกชั้น"
                    >
                      {gradeLevels.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="สถานะ"
                    valueStart={<span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[current.status])} />}
                  >
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

            </FormSection>

            <FormSection icon={<CallIcon className="h-4 w-4" />}>
                <Field label="เบอร์โทรศัพท์" error={err("phone")}>
                  <Input
                    type="tel"
                    value={current.phone ?? ""}
                    onChange={(e) => setDraft({ ...current, phone: e.target.value || null })}
                  />
                </Field>

                <Field label="อีเมล" error={err("email")}>
                  <Input
                    type="email"
                    value={current.email ?? ""}
                    onChange={(e) => setDraft({ ...current, email: e.target.value || null })}
                  />
                </Field>

            </FormSection>
            </div>

            <div hidden={tab !== "contact"} className="space-y-4">
            <FormSection icon={<HomeIcon className="h-4 w-4" />}>
              <AddressInputs value={current} onChange={(patch) => setDraft({ ...current, ...patch })} />
            </FormSection>

            <FormSection>
              <MapPicker
                value={current.latitude !== null && current.longitude !== null ? { lat: current.latitude, lng: current.longitude } : null}
                onChange={(p) => setDraft({ ...current, latitude: p?.lat ?? null, longitude: p?.lng ?? null })}
                disabled={readOnly}
              />
            </FormSection>
            </div>

            <div hidden={tab !== "health"}>
            <FormSection icon={<ShieldIcon className="h-4 w-4" />}>
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
            </FormSection>
            </div>
          </fieldset>
          </form>

          <div hidden={tab !== "guardian"}>
          <FormSection icon={<UsersIcon className="h-4 w-4" />}>
            <fieldset disabled={readOnly} className="space-y-4">
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

            </fieldset>
          </FormSection>
          <fieldset disabled={readOnly || !loadedGuardians.ready} className="mt-4 space-y-4">
            <GuardianCards
              value={currentGuardians}
              onChange={(slot, patch) => setGuardians({ ...currentGuardians, [slot]: { ...currentGuardians[slot], ...patch } })}
              source={currentSource}
              onSourceChange={setGuardianSource}
            />
          </fieldset>
          </div>
        </div>
      )}
    </>
  );

  return (
    <Modal open={target !== null} onOpenChange={(open) => !open && close()} title={title} footer={footer} className="max-w-lg">
      <SheetFormContext.Provider value>{body}</SheetFormContext.Provider>
    </Modal>
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
    date_of_birth: s.date_of_birth,
    latitude: s.latitude,
    longitude: s.longitude,
  };
}

// ------------------------------------------------------------- guardians

type GuardianSlot = "father" | "mother" | "other";
const GUARDIAN_SLOTS: { slot: GuardianSlot; title: string }[] = [
  { slot: "father", title: "ข้อมูลบิดา" },
  { slot: "mother", title: "ข้อมูลมารดา" },
  { slot: "other", title: "ข้อมูลผู้ปกครอง" },
];

/** One parent / guardian as typed into the form; saved to student_contacts (+ student_guardian_financials). */
type GuardianDraft = {
  relationship_note: string; // only used by the "other" slot
  prefix: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  occupation: string;
  workplace: string;
  monthly_income: string;
};
type GuardianDrafts = Record<GuardianSlot, GuardianDraft>;

const BLANK_GUARDIAN: GuardianDraft = {
  relationship_note: "",
  prefix: "",
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  occupation: "",
  workplace: "",
  monthly_income: "",
};
const BLANK_GUARDIANS: GuardianDrafts = { father: BLANK_GUARDIAN, mother: BLANK_GUARDIAN, other: BLANK_GUARDIAN };
const NO_ADDRESS: AddressFields = {
  house_no: null,
  village_no: null,
  alley: null,
  road: null,
  subdistrict: null,
  district: null,
  province: null,
  postal_code: null,
};

/** Who counts as the student's guardian: its own slot, or the father / mother (same data, flagged primary). */
type GuardianSource = GuardianSlot;

const guardianFilled = (g: GuardianDraft) => Object.values(g).some((v) => v.trim());

/** Why a half-filled guardian can't be saved, or null. A person needs both names; "other" also needs the relationship. */
function guardianProblem(drafts: GuardianDrafts, source: GuardianSource): string | null {
  for (const { slot, title } of GUARDIAN_SLOTS) {
    const g = drafts[slot];
    if (slot === source && source !== "other" && !guardianFilled(g)) return `${title}: กรอกข้อมูลก่อน เพราะใช้เป็นข้อมูลผู้ปกครอง`;
    if (slot === "other" && source !== "other") continue; // ignored while the guardian is a parent
    if (!guardianFilled(g)) continue;
    if (!g.first_name.trim() || !g.last_name.trim()) return `${title}: กรอกชื่อและนามสกุลให้ครบ`;
    if (g.phone.trim() && !phoneOk(g.phone)) return `${title}: เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก`;
    if (slot === "other" && !g.relationship_note.trim()) return `${title}: ระบุความสัมพันธ์`;
  }
  return null;
}

/** A student's saved father / mother / first other-guardian as drafts, plus the rows they came from. `ready` is false until they have loaded. */
function useLoadedGuardians(studentId: string | null) {
  const { data: contacts, isLoading } = useStudentContacts(studentId);
  const contactIds = useMemo(() => (contacts ?? []).map((c) => c.id), [contacts]);
  const { data: financials = [] } = useGuardianFinancials(contactIds);
  const ready = !studentId || !isLoading;
  return useMemo(() => {
    const drafts: GuardianDrafts = { ...BLANK_GUARDIANS };
    const rows: Partial<Record<GuardianSlot, StudentContact>> = {};
    for (const c of contacts ?? []) {
      if (rows[c.relationship]) continue;
      rows[c.relationship] = c;
      const f = financials.find((x) => x.contact_id === c.id);
      drafts[c.relationship] = {
        relationship_note: c.relationship_note ?? "",
        prefix: c.prefix ?? "",
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone ?? "",
        email: c.email ?? "",
        occupation: f?.occupation ?? "",
        workplace: f?.workplace ?? "",
        monthly_income: f?.monthly_income?.toString() ?? "",
      };
    }
    const source: GuardianSource = rows.father?.is_primary ? "father" : rows.mother?.is_primary ? "mother" : "other";
    return { drafts, rows, source, ready };
  }, [contacts, financials, ready]);
}

/** Writes the three guardian slots after the student row exists: fill → upsert, cleared → delete. Addresses on existing rows are left as they were. */
function useSaveGuardians() {
  const saveContact = useSaveStudentContact();
  const saveFinancial = useSaveGuardianFinancial();
  const deleteContact = useDeleteStudentContact();
  const setPrimary = useSetPrimaryContact();
  return async (
    studentId: string,
    drafts: GuardianDrafts,
    rows: Partial<Record<GuardianSlot, StudentContact>>,
    source: GuardianSource,
  ) => {
    const savedIds: Partial<Record<GuardianSlot, string>> = {};
    for (const { slot } of GUARDIAN_SLOTS) {
      const g = slot === "other" && source !== "other" ? BLANK_GUARDIAN : drafts[slot];
      const prev = rows[slot];
      if (!guardianFilled(g)) {
        if (prev) await deleteContact.mutateAsync(prev.id);
        continue;
      }
      const contact = await saveContact.mutateAsync({
        ...(prev ? { id: prev.id, ...pickAddress(prev) } : NO_ADDRESS),
        student_id: studentId,
        relationship: slot,
        relationship_note: slot === "other" ? g.relationship_note.trim() || null : null,
        prefix: g.prefix || null,
        first_name: g.first_name.trim(),
        last_name: g.last_name.trim(),
        phone: g.phone.trim() || null,
        email: g.email.trim() || null,
      });
      savedIds[slot] = contact.id;
      if (g.occupation.trim() || g.workplace.trim() || g.monthly_income.trim()) {
        await saveFinancial.mutateAsync({
          contact_id: contact.id,
          occupation: g.occupation.trim() || null,
          workplace: g.workplace.trim() || null,
          monthly_income: g.monthly_income.trim() ? Number(g.monthly_income) : null,
        });
      }
    }
    const primaryId = savedIds[source];
    if (primaryId) await setPrimary.mutateAsync(primaryId);
  };
}

function GuardianCards({
  value,
  onChange,
  source,
  onSourceChange,
}: {
  value: GuardianDrafts;
  onChange: (slot: GuardianSlot, patch: Partial<GuardianDraft>) => void;
  source: GuardianSource;
  onSourceChange: (source: GuardianSource) => void;
}) {
  return (
    <>
      {GUARDIAN_SLOTS.map(({ slot, title }) => {
        const g = value[slot];
        const set = (patch: Partial<GuardianDraft>) => onChange(slot, patch);
        // The guardian reuses the father's / mother's data, so its own fields would only duplicate them.
        const sameAsParent = slot === "other" && source !== "other";
        return (
          <section key={slot} className="min-w-0 space-y-3">
            <h3 className="font-heading px-0.5 text-[15px] font-semibold leading-tight">{title}</h3>
            {slot === "other" && (
              <FormSection>
                {(["father", "mother"] as const).map((parent) => (
                  <div key={parent} className="flex items-center justify-between gap-4 text-sm leading-5">
                    <span>{parent === "father" ? "ผู้ปกครองคือบิดา" : "ผู้ปกครองคือมารดา"}</span>
                    <Switch
                      size="sm"
                      checked={source === parent}
                      onChange={(on) => onSourceChange(on ? parent : "other")}
                      label={parent === "father" ? "ใช้ข้อมูลเดียวกับบิดา" : "ใช้ข้อมูลเดียวกับมารดา"}
                    />
                  </div>
                ))}
              </FormSection>
            )}
            {!sameAsParent && (
            <FormSection>
              {slot === "other" && (
                <Field label="ความสัมพันธ์">
                  <Input value={g.relationship_note} onChange={(e) => set({ relationship_note: e.target.value })} placeholder="เช่น ปู่, ย่า, ญาติ" />
                </Field>
              )}
              <Field label="คำนำหน้า">
                <Select value={g.prefix} onChange={(e) => set({ prefix: e.target.value })} placeholder="เลือกคำนำหน้า">
                  {["นาย", "นาง", "นางสาว"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="ชื่อ">
                <Input value={g.first_name} onChange={(e) => set({ first_name: e.target.value })} />
              </Field>
              <Field label="นามสกุล">
                <Input value={g.last_name} onChange={(e) => set({ last_name: e.target.value })} />
              </Field>
              <Field label="เบอร์โทรศัพท์">
                <Input type="tel" value={g.phone} onChange={(e) => set({ phone: e.target.value })} />
              </Field>
              <Field label="อาชีพ">
                <Input value={g.occupation} onChange={(e) => set({ occupation: e.target.value })} />
              </Field>
              <Field label="สถานที่ทำงาน">
                <Input value={g.workplace} onChange={(e) => set({ workplace: e.target.value })} />
              </Field>
              <Field label="เงินเดือน">
                <Input type="number" min="0" value={g.monthly_income} onChange={(e) => set({ monthly_income: e.target.value })} />
              </Field>
            </FormSection>
            )}
          </section>
        );
      })}
    </>
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
