import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckmarkCircleIcon, ImageIcon } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Button, Field, Input, Skeleton, Spinner } from "@/components/ui";
import { slipImageUrl, useReviewSlip, useSlipRequests, type SlipRow } from "@/hooks/useCardTopup";
import { findDuplicateSlips, parseAmount, TOPUP_MAX, TOPUP_MIN } from "@/lib/cardTopup";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
const when = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
export const SLIP_STATUS_LABEL = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ", voided: "ยกเลิกแล้ว" } as const;
const STATUS_BADGE = {
  pending: "bg-warning/15 text-[#a35a00] dark:text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/10 text-destructive",
  voided: "bg-destructive/10 text-destructive",
} as const;

type Filter = SlipRow["status"] | "all";
const studentName = (s: SlipRow["student"]) => (s ? `${s.prefix ?? ""}${s.first_name} ${s.last_name}` : "—");

/** True from Tailwind's `lg` (1024px) up: queue + review side by side; below it the review opens as a popup. */
function useWide() {
  const q = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/** อนุมัติสลิป — org-wide reviews parents' PromptPay slips one at a time; approval writes the ledger row inside an RPC. */
export function SlipsTab() {
  const toast = useToast();
  const wide = useWide();
  const { data: slips = [], isLoading } = useSlipRequests();
  const review = useReviewSlip();
  const [filter, setFilter] = useState<Filter>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popup, setPopup] = useState(false);
  const [rejecting, setRejecting] = useState<SlipRow | null>(null);
  const [reason, setReason] = useState("");

  const counts = useMemo(
    () => ({
      pending: slips.filter((s) => s.status === "pending").length,
      approved: slips.filter((s) => s.status === "approved").length,
      rejected: slips.filter((s) => s.status === "rejected").length,
    }),
    [slips],
  );
  const shown = useMemo(() => (filter === "all" ? slips : slips.filter((s) => s.status === filter)), [slips, filter]);
  // Wide: keep something selected so the review panel is never empty while there is work.
  const selected = shown.find((s) => s.id === selectedId) ?? (wide ? (shown[0] ?? null) : null);

  /** After a decision, move to the next slip still waiting (the queue keeps flowing). */
  function advance(done: SlipRow) {
    const rest = shown.filter((s) => s.id !== done.id && s.status === "pending");
    setSelectedId(rest[0]?.id ?? null);
    if (!rest.length) setPopup(false);
  }

  async function approve(s: SlipRow, amount: number) {
    try {
      await review.mutateAsync({ id: s.id, amount });
      toast(`อนุมัติและเติมเงิน ${formatBaht(amount)} ฿ แล้ว`);
      advance(s);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  async function reject() {
    if (!rejecting || !reason.trim()) return;
    const s = rejecting;
    try {
      await review.mutateAsync({ id: s.id, reject_reason: reason.trim() });
      toast("ไม่อนุมัติสลิปแล้ว");
      setRejecting(null);
      setReason("");
      advance(s);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  const chip = (active: boolean) =>
    cn(
      "tappable flex h-12 shrink-0 items-center rounded-full border px-5 text-lg font-semibold transition-colors",
      active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-foreground/5",
    );

  const detail = selected && (
    <SlipReview key={selected.id} stacked={!wide} slip={selected} all={slips} busy={review.isPending} onApprove={(a) => void approve(selected, a)} onReject={() => setRejecting(selected)} />
  );

  return (
    <div className="space-y-4">
      <div className="scrollbar-hidden flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="สถานะสลิป">
        {(
          [
            ["pending", `รออนุมัติ (${counts.pending})`],
            ["approved", `อนุมัติแล้ว (${counts.approved})`],
            ["rejected", `ไม่อนุมัติ (${counts.rejected})`],
            ["all", "ทั้งหมด"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} className={chip(filter === key)} onClick={() => (setFilter(key), setSelectedId(null))}>
            {label}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {!isLoading && shown.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-14 text-center">
          <CheckmarkCircleIcon className="h-12 w-12 text-success" />
          <p className="text-xl font-semibold">{filter === "pending" ? "ไม่มีสลิปที่รออนุมัติ" : "ไม่มีรายการ"}</p>
          {filter === "pending" && <p className="text-lg text-muted-foreground">สลิปใหม่จากผู้ปกครองจะขึ้นที่นี่</p>}
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
          {/* Queue */}
          <ul className="space-y-2 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto lg:pr-1" aria-label="รายการสลิป">
            {shown.map((s) => {
              const dup = s.status === "pending" && findDuplicateSlips(s, slips).length > 0;
              const active = wide && selected?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => (setSelectedId(s.id), !wide && setPopup(true))}
                    className={cn(
                      "tappable flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-foreground/[0.03]",
                      active ? "border-foreground ring-2 ring-foreground" : "border-border",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold">{studentName(s.student)}</p>
                      <p className="truncate text-base text-muted-foreground">
                        {s.student?.student_code ?? "—"} · โอน {when(s.transferred_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full px-3 py-0.5 text-sm font-semibold", STATUS_BADGE[s.status])}>{SLIP_STATUS_LABEL[s.status]}</span>
                        {dup && (
                          <span className="flex items-center gap-1 rounded-full bg-warning/15 px-3 py-0.5 text-sm font-semibold text-[#a35a00] dark:text-warning">
                            <AlertTriangle className="h-4 w-4" />
                            อาจซ้ำ
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="shrink-0 text-2xl font-bold tabular-nums">{formatBaht(s.amount)} ฿</p>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Review panel (wide) */}
          {wide && <div className="min-w-0">{detail}</div>}
        </div>
      )}

      {/* Review popup (tablet portrait / narrow) */}
      {!wide && (
        <Modal open={popup && !!selected} onOpenChange={(o) => !o && (setPopup(false), setSelectedId(null))} title="ตรวจสลิป">
          {detail}
        </Modal>
      )}

      <Modal
        open={!!rejecting}
        onOpenChange={(o) => !o && (setRejecting(null), setReason(""))}
        title="ไม่อนุมัติสลิป"
        description="เหตุผลจะถูกส่งให้ผู้ปกครองทาง LINE"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" className="h-14 flex-1 text-lg" onClick={() => (setRejecting(null), setReason(""))}>
              ปิด
            </Button>
            <Button variant="destructive" className="h-14 flex-1 text-lg" disabled={!reason.trim() || review.isPending} onClick={() => void reject()}>
              ยืนยันไม่อนุมัติ
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {["ยอดเงินไม่ตรงกับสลิป", "สลิปไม่ชัด", "สลิปซ้ำ", "ไม่พบยอดเข้าบัญชี"].map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={chip(reason === r)}>
                {r}
              </button>
            ))}
          </div>
          <Field label="เหตุผล" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เลือกด้านบน หรือพิมพ์เอง" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/** One slip: the image inline (signed URL), who/when, duplicate warning, and the decision controls. */
function SlipReview({ slip, all, busy, stacked, onApprove, onReject }: { slip: SlipRow; all: SlipRow[]; busy: boolean; stacked?: boolean; onApprove: (amount: number) => void; onReject: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(slip.amount));
  const value = parseAmount(amount, TOPUP_MIN, TOPUP_MAX);
  const dups = slip.status === "pending" ? findDuplicateSlips(slip, all) : [];
  const [img, setImg] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let live = true;
    setImg(null);
    setImgError(false);
    slipImageUrl(slip.slip_path).then(
      (u) => live && setImg(u),
      () => live && setImgError(true),
    );
    return () => {
      live = false;
    };
  }, [slip.slip_path]);

  // Signed URLs last 60 s, so the full-size view asks for a fresh one.
  const openFull = () =>
    slipImageUrl(slip.slip_path).then(
      (url) => window.open(url, "_blank", "noopener"),
      (e) => toast(errMsg(e), "error"),
    );
  const differs = value !== null && value !== slip.amount;

  return (
    <div className={cn("grid gap-4", stacked ? "" : "rounded-2xl border border-border bg-card p-5 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
      {/* Slip image */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className={cn("flex items-center justify-center overflow-hidden rounded-xl border border-border bg-muted", stacked ? "min-h-56" : "min-h-72")}>
          {img ? (
            <img src={img} alt={`สลิปของ ${studentName(slip.student)}`} className="max-h-[60vh] w-full object-contain" />
          ) : imgError ? (
            <p className="px-4 text-center text-lg text-muted-foreground">โหลดรูปสลิปไม่สำเร็จ</p>
          ) : (
            <Spinner className="size-8" />
          )}
        </div>
        <Button variant="outline" className="h-14 text-lg" onClick={() => void openFull()}>
          <ImageIcon className="mr-2 h-5 w-5" />
          เปิดรูปเต็มจอ
        </Button>
      </div>

      {/* Facts + decision */}
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <p className="truncate text-2xl font-semibold">{studentName(slip.student)}</p>
          <p className="text-lg text-muted-foreground">รหัสนักเรียน {slip.student?.student_code ?? "—"}</p>
        </div>
        <dl className="divide-y divide-border rounded-xl border border-border">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-lg text-muted-foreground">ผู้ปกครองแจ้งโอน</dt>
            <dd className="text-2xl font-bold tabular-nums">{formatBaht(slip.amount)} ฿</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-lg text-muted-foreground">เวลาโอน</dt>
            <dd className="text-right text-lg">{when(slip.transferred_at)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-lg text-muted-foreground">ส่งเมื่อ</dt>
            <dd className="text-right text-lg">{when(slip.created_at)}</dd>
          </div>
        </dl>

        {dups.length > 0 && (
          <p className="flex items-start gap-3 rounded-xl bg-warning/15 px-4 py-3 text-lg text-[#7a4300] dark:text-warning" role="alert">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
            มีสลิปยอดเท่ากัน เวลาโอนใกล้กันภายใน 10 นาที ของนักเรียนคนนี้อีก {dups.length} รายการ — ตรวจให้แน่ใจว่าไม่ซ้ำ
          </p>
        )}

        {slip.status === "pending" ? (
          <>
            <Field label="ยอดที่อนุมัติ (บาท) — แก้ได้ถ้าไม่ตรงกับสลิป">
              <Input
                inputMode="numeric"
                className="h-16 text-right !text-3xl font-bold tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </Field>
            {differs && <p className="text-base font-medium text-[#a35a00] dark:text-warning">ยอดที่อนุมัติต่างจากที่ผู้ปกครองแจ้ง ({formatBaht(slip.amount)} ฿)</p>}
            {value === null && <p className="text-base font-medium text-destructive">ใส่ยอด {TOPUP_MIN}–{TOPUP_MAX} บาท</p>}
            <div className="mt-auto flex flex-col gap-3">
              <Button className="h-16 text-xl" disabled={value === null || busy} onClick={() => value !== null && onApprove(value)}>
                {busy ? <Spinner /> : value === null ? "อนุมัติ" : `อนุมัติ เติมเงิน ${formatBaht(value)} ฿`}
              </Button>
              <Button variant="outline" className="h-16 text-xl text-destructive" disabled={busy} onClick={onReject}>
                ไม่อนุมัติ
              </Button>
            </div>
          </>
        ) : (
          <div className={cn("rounded-xl px-4 py-4", STATUS_BADGE[slip.status])}>
            <p className="text-xl font-semibold">
              {SLIP_STATUS_LABEL[slip.status]}
              {slip.status === "approved" && slip.approved_amount !== null && ` · ${formatBaht(slip.approved_amount)} ฿`}
            </p>
            {slip.status === "rejected" && <p className="mt-1 text-lg text-foreground">เหตุผล: {slip.reject_reason}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
