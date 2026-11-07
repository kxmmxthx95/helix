import { useEffect, useState } from "react";
import { AlertTriangle, LockIcon, Search } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Button, Field, Input, Skeleton, Spinner } from "@/components/ui";
import { usePortalSummary, useTopupList, useVoidTopup } from "@/hooks/useCardTopup";
import { TX_TYPE_LABEL } from "@/lib/cardTopup";
import type { CardTopupRow } from "@/lib/database.types";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
/** A date in Asia/Bangkok as yyyy-mm-dd ("sv" formats ISO-style). */
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString("sv", { timeZone: "Asia/Bangkok" });
const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

const PRESETS = [
  { key: "today", label: "วันนี้", range: (): [string, string] => [daysAgo(0), daysAgo(0)] },
  { key: "week", label: "7 วันล่าสุด", range: (): [string, string] => [daysAgo(6), daysAgo(0)] },
  { key: "month", label: "30 วันล่าสุด", range: (): [string, string] => [daysAgo(29), daysAgo(0)] },
] as const;
type Preset = (typeof PRESETS)[number]["key"] | "custom";
type Status = "active" | "voided" | "all";

const chip = (active: boolean) =>
  cn(
    "tappable flex h-12 shrink-0 items-center rounded-full border px-5 text-lg font-semibold transition-colors",
    active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-foreground/5",
  );
const typeBadge = (t: CardTopupRow["type"]) =>
  t === "topup_cash" ? "bg-success/15 text-success" : "bg-violet-500/15 text-violet-700 dark:text-violet-300";

/** ยกเลิกรายการ — org-wide voids a past top-up (cash or slip) of any age. The balance may go negative; the student then cannot buy until topped up. */
export function VoidTopupTab({ unlocked, onNeedPin }: { unlocked: boolean; onNeedPin: () => void }) {
  const [preset, setPreset] = useState<Preset>("week");
  const [from, setFrom] = useState(() => daysAgo(6));
  const [to, setTo] = useState(() => daysAgo(0));
  const [status, setStatus] = useState<Status>("active");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setQ(text), 300);
    return () => window.clearTimeout(t);
  }, [text]);
  const { data: rows = [], isLoading, error } = useTopupList(from, to, q);
  const [target, setTarget] = useState<CardTopupRow | null>(null);

  const shown = rows.filter((r) => (status === "all" ? true : status === "voided" ? !!r.voided_at : !r.voided_at));
  const voidedCount = rows.filter((r) => r.voided_at).length;
  const activeTotal = rows.filter((r) => !r.voided_at).reduce((s, r) => s + r.amount, 0);

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
      {/* Search */}
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

      {/* Date range */}
      <div className="scrollbar-hidden flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="ช่วงวันที่">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" role="tab" aria-selected={preset === p.key} className={chip(preset === p.key)} onClick={() => pick(p.key)}>
            {p.label}
          </button>
        ))}
        <button type="button" role="tab" aria-selected={preset === "custom"} className={chip(preset === "custom")} onClick={() => setPreset("custom")}>
          เลือกวันที่เอง
        </button>
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

      {/* Status + summary */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist" aria-label="สถานะรายการ">
          {(
            [
              ["active", `ยังไม่ยกเลิก (${rows.length - voidedCount})`],
              ["voided", `ยกเลิกแล้ว (${voidedCount})`],
              ["all", "ทั้งหมด"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={status === key}
              onClick={() => setStatus(key)}
              className={cn(
                "tappable h-12 rounded-xl px-4 text-lg font-semibold transition-colors",
                status === key ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {rows.length > 0 && (
          <p className="ml-auto text-lg text-muted-foreground">
            ยอดเติมที่ยังไม่ยกเลิก <span className="font-bold tabular-nums text-foreground">{formatBaht(activeTotal)} ฿</span>
          </p>
        )}
      </div>

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-lg text-destructive">{errMsg(error)}</p>}
      {!isLoading && !error && shown.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-lg text-muted-foreground">
          {rows.length === 0 ? "ไม่พบรายการเติมเงินในช่วงนี้" : "ไม่มีรายการในสถานะนี้"}
        </p>
      )}

      {shown.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shown.map((r) => (
            <li key={r.id} className={cn("flex flex-col rounded-2xl border border-border bg-card p-5", r.voided_at && "bg-muted/60")}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-xl font-semibold", r.voided_at && "text-muted-foreground")}>{r.student_name}</p>
                  <p className="text-lg text-muted-foreground">รหัส {r.student_code}</p>
                </div>
                <p className={cn("shrink-0 text-3xl font-bold tabular-nums", r.voided_at && "text-muted-foreground line-through")}>{formatBaht(r.amount)} ฿</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
                <span className={cn("rounded-full px-3 py-0.5 text-sm font-semibold", typeBadge(r.type))}>{TX_TYPE_LABEL[r.type]}</span>
                <span>{when(r.created_at)}</span>
                <span>· เติมโดย {r.cashier || "—"}</span>
              </div>
              {r.voided_at ? (
                <div className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-base">
                  <p className="font-semibold text-destructive">ยกเลิกแล้ว · {when(r.voided_at)}</p>
                  <p className="text-foreground">
                    โดย {r.voided_by_name ?? "ไม่ระบุ"} · เหตุผล: {r.void_reason ?? "—"}
                  </p>
                </div>
              ) : (
                <div className="mt-3 flex justify-end border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => setTarget(r)}
                    aria-label={`ยกเลิกการเติมเงินของ ${r.student_name} ${formatBaht(r.amount)} บาท`}
                    className="tappable h-12 rounded-xl border border-destructive/40 px-5 text-lg font-semibold text-destructive hover:bg-destructive/10"
                  >
                    ยกเลิกรายการ
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.length >= 300 && <p className="text-center text-lg text-muted-foreground">แสดง 300 รายการล่าสุด — ใช้การค้นหาหรือช่วงวันที่เพื่อจำกัดผลลัพธ์</p>}

      {target && <VoidDialog row={target} unlocked={unlocked} onNeedPin={onNeedPin} onClose={() => setTarget(null)} />}
    </div>
  );
}

function VoidDialog({ row, unlocked, onNeedPin, onClose }: { row: CardTopupRow; unlocked: boolean; onNeedPin: () => void; onClose: () => void }) {
  const toast = useToast();
  const voidTopup = useVoidTopup();
  const { data: bal } = usePortalSummary(row.student_id);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const after = bal == null ? null : bal.balance - row.amount;
  const presets = row.type === "topup_slip" ? ["สลิปซ้ำ", "สลิปไม่ถูกต้อง", "ยอดไม่ตรงกับที่โอน", "อนุมัติผิดคน"] : ["เติมผิดคน", "กดยอดผิด", "ผู้ปกครองขอคืน"];

  async function confirm() {
    if (!reason.trim()) return;
    setErr(null);
    if (!unlocked) return onNeedPin(); // PIN popup; press confirm again once unlocked
    try {
      const r = await voidTopup.mutateAsync({ tx_id: row.id, reason: reason.trim() });
      toast(`ยกเลิกแล้ว · ยอดคงเหลือ ${formatBaht(r.balance)} ฿`);
      onClose();
    } catch (e) {
      // The unlock hour ran out on the server: ask for the PIN again.
      if (e instanceof Error && e.message.includes("PIN")) onNeedPin();
      else setErr(errMsg(e));
    }
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && !voidTopup.isPending && onClose()}
      title="ยกเลิกการเติมเงิน"
      className="max-w-lg"
      footer={
        <div className="flex gap-3">
          <Button variant="outline" className="h-14 flex-1 text-lg" disabled={voidTopup.isPending} onClick={onClose}>
            ไม่ยกเลิก
          </Button>
          <Button variant="destructive" className="h-14 flex-[1.4] text-lg" disabled={!reason.trim() || voidTopup.isPending} onClick={() => void confirm()}>
            {voidTopup.isPending ? <Spinner /> : unlocked ? "ยืนยันยกเลิกรายการ" : "ใส่ PIN แล้วยกเลิก"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* What is being undone */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold">{row.student_name}</p>
              <p className="text-lg text-muted-foreground">
                {TX_TYPE_LABEL[row.type]} · {when(row.created_at)}
              </p>
            </div>
            <p className="shrink-0 text-3xl font-bold tabular-nums">{formatBaht(row.amount)} ฿</p>
          </div>
        </div>

        {/* Balance before → after */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-muted p-4 text-center">
          <div>
            <p className="text-base text-muted-foreground">ยอดคงเหลือตอนนี้</p>
            <p className="text-2xl font-bold tabular-nums">{bal == null ? "…" : `${formatBaht(bal.balance)} ฿`}</p>
          </div>
          <span className="text-3xl text-muted-foreground" aria-hidden>
            →
          </span>
          <div>
            <p className="text-base text-muted-foreground">หลังยกเลิก</p>
            <p className={cn("text-2xl font-bold tabular-nums", after !== null && after < 0 && "text-destructive")}>{after === null ? "…" : `${formatBaht(after)} ฿`}</p>
          </div>
        </div>

        {after !== null && after < 0 && (
          <p className="flex items-start gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-lg text-destructive">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
            นักเรียนใช้เงินที่เติมไปแล้ว ยอดจะติดลบ และซื้อสินค้าไม่ได้จนกว่าจะเติมเงินให้ยอดเป็นบวก
          </p>
        )}
        {row.type === "topup_slip" && (
          <p className="rounded-xl bg-warning/15 px-4 py-3 text-lg">รายการนี้มาจากสลิป — สลิปจะถูกเปลี่ยนเป็น "ยกเลิกแล้ว" และใช้สลิปใบเดิมซ้ำไม่ได้</p>
        )}

        <div className="space-y-2">
          <p className="text-lg font-semibold">
            เหตุผลที่ยกเลิก <span className="text-destructive">*</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p} type="button" className={chip(reason === p)} onClick={() => setReason(p)}>
                {p}
              </button>
            ))}
          </div>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เลือกด้านบน หรือพิมพ์เหตุผลเอง" aria-label="เหตุผลที่ยกเลิก" />
        </div>

        {!unlocked && (
          <p className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-lg">
            <LockIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
            ต้องใส่ PIN แคชเชียร์ก่อน — กดปุ่มด้านล่าง แล้วกดยืนยันอีกครั้งหลังปลดล็อก
          </p>
        )}
        {err && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-lg font-semibold text-destructive">{err}</p>}
      </div>
    </Modal>
  );
}
