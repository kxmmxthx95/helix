import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { useProfiles } from "@/hooks/useProfiles";
import { useDepartmentSettings } from "@/hooks/useSettings";
import {
  useClockIn,
  useClockOut,
  useMyTimeClock,
  useRecordTimeClockForOthers,
  useTimeClockRange,
} from "@/hooks/useTimeClock";
import {
  useConfirmReturn,
  usePendingApprovals,
  useRequestPremisesExit,
  useSetPremisesExitStatus,
  useTodayPremisesExits,
} from "@/hooks/usePremisesExit";
import { profileFullName, type PremisesExitStatus } from "@/lib/database.types";
import { canManage } from "@/lib/roles";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Renders a timestamptz as Thailand wall-clock HH:MM regardless of the browser's own timezone (fixed UTC+7, no DST). */
function bangkokTime(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const STATUS_LABEL: Record<PremisesExitStatus, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
};

export function TimeTracking() {
  const { profile } = useAuth();
  if (!profile) return null;
  const date = todayIso();
  const mayApprove = canManage(profile.roles);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <MyClockCard profileId={profile.id} departmentId={profile.department_id} date={date} />
      <PremisesExitCard profileId={profile.id} date={date} />
      <HistoryCard profileId={profile.id} departmentId={profile.department_id} />
      {mayApprove && <ApprovalsCard approverId={profile.id} />}
      {mayApprove && <ManualRecordCard recordedBy={profile.id} />}
    </div>
  );
}

function MyClockCard({
  profileId,
  departmentId,
  date,
}: {
  profileId: string;
  departmentId: string | null;
  date: string;
}) {
  const toast = useToast();
  const { data: record, isLoading } = useMyTimeClock(profileId, date);
  const { data: deptSettings } = useDepartmentSettings(departmentId);
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const late =
    !!record?.clock_in_time &&
    !!deptSettings?.work_start_time &&
    bangkokTime(record.clock_in_time) > deptSettings.work_start_time.slice(0, 5);

  function onClockIn() {
    clockIn.mutate(
      { profileId, departmentId, date },
      {
        onSuccess: () => toast("บันทึกเวลาเข้างานสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  function onClockOut() {
    clockOut.mutate(
      { profileId, departmentId, date },
      {
        onSuccess: () => toast("บันทึกเวลาออกงานสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm font-medium">เวลาทำงานวันนี้</p>
      {isLoading ? (
        <Spinner className="h-4 w-4 text-muted-foreground" />
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">เข้างาน</p>
            <p className="text-lg font-semibold">
              {record?.clock_in_time ? bangkokTime(record.clock_in_time) : "—"}
              {late && (
                <span className="ml-1.5 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-normal text-warning">
                  สาย
                </span>
              )}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">ออกงาน</p>
            <p className="text-lg font-semibold">
              {record?.clock_out_time ? bangkokTime(record.clock_out_time) : "—"}
            </p>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!!record?.clock_in_time || clockIn.isPending} onClick={onClockIn}>
          {clockIn.isPending ? <Spinner className="h-3.5 w-3.5" /> : "เข้างาน"}
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          disabled={!record?.clock_in_time || !!record?.clock_out_time || clockOut.isPending}
          onClick={onClockOut}
        >
          {clockOut.isPending ? <Spinner className="h-3.5 w-3.5" /> : "ออกงาน"}
        </Button>
      </div>
    </Card>
  );
}

function PremisesExitCard({ profileId, date }: { profileId: string; date: string }) {
  const toast = useToast();
  const { data: requests = [], isLoading } = useTodayPremisesExits(profileId, date);
  const request = useRequestPremisesExit();
  const confirmReturn = useConfirmReturn();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    request.mutate(
      { profileId, date, reason: reason.trim() },
      {
        onSuccess: () => {
          toast("ส่งคำขอออกนอกโรงเรียนสำเร็จ");
          setReason("");
          setOpen(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">ขอออกนอกโรงเรียน</p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          + ขอออก
        </Button>
      </div>

      {isLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
      {!isLoading && requests.length === 0 && (
        <p className="text-xs text-muted-foreground">ยังไม่มีคำขอวันนี้</p>
      )}
      {requests.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate">{r.reason}</p>
                <p className="text-xs text-muted-foreground">
                  ออก {bangkokTime(r.exit_time)}
                  {r.return_time ? ` · กลับ ${bangkokTime(r.return_time)}` : ""} · {STATUS_LABEL[r.status]}
                </p>
              </div>
              {!r.return_time && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => confirmReturn.mutate(r.id)}
                  disabled={confirmReturn.isPending}
                >
                  กลับมาแล้ว
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="ขอออกนอกโรงเรียน"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              type="submit"
              form="request-premises-exit"
              className="flex-1"
              disabled={!reason.trim() || request.isPending}
            >
              {request.isPending ? <Spinner className="h-3 w-3" /> : "ส่งคำขอ"}
            </Button>
          </div>
        }
      >
        <form id="request-premises-exit" className="space-y-4" onSubmit={submit}>
          <Field label="เหตุผล">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              autoFocus
              placeholder="เช่น ไปธนาคาร"
            />
          </Field>
        </form>
      </Sheet>
    </Card>
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
    <Card className="space-y-2">
      <p className="text-sm font-medium">ประวัติ 14 วันล่าสุด</p>
      {isLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
      {!isLoading && records.length === 0 && (
        <p className="text-xs text-muted-foreground">ยังไม่มีประวัติ</p>
      )}
      {records.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">วันที่</th>
                <th className="py-1 pr-2 font-medium">เข้างาน</th>
                <th className="py-1 font-medium">ออกงาน</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const late =
                  !!r.clock_in_time &&
                  !!deptSettings?.work_start_time &&
                  bangkokTime(r.clock_in_time) > deptSettings.work_start_time.slice(0, 5);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-1.5 pr-2 tabular-nums">{r.date}</td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {r.clock_in_time ? bangkokTime(r.clock_in_time) : "—"}
                      {late && <span className="ml-1 text-warning">สาย</span>}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {r.clock_out_time ? bangkokTime(r.clock_out_time) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
      {isLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
      <ul className="divide-y divide-border text-sm">
        {pending.map((r) => (
          <li key={r.id} className="space-y-1.5 py-2">
            <p className="font-medium">{nameById.get(r.profile_id) ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              {r.reason} · ออก {bangkokTime(r.exit_time)}
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
function ManualRecordCard({ recordedBy }: { recordedBy: string }) {
  const toast = useToast();
  const { data: profiles = [] } = useProfiles({ search: "", departmentId: "", role: "", active: "true" });
  const [targetId, setTargetId] = useState("");
  const [date, setDate] = useState(todayIso());
  const { data: existing } = useMyTimeClock(targetId || null, date);
  const [clockInInput, setClockInInput] = useState("");
  const [clockOutInput, setClockOutInput] = useState("");
  const record = useRecordTimeClockForOthers();

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
    <Card className="space-y-3">
      <p className="text-sm font-medium">บันทึกเวลาแทน</p>
      <p className="text-xs text-muted-foreground">สำหรับกรณี GPS มีปัญหา หรือบันทึกย้อนหลัง</p>
      <form className="space-y-3" onSubmit={submit}>
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
        <Button type="submit" disabled={!targetId || record.isPending}>
          {record.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
        </Button>
      </form>
    </Card>
  );
}
