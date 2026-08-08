import { Plus, Search, SlidersHorizontal, Upload } from "@/components/icons";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ImportUsersSheet } from "@/components/ImportUsersSheet";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import {
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
import type { PositionTitle } from "@/lib/database.types";
import { profileFullName } from "@/lib/database.types";
import { canManageUsers, isOrgWide, PREFIXES, ROLE_LABEL, ROLES, roleLabels, type Role } from "@/lib/roles";

const EMPTY: ProfileFilters = { search: "", departmentId: "", role: "", active: "" };

/** Roles pickable directly as checkboxes — dept_head comes from position_titles instead. */
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
        <Card className="py-10 text-center text-sm text-muted-foreground">ไม่พบผู้ใช้งาน</Card>
      )}

      {rows && rows.length > 0 && (
        // Table stays a table on mobile; the wrapper scrolls sideways so the
        // page body never does.
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ชื่อ</th>
                <th className="px-3 py-2 font-medium">สิทธิ์</th>
                <th className="px-3 py-2 font-medium">ตำแหน่ง</th>
                <th className="px-3 py-2 font-medium">แผนก</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => mayManage && setEditing(row)}
                  className={
                    mayManage
                      ? "tappable cursor-pointer border-t border-border active:bg-muted"
                      : "border-t border-border"
                  }
                >
                  <td className="px-3 py-3">
                    <p className="font-medium">{profileFullName(row)}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  </td>
                  <td className="px-3 py-3">{roleLabels(row.roles)}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {row.positionTitleIds.length
                      ? row.positionTitleIds.map((id) => titleName.get(id) ?? "—").join(", ")
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {row.department_id ? (deptName.get(row.department_id) ?? "—") : "ทุกแผนก"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        row.is_active
                          ? "rounded-full bg-success/15 px-2 py-0.5 text-xs text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {row.is_active ? "ใช้งาน" : "ปิด"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

/** Role + position-title checkboxes, shared by the edit and create sheets. */
function RolePicker({
  roles,
  positionTitleIds,
  positionTitles,
  onToggleRole,
  onToggleTitle,
}: {
  roles: Role[];
  positionTitleIds: string[];
  positionTitles: PositionTitle[];
  onToggleRole: (role: Role, checked: boolean) => void;
  onToggleTitle: (titleId: string, checked: boolean) => void;
}) {
  return (
    <>
      <Field label="สิทธิ์">
        <div className="space-y-1.5">
          {BASE_ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={roles.includes(r)}
                onChange={(e) => onToggleRole(r, e.target.checked)}
                className="h-5 w-5 accent-[hsl(var(--accent))]"
              />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
      </Field>

      <Field label="ตำแหน่งหัวหน้างาน (แผนกตัวเอง)">
        <div className="space-y-1.5">
          {positionTitles.map((t) => (
            <label key={t.id} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={positionTitleIds.includes(t.id)}
                onChange={(e) => onToggleTitle(t.id, e.target.checked)}
                className="h-5 w-5 accent-[hsl(var(--accent))]"
              />
              {t.name}
            </label>
          ))}
        </div>
      </Field>
    </>
  );
}

function PrefixNameFields({
  prefix,
  firstName,
  lastName,
  onChange,
}: {
  prefix: string | null;
  firstName: string;
  lastName: string;
  onChange: (patch: { prefix?: string | null; first_name?: string; last_name?: string }) => void;
}) {
  return (
    <>
      <Field label="คำนำหน้า">
        <Select value={prefix ?? ""} onChange={(e) => onChange({ prefix: e.target.value || null })}>
          <option value="">— ไม่ระบุ —</option>
          {PREFIXES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ชื่อ">
          <Input value={firstName} onChange={(e) => onChange({ first_name: e.target.value })} required />
        </Field>
        <Field label="นามสกุล">
          <Input value={lastName} onChange={(e) => onChange({ last_name: e.target.value })} required />
        </Field>
      </div>
    </>
  );
}

function EditUserSheet({ profile, onClose }: { profile: ProfileRow | null; onClose: () => void }) {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const { data: positionTitles = [] } = usePositionTitles();
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<ProfileEdit | null>(null);

  // draft is cleared on close, so a freshly opened row always starts from its
  // own values rather than the previously edited row's.
  const current: ProfileEdit | null = draft ?? (profile ? pickEditable(profile) : null);

  function toggleRole(role: Role, checked: boolean) {
    if (!current) return;
    const roles = checked ? [...current.roles, role] : current.roles.filter((r) => r !== role);
    setDraft({ ...current, roles });
  }

  function toggleTitle(titleId: string, checked: boolean) {
    if (!current) return;
    const positionTitleIds = checked
      ? [...current.positionTitleIds, titleId]
      : current.positionTitleIds.filter((t) => t !== titleId);
    setDraft({ ...current, positionTitleIds });
  }

  function save() {
    if (!profile || !current) return;
    update.mutate({ id: profile.id, ...current });
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
          <PrefixNameFields
            prefix={current.prefix}
            firstName={current.first_name}
            lastName={current.last_name}
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

          <Field label="เลขบัตรประชาชน">
            <Input
              value={current.national_id ?? ""}
              onChange={(e) => setDraft({ ...current, national_id: e.target.value || null })}
            />
          </Field>

          <Field label="วันเดือนปีเกิด">
            <Input
              type="date"
              value={current.date_of_birth ?? ""}
              onChange={(e) => setDraft({ ...current, date_of_birth: e.target.value || null })}
            />
          </Field>

          <RolePicker
            roles={current.roles}
            positionTitleIds={current.positionTitleIds}
            positionTitles={positionTitles}
            onToggleRole={toggleRole}
            onToggleTitle={toggleTitle}
          />

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

          <label className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">เปิดใช้งานบัญชี</span>
            <input
              type="checkbox"
              checked={current.is_active}
              onChange={(e) => setDraft({ ...current, is_active: e.target.checked })}
              className="h-6 w-6 accent-[hsl(var(--accent))]"
            />
          </label>
        </div>
      )}
    </Sheet>
  );
}

function blankInvite(departmentId: string | null): UserInvite {
  return {
    kind: "staff",
    loginId: "",
    password: "",
    prefix: null,
    first_name: "",
    last_name: "",
    email: null,
    national_id: null,
    date_of_birth: null,
    department_id: departmentId,
    roles: [],
    positionTitleIds: [],
  };
}

/** Staff/teacher/etc. only — student logins are created from the Roster page instead. */
function CreateUserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const { data: positionTitles = [] } = usePositionTitles();
  const invite = useInviteUsers();
  const [draft, setDraft] = useState<UserInvite>(() => blankInvite(me?.department_id ?? null));
  const [failReason, setFailReason] = useState<string | null>(null);

  function toggleRole(role: Role, checked: boolean) {
    setDraft((d) => ({
      ...d,
      roles: checked ? [...d.roles, role] : d.roles.filter((r) => r !== role),
    }));
  }

  function toggleTitle(titleId: string, checked: boolean) {
    setDraft((d) => ({
      ...d,
      positionTitleIds: checked
        ? [...d.positionTitleIds, titleId]
        : d.positionTitleIds.filter((t) => t !== titleId),
    }));
  }

  function close() {
    setDraft(blankInvite(me?.department_id ?? null));
    setFailReason(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFailReason(null);
    const outcome = await invite.mutateAsync([draft]);
    if (outcome.inserted > 0) {
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
      description="เบอร์โทรเป็นรหัสผู้ใช้เข้าระบบ — ตั้งรหัสผ่านให้ตรงนี้เลย"
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
      <form id="create-user" onSubmit={submit} className="space-y-4">
        <Field label="เบอร์โทร (รหัสผู้ใช้)">
          <Input
            type="tel"
            value={draft.loginId}
            onChange={(e) => setDraft({ ...draft, loginId: e.target.value })}
            required
          />
        </Field>

        <Field label="รหัสผ่าน">
          <Input
            type="password"
            value={draft.password}
            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            minLength={8}
            required
          />
        </Field>

        <PrefixNameFields
          prefix={draft.prefix}
          firstName={draft.first_name}
          lastName={draft.last_name}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
        />

        <Field label="อีเมล (ข้อมูลติดต่อ ไม่บังคับ)">
          <Input
            type="email"
            value={draft.email ?? ""}
            onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
          />
        </Field>

        <Field label="เลขบัตรประชาชน (ใช้ยืนยันตอนลืมรหัสผ่าน)">
          <Input
            value={draft.national_id ?? ""}
            onChange={(e) => setDraft({ ...draft, national_id: e.target.value || null })}
            required
          />
        </Field>

        <Field label="วันเดือนปีเกิด">
          <Input
            type="date"
            value={draft.date_of_birth ?? ""}
            onChange={(e) => setDraft({ ...draft, date_of_birth: e.target.value || null })}
            required
          />
        </Field>

        <RolePicker
          roles={draft.roles}
          positionTitleIds={draft.positionTitleIds}
          positionTitles={positionTitles}
          onToggleRole={toggleRole}
          onToggleTitle={toggleTitle}
        />

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
    roles: p.roles.filter((r) => r !== "dept_head"),
    positionTitleIds: p.positionTitleIds,
  };
}
