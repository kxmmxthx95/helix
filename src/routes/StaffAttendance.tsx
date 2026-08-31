import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Card, EmptyState, Input, Select, Skeleton } from "@/components/ui";
import { bangkokTime } from "@/routes/TimeTracking";
import { STATUS_LABEL, STATUS_STYLE } from "@/routes/Attendance";
import { summarizeAttendance } from "@/hooks/useAttendance";
import { useStaffAttendanceRange } from "@/hooks/useStaffAttendance";
import { useDepartments, useProfiles } from "@/hooks/useProfiles";
import { profileFullName, type AttendanceStatus } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

const todayIso = () => new Date().toISOString().slice(0, 10);
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("th-TH", { month: "long" }).format(new Date(2000, i, 1)),
);
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];

type View = "roster" | "summary";

export function StaffAttendance() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>("roster");
  const [departmentId, setDepartmentId] = useState("");
  const { data: departments = [] } = useDepartments();

  if (!profile) return null;
  if (!canManage(profile.roles)) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }
  const orgWide = isOrgWide(profile.roles);

  return (
    <div className="page-fill">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-40" value={view} onChange={(e) => setView(e.target.value as View)}>
          <option value="roster">รายวัน</option>
          <option value="summary">สรุปรายเดือน</option>
        </Select>
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

      {view === "roster" ? <RosterView departmentId={departmentId} /> : <SummaryView departmentId={departmentId} />}
    </div>
  );
}

function useNameById(departmentId: string) {
  const { data: profiles = [] } = useProfiles({ search: "", departmentId, role: "", active: "true" });
  return useMemo(() => new Map(profiles.map((p) => [p.id, profileFullName(p)])), [profiles]);
}

function RosterView({ departmentId }: { departmentId: string }) {
  const [date, setDate] = useState(todayIso());
  const { data: rows = [], isLoading } = useStaffAttendanceRange(date, date);
  const nameById = useNameById(departmentId);

  const visible = rows.filter((r) => nameById.has(r.profile_id));

  return (
    <div className="space-y-3">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" aria-label="วันที่" />

      {isLoading && (
        <div className="overflow-hidden rounded-lg border border-border bg-card" role="status" aria-label="กำลังโหลด">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ชื่อ</th>
                <th className="px-3 py-2 font-medium">เข้างาน</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-24" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-12" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-12 rounded-full" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!isLoading && visible.length === 0 && (
        <EmptyState title="ไม่มีข้อมูล" description="อาจเป็นวันหยุด หรือไม่มีพนักงานที่ต้องบันทึกเวลาในวันนี้" />
      )}
      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ชื่อ</th>
                <th className="px-3 py-2 font-medium">เข้างาน</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.profile_id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{nameById.get(r.profile_id) ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {r.clock_in_time ? bangkokTime(r.clock_in_time) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px]", STATUS_STYLE[r.status])}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryView({ departmentId }: { departmentId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear() + 543); // พ.ศ.
  const [month, setMonth] = useState(now.getMonth() + 1);
  const ceYear = year - 543;
  const startDate = `${ceYear}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${ceYear}-${String(month).padStart(2, "0")}-${String(daysInMonth(ceYear, month)).padStart(2, "0")}`;
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() + 543 - i);

  const { data: rows = [], isLoading } = useStaffAttendanceRange(startDate, endDate);
  const nameById = useNameById(departmentId);

  const byProfile = useMemo(() => {
    const map = new Map<string, { status: AttendanceStatus }[]>();
    for (const r of rows) {
      if (!nameById.has(r.profile_id)) continue;
      const arr = map.get(r.profile_id) ?? [];
      arr.push(r);
      map.set(r.profile_id, arr);
    }
    return map;
  }, [rows, nameById]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select className="w-32" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </Select>
        <Select className="w-24" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && (
        <div className="overflow-hidden rounded-lg border border-border bg-card" role="status" aria-label="กำลังโหลด">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ชื่อ</th>
                {STATUS_ORDER.map((st) => (
                  <th key={st} className="px-3 py-2 text-right font-medium">
                    {STATUS_LABEL[st]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-24" />
                  </td>
                  {STATUS_ORDER.map((st) => (
                    <td key={st} className="px-3 py-2 text-right">
                      <Skeleton className="ml-auto h-3 w-6" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!isLoading && byProfile.size === 0 && (
        <EmptyState title="ไม่มีข้อมูล" description="ไม่มีข้อมูลการมาทำงานในเดือนนี้" />
      )}
      {byProfile.size > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ชื่อ</th>
                {STATUS_ORDER.map((st) => (
                  <th key={st} className="px-3 py-2 text-right font-medium">
                    {STATUS_LABEL[st]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...byProfile.entries()].map(([profileId, records]) => {
                const counts = summarizeAttendance(records);
                return (
                  <tr key={profileId} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{nameById.get(profileId) ?? "—"}</td>
                    {STATUS_ORDER.map((st) => (
                      <td key={st} className="px-3 py-2 text-right tabular-nums">
                        {counts[st]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
