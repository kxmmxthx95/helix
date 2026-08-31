import { Plus, Search, SlidersHorizontal, Upload, X } from "@/components/icons";
import { useEffect, useRef, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ImportUsersSheet } from "@/components/ImportUsersSheet";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import {
  Avatar,
  Button,
  BuddhistDateSelect,
  Card,
  EmptyState,
  Field,
  Input,
  Pagination,
  PasswordInput,
  Select,
  Spinner,
  Switch,
} from "@/components/ui";
import { avatarUrl, useRemoveAvatar, useUploadAvatar } from "@/hooks/useAvatar";
import { useLearningAreas } from "@/hooks/useCurriculum";
import { usePagination } from "@/hooks/usePagination";
import {
  useDeleteUser,
  useDepartments,
  usePositionTitles,
  useProfiles,
  useUpdateProfile,
  useInviteUsers,
  type ProfileEdit,
  type ProfileFilters,
  type ProfileRow,
  type UserInvite,
} from "@/hooks/useProfiles";
import { useStudentByProfile, useStudents } from "@/hooks/useStudents";
import type { PositionTitle, Student } from "@/lib/database.types";
import { profileFullName } from "@/lib/database.types";
import { blobToBase64, compressImage } from "@/lib/image";
import { passwordFromDob } from "@/lib/password";
import { canManageUsers, isOrgWide, PREFIXES, ROLE_LABEL, ROLES, STUDENT_PREFIXES, roleLabels, type Role } from "@/lib/roles";
import { AddressInputs, pickAddress } from "@/routes/Roster";

const EMPTY: ProfileFilters = { search: "", departmentId: "", role: "", active: "" };

/** Roles pickable directly — dept_head comes from position_titles instead. */
const BASE_ROLES = ROLES.filter((r) => r !== "dept_head");

export function Users() {
  const { profile: me } = useAuth();
  const [filters, setFilters] = useState<ProfileFilters>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: departments = [] } = useDepartments();
  const { data: positionTitles = [] } = usePositionTitles();
  const { data: rows, isLoading, error } = useProfiles(filters);
  const { page, setPage, pageCount, pageRows } = usePagination(rows ?? [], [filters]);
  const deleteUser = useDeleteUser();
  const updateUser = useUpdateProfile();

  const mayManage = me ? canManageUsers(me.roles) : false;

  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );
  const titleName = useMemo(
    () => new Map(positionTitles.map((t) => [t.id, t.name])),
    [positionTitles],
  );

  const activeFilterCount = [filters.departmentId, filters.role, filters.active].filter(
    Boolean,
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="ค้นหาชื่อหรืออีเมล"
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
        {mayManage && (
          <>
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => setImporting(true)} aria-label="นำเข้า CSV">
              <Upload className="h-3 w-3" />
            </Button>
            <Button size="icon" className="shrink-0" onClick={() => setCreating(true)} aria-label="เพิ่มผู้ใช้งาน">
              <Plus className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</Card>
      )}

      {rows && rows.length === 0 && (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่พบผู้ใช้งานตามเงื่อนไขที่เลือก" />
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          <ul className="space-y-2 lg:hidden">
            {pageRows.map((row) => {
              const name = profileFullName(row);
              const rolesText = roleLabels(row.roles.filter((r) => r !== "dept_head"));
              const titlesText = row.positionTitleIds.length
                ? row.positionTitleIds.map((id) => titleName.get(id) ?? "—").join(", ")
                : "—";
              const deptText = row.department_id ? (deptName.get(row.department_id) ?? "—") : "ทุกแผนก";
              return (
                <li key={row.id}>
                  <div
                    role={mayManage ? "button" : undefined}
                    tabIndex={mayManage ? 0 : undefined}
                    onClick={() => mayManage && setEditing(row)}
                    onKeyDown={(e) => {
                      if (!mayManage) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setEditing(row);
                      }
                    }}
                    className={
                      mayManage
                        ? "rounded-lg border border-border p-3 active:bg-muted"
                        : "rounded-lg border border-border p-3"
                    }
                  >
                    <div className="flex items-start gap-3">
                      <Avatar name={name} src={avatarUrl(row)} className="h-10 w-10 text-xs" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{name}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.email}</p>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            {mayManage ? (
                              <Switch
                                size="sm"
                                checked={row.is_active}
                                disabled={updateUser.isPending}
                                label={row.is_active ? "ใช้งาน" : "ปิด"}
                                onChange={(is_active) =>
                                  updateUser.mutate({ id: row.id, ...pickEditable(row), is_active })
                                }
                              />
                            ) : (
                              <span
                                className={
                                  row.is_active
                                    ? "rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success"
                                    : "rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                                }
                              >
                                {row.is_active ? "ใช้งาน" : "ปิด"}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {rolesText || "—"}
                          {" · "}
                          {titlesText}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{deptText}</p>
                      </div>
                    </div>
                    {mayManage && (
                      <div className="mt-2 flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="ลบผู้ใช้งาน"
                          disabled={row.id === me?.id || deleteUser.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (row.id === me?.id) return;
                            if (
                              confirm(
                                `ลบ "${name}" ถาวร? บัญชีเข้าสู่ระบบจะถูกลบด้วย กู้คืนไม่ได้`,
                              )
                            ) {
                              deleteUser.mutate(row.id, {
                                onError: (err) => {
                                  alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
                                },
                              });
                            }
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card lg:block">
            <table className="w-full text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">ชื่อ</th>
                  <th className="px-3 py-2 font-medium">สิทธิ์</th>
                  <th className="px-3 py-2 font-medium">ตำแหน่ง</th>
                  <th className="px-3 py-2 font-medium">แผนก</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  {mayManage && <th className="w-10 px-3 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => mayManage && setEditing(row)}
                    className={
                      mayManage
                        ? "cursor-pointer border-t border-border active:bg-muted"
                        : "border-t border-border"
                    }
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={profileFullName(row)} src={avatarUrl(row)} className="h-7 w-7 shrink-0 text-[10px]" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{profileFullName(row)}</p>
                          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                        </div>
                      </div>
                    </td>
                    {/* dept_head shows via the ตำแหน่ง column instead — same filter the edit form uses (pickEditable). */}
                    <td className="px-3 py-2">{roleLabels(row.roles.filter((r) => r !== "dept_head"))}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.positionTitleIds.length
                        ? row.positionTitleIds.map((id) => titleName.get(id) ?? "—").join(", ")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.department_id ? (deptName.get(row.department_id) ?? "—") : "ทุกแผนก"}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      {mayManage ? (
                        <Switch
                          size="sm"
                          checked={row.is_active}
                          disabled={updateUser.isPending}
                          label={row.is_active ? "ใช้งาน" : "ปิด"}
                          onChange={(is_active) =>
                            updateUser.mutate({ id: row.id, ...pickEditable(row), is_active })
                          }
                        />
                      ) : (
                        <span
                          className={
                            row.is_active
                              ? "rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success"
                              : "rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                          }
                        >
                          {row.is_active ? "ใช้งาน" : "ปิด"}
                        </span>
                      )}
                    </td>
                    {mayManage && (
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="ลบผู้ใช้งาน"
                          disabled={row.id === me?.id || deleteUser.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (row.id === me?.id) return;
                            if (
                              confirm(
                                `ลบ "${profileFullName(row)}" ถาวร? บัญชีเข้าสู่ระบบจะถูกลบด้วย กู้คืนไม่ได้`,
                              )
                            ) {
                              deleteUser.mutate(row.id, {
                                onError: (err) => {
                                  alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
                                },
                              });
                            }
                          }}
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

          <Field label="สิทธิ์">
            <Select
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value as Role | "" })}
            >
              <option value="">ทุกสิทธิ์</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="สถานะ">
            <Select
              value={filters.active}
              onChange={(e) =>
                setFilters({ ...filters, active: e.target.value as ProfileFilters["active"] })
              }
            >
              <option value="">ทั้งหมด</option>
              <option value="true">ใช้งาน</option>
              <option value="false">ปิด</option>
            </Select>
          </Field>
        </div>
      </Sheet>

      <EditUserSheet profile={editing} onClose={() => setEditing(null)} />
      <CreateUserSheet open={creating} onClose={() => setCreating(false)} />
      <ImportUsersSheet open={importing} onOpenChange={setImporting} />
    </div>
  );
}

/**
 * Role + position-title pickers, shared by the edit and create sheets.
 * Native single-value <select> (grill decision) — a profile holds at most
 * one of each here. positionTitleIds/roles arrays upstream still support
 * more than one (a teacher who is both หัวหน้าฝ่ายวิชาการ and
 * หัวหน้ากิจการนักเรียน, per 0001's schema comment), but this UI can only
 * set/see the first — saving here overwrites any extra pre-existing ones.
 */
/**
 * สิทธิ์ — one at a time (native select). ตำแหน่งหัวหน้างาน — a person can
 * hold several at once (e.g. หัวหน้าฝ่ายวิชาการ + หัวหน้ากิจการนักเรียน, per
 * 0001's schema comment), so it stays multi: select-to-add + a removable
 * list, rather than a plain <select multiple> (poor touch UX) or reverting
 * to the old button grid.
 */
function RolePicker({
  role,
  positionTitleIds,
  positionTitles,
  onRoleChange,
  onAddTitle,
  onRemoveTitle,
  roleError,
}: {
  role: Role | "";
  positionTitleIds: string[];
  positionTitles: PositionTitle[];
  onRoleChange: (role: Role | "") => void;
  onAddTitle: (titleId: string) => void;
  onRemoveTitle: (titleId: string) => void;
  roleError?: string;
}) {
  const available = positionTitles.filter((t) => !positionTitleIds.includes(t.id));

  return (
    <>
      <Field label="สิทธิ์" error={roleError} required>
        <Select
          value={role}
          onChange={(e) => onRoleChange(e.target.value as Role | "")}
          placeholder="เลือกสิทธิ์"
        >
          {BASE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="ตำแหน่งหัวหน้างาน (แผนกตัวเอง)">
        <div className="space-y-2">
          {positionTitleIds.length > 0 && (
            <ul className="space-y-1.5">
              {positionTitleIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate">{positionTitles.find((t) => t.id === id)?.name ?? id}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveTitle(id)}
                    aria-label="ลบตำแหน่ง"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {available.length > 0 && (
            <Select
              value=""
              onChange={(e) => e.target.value && onAddTitle(e.target.value)}
              placeholder="+ เพิ่มตำแหน่ง"
            >
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </Field>
    </>
  );
}

export function PrefixNameFields({
  prefix,
  firstName,
  lastName,
  onChange,
  errors,
  prefixes = PREFIXES,
}: {
  prefix: string | null;
  firstName: string;
  lastName: string;
  onChange: (patch: { prefix?: string | null; first_name?: string; last_name?: string }) => void;
  errors?: { first_name?: string; last_name?: string };
  prefixes?: readonly string[];
}) {
  const options =
    prefix && !prefixes.includes(prefix) ? [prefix, ...prefixes] : prefixes;

  return (
    <>
      <Field label="คำนำหน้า">
        <Select value={prefix ?? ""} onChange={(e) => onChange({ prefix: e.target.value || null })}>
          <option value="">— ไม่ระบุ —</option>
          {options.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ชื่อ" error={errors?.first_name} required>
          <Input value={firstName} onChange={(e) => onChange({ first_name: e.target.value })} required />
        </Field>
        <Field label="นามสกุล" error={errors?.last_name} required>
          <Input value={lastName} onChange={(e) => onChange({ last_name: e.target.value })} required />
        </Field>
      </div>
    </>
  );
}

/** teacher_code + learning_area_id — shown only when role "teacher" is checked (required by check_profile_role_dept()). */
function TeacherFields({
  teacherCode,
  learningAreaId,
  onChange,
  error,
}: {
  teacherCode: string | null;
  learningAreaId: string | null;
  onChange: (patch: { teacher_code?: string | null; learning_area_id?: string | null }) => void;
  error?: string;
}) {
  const { data: learningAreas = [] } = useLearningAreas();

  return (
    <>
      <Field label="รหัสครู">
        <Input
          value={teacherCode ?? ""}
          onChange={(e) => onChange({ teacher_code: e.target.value || null })}
        />
      </Field>
      <Field label="กลุ่มสาระฯ" error={error} required>
        <Select
          value={learningAreaId ?? ""}
          onChange={(e) => onChange({ learning_area_id: e.target.value || null })}
          required
        >
          <option value="">— เลือกกลุ่มสาระ —</option>
          {learningAreas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

type LinkedStudent = Pick<Student, "id" | "student_code" | "first_name" | "last_name">;

/** role="parent": which students this account is a guardian of — writes guardianships on create, see invite-user. */
function LinkedStudentsField({
  selected,
  onAdd,
  onRemove,
  error,
}: {
  selected: LinkedStudent[];
  onAdd: (s: LinkedStudent) => void;
  onRemove: (id: string) => void;
  error?: string;
}) {
  const [search, setSearch] = useState("");
  const { data: results = [] } = useStudents({ search, departmentId: "", status: "" });
  const available = results.filter((s) => !selected.some((sel) => sel.id === s.id)).slice(0, 8);

  return (
    <Field label="นักเรียนที่ดูแล (ผู้ปกครองของ)" error={error} required>
      <div className="space-y-2">
        {selected.length > 0 && (
          <ul className="space-y-1.5">
            {selected.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
              >
                <span className="truncate">
                  {s.first_name} {s.last_name} · {s.student_code}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(s.id)}
                  aria-label="ลบนักเรียน"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Input
          placeholder="ค้นหาชื่อหรือรหัสนักเรียน"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search.trim() && available.length > 0 && (
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
            {available.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(s);
                    setSearch("");
                  }}
                  className="block w-full truncate px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                >
                  {s.first_name} {s.last_name} · {s.student_code}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

/**
 * Uploads immediately on pick (not deferred to the sheet's "บันทึก" button)
 * — same convention as the school-logo and self-service avatar uploads.
 * `profile` here is a snapshot passed down from the row the admin clicked,
 * which won't refresh mid-edit even though the mutations below invalidate
 * the profiles query — so the just-picked/removed photo is tracked locally
 * instead of waiting on that prop to catch up.
 */
function EditAvatarField({ profile }: { profile: ProfileRow }) {
  const toast = useToast();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const [override, setOverride] = useState<{ url: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = uploadAvatar.isPending || removeAvatar.isPending;
  const src = override ? override.url : avatarUrl(profile);

  function setPreview(url: string | null) {
    setOverride((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { url };
    });
  }

  async function pick(file: File) {
    setPreview(URL.createObjectURL(file));
    try {
      await uploadAvatar.mutateAsync({ file, profileId: profile.id });
      toast("อัปเดตรูปโปรไฟล์แล้ว");
    } catch {
      toast("อัปโหลดรูปไม่สำเร็จ", "error");
    }
  }

  async function remove() {
    setPreview(null);
    try {
      await removeAvatar.mutateAsync(profile.id);
    } catch {
      toast("ลบรูปไม่สำเร็จ", "error");
    }
  }

  return (
    <Field label="รูปโปรไฟล์">
      <div className="flex justify-center">
        <div className="relative">
          <Avatar name={profileFullName(profile)} src={src} className="h-20 w-20 text-xl" />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            aria-label={src ? "เปลี่ยนรูป" : "เลือกรูป"}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity hover:opacity-100"
          >
            {busy ? <Spinner className="h-5 w-5 text-white" /> : <Upload className="h-5 w-5 text-white" />}
          </button>
          {src && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              aria-label="ลบรูป"
              className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void pick(file);
          }}
        />
      </div>
    </Field>
  );
}

function EditUserSheet({ profile, onClose }: { profile: ProfileRow | null; onClose: () => void }) {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data: departments = [] } = useDepartments();
  const { data: positionTitles = [] } = usePositionTitles();
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<ProfileEdit | null>(null);
  const isStudent = profile?.roles.includes("student") ?? false;
  const { data: linkedStudent } = useStudentByProfile(isStudent ? (profile?.id ?? null) : null);

  // draft is cleared on close, so a freshly opened row always starts from its
  // own values rather than the previously edited row's.
  const current: ProfileEdit | null = draft ?? (profile ? pickEditable(profile) : null);

  function setRole(role: Role | "") {
    if (!current) return;
    setDraft({ ...current, roles: role ? [role] : [] });
  }

  function addTitle(titleId: string) {
    if (!current || current.positionTitleIds.includes(titleId)) return;
    setDraft({ ...current, positionTitleIds: [...current.positionTitleIds, titleId] });
  }

  function removeTitle(titleId: string) {
    if (!current) return;
    setDraft({ ...current, positionTitleIds: current.positionTitleIds.filter((t) => t !== titleId) });
  }

  function save() {
    if (!profile || !current) return;
    update.mutate(
      { id: profile.id, ...current },
      {
        onSuccess: () => toast("บันทึกข้อมูลผู้ใช้งานสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
    close();
  }

  function close() {
    setDraft(null);
    onClose();
  }

  return (
    <Sheet
      open={profile !== null}
      onOpenChange={(open) => !open && close()}
      title="แก้ไขผู้ใช้งาน"
      description={profile ? profileFullName(profile) : undefined}
      footer={
        profile && current ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={close}>
              ยกเลิก
            </Button>
            <Button className="flex-1" onClick={save}>
              บันทึก
            </Button>
          </div>
        ) : undefined
      }
    >
      {profile && current && (
        <div className="space-y-4">
          <EditAvatarField key={profile.id} profile={profile} />

          <PrefixNameFields
            prefix={current.prefix}
            firstName={current.first_name}
            lastName={current.last_name}
            prefixes={profile.roles.includes("student") ? STUDENT_PREFIXES : PREFIXES}
            onChange={(patch) => setDraft({ ...current, ...patch })}
          />

          <Field label="อีเมล (ข้อมูลติดต่อ ไม่ใช่รหัสเข้าระบบ)">
            <Input
              type="email"
              value={current.email ?? ""}
              onChange={(e) => setDraft({ ...current, email: e.target.value || null })}
            />
          </Field>

          <Field label="เบอร์โทร (รหัสผู้ใช้เข้าระบบ — แก้ที่นี่ไม่ได้)">
            <Input type="tel" value={current.phone ?? ""} disabled readOnly />
          </Field>

          {isStudent && (
            <Field label="รหัสนักเรียน">
              <Input value={linkedStudent?.student_code ?? "—"} disabled readOnly />
            </Field>
          )}

          <Field label="เลขบัตรประชาชน">
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={current.national_id ?? ""}
              onChange={(e) =>
                setDraft({
                  ...current,
                  national_id: e.target.value.replace(/\D/g, "").slice(0, 13) || null,
                })
              }
              pattern="[0-9]{13}"
              minLength={13}
              maxLength={13}
              title="เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก"
            />
          </Field>

          <Field label="วันเดือนปีเกิด">
            <BuddhistDateSelect
              key={profile?.id}
              value={current.date_of_birth ?? ""}
              onChange={(v) => setDraft({ ...current, date_of_birth: v || null })}
            />
          </Field>

          <AddressInputs value={current} onChange={(patch) => setDraft({ ...current, ...patch })} />

          <RolePicker
            role={current.roles[0] ?? ""}
            positionTitleIds={current.positionTitleIds}
            positionTitles={positionTitles}
            onRoleChange={setRole}
            onAddTitle={addTitle}
            onRemoveTitle={removeTitle}
          />

          {current.roles.includes("teacher") && (
            <TeacherFields
              teacherCode={current.teacher_code}
              learningAreaId={current.learning_area_id}
              onChange={(patch) => setDraft({ ...current, ...patch })}
            />
          )}

          {me && isOrgWide(me.roles) && (
            <Field label="แผนก">
              <Select
                value={current.department_id ?? ""}
                onChange={(e) => setDraft({ ...current, department_id: e.target.value || null })}
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

          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">เปิดใช้งานบัญชี</span>
            <Switch
              checked={current.is_active}
              onChange={(v) => setDraft({ ...current, is_active: v })}
              label="เปิดใช้งานบัญชี"
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** null = missing an input the rule needs (DOB, or a linked student for role="parent"). */
function defaultPasswordFor(
  role: Role | "",
  dateOfBirth: string | null,
  firstGuardianStudentCode: string | null,
): string | null {
  if (role === "parent") return firstGuardianStudentCode;
  if (role === "super_admin" || !role) return null; // super_admin always sets its own — grill decision
  return dateOfBirth ? passwordFromDob(dateOfBirth) : null;
}

function blankInvite(departmentId: string | null): UserInvite {
  return {
    kind: "staff",
    loginId: "",
    password: "",
    mustChangePassword: false,
    prefix: null,
    first_name: "",
    last_name: "",
    email: null,
    national_id: null,
    date_of_birth: null,
    department_id: departmentId,
    roles: [],
    positionTitleIds: [],
    teacher_code: null,
    learning_area_id: null,
  };
}

/** Staff/teacher/etc. only — student logins are created from the Roster page instead. */
function CreateUserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data: departments = [] } = useDepartments();
  const { data: positionTitles = [] } = usePositionTitles();
  const invite = useInviteUsers();
  const [draft, setDraft] = useState<UserInvite>(() => blankInvite(me?.department_id ?? null));
  const [guardianStudents, setGuardianStudents] = useState<
    Pick<Student, "id" | "student_code" | "first_name" | "last_name">[]
  >([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);

  const role = draft.roles[0] ?? "";
  const autoPassword = defaultPasswordFor(role, draft.date_of_birth, guardianStudents[0]?.student_code ?? null);

  function pickAvatar(file: File | null) {
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setAvatarFile(file);
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (draft.loginId.replace(/\D/g, "").length !== 10) e.loginId = "เบอร์โทรต้องเป็นตัวเลข 10 หลัก";
    if (!draft.first_name.trim()) e.first_name = "กรอกชื่อ";
    if (!draft.last_name.trim()) e.last_name = "กรอกนามสกุล";
    if ((draft.national_id ?? "").replace(/\D/g, "").length !== 13) {
      e.national_id = "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก";
    }
    if (!draft.date_of_birth) e.date_of_birth = "เลือกวันเดือนปีเกิดให้ครบ";
    if (!role) e.role = "เลือกสิทธิ์";
    if (role === "teacher" && !draft.learning_area_id) e.learning_area_id = "เลือกกลุ่มสาระ";
    if (role === "parent" && guardianStudents.length === 0) {
      e.guardianStudents = "เลือกนักเรียนที่ดูแลอย่างน้อย 1 คน";
    }
    if (draft.password && draft.password.length < 8) {
      e.password = "รหัสผ่านอย่างน้อย 8 ตัวอักษร";
    } else if (!draft.password && !autoPassword) {
      e.password =
        role === "super_admin" ? "ผู้ดูแลระบบต้องตั้งรหัสผ่านเอง" : "กรอกวันเดือนปีเกิดก่อน เพื่อตั้งรหัสผ่านเริ่มต้น";
    }
    return e;
  }

  // Re-validates live once the admin has tried to submit at least once —
  // avoids nagging with red text before they've touched anything.
  useEffect(() => {
    if (attempted) setErrors(validate());
  }, [attempted, draft, guardianStudents]);

  function setRole(role: Role | "") {
    setDraft((d) => ({ ...d, roles: role ? [role] : [] }));
    if (role !== "parent") setGuardianStudents([]);
  }

  function addTitle(titleId: string) {
    setDraft((d) => (d.positionTitleIds.includes(titleId) ? d : { ...d, positionTitleIds: [...d.positionTitleIds, titleId] }));
  }

  function removeTitle(titleId: string) {
    setDraft((d) => ({ ...d, positionTitleIds: d.positionTitleIds.filter((t) => t !== titleId) }));
  }

  function addGuardianStudent(s: Pick<Student, "id" | "student_code" | "first_name" | "last_name">) {
    setGuardianStudents((gs) => (gs.some((g) => g.id === s.id) ? gs : [...gs, s]));
  }

  function removeGuardianStudent(id: string) {
    setGuardianStudents((gs) => gs.filter((g) => g.id !== id));
  }

  function close() {
    setDraft(blankInvite(me?.department_id ?? null));
    setGuardianStudents([]);
    pickAvatar(null);
    setFailReason(null);
    setErrors({});
    setAttempted(false);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFailReason(null);
    setAttempted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const avatarBase64 = avatarFile ? await blobToBase64(await compressImage(avatarFile)) : undefined;
    const phone = draft.loginId.replace(/\D/g, "");
    const nationalId = (draft.national_id ?? "").replace(/\D/g, "");
    const password = draft.password || autoPassword!;
    const outcome = await invite.mutateAsync([
      {
        ...draft,
        loginId: phone,
        national_id: nationalId,
        password,
        mustChangePassword: !draft.password,
        guardianStudentIds: guardianStudents.map((s) => s.id),
        avatarBase64,
      },
    ]);
    if (outcome.inserted > 0) {
      toast("เพิ่มผู้ใช้งานสำเร็จ");
      close();
    } else {
      setFailReason(outcome.skipped[0]?.reason ?? "เพิ่มผู้ใช้งานไม่สำเร็จ");
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      title="เพิ่มผู้ใช้งาน"
      description="เบอร์โทรเป็นรหัสผู้ใช้เข้าระบบ — เว้นรหัสผ่านว่างไว้ได้ ระบบตั้งให้อัตโนมัติตามบทบาท"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={close}>
            ยกเลิก
          </Button>
          <Button type="submit" form="create-user" className="flex-1" disabled={invite.isPending}>
            {invite.isPending ? <Spinner /> : "สร้างบัญชี"}
          </Button>
        </div>
      }
    >
      <form id="create-user" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="รูปโปรไฟล์ (ไม่บังคับ)">
          <div className="flex justify-center">
            <div className="relative">
              <Avatar
                name={`${draft.first_name} ${draft.last_name}`.trim() || "?"}
                src={avatarPreview}
                className="h-20 w-20 text-xl"
              />
              <button
                type="button"
                onClick={() => avatarFileRef.current?.click()}
                aria-label={avatarFile ? "เปลี่ยนรูป" : "เลือกรูป"}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity hover:opacity-100"
              >
                <Upload className="h-5 w-5 text-white" />
              </button>
            </div>
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
            />
          </div>
        </Field>

        <Field label="เบอร์โทร (รหัสผู้ใช้)" error={errors.loginId} required>
          <Input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={draft.loginId}
            onChange={(e) =>
              setDraft({ ...draft, loginId: e.target.value.replace(/\D/g, "").slice(0, 10) })
            }
            maxLength={10}
          />
        </Field>

        <PrefixNameFields
          prefix={draft.prefix}
          firstName={draft.first_name}
          lastName={draft.last_name}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
          errors={errors}
        />

        <Field label="อีเมล (ข้อมูลติดต่อ ไม่บังคับ)">
          <Input
            type="email"
            value={draft.email ?? ""}
            onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
          />
        </Field>

        <Field label="เลขบัตรประชาชน (ใช้ยืนยันตอนลืมรหัสผ่าน)" error={errors.national_id} required>
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={draft.national_id ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                national_id: e.target.value.replace(/\D/g, "").slice(0, 13) || null,
              })
            }
            maxLength={13}
          />
        </Field>

        <Field label="วันเดือนปีเกิด" error={errors.date_of_birth} required>
          <BuddhistDateSelect
            key={open ? "open" : "closed"}
            value={draft.date_of_birth ?? ""}
            onChange={(v) => setDraft({ ...draft, date_of_birth: v || null })}
          />
        </Field>

        <RolePicker
          role={draft.roles[0] ?? ""}
          positionTitleIds={draft.positionTitleIds}
          positionTitles={positionTitles}
          onRoleChange={setRole}
          onAddTitle={addTitle}
          onRemoveTitle={removeTitle}
          roleError={errors.role}
        />

        {draft.roles.includes("teacher") && (
          <TeacherFields
            teacherCode={draft.teacher_code}
            learningAreaId={draft.learning_area_id}
            onChange={(patch) => setDraft({ ...draft, ...patch })}
            error={errors.learning_area_id}
          />
        )}

        {role === "parent" && (
          <LinkedStudentsField
            selected={guardianStudents}
            onAdd={addGuardianStudent}
            onRemove={removeGuardianStudent}
            error={errors.guardianStudents}
          />
        )}

        <Field label="รหัสผ่าน (เว้นว่างได้)" error={errors.password} required={role === "super_admin"}>
          <PasswordInput
            value={draft.password}
            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {role === "super_admin"
              ? "ผู้ดูแลระบบต้องตั้งรหัสผ่านเอง"
              : autoPassword
                ? <>ถ้าเว้นว่าง รหัสผ่านเริ่มต้นคือ <span className="font-mono">{autoPassword}</span></>
                : role === "parent"
                  ? "เลือกนักเรียนที่ดูแลก่อน เพื่อดูรหัสผ่านเริ่มต้น"
                  : "กรอกวันเดือนปีเกิดก่อน เพื่อดูรหัสผ่านเริ่มต้น"}
          </p>
        </Field>

        {me && isOrgWide(me.roles) && (
          <Field label="แผนก">
            <Select
              value={draft.department_id ?? ""}
              onChange={(e) => setDraft({ ...draft, department_id: e.target.value || null })}
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

        {failReason && <p className="text-sm text-destructive">{failReason}</p>}
      </form>
    </Sheet>
  );
}

function pickEditable(p: ProfileRow): ProfileEdit {
  return {
    prefix: p.prefix,
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email,
    phone: p.phone,
    national_id: p.national_id,
    date_of_birth: p.date_of_birth,
    department_id: p.department_id,
    is_active: p.is_active,
    teacher_code: p.teacher_code,
    learning_area_id: p.learning_area_id,
    ...pickAddress(p),
    roles: p.roles.filter((r) => r !== "dept_head"),
    positionTitleIds: p.positionTitleIds,
  };
}
