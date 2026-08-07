import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import {
  useDepartments,
  useProfiles,
  useUpdateProfile,
  type ProfileEdit,
  type ProfileFilters,
} from "@/hooks/useProfiles";
import type { Profile } from "@/lib/database.types";
import { isOrgWide, ROLE_LABEL, ROLES, type Role } from "@/lib/roles";

const EMPTY: ProfileFilters = { search: "", departmentId: "", role: "", active: "" };

export function Users() {
  const { profile: me } = useAuth();
  const [filters, setFilters] = useState<ProfileFilters>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const { data: departments = [] } = useDepartments();
  const { data: rows, isLoading, error } = useProfiles(filters);

  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const activeFilterCount = [filters.departmentId, filters.role, filters.active].filter(
    Boolean,
  ).length;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">ผู้ใช้งาน</h2>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="ค้นหาชื่อหรืออีเมล"
            className="pl-9"
            type="search"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => setFiltersOpen(true)} aria-label="ตัวกรอง">
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

      {error && (
        <Card className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</Card>
      )}

      {rows && rows.length === 0 && (
        <Card className="py-10 text-center text-sm text-muted-foreground">ไม่พบผู้ใช้งาน</Card>
      )}

      {rows && rows.length > 0 && (
        // Table stays a table on mobile; the wrapper scrolls sideways so the
        // page body never does.
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ชื่อ</th>
                <th className="px-3 py-2 font-medium">สิทธิ์</th>
                <th className="px-3 py-2 font-medium">แผนก</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setEditing(row)}
                  className="tappable cursor-pointer border-t border-border active:bg-muted"
                >
                  <td className="px-3 py-3">
                    <p className="font-medium">{row.full_name}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  </td>
                  <td className="px-3 py-3">{ROLE_LABEL[row.role]}</td>
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

      <EditUserSheet profile={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EditUserSheet({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<ProfileEdit | null>(null);

  // draft is cleared on close, so a freshly opened row always starts from its
  // own values rather than the previously edited row's.
  const current: ProfileEdit | null = draft ?? (profile ? pickEditable(profile) : null);

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
      description={profile?.full_name}
    >
      {profile && current && (
        <div className="space-y-4">
          <Field label="ชื่อ-นามสกุล">
            <Input
              value={current.full_name}
              onChange={(e) => setDraft({ ...current, full_name: e.target.value })}
            />
          </Field>

          <Field label="อีเมล">
            <Input
              type="email"
              value={current.email ?? ""}
              onChange={(e) => setDraft({ ...current, email: e.target.value || null })}
            />
          </Field>

          <Field label="เบอร์โทร">
            <Input
              type="tel"
              value={current.phone ?? ""}
              onChange={(e) => setDraft({ ...current, phone: e.target.value || null })}
            />
          </Field>

          <Field label="สิทธิ์">
            <Select
              value={current.role}
              onChange={(e) => setDraft({ ...current, role: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>

          {me && isOrgWide(me.role) && (
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

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={close}>
              ยกเลิก
            </Button>
            <Button className="flex-1" onClick={save}>
              บันทึก
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function pickEditable(p: Profile): ProfileEdit {
  return {
    full_name: p.full_name,
    email: p.email,
    phone: p.phone,
    role: p.role,
    department_id: p.department_id,
    is_active: p.is_active,
  };
}
