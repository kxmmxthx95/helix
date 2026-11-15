import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Avatar, Button, EmptyState, Input, Select, Skeleton } from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
import { CheckmarkCircleIcon, Search, TimeIcon, X } from "@/components/icons";
import { CoverSheet, type CoverLeave } from "@/routes/CoverSheet";
import { useProfiles } from "@/hooks/useProfiles";
import {
  leaveAttachmentUrl,
  useCancelLeaveRequest,
  useLeaveApprovals,
  useLeaveTypes,
  useMyLeaveRequests,
  useSetLeaveStatus,
} from "@/hooks/useLeave";
import { profileFullName, type LeaveStatus } from "@/lib/database.types";
import { canManage } from "@/lib/roles";
import { cn } from "@/lib/utils";

const todayIso = () => new Date().toISOString().slice(0, 10);

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิกแล้ว",
};

export const LEAVE_STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const LEAVE_STATUS_ICON = { pending: TimeIcon, approved: CheckmarkCircleIcon, rejected: X, cancelled: X };

/** Status as an icon (label in title/aria-label for hover and screen readers). */
function LeaveStatusIcon({ status }: { status: LeaveStatus }) {
  const Icon = LEAVE_STATUS_ICON[status];
  return (
    <span
      role="img"
      aria-label={LEAVE_STATUS_LABEL[status]}
      title={LEAVE_STATUS_LABEL[status]}
      className={cn("inline-flex h-7 w-7 items-center justify-center", LEAVE_STATUS_STYLE[status].replace(/bg-\S+\s*/, ""))}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

type LeaveView = "mine" | "approvals";

export function Leave() {
  const { profile } = useAuth();
  const [chosenView, setView] = useState<LeaveView | null>(null);
  const [search, setSearch] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<LeaveStatus | "">("pending");
  if (!profile) return null;
  const mayApprove = canManage(profile.roles);
  const view = chosenView ?? (mayApprove ? "approvals" : "mine");

  return (
    <div className="page-fill">
      <div className="flex w-full border-b border-border" role="tablist">
        {(
          [
            ...(mayApprove ? [["approvals", "รายการ"]] : []),
            ["mine", "ประวัติการลา"],
          ] as [LeaveView, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={cn(
              "-mb-px inline-flex h-9 min-w-0 flex-1 items-center justify-center border-b-2 px-3 text-sm font-medium transition-colors",
              view === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "approvals" && (
        <div className="toolbar">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อผู้ขอ"
              className="pl-9"
              type="search"
            />
          </div>
          <Select
            className="w-36 shrink-0 sm:w-40"
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
        </div>
      )}

      {view === "mine" && (
        <>
          <MyRequestsSection profileId={profile.id} />
        </>
      )}
      {view === "approvals" && mayApprove && (
        <ApprovalsSection approverId={profile.id} status={approvalStatus} search={search} />
      )}
    </div>
  );
}

function MyRequestsSection({ profileId }: { profileId: string }) {
  const { data: types = [] } = useLeaveTypes();
  const { data: requests = [], isLoading } = useMyLeaveRequests(profileId);
  const cancel = useCancelLeaveRequest();
  const [coverFor, setCoverFor] = useState<CoverLeave | null>(null);

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
                <th className="px-3 py-2 font-medium">จำนวนวัน</th>
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
                    <Skeleton className="h-3 w-12" />
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
          <EmptyState title="ยังไม่มีคำขอลา" />
        </div>
      )}
      {requests.length > 0 && (
<div className="table-panel rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
          <table className="w-full min-w-[36rem] text-[13px]">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-4 py-3">ประเภท</th>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-4 py-3">จำนวนวัน</th>
                <th className="px-4 py-3">เหตุผล</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const cancellable =
                  (r.status === "pending" || r.status === "approved") && r.start_date > todayIso();
                return (
                  <tr key={r.id} className="h-14 border-t border-border first:border-t-0">
                    <td className="px-4 py-3">{typeName(r.leave_type_id)}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {r.start_date} – {r.end_date}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.days} วัน</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.reason}</td>
                    <td className="px-4 py-2">
                      <LeaveStatusIcon status={r.status} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        {(r.status === "pending" || r.status === "approved") && r.end_date >= todayIso() && (
                          <Button size="sm" onClick={() => setCoverFor(r)}>
                            มอบงานแทน
                          </Button>
                        )}
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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {coverFor && (
        <CoverSheet leave={coverFor} actorId={profileId} open onOpenChange={(o) => !o && setCoverFor(null)} />
      )}
    </div>
  );
}

function ApprovalsSection({ approverId, status, search }: { approverId: string; status: LeaveStatus | ""; search: string }) {
  const { data: all = [], isLoading } = useLeaveApprovals(status);
  const { data: types = [] } = useLeaveTypes();
  const { data: profiles = [] } = useProfiles({ search: "", departmentId: "", role: "", active: "" });
  const setStatus = useSetLeaveStatus();
  const [coverFor, setCoverFor] = useState<CoverLeave | null>(null);
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const q = search.trim().toLowerCase();
  const requests = q
    ? all.filter((r) => {
        const p = profileById.get(r.profile_id);
        return !!p && profileFullName(p).toLowerCase().includes(q);
      })
    : all;
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
                <th className="px-3 py-2 font-medium">จำนวนวัน</th>
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
                    <Skeleton className="h-3 w-12" />
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
<div className="table-panel rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
          <table className="w-full min-w-[48rem] text-[13px]">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-4 py-3">ผู้ขอ</th>
                <th className="px-4 py-3">ประเภท</th>
                <th className="px-4 py-3">วันที่</th>
                <th className="px-4 py-3">จำนวนวัน</th>
                <th className="px-4 py-3">เหตุผล</th>
                <th className="px-4 py-3">ไฟล์แนบ</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="h-14 border-t border-border first:border-t-0">
                  <td className="px-4 py-3">
                    {(() => {
                      const p = profileById.get(r.profile_id);
                      const name = p ? profileFullName(p) : "—";
                      return (
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={name} src={p ? avatarUrl(p) : null} className="h-9 w-9 text-xs" />
                          <span className="whitespace-nowrap text-sm font-medium">{name}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{typeName(r.leave_type_id)}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {r.start_date} – {r.end_date}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.days} วัน</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.reason}</td>
                  <td className="px-4 py-2">
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
                  <td className="px-4 py-2">
                    <LeaveStatusIcon status={r.status} />
                  </td>
                  <td className="px-4 py-2">
                    {(r.status === "pending" || r.status === "approved") && r.end_date >= todayIso() && (
                      <Button size="sm" className="mb-1" onClick={() => setCoverFor(r)}>
                        มอบงานแทน
                      </Button>
                    )}
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
        </div>
      )}
      {coverFor && (
        <CoverSheet leave={coverFor} actorId={approverId} open onOpenChange={(o) => !o && setCoverFor(null)} />
      )}
    </div>
  );
}
