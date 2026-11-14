import { useState } from "react";
import { CartIcon, CoinIcon, DownloadIcon, ImageIcon, PricetagIcon } from "@/components/icons";
import { Button, Field, Input, Skeleton } from "@/components/ui";
import { useCardReport } from "@/hooks/useCardTopup";
import { reportCsv, TX_TYPE_LABEL } from "@/lib/cardTopup";
import { downloadCsv } from "@/lib/csv";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";

type Icon = typeof CartIcon;

/** A date in Asia/Bangkok as yyyy-mm-dd ("sv" formats ISO-style). */
const bangkokDate = (d: Date) => d.toLocaleDateString("sv", { timeZone: "Asia/Bangkok" });
const daysAgo = (n: number) => bangkokDate(new Date(Date.now() - n * 86400000));

const PRESETS = [
  { key: "today", label: "วันนี้", range: (): [string, string] => [daysAgo(0), daysAgo(0)] },
  { key: "yesterday", label: "เมื่อวาน", range: (): [string, string] => [daysAgo(1), daysAgo(1)] },
  { key: "week", label: "7 วันล่าสุด", range: (): [string, string] => [daysAgo(6), daysAgo(0)] },
  { key: "month", label: "เดือนนี้", range: (): [string, string] => [`${daysAgo(0).slice(0, 8)}01`, daysAgo(0)] },
] as const;
type Preset = (typeof PRESETS)[number]["key"] | "custom";

type Section = "cashier" | "terminal" | "voids";

/** รายงาน — drawer reconciliation: cash to hand in per cashier, totals per terminal, and every void. */
export function ReportTab() {
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(() => daysAgo(0));
  const [to, setTo] = useState(() => daysAgo(0));
  const [section, setSection] = useState<Section>("cashier");
  const { data: r, isLoading, error } = useCardReport(from, to);

  function pick(key: Preset) {
    setPreset(key);
    const p = PRESETS.find((x) => x.key === key);
    if (p) {
      const [f, t] = p.range();
      setFrom(f);
      setTo(t);
    }
  }

  const chip = (active: boolean) =>
    cn(
      "tappable flex h-12 shrink-0 items-center gap-2 rounded-full border px-5 text-lg font-semibold transition-colors",
      active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-foreground/5",
    );

  return (
    <div className="space-y-5">
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
        <Button
          variant="outline"
          className="h-14 shrink-0 px-5 text-lg"
          disabled={!r}
          onClick={() => r && downloadCsv(`card-report-${from}_${to}.csv`, reportCsv(r))}
        >
          <DownloadIcon className="mr-2 h-5 w-5" />
          ส่งออก CSV
        </Button>
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

      {isLoading && (
        <div className="space-y-3" role="status" aria-label="กำลังโหลด">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      )}
      {error && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-lg text-destructive">{error instanceof Error ? error.message : "โหลดรายงานไม่สำเร็จ"}</p>
      )}

      {r && (
        <>
          {/* Headline: the cash that must be in the drawer */}
          <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5 lg:p-6">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-success/15 text-success">
              <CoinIcon className="h-9 w-9" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold">เงินสดที่ต้องนำส่ง</p>
              <p className="text-base text-muted-foreground">รวมยอดเติมเงินสดทุกแคชเชียร์ในช่วงนี้</p>
            </div>
            <p className="font-heading text-5xl font-bold tabular-nums lg:text-6xl">{formatBaht(r.totals.cash_topup_total)} ฿</p>
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={CartIcon} tone="bg-sky-500/15 text-sky-600 dark:text-sky-400" label="ยอดขาย" sub={`${r.totals.sales_count} ครั้ง`} value={r.totals.sales_total} />
            <Stat icon={CoinIcon} tone="bg-success/15 text-success" label="เติมเงินสด" value={r.totals.cash_topup_total} />
            <Stat icon={ImageIcon} tone="bg-violet-500/15 text-violet-600 dark:text-violet-400" label="เติมผ่านสลิป" value={r.totals.slip_topup_total} />
            <Stat icon={PricetagIcon} tone="bg-amber-500/15 text-amber-700 dark:text-amber-400" label="ถอนคืนเงิน" value={r.totals.refund_total} />
          </div>

          {/* Section switch */}
          <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist" aria-label="รายละเอียด">
            {(
              [
                ["cashier", `ตามแคชเชียร์ (${r.by_cashier.length})`],
                ["terminal", `ตามเครื่องขาย (${r.by_terminal.length})`],
                ["voids", `รายการยกเลิก (${r.voids.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={section === key}
                onClick={() => setSection(key)}
                className={cn(
                  "tappable flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl px-3 text-lg font-semibold transition-colors",
                  section === key ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                  key === "voids" && r.voids.length > 0 && section !== key && "text-destructive",
                )}
              >
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {section === "cashier" &&
            (r.by_cashier.length === 0 ? (
              <Empty text="ไม่มีรายการของแคชเชียร์ในช่วงนี้" />
            ) : (
              <DataTable
                head={["แคชเชียร์", "ยอดขาย", "จำนวนครั้งที่ขาย", "เงินสดที่ต้องนำส่ง"]}
                rows={r.by_cashier.map((c) => ({
                  key: c.profile_id,
                  cells: [
                    <span key="n" className="font-semibold">{c.name}</span>,
                    `${formatBaht(c.sales_total)} ฿`,
                    `${c.sales_count} ครั้ง`,
                    <span key="c" className="text-xl font-bold text-success">{formatBaht(c.cash_topup_total)} ฿</span>,
                  ],
                }))}
              />
            ))}

          {section === "terminal" &&
            (r.by_terminal.length === 0 ? (
              <Empty text="ไม่มีรายการในช่วงนี้" />
            ) : (
              <DataTable
                head={["เครื่องขาย", "ยอดขาย", "จำนวนครั้งที่ขาย", "เติมเงินสด", "เติมผ่านสลิป"]}
                rows={r.by_terminal.map((t) => ({
                  key: t.terminal_id ?? "none",
                  cells: [
                    <span key="n" className="font-semibold">{t.name ?? "ไม่ระบุเครื่อง (สลิป)"}</span>,
                    <span key="s" className="font-semibold">{formatBaht(t.sales_total)} ฿</span>,
                    `${t.sales_count} ครั้ง`,
                    `${formatBaht(t.cash_topup_total)} ฿`,
                    `${formatBaht(t.slip_topup_total)} ฿`,
                  ],
                }))}
              />
            ))}

          {section === "voids" &&
            (r.voids.length === 0 ? (
              <Empty text="ไม่มีรายการที่ยกเลิก" />
            ) : (
              <DataTable
                head={["เวลายกเลิก", "รายการ", "นักเรียน", "ยกเลิกโดย", "เหตุผล", "ยอด"]}
                rows={r.voids.map((v) => ({
                  key: v.id,
                  cells: [
                    new Date(v.voided_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }),
                    TX_TYPE_LABEL[v.type],
                    v.student_name,
                    v.voided_by_name ?? v.cashier,
                    v.void_reason,
                    <span key="a" className="font-bold text-destructive line-through decoration-2">{formatBaht(Math.abs(v.amount))} ฿</span>,
                  ],
                }))}
              />
            ))}
        </>
      )}
    </div>
  );
}

function Stat({ icon: I, tone, label, sub, value }: { icon: Icon; tone: string; label: string; sub?: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tone)}>
          <I className="h-6 w-6" />
        </span>
        <p className="min-w-0 text-lg font-medium leading-tight">
          {label}
          {sub && <span className="block text-base font-normal text-muted-foreground">{sub}</span>}
        </p>
      </div>
      <p className="mt-3 font-heading text-3xl font-bold tabular-nums">{formatBaht(value)} ฿</p>
    </div>
  );
}

/** Plain list table: first column left-aligned, the rest right-aligned (amounts) except free text in voids. */
function DataTable({ head, rows }: { head: string[]; rows: { key: string; cells: React.ReactNode[] }[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-lg">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-base text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn("whitespace-nowrap px-5 py-3 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((c, i) => (
                <td key={i} className={cn("px-5 py-3.5 tabular-nums", i > 0 && "text-right")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="col-span-full rounded-2xl border border-dashed border-border px-4 py-12 text-center text-lg text-muted-foreground">{text}</p>;
}
