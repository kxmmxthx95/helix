import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Field, Input, Select, Skeleton, Spinner } from "@/components/ui";
import { useProfiles } from "@/hooks/useProfiles";
import {
  leaveAttachmentUrl,
  useCancelLeaveRequest,
  useLeaveApprovals,
  useLeaveTypes,
  useMyLeaveRequests,
  useRequestLeave,
  useSetLeaveStatus,
} from "@/hooks/useLeave";
import { profileFullName, type LeaveStatus } from "@/lib/database.types";
import { canManage } from "@/lib/roles";
import { cn } from "@/lib/utils";

const todayIso = () => new Date().toISOString().slice(0, 10);
const currentYear = () => new Date().getFullYear();

function dayCount(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(ms / 86400000) + 1);
}

const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิกแล้ว",
};

const LEAVE_STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

type LeaveView = "mine" | "approvals";

export function Leave() {
  const { profile } = useAuth();
  const [view, setView] = useState<LeaveView>("mine");
  const [newLeaveOpen, setNewLeaveOpen] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<LeaveStatus | "">("pending");
  if (!profile) return null;
  const mayApprove = canManage(profile.roles);

  return (
    <div className="page-fill">
      <div className="flex items-center gap-2">
        <Select className="w-48" value={view} onChange={(e) => setView(e.target.value as LeaveView)}>
          <option value="mine">คำขอลาของฉัน</option>
          {mayApprove && <option value="approvals">คำขอลา</option>}
        </Select>
        {view === "mine" && (
          <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => setNewLeaveOpen(true)}>
            + ลาใหม่
          </Button>
        )}
        {view === "approvals" && (
          <Select
            className="ml-auto w-40 shrink-0"
            value={approvalStatus}
            onChange={(e) => setApprovalStatus(e.target.value as LeaveStatus | "")}
            aria-label="สถานะคำขอ"
          >
            <option value="">ทุกสถานะ</option>
            {(Object.keys(LEAVE_STATUS_LABEL) as LeaveStatus[]).map((s) => (
              <option key={s} value={s}>
                {LEAVE_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
      </div>

      {view === "mine" && (
        <>
          <QuotaSection profileId={profile.id} />
          <MyRequestsSection profileId={profile.id} open={newLeaveOpen} onOpenChange={setNewLeaveOpen} />
        </>
      )}
      {view === "approvals" && mayApprove && (
        <ApprovalsSection approverId={profile.id} status={approvalStatus} />
      )}
    </div>
  );
}

function QuotaSection({ profileId }: { profileId: string }) {
  const { data: types = [] } = useLeaveTypes();
  const { data: requests = [] } = useMyLeaveRequests(profileId);
  const year = currentYear();

  const usedByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests) {
      if (r.status !== "pending" && r.status !== "approved") continue;
      if (!r.start_date.startsWith(String(year))) continue;
      map.set(r.leave_type_id, (map.get(r.leave_type_id) ?? 0) + r.days);
    }
    return map;
  }, [requests, year]);

  if (types.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">โควตาลาปี {year}</p>
      <ul className="divide-y divide-border rounded-lg border border-border px-3 text-sm">
        {types.map((t) => {
          const used = usedByType.get(t.id) ?? 0;
          const over = t.max_days_per_year !== null && used > t.max_days_per_year;
          return (
            <li key={t.id} className="flex items-center justify-between py-1.5">
              <span>{t.name}</span>
              <span className={cn(over && "font-medium text-destructive")}>
                {t.max_days_per_year !== null ? `${used} / ${t.max_days_per_year} วัน` : `${used} วัน (ไม่จำกัด)`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MyRequestsSection({
  profileId,
  open,
  onOpenChange,
}: {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const { data: types = [] } = useLeaveTypes();
  const { data: requests = [], isLoading } = useMyLeaveRequests(profileId);
  const request = useRequestLeave();
  const cancel = useCancelLeaveRequest();

  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedType = types.find((t) => t.id === leaveTypeId);
  const days = startDate && endDate ? dayCount(startDate, endDate) : 0;
  const needsAttachment =
    !!selectedType?.requires_attachment_after_days &&
    days > selectedType.requires_attachment_after_days &&
    !file;

  function reset() {
    setLeaveTypeId("");
    setStartDate("");
    setEndDate("");
    setReason("");
    setFile(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!leaveTypeId || !startDate || !endDate || !reason.trim()) return;
    request.mutate(
      { profileId, leaveTypeId, startDate, endDate, reason: reason.trim(), file },
      {
        onSuccess: () => {
          toast("ส่งคำขอลาสำเร็จ");
          reset();
          onOpenChange(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ", "error"),
      },
    );
  }

  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "—";

  return (
    <div className={cn("flex flex-col", !isLoading && requests.length === 0 ? "flex-1" : "space-y-3")}>
      {isLoading && (
        <div className="overflow-hidden rounded-lg border border-border bg-card" role="status" aria-label="กำลังโหลด">
          <table className="w-full min-w-[36rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">วันที่</th>
                <th className="px-3 py-2 font-medium">เหตุผล</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-16" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-32" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-24" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </td>
                  <td className="px-3 py-2" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!isLoading && requests.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีคำขอลา" description="กด + ลาใหม่เพื่อส่งคำขอลา" />
        </div>
      )}
      {requests.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[36rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">วันที่</th>
                <th className="px-3 py-2 font-medium">เหตุผล</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const cancellable =
                  (r.status === "pending" || r.status === "approved") && r.start_date > todayIso();
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium">{typeName(r.leave_type_id)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.start_date} – {r.end_date} ({r.days} วัน)
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.reason}</td>
                    <td className="px-3 py-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", LEAVE_STATUS_STYLE[r.status])}>
                        {LEAVE_STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {cancellable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancel.mutate(r.id)}
                          disabled={cancel.isPending}
                        >
                          ยกเลิก
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={open}
        onOpenChange={(o) => {
          onOpenChange(o);
          if (!o) reset();
        }}
        title="ลาใหม่"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button
              type="submit"
              form="request-leave"
              className="flex-1"
              disabled={!leaveTypeId || !startDate || !endDate || !reason.trim() || request.isPending}
            >
              {request.isPending ? <Spinner className="h-3 w-3" /> : "ส่งคำขอ"}
            </Button>
          </div>
        }
      >
        <form id="request-leave" className="space-y-4" onSubmit={submit}>
          <Field label="ประเภทการลา">
            <Select
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              required
              placeholder="เลือกประเภท"
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="วันเริ่ม">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </Field>
            <Field label="วันสิ้นสุด">
              <Input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </Field>
          </div>
          {days > 0 && <p className="text-xs text-muted-foreground">รวม {days} วัน</p>}
          <Field label="เหตุผล">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="เช่น ลาป่วย มีไข้"
            />
          </Field>
          <Field
            label={
              selectedType?.requires_attachment_after_days
                ? `ไฟล์แนบ (บังคับถ้าลาเกิน ${selectedType.requires_attachment_after_days} วัน)`
                : "ไฟล์แนบ (ถ้ามี)"
            }
          >
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {file ? file.name : "เลือกไฟล์"}
            </Button>
          </Field>
          {needsAttachment && (
            <p className="text-xs text-destructive">
              ลาต่อเนื่องเกิน {selectedType!.requires_attachment_after_days} วัน ต้องแนบเอกสารประกอบ
            </p>
          )}
        </form>
      </Sheet>
    </div>
  );
}

function ApprovalsSection({ approverId, status }: { approverId: string; status: LeaveStatus | "" }) {
  const { data: requests = [], isLoading } = useLeaveApprovals(status);
  const { data: types = [] } = useLeaveTypes();
  const { data: profiles = [] } = useProfiles({ search: "", departmentId: "", role: "", active: "" });
  const setStatus = useSetLeaveStatus();
  const nameById = new Map(profiles.map((p) => [p.id, profileFullName(p)]));
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "—";

  async function openAttachment(path: string) {
    try {
      const url = await leaveAttachmentUrl(path);
      window.open(url, "_blank");
    } catch {
      /* best-effort — ignore */
    }
  }

  return (
    <div className={cn("flex flex-col", !isLoading && requests.length === 0 ? "flex-1" : "space-y-2")}>
      {isLoading && (
        <div className="overflow-hidden rounded-lg border border-border" role="status" aria-label="กำลังโหลด">
          <table className="w-full min-w-[48rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ผู้ขอ</th>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">วันที่</th>
                <th className="px-3 py-2 font-medium">เหตุผล</th>
                <th className="px-3 py-2 font-medium">ไฟล์แนบ</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-20" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-16" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-32" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-24" />
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </td>
                  <td className="px-3 py-2" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!isLoading && requests.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่มีคำขอ" description="ลองเปลี่ยนสถานะที่กรองด้านบน" />
        </div>
      )}
      {requests.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[48rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ผู้ขอ</th>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">วันที่</th>
                <th className="px-3 py-2 font-medium">เหตุผล</th>
                <th className="px-3 py-2 font-medium">ไฟล์แนบ</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium">{nameById.get(r.profile_id) ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{typeName(r.leave_type_id)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.start_date} – {r.end_date} ({r.days} วัน)
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.reason}</td>
                  <td className="px-3 py-2">
                    {r.attachment_path && (
                      <button
                        type="button"
                        className="text-xs text-accent underline"
                        onClick={() => openAttachment(r.attachment_path!)}
                      >
                        ดูไฟล์แนบ
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", LEAVE_STATUS_STYLE[r.status])}>
                      {LEAVE_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={setStatus.isPending}
                          onClick={() => setStatus.mutate({ id: r.id, status: "approved", approvedBy: approverId })}
                        >
                          อนุมัติ
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={setStatus.isPending}
                          onClick={() => setStatus.mutate({ id: r.id, status: "rejected", approvedBy: approverId })}
                        >
                          ไม่อนุมัติ
                        </Button>
                      </div>
                    )}
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
