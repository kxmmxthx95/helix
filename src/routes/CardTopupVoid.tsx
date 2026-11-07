import { useEffect, useState } from "react";
import { AlertTriangle } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Button, Field, Input, Skeleton } from "@/components/ui";
import { usePortalSummary, useTopupList, useVoidTopup } from "@/hooks/useCardTopup";
import { TX_TYPE_LABEL } from "@/lib/cardTopup";
import type { CardTopupRow } from "@/lib/database.types";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
/** A date in Asia/Bangkok as yyyy-mm-dd ("sv" formats ISO-style). */
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString("sv", { timeZone: "Asia/Bangkok" });
const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

/** ยกเลิกรายการ — org-wide voids a past top-up (cash or slip) of any age. The balance may go negative; the student then cannot buy until topped up. */
export function VoidTopupTab({ unlocked, onNeedPin }: { unlocked: boolean; onNeedPin: () => void }) {
  const [from, setFrom] = useState(() => daysAgo(6));
  const [to, setTo] = useState(() => daysAgo(0));
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setQ(text), 300);
    return () => window.clearTimeout(t);
  }, [text]);
  const { data: rows = [], isLoading, error } = useTopupList(from, to, q);
  const [target, setTarget] = useState<CardTopupRow | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-ui text-2xl font-semibold">ยกเลิกรายการเติมเงิน</h2>
        <p className="text-lg text-muted-foreground">ค้นหารายการเติมเงินย้อนหลังที่ต้องการยกเลิก (เงินสดและสลิป)</p>
      </div>
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
        <Field label="ตั้งแต่วันที่">
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="ถึงวันที่">
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="ชื่อ หรือรหัสนักเรียน">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="ค้นหา" />
        </Field>
      </div>

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-lg text-destructive">{errMsg(error)}</p>}
      {!isLoading && !error && rows.length === 0 && <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-lg text-muted-foreground">ไม่พบรายการเติมเงินในช่วงนี้</p>}
      {rows.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4", r.voided_at && "text-muted-foreground")}>
              <div className="min-w-0 flex-1">
                <p className={cn("text-lg font-semibold", r.voided_at && "line-through")}>
                  {r.student_name} <span className="font-normal text-muted-foreground">· {r.student_code}</span>
                </p>
                <p className="text-base text-muted-foreground">
                  {when(r.created_at)} · {TX_TYPE_LABEL[r.type]} · {r.cashier || "—"}
                </p>
                {r.voided_at && (
                  <p className="text-base text-destructive">
                    ยกเลิกแล้ว {when(r.voided_at)} · โดย {r.voided_by_name ?? "ไม่ระบุ"} · {r.void_reason}
                  </p>
                )}
              </div>
              <p className={cn("shrink-0 text-2xl font-bold tabular-nums", r.voided_at && "line-through")}>{formatBaht(r.amount)} ฿</p>
              {!r.voided_at && (
                <Button variant="outline" className="h-12 shrink-0 px-5 text-base font-bold text-destructive" onClick={() => setTarget(r)}>
                  ยกเลิก
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.length >= 300 && <p className="text-center text-base text-muted-foreground">แสดง 300 รายการล่าสุด — ใช้ตัวกรองเพื่อจำกัดผลลัพธ์</p>}

      {target && <VoidDialog row={target} unlocked={unlocked} onNeedPin={onNeedPin} onClose={() => setTarget(null)} />}
    </div>
  );
}

function VoidDialog({ row, unlocked, onNeedPin, onClose }: { row: CardTopupRow; unlocked: boolean; onNeedPin: () => void; onClose: () => void }) {
  const toast = useToast();
  const voidTopup = useVoidTopup();
  const { data: bal } = usePortalSummary(row.student_id);
  const [reason, setReason] = useState("");
  const after = bal === undefined ? null : bal.balance - row.amount;

  async function confirm() {
    if (!reason.trim()) return;
    if (!unlocked) return onNeedPin(); // PIN popup; press confirm again once unlocked
    try {
      const r = await voidTopup.mutateAsync({ tx_id: row.id, reason: reason.trim() });
      toast(`ยกเลิกแล้ว · ยอดคงเหลือ ${formatBaht(r.balance)} ฿`);
      onClose();
    } catch (e) {
      // The unlock hour ran out on the server: ask for the PIN again.
      if (e instanceof Error && e.message.includes("PIN")) onNeedPin();
      else toast(errMsg(e), "error");
    }
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && !voidTopup.isPending && onClose()}
      title="ยกเลิกการเติมเงิน"
      description={`${row.student_name} · ${TX_TYPE_LABEL[row.type]} ${formatBaht(row.amount)} ฿`}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={voidTopup.isPending} onClick={onClose}>
            ปิด
          </Button>
          <Button variant="destructive" className="flex-1" disabled={!reason.trim() || voidTopup.isPending} onClick={() => void confirm()}>
            {unlocked ? "ยืนยันยกเลิก" : "ใส่ PIN เพื่อยกเลิก"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <dl className="space-y-2 text-lg">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">ยอดคงเหลือตอนนี้</dt>
            <dd className="font-semibold tabular-nums">{bal === undefined ? "…" : `${formatBaht(bal.balance)} ฿`}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">ยอดคงเหลือหลังยกเลิก</dt>
            <dd className={cn("font-semibold tabular-nums", after !== null && after < 0 && "text-destructive")}>{after === null ? "…" : `${formatBaht(after)} ฿`}</dd>
          </div>
        </dl>
        {after !== null && after < 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-base text-destructive">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            นักเรียนใช้เงินที่เติมไปแล้ว ยอดจะติดลบ และซื้อสินค้าไม่ได้จนกว่าจะเติมเงินให้ยอดเป็นบวก
          </p>
        )}
        {row.type === "topup_slip" && <p className="text-base text-muted-foreground">รายการนี้มาจากสลิป สลิปที่เกี่ยวข้องจะถูกเปลี่ยนเป็น "ยกเลิกแล้ว" และใช้สลิปใบเดิมซ้ำไม่ได้</p>}
        <Field label="เหตุผลที่ยกเลิก (จำเป็น)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
