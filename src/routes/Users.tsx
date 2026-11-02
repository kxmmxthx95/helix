import {
  CalendarIcon,
  CallIcon,
  CheckmarkCircleIcon,
  Plus,
  ProfileIcon,
  Search,
  ShieldIcon,
  SlidersHorizontal,
  TimeIcon,
  TrashIcon,
  Upload,
  Users as UsersIcon,
  X,
} from "@/components/icons";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ImportUsersSheet } from "@/components/ImportUsersSheet";
import { Modal } from "@/components/Modal";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import {
  Avatar,
  AvatarCard,
  Button,
  BuddhistDateSelect,
  Card,
  EmptyState,
  Field,
  Input,
  PasswordInput,
  Select,
  SheetFormContext,
  Skeleton,
  Spinner,
  Switch,
} from "@/components/ui";
import { avatarUrl, useRemoveAvatar, useUploadAvatar } from "@/hooks/useAvatar";
import { useLearningAreas } from "@/hooks/useCurriculum";
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
import { cn } from "@/lib/utils";
import { StatCard } from "@/routes/Classrooms";
import { pickAddress } from "@/routes/Roster";
import { FormSection } from "@/components/ui";

const EMPTY: ProfileFilters = { search: "", departmentId: "", role: "", active: "" };

/** Roles pickable directly — dept_head comes from position_titles instead. */
const BASE_ROLES = ROLES.filter((r) => r !== "dept_head");
/** นักเรียน/ผู้ปกครอง are self-scoped accounts — never combined with staff roles or each other. */
const SELF_ONLY: readonly Role[] = ["student", "parent"];
const roleCombinable = (held: Role[], next: Role) =>
  held.length === 0 || (!SELF_ONLY.includes(next) && !held.some((r) => SELF_ONLY.includes(r)));
/** One role drives the default-password rule: the most restrictive held. */
const primaryRole = (roles: Role[]): Role | "" =>
  roles.includes("super_admin") ? "super_admin" : roles.includes("parent") ? "parent" : (roles[0] ?? "");

/** Role badge tint (soft fill, readable text) — admin accent, management violet, self-scoped accounts neutral. */
function roleTone(r: Role): string {
  if (r === "super_admin") return "bg-accent-soft text-accent";
  if (r === "director" || r === "dept_director" || r === "dept_head")
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
  if (r === "student" || r === "parent") return "bg-secondary text-muted-foreground";
  return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
}

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
  const deleteUser = useDeleteUser();
  const toast = useToast();
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
    <div className="page-fill page-flush min-h-0 shrink-0 pb-5 lg:h-[calc(100dvh-7.5rem)]">
      <div className="toolbar">
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
            <Button className="shrink-0" onClick={() => setCreating(true)} aria-label="เพิ่มผู้ใช้งาน">
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">เพิ่มผู้ใช้งาน</span>
            </Button>
          </>
        )}
      </div>

      {isLoading && (
        <div role="status" aria-label="กำลังโหลด" className="space-y-2">
          <ul className="space-y-2 lg:hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="rounded-xl bg-card p-3.5 shadow-card">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="table-panel hidden lg:flex"><div className="table-panel-scroll">
            <table className="w-full text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">สิทธิ์</th>
                  <th className="px-4 py-3">ตำแหน่ง</th>
                  <th className="px-4 py-3">แผนก</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className="h-14 border-t border-border first:border-t-0">
                    <td className="px-4 py-0">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-16" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-20" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-3 w-16" />
                    </td>
                    <td className="px-4 py-0">
                      <Skeleton className="h-4 w-12 rounded-full" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </div>
      )}

      {error && (
        <Card className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</Card>
      )}

      {rows && rows.length === 0 && (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่พบผู้ใช้งานตามเงื่อนไขที่เลือก" />
      )}

      {rows && rows.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <ul className="space-y-2 lg:hidden">
            {rows.map((row) => {
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
                        ? "rounded-xl bg-card p-3.5 shadow-card active:bg-muted"
                        : "rounded-xl bg-card p-3.5 shadow-card"
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
                                size="xs"
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
                                onSuccess: () => toast("ลบผู้ใช้งานสำเร็จ"),
                                onError: (err) =>
                                  toast(err instanceof Error ? err.message : "ลบไม่สำเร็จ", "error"),
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

          <div className="table-panel hidden rounded-none border-t border-border shadow-none lg:flex"><div className="table-panel-scroll">
            <table className="w-full text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">สิทธิ์</th>
                  <th className="px-4 py-3">ตำแหน่ง</th>
                  <th className="px-4 py-3">แผนก</th>
                  <th className="px-4 py-3">สถานะ</th>
                  {mayManage && <th className="w-14 px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => mayManage && setEditing(row)}
                    className={
                      mayManage
                        ? "h-14 cursor-pointer border-t border-border first:border-t-0"
                        : "h-14 border-t border-border first:border-t-0"
                    }
                  >
                    <td className="px-4 py-0">
                      <div className="flex items-center gap-3">
                        <Avatar name={profileFullName(row)} src={avatarUrl(row)} className="h-9 w-9 shrink-0 text-xs" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{profileFullName(row)}</p>
                          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                        </div>
                      </div>
                    </td>
                    {/* dept_head shows via the ตำแหน่ง column instead — same filter the edit form uses (pickEditable). */}
                    <td className="px-4 py-0"><div className="flex flex-wrap gap-1">
                        {row.roles
                          .filter((r) => r !== "dept_head")
                          .map((r) => (
                            <span key={r} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleTone(r)}`}>
                              {ROLE_LABEL[r]}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-4 py-0 text-muted-foreground">
                      {row.positionTitleIds.length
                        ? row.positionTitleIds.map((id) => titleName.get(id) ?? "—").join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-0 text-muted-foreground">
                      {row.department_id ? (deptName.get(row.department_id) ?? "—") : "ทุกแผนก"}
                    </td>
                    <td className="px-4 py-0" onClick={(e) => e.stopPropagation()}>
                      {mayManage ? (
                        <Switch
                          size="xs"
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
                      <td className="px-4 py-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
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
                                onSuccess: () => toast("ลบผู้ใช้งานสำเร็จ"),
                                onError: (err) =>
                                  toast(err instanceof Error ? err.message : "ลบไม่สำเร็จ", "error"),
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
          </div></div>
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
      {rows && (
        <div className="sticky bottom-0 z-10 mt-auto grid shrink-0 grid-cols-2 gap-2 bg-background pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:grid-cols-4">
          <StatCard tone="accent" icon={<UsersIcon className="h-5 w-5" />} label="ทั้งหมด" value={rows.length} unit="คน" />
          <StatCard tone="success" icon={<CheckmarkCircleIcon className="h-5 w-5" />} label="ใช้งานอยู่" value={rows.filter((r) => r.is_active).length} unit="คน" />
          <StatCard tone="warning" icon={<TimeIcon className="h-5 w-5" />} label="ปิดใช้งาน" value={rows.filter((r) => !r.is_active).length} unit="คน" />
          <StatCard tone="muted" icon={<UsersIcon className="h-5 w-5" />} label="นักเรียน" value={rows.filter((r) => r.roles.includes("student")).length} unit="คน" />
        </div>
      )}
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
  roles,
  positionTitleIds,
  positionTitles,
  onAddRole,
  onRemoveRole,
  onAddTitle,
  onRemoveTitle,
  roleError,
}: {
  roles: Role[];
  positionTitleIds: string[];
  positionTitles: PositionTitle[];
  onAddRole: (role: Role) => void;
  onRemoveRole: (role: Role) => void;
  onAddTitle: (titleId: string) => void;
  onRemoveTitle: (titleId: string) => void;
  roleError?: string;
}) {
  const available = positionTitles.filter((t) => !positionTitleIds.includes(t.id));
  const availableRoles = BASE_ROLES.filter((r) => !roles.includes(r) && roleCombinable(roles, r));

  return (
    <>
      <Field label="สิทธิ์" error={roleError} required>
        <div className="space-y-2">
          {roles.length > 0 && (
            <ul className="space-y-1.5">
              {roles.map((r) => (
                <li
                  key={r}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate">{ROLE_LABEL[r]}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveRole(r)}
                    aria-label="ลบสิทธิ์"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {availableRoles.length > 0 && (
            <Select
              value=""
              onChange={(e) => e.target.value && onAddRole(e.target.value as Role)}
              placeholder={roles.length ? "+ เพิ่มสิทธิ์" : "เลือกสิทธิ์"}
            >
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </div>
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

type UserTab = "general" | "account";
const USER_TABS: { key: UserTab; label: string; icon: typeof ProfileIcon }[] = [
  { key: "general", label: "ข้อมูลทั่วไป", icon: ProfileIcon },
  { key: "account", label: "สิทธิ์และบัญชี", icon: ShieldIcon },
];

function EditUserSheet({ profile, onClose }: { profile: ProfileRow | null; onClose: () => void }) {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data: departments = [] } = useDepartments();
  const { data: positionTitles = [] } = usePositionTitles();
  const update = useUpdateProfile();
  const deleteUser = useDeleteUser();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const [draft, setDraft] = useState<ProfileEdit | null>(null);
  const [tab, setTab] = useState<UserTab>("general");
  const [attempted, setAttempted] = useState(false); // show field errors only after the first save attempt
  // Picked photo, applied on save; "remove" clears the stored one.
  const [avatar, setAvatar] = useState<File | "remove" | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!(avatar instanceof File)) return setAvatarPreview(null);
    const url = URL.createObjectURL(avatar);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);
  const isStudent = profile?.roles.includes("student") ?? false;
  const { data: linkedStudent } = useStudentByProfile(isStudent ? (profile?.id ?? null) : null);

  // draft is cleared on close, so a freshly opened row always starts from its
  // own values rather than the previously edited row's.
  const current: ProfileEdit | null = draft ?? (profile ? pickEditable(profile) : null);

  const errors: Record<string, string> = {};
  if (current) {
    if (!current.first_name.trim()) errors.first_name = "กรอกชื่อ";
    if (!current.last_name.trim()) errors.last_name = "กรอกนามสกุล";
    if (!current.date_of_birth) errors.date_of_birth = "เลือกวันเดือนปีเกิดให้ครบ";
    if (current.phone && current.phone.length !== 10) errors.phone = "เบอร์โทรต้องเป็นตัวเลข 10 หลัก";
    if (current.national_id && current.national_id.length !== 13) errors.national_id = "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก";
    if (current.roles.includes("dept_director") && !current.department_id) errors.department_id = "ผู้บริหารแผนกต้องระบุแผนก";
  }
  const err = (k: string) => (attempted ? errors[k] : undefined);

  function addRole(role: Role) {
    if (!current || current.roles.includes(role)) return;
    setDraft({ ...current, roles: [...current.roles, role] });
  }

  function removeRole(role: Role) {
    if (!current) return;
    setDraft({ ...current, roles: current.roles.filter((r) => r !== role) });
  }

  function addTitle(titleId: string) {
    if (!current || current.positionTitleIds.includes(titleId)) return;
    setDraft({ ...current, positionTitleIds: [...current.positionTitleIds, titleId] });
  }

  function removeTitle(titleId: string) {
    if (!current) return;
    setDraft({ ...current, positionTitleIds: current.positionTitleIds.filter((t) => t !== titleId) });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !current) return;
    const invalid = Object.keys(errors);
    if (invalid.length) {
      setAttempted(true);
      setTab(invalid.every((k) => k === "department_id") ? "account" : "general");
      toast(`กรอกข้อมูลให้ถูกต้อง (${invalid.length} ช่อง)`, "error");
      return;
    }
    const photo = avatar;
    update
      .mutateAsync({ id: profile.id, originalPhone: profile.phone, ...current })
      .then(async () => {
        if (photo === "remove") await removeAvatar.mutateAsync(profile.id);
        else if (photo) await uploadAvatar.mutateAsync({ file: photo, profileId: profile.id });
        toast("บันทึกข้อมูลผู้ใช้งานสำเร็จ");
      })
      .catch((err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"));
    close();
  }

  function remove() {
    if (!profile || profile.id === me?.id) return;
    if (!confirm(`ลบ "${profileFullName(profile)}" ถาวร? บัญชีเข้าสู่ระบบจะถูกลบด้วย กู้คืนไม่ได้`)) return;
    deleteUser.mutate(profile.id, {
      onSuccess: () => {
        toast("ลบผู้ใช้งานสำเร็จ");
        close();
      },
      onError: (err) => toast(err instanceof Error ? err.message : "ลบไม่สำเร็จ", "error"),
    });
  }

  function close() {
    setDraft(null);
    setAttempted(false);
    setTab("general");
    setAvatar(null);
    onClose();
  }

  return (
    <Modal
      open={profile !== null}
      onOpenChange={(open) => !open && close()}
      title="แก้ไขผู้ใช้งาน"
      className="max-w-lg"
      footer={
        profile && current ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              ยกเลิก
            </Button>
            <Button type="submit" form="edit-user" className="flex-1">
              บันทึก
            </Button>
          </div>
        ) : undefined
      }
    >
      <SheetFormContext.Provider value>
        {profile && current && (
          <div className="space-y-4">
            <div role="tablist" aria-label="หัวข้อข้อมูลผู้ใช้งาน" className="flex overflow-x-auto border-b border-border [container-type:inline-size] [scrollbar-width:none]">
              {USER_TABS.map((t) => (
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
                  <span className="[@container(max-width:26rem)]:sr-only">{t.label}</span>
                </button>
              ))}
            </div>
            {/* Panels stay mounted (hidden) so the draft and the single form survive tab switches. */}
            <form id="edit-user" onSubmit={submit} noValidate className="space-y-4">
              <div hidden={tab !== "general"} className="space-y-4">
                <AvatarCard
                  name={profileFullName(profile)}
                  src={avatar === "remove" ? null : (avatarPreview ?? avatarUrl(profile))}
                  onPick={setAvatar}
                  onRemove={() => setAvatar("remove")}
                />

                <FormSection icon={<ProfileIcon className="h-4 w-4" />}>
                  <PrefixNameFields
                    prefix={current.prefix}
                    firstName={current.first_name}
                    lastName={current.last_name}
                    prefixes={isStudent ? STUDENT_PREFIXES : PREFIXES}
                    errors={{ first_name: err("first_name"), last_name: err("last_name") }}
                    onChange={(patch) => setDraft({ ...current, ...patch })}
                  />
                  <Field label="วันเดือนปีเกิด" required error={err("date_of_birth")}>
                    <BuddhistDateSelect
                      key={profile.id}
                      value={current.date_of_birth ?? ""}
                      onChange={(v) => setDraft({ ...current, date_of_birth: v || null })}
                    />
                  </Field>
                </FormSection>

                <FormSection icon={<CallIcon className="h-4 w-4" />}>
                  <Field label="เบอร์โทร (รหัสผู้ใช้)" error={err("phone")}>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={current.phone ?? ""}
                      onChange={(e) =>
                        setDraft({ ...current, phone: e.target.value.replace(/\D/g, "").slice(0, 10) || null })
                      }
                      maxLength={10}
                    />
                  </Field>

                  {isStudent && (
                    <Field label="รหัสนักเรียน">
                      <Input value={linkedStudent?.student_code ?? "—"} disabled readOnly />
                    </Field>
                  )}

                  <Field label="อีเมล (ไม่บังคับ)">
                    <Input
                      type="email"
                      value={current.email ?? ""}
                      onChange={(e) => setDraft({ ...current, email: e.target.value || null })}
                    />
                  </Field>

                  <Field label="เลขบัตรประชาชน (ใช้ยืนยันตอนลืมรหัสผ่าน)" error={err("national_id")}>
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
                </FormSection>
              </div>

              <div hidden={tab !== "account"} className="space-y-4">
                <FormSection icon={<ShieldIcon className="h-4 w-4" />}>
                  <RolePicker
                    roles={current.roles}
                    positionTitleIds={current.positionTitleIds}
                    positionTitles={positionTitles}
                    onAddRole={addRole}
                    onRemoveRole={removeRole}
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
                    <Field label="แผนก" error={err("department_id")}>
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
                </FormSection>

                <FormSection icon={<TrashIcon className="h-4 w-4" />}>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-destructive"
                    disabled={profile.id === me?.id || deleteUser.isPending}
                    onClick={remove}
                  >
                    ลบผู้ใช้งาน
                  </Button>
                </FormSection>
              </div>
            </form>
          </div>
        )}
      </SheetFormContext.Provider>
    </Modal>
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
  const [failReason, setFailReason] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);

  const role = primaryRole(draft.roles);
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
    if (!draft.date_of_birth) e.date_of_birth = "เลือกวันเดือนปีเกิดให้ครบ";
    if (!role) e.role = "เลือกสิทธิ์";
    if (draft.roles.includes("dept_director") && !draft.department_id) e.role = "ผู้บริหารแผนกต้องระบุแผนก";
    if (draft.roles.includes("teacher") && !draft.learning_area_id) e.learning_area_id = "เลือกกลุ่มสาระ";
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

  function addRole(role: Role) {
    setDraft((d) => (d.roles.includes(role) ? d : { ...d, roles: [...d.roles, role] }));
  }

  function removeRole(role: Role) {
    setDraft((d) => ({ ...d, roles: d.roles.filter((r) => r !== role) }));
    if (role === "parent") setGuardianStudents([]);
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
    const nationalId = (draft.national_id ?? "").replace(/\D/g, "") || null;
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
    <Modal
      open={open}
      onOpenChange={(next) => !next && close()}
      title="เพิ่มผู้ใช้งาน"
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
      className="max-w-lg"
    >
      <SheetFormContext.Provider value>
      <form id="create-user" onSubmit={submit} className="space-y-4" noValidate>
        <AvatarCard
          name={`${draft.first_name} ${draft.last_name}`.trim() || "?"}
          src={avatarPreview}
          onPick={pickAvatar}
          onRemove={() => pickAvatar(null)}
        />

        <FormSection icon={<ProfileIcon className="h-4 w-4" />} title="ข้อมูลทั่วไป" description="ข้อมูลพื้นฐานของผู้ใช้งาน">
          <PrefixNameFields
            prefix={draft.prefix}
            firstName={draft.first_name}
            lastName={draft.last_name}
            onChange={(patch) => setDraft({ ...draft, ...patch })}
            errors={errors}
          />
        </FormSection>

        <FormSection icon={<CallIcon className="h-4 w-4" />} title="ข้อมูลติดต่อ" description="เบอร์โทรใช้เป็นรหัสเข้าสู่ระบบ">
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

          <Field label="อีเมล (ไม่บังคับ)">
            <Input
              type="email"
              value={draft.email ?? ""}
              onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
            />
          </Field>

          <Field label="เลขบัตรประชาชน (ใช้ยืนยันตอนลืมรหัสผ่าน)" error={errors.national_id}>
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
        </FormSection>

        <FormSection icon={<CalendarIcon className="h-4 w-4" />} title="วันเดือนปีเกิด">
          <Field label="วัน / เดือน / ปี (พ.ศ.)" error={errors.date_of_birth} required>
            <BuddhistDateSelect
              key={open ? "open" : "closed"}
              value={draft.date_of_birth ?? ""}
              onChange={(v) => setDraft({ ...draft, date_of_birth: v || null })}
            />
          </Field>
        </FormSection>

        <FormSection icon={<ShieldIcon className="h-4 w-4" />} title="สิทธิ์และบัญชี">
          <RolePicker
            roles={draft.roles}
            positionTitleIds={draft.positionTitleIds}
            positionTitles={positionTitles}
            onAddRole={addRole}
            onRemoveRole={removeRole}
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
        </FormSection>

        {failReason && <p className="text-sm text-destructive">{failReason}</p>}
      </form>
      </SheetFormContext.Provider>
    </Modal>
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
