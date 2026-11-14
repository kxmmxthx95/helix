import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input, Select, Skeleton, Spinner } from "@/components/ui";
import { useProfiles } from "@/hooks/useProfiles";
import { useDepartmentSettings, useSchoolSettings } from "@/hooks/useSettings";
import { StaffAttendance } from "@/routes/StaffAttendance";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import {
  useMyTimeClock,
  useDeleteTimeClockRecord,
  useRecordTimeClockForOthers,
  useTimeClockRange,
} from "@/hooks/useTimeClock";
import {
  usePendingApprovals,
  useSetPremisesExitStatus,
} from "@/hooks/usePremisesExit";
import { profileFullName } from "@/lib/database.types";
import { canManage } from "@/lib/roles";

import { todayIso } from "@/lib/utils";

/** Renders a timestamptz as Thailand wall-clock HH:MM regardless of the browser's own timezone (fixed UTC+7, no DST). */
export function bangkokTime(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type Tab = "clock" | "report";

/** หน้ารวม: tab "เวลาทำงาน" (role ที่เปิดใน time_tracking_roles) + tab "รายงานการมาทำงาน" (dept manager ขึ้นไป). */
export function TimeTracking() {
  const { profile } = useAuth();
  const { data: schoolSettings } = useSchoolSettings();
  const [params, setParams] = useSearchParams();
  if (!profile) return null;

  const tabs: { key: Tab; label: string }[] = [];
  if (profile.roles.some((r) => schoolSettings?.time_tracking_roles.includes(r)))
    tabs.push({ key: "clock", label: "เวลาทำงาน" });
  if (canManage(profile.roles)) tabs.push({ key: "report", label: "รายงานการมาทำงาน" });
  if (tabs.length === 0) return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;

  const wanted = params.get("tab");
  const active = tabs.find((t) => t.key === wanted)?.key ?? tabs[0]!.key;

  return (
    <div className="page-fill">
      {tabs.length > 1 && (
        <div role="tablist" className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={active === t.key}
              onClick={() => setParams({ tab: t.key }, { replace: true })}
              className={cn(
                "-mb-px flex-1 border-b-2 px-3 py-2 text-center text-sm",
                active === t.key
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {active === "clock" ? <ClockTab profile={profile} /> : <StaffAttendance />}
    </div>
  );
}

function ClockTab({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>["profile"]> }) {
  const mayApprove = canManage(profile.roles);

  return (
    <div className="space-y-4">
      {mayApprove && (
        <div className="flex justify-end">
          <ManualRecordButton recordedBy={profile.id} />
        </div>
      )}
      <HistoryCard profileId={profile.id} departmentId={profile.department_id} />
      {mayApprove && <ApprovalsCard approverId={profile.id} />}
    </div>
  );
}

function HistoryCard({ profileId, departmentId }: { profileId: string; departmentId: string | null }) {
  const end = todayIso();
  const start = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return d.toISOString().slice(0, 10);
  }, []);
  const { data: records = [], isLoading } = useTimeClockRange(profileId, start, end);
  const { data: deptSettings } = useDepartmentSettings(departmentId);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">ประวัติ 14 วันล่าสุด</p>
      {!isLoading && records.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ</p>
      ) : (
        <div className="table-panel rounded-none border-t border-border shadow-none" role={isLoading ? "status" : undefined} aria-label={isLoading ? "กำลังโหลด" : undefined}>
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">เข้างาน</th>
                  <th className="px-4 py-3">ออกงาน</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? [0, 1, 2, 3, 4].map((i) => (
                      <tr key={i} className="h-12 border-t border-border first:border-t-0">
                        <td className="px-4 py-0"><Skeleton className="h-3 w-20" /></td>
                        <td className="px-4 py-0"><Skeleton className="h-3 w-12" /></td>
                        <td className="px-4 py-0"><Skeleton className="h-3 w-12" /></td>
                      </tr>
                    ))
                  : records.map((r) => {
                      const late =
                        !!r.clock_in_time &&
                        !!deptSettings?.work_start_time &&
                        bangkokTime(r.clock_in_time) > deptSettings.work_start_time.slice(0, 5);
                      return (
                        <tr key={r.id} className="h-12 border-t border-border first:border-t-0">
                          <td className="px-4 py-0 tabular-nums">{r.date}</td>
                          <td className="px-4 py-0 tabular-nums">
                            {r.clock_in_time ? bangkokTime(r.clock_in_time) : "—"}
                            {late && <span className="ml-2 inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">สาย</span>}
                          </td>
                          <td className="px-4 py-0 tabular-nums">
                            {r.clock_out_time ? bangkokTime(r.clock_out_time) : "—"}
                            {r.auto_clock_out && <span className="ml-2 inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">อัตโนมัติ</span>}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalsCard({ approverId }: { approverId: string }) {
  const { data: pending = [], isLoading } = usePendingApprovals();
  const { data: profiles = [] } = useProfiles({ search: "", departmentId: "", role: "", active: "" });
  const setStatus = useSetPremisesExitStatus();
  const nameById = new Map(profiles.map((p) => [p.id, profileFullName(p)]));

  if (!isLoading && pending.length === 0) return null;

  return (
    <Card className="space-y-2">
      <p className="text-sm font-medium">รออนุมัติ ({pending.length})</p>
      {isLoading && (
        <ul className="divide-y divide-border text-sm" role="status" aria-label="กำลังโหลด">
          {[0, 1, 2].map((i) => (
            <li key={i} className="space-y-1.5 py-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
              <div className="flex gap-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ul className="divide-y divide-border text-sm">
        {pending.map((r) => (
          <li key={r.id} className="space-y-1.5 py-2">
            <p className="font-medium">{nameById.get(r.profile_id) ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              {r.reason} · ออก {bangkokTime(r.exit_time)}
              {r.no_return ? " · ไม่กลับ" : r.planned_return_time ? ` · คาดว่ากลับ ${bangkokTime(r.planned_return_time)}` : ""}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: r.id, status: "approved", approvedBy: approverId })}
              >
                อนุมัติ
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: r.id, status: "rejected", approvedBy: approverId })}
              >
                ไม่อนุมัติ
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** GPS ล่ม/ตกหล่น หรือบันทึกย้อนหลัง — ข้าม geofence check เพราะแอดมินไม่ได้อยู่ที่นั่นจริง (grill decision). */
function ManualRecordButton({ recordedBy }: { recordedBy: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data: allProfiles = [] } = useProfiles({ search: "", departmentId: "", role: "", active: "true" });
  // เฉพาะบุคลากร — ตัดบัญชีที่มีแต่ role student/parent
  const profiles = allProfiles.filter((p) => p.roles.some((r) => r !== "student" && r !== "parent"));
  const [targetId, setTargetId] = useState("");
  const [date, setDate] = useState(todayIso());
  const { data: existing } = useMyTimeClock(targetId || null, date);
  const [clockInInput, setClockInInput] = useState("");
  const [clockOutInput, setClockOutInput] = useState("");
  const record = useRecordTimeClockForOthers();
  const remove = useDeleteTimeClockRecord();

  useEffect(() => {
    setClockInInput(existing?.clock_in_time ? bangkokTime(existing.clock_in_time) : "");
    setClockOutInput(existing?.clock_out_time ? bangkokTime(existing.clock_out_time) : "");
  }, [existing]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) return;
    record.mutate(
      {
        profileId: targetId,
        date,
        clockInTime: clockInInput ? `${date}T${clockInInput}:00+07:00` : null,
        clockOutTime: clockOutInput ? `${date}T${clockOutInput}:00+07:00` : null,
        recordedBy,
      },
      {
        onSuccess: () => toast("บันทึกแทนสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        บันทึกเวลาแทน
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="บันทึกเวลาแทน"
        description="สำหรับกรณี GPS มีปัญหา หรือบันทึกย้อนหลัง"
        bottomOnPhone
        footer={
          <div className="flex gap-2">
            {existing && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (!confirm("ลบรายการลงเวลาของวันนี้ทั้งหมดหรือไม่? การลบจะถูกบันทึกในประวัติระบบ")) return;
                  remove.mutate(
                    { profileId: targetId, date },
                    {
                      onSuccess: () => toast("ลบรายการลงเวลาแล้ว"),
                      onError: (err) => toast(err instanceof Error ? err.message : "ลบไม่สำเร็จ", "error"),
                    },
                  );
                }}
              >
                {remove.isPending ? <Spinner className="h-3 w-3" /> : "ลบรายการ"}
              </Button>
            )}
            <Button type="submit" form="manual-time-record" className="flex-1" disabled={!targetId || record.isPending}>
              {record.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
            </Button>
          </div>
        }
      >
        <form id="manual-time-record" className="space-y-3" onSubmit={submit}>
          <Field label="บุคลากร">
            <Select value={targetId} onChange={(e) => setTargetId(e.target.value)} required placeholder="เลือกบุคลากร">
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {profileFullName(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="วันที่">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="เวลาเข้างาน">
              <Input type="time" value={clockInInput} onChange={(e) => setClockInInput(e.target.value)} />
            </Field>
            <Field label="เวลาออกงาน">
              <Input type="time" value={clockOutInput} onChange={(e) => setClockOutInput(e.target.value)} />
            </Field>
          </div>
        </form>
      </Sheet>
    </>
  );
}
