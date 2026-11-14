import { useEffect, useState } from "react";
import { Search } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Button, Field, Input, Skeleton, Spinner } from "@/components/ui";
import { usePosVoid, useSalesList } from "@/hooks/useCardTopup";
import type { CardSaleRow } from "@/lib/database.types";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
/** A date in Asia/Bangkok as yyyy-mm-dd ("sv" formats ISO-style). */
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString("sv", { timeZone: "Asia/Bangkok" });
const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

const PRESETS = [
  { key: "today", label: "วันนี้", range: (): [string, string] => [daysAgo(0), daysAgo(0)] },
  { key: "yesterday", label: "เมื่อวาน", range: (): [string, string] => [daysAgo(1), daysAgo(1)] },
  { key: "week", label: "7 วันล่าสุด", range: (): [string, string] => [daysAgo(6), daysAgo(0)] },
  { key: "month", label: "30 วันล่าสุด", range: (): [string, string] => [daysAgo(29), daysAgo(0)] },
] as const;
type Preset = (typeof PRESETS)[number]["key"] | "custom";

const chip = (active: boolean) =>
  cn(
    "tappable flex h-12 shrink-0 items-center rounded-full border px-5 text-lg font-semibold transition-colors",
    active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-foreground/5",
  );

/** ประวัติการขาย — org-wide: every card sale in a date range with the products on the bill. */
export function SalesHistoryTab() {
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(() => daysAgo(0));
  const [to, setTo] = useState(() => daysAgo(0));
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setQ(text), 300);
    return () => window.clearTimeout(t);
  }, [text]);
  const { data: rows = [], isLoading, error } = useSalesList(from, to, q);
  const [target, setTarget] = useState<CardSaleRow | null>(null);

  const total = rows.filter((r) => !r.voided_at).reduce((s, r) => s + r.amount, 0);
  const voided = rows.filter((r) => r.voided_at).length;

  function pick(key: Preset) {
    setPreset(key);
    const p = PRESETS.find((x) => x.key === key);
    if (p) {
      const [f, t] = p.range();
      setFrom(f);
      setTo(t);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          className="h-14 !pl-12 text-lg"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ค้นหาชื่อ หรือรหัสนักเรียน"
          aria-label="ค้นหานักเรียน"
          autoComplete="off"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="scrollbar-hidden flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" role="tablist" aria-label="ช่วงวันที่">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" role="tab" aria-selected={preset === p.key} className={chip(preset === p.key)} onClick={() => pick(p.key)}>
              {p.label}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={preset === "custom"} className={chip(preset === "custom")} onClick={() => setPreset("custom")}>
            เลือกวันที่เอง
          </button>
        </div>
        {rows.length > 0 && (
          <p className="shrink-0 text-lg text-muted-foreground">
            {rows.length - voided} รายการ · รวม <span className="font-bold tabular-nums text-foreground">{formatBaht(total)} ฿</span>
          </p>
        )}
      </div>
      {preset === "custom" && (
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <Field label="ตั้งแต่วันที่">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="ถึงวันที่">
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      )}

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-lg text-destructive">{errMsg(error)}</p>}
      {!isLoading && !error && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-lg text-muted-foreground">ไม่พบรายการขายในช่วงนี้</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-lg">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-base text-muted-foreground">
                {["เวลา", "นักเรียน", "สินค้า", "เครื่องขาย", "แคชเชียร์"].map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap px-5 py-3 font-medium">
                    {h}
                  </th>
                ))}
                <th scope="col" className="whitespace-nowrap px-5 py-3 text-right font-medium">
                  ยอด
                </th>
                <th scope="col" className="whitespace-nowrap px-5 py-3 text-right font-medium">
                  สถานะ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className={cn(r.voided_at && "bg-muted/60 text-muted-foreground")}>
                  <td className="whitespace-nowrap px-5 py-3.5">{when(r.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <p className={cn("font-semibold", !r.voided_at && "text-foreground")}>{r.student_name}</p>
                    <p className="text-base text-muted-foreground">รหัส {r.student_code}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    {r.items.length === 0 ? (
                      <span className="text-muted-foreground">ระบุยอดเอง</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.items.map((i, n) => (
                          <li key={n}>
                            {i.name} <span className="text-muted-foreground">× {i.qty}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">{r.terminal ?? "—"}</td>
                  <td className="whitespace-nowrap px-5 py-3.5">{r.cashier || "—"}</td>
                  <td className={cn("whitespace-nowrap px-5 py-3.5 text-right text-xl font-bold tabular-nums", r.voided_at ? "line-through" : "text-foreground")}>
                    {formatBaht(r.amount)} ฿
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {r.voided_at ? (
                      <span className="font-semibold text-destructive">ยกเลิกแล้ว · {when(r.voided_at)}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTarget(r)}
                        aria-label={`ยกเลิกการขายของ ${r.student_name} ${formatBaht(r.amount)} บาท และคืนเงิน`}
                        className="tappable h-12 whitespace-nowrap rounded-xl border border-destructive/40 px-5 text-lg font-semibold text-destructive hover:bg-destructive/10"
                      >
                        ยกเลิก / คืนเงิน
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length >= 300 && <p className="text-center text-lg text-muted-foreground">แสดง 300 รายการล่าสุด — ใช้การค้นหาหรือช่วงวันที่เพื่อจำกัดผลลัพธ์</p>}

      {target && <SaleVoidDialog row={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

const REASONS = ["ลูกค้าไม่รับสินค้า", "ตัดเงินผิดยอด", "ตัดเงินซ้ำ", "สินค้าหมด"];

/** Voiding a sale refunds it: the wallet balance is the ledger minus voided rows, so the amount returns at once. */
function SaleVoidDialog({ row, onClose }: { row: CardSaleRow; onClose: () => void }) {
  const toast = useToast();
  const voidTx = usePosVoid();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    if (!reason.trim()) return;
    setErr(null);
    try {
      const r = await voidTx.mutateAsync({ tx_id: row.id, reason: reason.trim() });
      toast(`ยกเลิกการขายและคืนเงินแล้ว · ยอดคงเหลือ ${formatBaht(r.balance)} ฿`);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && !voidTx.isPending && onClose()}
      title="ยกเลิกการขายและคืนเงิน"
      className="max-w-lg"
      footer={
        <div className="flex gap-3">
          <Button variant="outline" className="h-14 flex-1 text-lg" disabled={voidTx.isPending} onClick={onClose}>
            ไม่ยกเลิก
          </Button>
          <Button variant="destructive" className="h-14 flex-[1.4] text-lg" disabled={!reason.trim() || voidTx.isPending} onClick={() => void confirm()}>
            {voidTx.isPending ? <Spinner /> : `ยืนยันคืนเงิน ${formatBaht(row.amount)} ฿`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold">{row.student_name}</p>
              <p className="text-lg text-muted-foreground">{when(row.created_at)}</p>
            </div>
            <p className="shrink-0 text-3xl font-bold tabular-nums">{formatBaht(row.amount)} ฿</p>
          </div>
          {row.items.length > 0 && (
            <ul className="mt-3 space-y-0.5 border-t border-border pt-3 text-lg">
              {row.items.map((i, n) => (
                <li key={n}>
                  {i.name} <span className="text-muted-foreground">× {i.qty}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="rounded-xl bg-success/10 px-4 py-3 text-lg">
          เงิน <span className="font-bold text-success">{formatBaht(row.amount)} ฿</span> จะคืนเข้ากระเป๋าของนักเรียนทันที
        </p>
        <div className="space-y-2">
          <p className="text-lg font-semibold">
            เหตุผลที่ยกเลิก <span className="text-destructive">*</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((p) => (
              <button key={p} type="button" className={chip(reason === p)} onClick={() => setReason(p)}>
                {p}
              </button>
            ))}
          </div>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เลือกด้านบน หรือพิมพ์เหตุผลเอง" aria-label="เหตุผลที่ยกเลิก" />
        </div>
        {err && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-lg font-semibold text-destructive">{err}</p>}
      </div>
    </Modal>
  );
}
