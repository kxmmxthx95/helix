import { useState } from "react";
import { DownloadIcon } from "@/components/icons";
import { Button, Card, Field, Input, Skeleton } from "@/components/ui";
import { useCardReport } from "@/hooks/useCardTopup";
import { reportCsv, TX_TYPE_LABEL } from "@/lib/cardTopup";
import { downloadCsv } from "@/lib/csv";
import { formatBaht } from "@/lib/tuition";

/** Today's date in Asia/Bangkok as yyyy-mm-dd ("sv" formats ISO-style). */
const bangkokToday = () => new Date().toLocaleDateString("sv", { timeZone: "Asia/Bangkok" });

/** รายงาน — per terminal / per cashier totals for drawer reconciliation, plus every void. */
export function ReportTab() {
  const [from, setFrom] = useState(bangkokToday);
  const [to, setTo] = useState(bangkokToday);
  const { data: r, isLoading, error } = useCardReport(from, to);
  const num = "px-3 py-1.5 text-right";

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-3">
        <Field label="ตั้งแต่วันที่">
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="ถึงวันที่">
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button variant="outline" disabled={!r} onClick={() => r && downloadCsv(`card-report-${from}_${to}.csv`, reportCsv(r))}>
          <DownloadIcon className="size-4" />
          ส่งออก CSV
        </Button>
      </Card>

      {isLoading && <Skeleton className="h-32 w-full" />}
      {error && <Card className="text-sm text-destructive">{error instanceof Error ? error.message : "โหลดรายงานไม่สำเร็จ"}</Card>}
      {r && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={`ยอดขาย (${r.totals.sales_count} ครั้ง)`} value={r.totals.sales_total} />
            <Stat label="เติมเงินสด" value={r.totals.cash_topup_total} />
            <Stat label="เติมผ่านสลิป" value={r.totals.slip_topup_total} />
            <Stat label="ถอนคืนเงิน" value={r.totals.refund_total} />
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <caption className="px-3 py-2 text-left font-ui text-sm font-semibold">ตามเครื่องขาย</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">เครื่อง</th>
                  <th className={num}>ครั้งที่ขาย</th>
                  <th className={num}>ยอดขาย</th>
                  <th className={num}>เติมเงินสด</th>
                  <th className={num}>เติมผ่านสลิป</th>
                </tr>
              </thead>
              <tbody>
                {r.by_terminal.map((t) => (
                  <tr key={t.terminal_id ?? "none"} className="border-t border-border">
                    <td className="px-3 py-1.5">{t.name ?? "ไม่ระบุเครื่อง (สลิป)"}</td>
                    <td className={num}>{t.sales_count}</td>
                    <td className={num}>{formatBaht(t.sales_total)}</td>
                    <td className={num}>{formatBaht(t.cash_topup_total)}</td>
                    <td className={num}>{formatBaht(t.slip_topup_total)}</td>
                  </tr>
                ))}
                {r.by_terminal.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-xs text-muted-foreground">
                      ไม่มีรายการในช่วงนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <caption className="px-3 py-2 text-left font-ui text-sm font-semibold">ตามแคชเชียร์ (ยอดเงินสดที่ต้องนำส่ง = เติมเงินสด)</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">ผู้ทำรายการ</th>
                  <th className={num}>ครั้งที่ขาย</th>
                  <th className={num}>ยอดขาย</th>
                  <th className={num}>เติมเงินสด</th>
                </tr>
              </thead>
              <tbody>
                {r.by_cashier.map((c) => (
                  <tr key={c.profile_id} className="border-t border-border">
                    <td className="px-3 py-1.5">{c.name}</td>
                    <td className={num}>{c.sales_count}</td>
                    <td className={num}>{formatBaht(c.sales_total)}</td>
                    <td className={num}>{formatBaht(c.cash_topup_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="space-y-1">
            <p className="font-ui text-sm font-semibold">รายการที่ยกเลิก ({r.voids.length})</p>
            {r.voids.map((v) => (
              <p key={v.id} className="text-xs text-muted-foreground">
                {new Date(v.voided_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} · {TX_TYPE_LABEL[v.type]}{" "}
                {formatBaht(Math.abs(v.amount))} · {v.student_name} · {v.cashier} · {v.void_reason}
              </p>
            ))}
            {r.voids.length === 0 && <p className="text-xs text-muted-foreground">ไม่มีรายการที่ยกเลิก</p>}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-semibold">{formatBaht(value)} ฿</p>
    </Card>
  );
}
