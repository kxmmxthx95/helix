import { useMemo, useState } from "react";
import { AlertTriangle } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input, Skeleton } from "@/components/ui";
import { slipImageUrl, useReviewSlip, useSlipRequests, type SlipRow } from "@/hooks/useCardTopup";
import { findDuplicateSlips, parseAmount, TOPUP_MAX, TOPUP_MIN } from "@/lib/cardTopup";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
export const SLIP_STATUS_LABEL = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ" } as const;

/** อนุมัติสลิป — org-wide reviews parents' PromptPay slips; approval writes the ledger row inside an RPC. */
export function SlipsTab() {
  const toast = useToast();
  const { data: slips = [], isLoading } = useSlipRequests();
  const review = useReviewSlip();
  const [showAll, setShowAll] = useState(false);
  const [rejecting, setRejecting] = useState<SlipRow | null>(null);
  const [reason, setReason] = useState("");
  const shown = useMemo(() => (showAll ? slips : slips.filter((s) => s.status === "pending")), [slips, showAll]);

  const openImage = (s: SlipRow) =>
    slipImageUrl(s.slip_path).then(
      (url) => window.open(url, "_blank", "noopener"),
      (e) => toast(errMsg(e), "error"),
    );

  async function approve(s: SlipRow, amount: number) {
    try {
      await review.mutateAsync({ id: s.id, amount });
      toast("อนุมัติและเติมเงินแล้ว");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  async function reject() {
    if (!rejecting || !reason.trim()) return;
    try {
      await review.mutateAsync({ id: rejecting.id, reject_reason: reason.trim() });
      toast("ไม่อนุมัติสลิปแล้ว");
      setRejecting(null);
      setReason("");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">รออนุมัติ {slips.filter((s) => s.status === "pending").length} รายการ</p>
        <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "แสดงเฉพาะรออนุมัติ" : "แสดงทั้งหมด"}
        </Button>
      </div>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {!isLoading && shown.length === 0 && <Card className="text-sm text-muted-foreground">ไม่มีสลิปที่รออนุมัติ</Card>}
      {shown.map((s) => (
        <SlipCard key={s.id} slip={s} all={slips} busy={review.isPending} onView={() => void openImage(s)} onApprove={(a) => void approve(s, a)} onReject={() => setRejecting(s)} />
      ))}
      <Modal
        open={!!rejecting}
        onOpenChange={(o) => !o && (setRejecting(null), setReason(""))}
        title="ไม่อนุมัติสลิป"
        description="เหตุผลจะถูกส่งให้ผู้ปกครองทาง LINE"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => (setRejecting(null), setReason(""))}>
              ปิด
            </Button>
            <Button variant="destructive" className="flex-1" disabled={!reason.trim() || review.isPending} onClick={() => void reject()}>
              ยืนยันไม่อนุมัติ
            </Button>
          </div>
        }
      >
        <Field label="เหตุผล" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

function SlipCard({
  slip,
  all,
  busy,
  onView,
  onApprove,
  onReject,
}: {
  slip: SlipRow;
  all: SlipRow[];
  busy: boolean;
  onView: () => void;
  onApprove: (amount: number) => void;
  onReject: () => void;
}) {
  const [amount, setAmount] = useState(String(slip.amount));
  const value = parseAmount(amount, TOPUP_MIN, TOPUP_MAX);
  const dups = slip.status === "pending" ? findDuplicateSlips(slip, all) : [];
  const s = slip.student;

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-ui text-sm font-semibold">
            {s ? `${s.student_code} · ${s.prefix ?? ""}${s.first_name} ${s.last_name}` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            ผู้ปกครองแจ้งโอน {formatBaht(slip.amount)} ฿ · เวลาโอน {when(slip.transferred_at)} · ส่งเมื่อ {when(slip.created_at)}
          </p>
        </div>
        <span className={cn("font-ui text-xs font-semibold", slip.status === "approved" && "text-accent", slip.status === "rejected" && "text-destructive")}>
          {SLIP_STATUS_LABEL[slip.status]}
          {slip.status === "approved" && slip.approved_amount !== null && ` ${formatBaht(slip.approved_amount)} ฿`}
        </span>
      </div>
      {slip.status === "rejected" && <p className="text-xs text-muted-foreground">เหตุผล: {slip.reject_reason}</p>}
      {dups.length > 0 && (
        <p className="flex items-center gap-2 rounded-md bg-warning/15 px-2 py-1 text-xs text-warning" role="alert">
          <AlertTriangle className="size-3.5 shrink-0" />
          มีสลิปยอดเท่ากัน ({formatBaht(slip.amount)} ฿) เวลาโอนใกล้กันภายใน 10 นาทีของนักเรียนคนนี้ {dups.length} รายการ — ตรวจสอบว่าไม่ซ้ำ
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Button size="sm" variant="outline" onClick={onView}>
          ดูสลิป
        </Button>
        {slip.status === "pending" && (
          <>
            <div className="w-32">
              <Field label="ยอดที่อนุมัติ">
                <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </Field>
            </div>
            <Button size="sm" disabled={value === null || busy} onClick={() => value !== null && onApprove(value)}>
              อนุมัติ
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={onReject}>
              ไม่อนุมัติ
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
