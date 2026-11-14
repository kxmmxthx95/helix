import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { PencilIcon } from "@/components/icons";
import { Avatar, Button, Card, EmptyState, Field, Input, Select, Skeleton, Spinner } from "@/components/ui";
import { bangkokTime } from "@/routes/TimeTracking";
import { STATUS_LABEL } from "@/routes/Attendance";
import { summarizeAttendance } from "@/hooks/useAttendance";
import {
  useClearStaffAttendanceOverride,
  useSetStaffAttendanceOverride,
  useStaffAttendanceRange,
} from "@/hooks/useStaffAttendance";
import { useDepartments, useProfiles } from "@/hooks/useProfiles";
import { avatarUrl } from "@/hooks/useAvatar";
import { profileFullName, type AttendanceStatus, type Profile, type StaffAttendanceStatusRow } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn, todayIso } from "@/lib/utils";

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("th-TH", { month: "long" }).format(new Date(2000, i, 1)),
);
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
/** Badge นุ่ม (พื้นจาง + จุดสี) เหมือนสถานะในหน้ารายชื่อนักเรียน */
const BADGE: Record<AttendanceStatus, { pill: string; dot: string }> = {
  present: { pill: "bg-success/10 text-success", dot: "bg-success" },
  late: { pill: "bg-warning/10 text-warning", dot: "bg-warning" },
  absent: { pill: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  leave: { pill: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" },
};
const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];

type View = "roster" | "summary";

export function StaffAttendance() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>("roster");
  const [date, setDate] = useState(todayIso());
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear() + 543); // พ.ศ.
  const [month, setMonth] = useState(now.getMonth() + 1);
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() + 543 - i);
  const [departmentId, setDepartmentId] = useState("");
  const { data: departments = [] } = useDepartments();

  if (!profile) return null;
  if (!canManage(profile.roles)) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }
  const orgWide = isOrgWide(profile.roles);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-40" value={view} onChange={(e) => setView(e.target.value as View)}>
          <option value="roster">รายวัน</option>
          <option value="summary">สรุปรายเดือน</option>
        </Select>
        {view === "roster" && (
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" aria-label="วันที่" />
        )}
        {view === "summary" && (
          <>
            <Select className="w-32" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} aria-label="เดือน">
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </Select>
            <Select className="w-24" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} aria-label="ปี">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </>
        )}
        {orgWide && (
          <Select
            className="ml-auto w-48"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
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

      {view === "roster" ? <RosterView departmentId={departmentId} date={date} /> : <SummaryView departmentId={departmentId} year={year} month={month} />}
    </div>
  );
}

function useProfileById(departmentId: string) {
  const { data: profiles = [] } = useProfiles({ search: "", departmentId, role: "", active: "true" });
  return useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
}

function NameCell({ profile }: { profile?: Profile }) {
  const name = profile ? profileFullName(profile) : "—";
  return (
    <td className="px-4 py-0">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={name} src={profile ? avatarUrl(profile) : null} className="h-9 w-9 text-xs" />
        <span className="truncate text-sm font-medium">{name}</span>
      </div>
    </td>
  );
}

function RosterView({ departmentId, date }: { departmentId: string; date: string }) {
  const { data: rows = [], isLoading } = useStaffAttendanceRange(date, date);
  const profileById = useProfileById(departmentId);

  const visible = rows.filter((r) => profileById.has(r.profile_id));
  const [editing, setEditing] = useState<StaffAttendanceStatusRow | null>(null);

  return (
    <div className={cn("flex flex-col gap-3", !isLoading && visible.length === 0 && "flex-1")}>
      <EditStatusSheet
        row={editing}
        name={editing ? profileFullName(profileById.get(editing.profile_id) ?? ({} as Profile)) : ""}
        onClose={() => setEditing(null)}
      />
      {isLoading && (
        <div className="table-panel rounded-none border-t border-border shadow-none" role="status" aria-label="กำลังโหลด"><div className="table-panel-scroll scrollbar-hidden">
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-4 py-3">ชื่อ</th>
                <th className="px-4 py-3">เข้างาน</th>
                <th className="px-4 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="h-12 border-t border-border first:border-t-0">
                  <td className="px-4 py-0">
                    <div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-3 w-24" /></div>
                  </td>
                  <td className="px-4 py-0">
                    <Skeleton className="h-3 w-12" />
                  </td>
                  <td className="px-4 py-0">
                    <Skeleton className="h-4 w-12 rounded-full" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {!isLoading && visible.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่มีข้อมูล" description="อาจเป็นวันหยุด หรือไม่มีพนักงานที่ต้องบันทึกเวลาในวันนี้" />
        </div>
      )}
      {visible.length > 0 && (
        <div className="table-panel rounded-none border-t border-border shadow-none"><div className="table-panel-scroll scrollbar-hidden">
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-4 py-3">ชื่อ</th>
                <th className="px-4 py-3">เข้างาน</th>
                <th className="px-4 py-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.profile_id} className="h-12 border-t border-border first:border-t-0">
                  <NameCell profile={profileById.get(r.profile_id)} />
                  <td className="px-4 py-0 text-muted-foreground tabular-nums">
                    {r.clock_in_time ? bangkokTime(r.clock_in_time) : "—"}
                  </td>
                  <td className="px-4 py-0">
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      title={r.overridden ? `แก้เอง: ${r.override_reason ?? ""}` : "เปลี่ยนสถานะ"}
                      className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {r.status ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                            BADGE[r.status].pill,
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", BADGE[r.status].dot)} />
                          {STATUS_LABEL[r.status]}
                          {r.overridden && <PencilIcon className="h-3 w-3" aria-label="แก้เอง" />}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </div>
  );
}

const EDIT_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];

function EditStatusSheet({
  row,
  name,
  onClose,
}: {
  row: StaffAttendanceStatusRow | null;
  name: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const set = useSetStaffAttendanceOverride();
  const clear = useClearStaffAttendanceOverride();
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [reason, setReason] = useState("");

  // reset form each time a different row opens
  const key = row ? `${row.profile_id}|${row.date}` : "";
  const [loadedKey, setLoadedKey] = useState("");
  if (key !== loadedKey) {
    setLoadedKey(key);
    setStatus(row?.status ?? "present");
    setReason(row?.override_reason ?? "");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!row || !reason.trim()) return;
    set.mutate(
      { profileId: row.profile_id, date: row.date, status, reason: reason.trim() },
      {
        onSuccess: () => {
          toast("เปลี่ยนสถานะแล้ว");
          onClose();
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={row !== null}
      onOpenChange={(o) => !o && onClose()}
      title="เปลี่ยนสถานะการมาทำงาน"
      description={row ? `${name} · ${row.date}` : undefined}
      bottomOnPhone
      footer={
        <div className="flex gap-2">
          {row?.overridden && (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={clear.isPending}
              onClick={() =>
                clear.mutate(
                  { profileId: row.profile_id, date: row.date },
                  {
                    onSuccess: () => {
                      toast("คืนค่าอัตโนมัติแล้ว");
                      onClose();
                    },
                    onError: (err) => toast(err instanceof Error ? err.message : "ไม่สำเร็จ", "error"),
                  },
                )
              }
            >
              {clear.isPending ? <Spinner className="h-3 w-3" /> : "คืนค่าอัตโนมัติ"}
            </Button>
          )}
          <Button type="submit" form="staff-status-edit" className="flex-1" disabled={!reason.trim() || set.isPending}>
            {set.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
          </Button>
        </div>
      }
    >
      <form id="staff-status-edit" className="space-y-3" onSubmit={save}>
        <Field label="สถานะ">
          <Select value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
            {EDIT_ORDER.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABEL[st]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="เหตุผล" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ลืมสแกน, ไปราชการ" />
        </Field>
      </form>
    </Sheet>
  );
}

function SummaryView({ departmentId, year, month }: { departmentId: string; year: number; month: number }) {
  const ceYear = year - 543;
  const startDate = `${ceYear}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${ceYear}-${String(month).padStart(2, "0")}-${String(daysInMonth(ceYear, month)).padStart(2, "0")}`;

  const { data: rows = [], isLoading } = useStaffAttendanceRange(startDate, endDate);
  const profileById = useProfileById(departmentId);

  const byProfile = useMemo(() => {
    const map = new Map<string, { status: AttendanceStatus | null }[]>();
    for (const r of rows) {
      if (!profileById.has(r.profile_id)) continue;
      const arr = map.get(r.profile_id) ?? [];
      arr.push(r);
      map.set(r.profile_id, arr);
    }
    return map;
  }, [rows, profileById]);

  return (
    <div className="space-y-3">
      {isLoading && (
        <div className="table-panel rounded-none border-t border-border shadow-none" role="status" aria-label="กำลังโหลด"><div className="table-panel-scroll scrollbar-hidden">
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-4 py-3">ชื่อ</th>
                {STATUS_ORDER.map((st) => (
                  <th key={st} className="px-4 py-3 text-right">
                    {STATUS_LABEL[st]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="h-12 border-t border-border first:border-t-0">
                  <td className="px-4 py-0">
                    <div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-3 w-24" /></div>
                  </td>
                  {STATUS_ORDER.map((st) => (
                    <td key={st} className="px-4 py-0 text-right">
                      <Skeleton className="ml-auto h-3 w-6" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {!isLoading && byProfile.size === 0 && (
        <EmptyState title="ไม่มีข้อมูล" description="ไม่มีข้อมูลการมาทำงานในเดือนนี้" />
      )}
      {byProfile.size > 0 && (
        <div className="table-panel rounded-none border-t border-border shadow-none"><div className="table-panel-scroll scrollbar-hidden">
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-4 py-3">ชื่อ</th>
                {STATUS_ORDER.map((st) => (
                  <th key={st} className="px-4 py-3 text-right">
                    {STATUS_LABEL[st]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...byProfile.entries()].map(([profileId, records]) => {
                const counts = summarizeAttendance(records);
                return (
                  <tr key={profileId} className="h-12 border-t border-border first:border-t-0">
                    <NameCell profile={profileById.get(profileId)} />
                    {STATUS_ORDER.map((st) => (
                      <td key={st} className="px-4 py-0 text-right tabular-nums">
                        {counts[st]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></div>
      )}
    </div>
  );
}
