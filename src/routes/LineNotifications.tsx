import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Search } from "@/components/icons";
import { useToast } from "@/components/Toast";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Pagination,
  Select,
  Skeleton,
  Spinner,
  Switch,
} from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
import { useSetLineNotificationsEnabled } from "@/hooks/useLineLink";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments, useProfiles, type ProfileFilters } from "@/hooks/useProfiles";
import {
  useDepartmentSettings,
  useSchoolSettings,
  useUpdateDepartmentSettings,
  useUpdateSchoolSettings,
  type DepartmentSettingsEdit,
  type SchoolSettingsEdit,
} from "@/hooks/useSettings";
import { profileFullName } from "@/lib/database.types";
import { canManage, isOrgWide, roleLabels } from "@/lib/roles";

function LineDigestOrgCard() {
  const toast = useToast();
  const { data: settings, isLoading } = useSchoolSettings();
  const update = useUpdateSchoolSettings();
  const [form, setForm] = useState<Pick<
    SchoolSettingsEdit,
    "attendance_digest_time" | "staff_attendance_digest_time"
  > | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        attendance_digest_time: settings.attendance_digest_time,
        staff_attendance_digest_time: settings.staff_attendance_digest_time,
      });
    }
  }, [settings]);

  if (isLoading || !form) {
    return (
      <Card className="space-y-3" role="status" aria-label="กำลังโหลด">
        <Skeleton className="h-3.5 w-56" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="h-9 w-20" />
      </Card>
    );
  }

  return (
    <Card className="space-y-2">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(form, { onSuccess: () => toast("บันทึกสำเร็จ") });
        }}
      >
        <div>
          <p className="text-sm font-medium">สรุปสถิติรายวัน (ภาพรวมทั้งโรงเรียน)</p>
          <p className="text-xs text-muted-foreground">
            ไม่กำหนดเวลา = ปิดการแจ้งเตือน — ส่งให้ผู้บริหารระดับโรงเรียนเมื่อถึงเวลานี้ (คลาดเคลื่อนได้ถึง 5 นาที)
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="สรุปการมาเรียนนักเรียน">
            <Input
              type="time"
              value={form.attendance_digest_time ?? ""}
              onChange={(e) => setForm({ ...form, attendance_digest_time: e.target.value || null })}
            />
          </Field>
          <Field label="สรุปการเข้างานบุคลากร">
            <Input
              type="time"
              value={form.staff_attendance_digest_time ?? ""}
              onChange={(e) =>
                setForm({ ...form, staff_attendance_digest_time: e.target.value || null })
              }
            />
          </Field>
        </div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
        </Button>
      </form>
    </Card>
  );
}

function LineDigestDeptCard({ departmentId }: { departmentId: string }) {
  const toast = useToast();
  const { data: settings, isLoading } = useDepartmentSettings(departmentId);
  const update = useUpdateDepartmentSettings(departmentId);
  const [form, setForm] = useState<Pick<
    DepartmentSettingsEdit,
    "attendance_digest_time" | "staff_attendance_digest_time"
  > | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        attendance_digest_time: settings.attendance_digest_time,
        staff_attendance_digest_time: settings.staff_attendance_digest_time,
      });
    }
  }, [settings]);

  if (isLoading || !form) {
    return (
      <Card className="space-y-3" role="status" aria-label="กำลังโหลด">
        <Skeleton className="h-3.5 w-40" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="h-9 w-20" />
      </Card>
    );
  }

  return (
    <Card className="space-y-2">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(form, { onSuccess: () => toast("บันทึกสำเร็จ") });
        }}
      >
        <div>
          <p className="text-sm font-medium">สรุปสถิติรายวัน (เฉพาะแผนกนี้)</p>
          <p className="text-xs text-muted-foreground">
            ไม่กำหนดเวลา = ปิดการแจ้งเตือน — ส่งให้ผู้บริหารแผนกเมื่อถึงเวลานี้ (คลาดเคลื่อนได้ถึง 5 นาที)
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="สรุปการมาเรียนนักเรียน">
            <Input
              type="time"
              value={form.attendance_digest_time ?? ""}
              onChange={(e) => setForm({ ...form, attendance_digest_time: e.target.value || null })}
            />
          </Field>
          <Field label="สรุปการเข้างานบุคลากร">
            <Input
              type="time"
              value={form.staff_attendance_digest_time ?? ""}
              onChange={(e) =>
                setForm({ ...form, staff_attendance_digest_time: e.target.value || null })
              }
            />
          </Field>
        </div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
        </Button>
      </form>
    </Card>
  );
}

const EMPTY_FILTERS: ProfileFilters = { search: "", departmentId: "", role: "", active: "" };

function LineNotificationUsersCard({ orgWide }: { orgWide: boolean }) {
  const [filters, setFilters] = useState<ProfileFilters>(EMPTY_FILTERS);
  const { data: departments = [] } = useDepartments();
  const { data: rows, isLoading, error } = useProfiles(filters);
  const { page, setPage, pageCount, pageRows } = usePagination(rows ?? [], [filters]);
  const setEnabled = useSetLineNotificationsEnabled();

  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-medium">แจ้งเตือนไลน์รายบุคคล</p>
        <p className="text-xs text-muted-foreground">
          ปิด = ผู้ใช้จะไม่ได้รับการแจ้งเตือนไลน์ใด ๆ ทั้งหมด แม้ผูกบัญชีไลน์ไว้แล้วก็ตาม
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        {orgWide && (
          <Select
            className="w-auto min-w-[10rem]"
            value={filters.departmentId}
            onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}
            placeholder="ทุกแผนก"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {isLoading && (
        <ul className="space-y-2" role="status" aria-label="กำลังโหลด">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</p>}

      {rows && rows.length === 0 && (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่พบผู้ใช้งานตามเงื่อนไขที่เลือก" />
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          <ul className="space-y-2 lg:hidden">
            {pageRows.map((row) => {
              const name = profileFullName(row);
              return (
                <li key={row.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <Avatar name={name} src={avatarUrl(row)} className="h-8 w-8 shrink-0 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {roleLabels(row.roles.filter((r) => r !== "dept_head")) || "—"}
                      {" · "}
                      {row.line_user_id ? "เชื่อมต่อไลน์แล้ว" : "ยังไม่เชื่อมต่อไลน์"}
                    </p>
                  </div>
                  <Switch
                    size="sm"
                    checked={row.line_notifications_enabled}
                    disabled={setEnabled.isPending}
                    onChange={(enabled) => setEnabled.mutate({ profileId: row.id, enabled })}
                  />
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
                  <th className="px-3 py-2 font-medium">สถานะไลน์</th>
                  <th className="px-3 py-2 font-medium">แจ้งเตือน</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const name = profileFullName(row);
                  return (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={name} src={avatarUrl(row)} className="h-7 w-7 shrink-0 text-[10px]" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{name}</p>
                            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">{roleLabels(row.roles.filter((r) => r !== "dept_head")) || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.line_user_id ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ"}
                      </td>
                      <td className="px-3 py-2">
                        <Switch
                          size="sm"
                          checked={row.line_notifications_enabled}
                          disabled={setEnabled.isPending}
                          onChange={(enabled) => setEnabled.mutate({ profileId: row.id, enabled })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}
    </Card>
  );
}

export function LineNotifications() {
  const { profile } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = profile ? isOrgWide(profile.roles) : false;
  const mayManage = profile ? canManage(profile.roles) : false;
  const [pickedDept, setPickedDept] = useState("");

  // Org-wide has no home department — default the picker to the first one.
  useEffect(() => {
    if (orgWide && !pickedDept && departments.length > 0) setPickedDept(departments[0]!.id);
  }, [orgWide, departments, pickedDept]);

  const deptSettingsId = orgWide ? pickedDept : profile?.department_id ?? "";

  if (!mayManage) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้</Card>;
  }

  return (
    <div className="space-y-4">
      {orgWide && <LineDigestOrgCard />}

      {orgWide && departments.length > 0 && (
        <Select
          className="w-auto min-w-[10rem]"
          value={pickedDept}
          onChange={(e) => setPickedDept(e.target.value)}
          aria-label="แผนก"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      )}
      {deptSettingsId && <LineDigestDeptCard key={deptSettingsId} departmentId={deptSettingsId} />}

      <LineNotificationUsersCard orgWide={orgWide} />
    </div>
  );
}
