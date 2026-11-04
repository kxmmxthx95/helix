import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronForward, DocumentTextIcon, FileUp, PricetagIcon, ShieldIcon } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { Sheet, SheetStyleContext } from "@/components/Sheet";
import { TopupFlipCard } from "@/components/TopupFlipCard";
import { StudentQrCard } from "@/components/StudentQrCard";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, EmptyState, Field, Input, Select, Skeleton } from "@/components/ui";
import { studentAvatarUrl } from "@/hooks/useAvatar";
import {
  useCardTransactions,
  useMyCardStudents,
  usePortalSummary,
  useSetDailyLimit,
  useSetFrozen,
  useSlipRequests,
  type PortalStudent,
} from "@/hooks/useCardTopup";
import { TX_TYPE_LABEL } from "@/lib/cardTopup";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";
import { TopupSlipForm, useCanTopup } from "@/routes/CardTopupForm";
import { SLIP_STATUS_LABEL } from "@/routes/CardTopupSlips";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
const fullName = (s: PortalStudent) => `${s.prefix ?? ""}${s.first_name} ${s.last_name}`;

/** Parent: balance, history, PromptPay slip top-up, daily limit, freeze. Student: balance + history only. */
export function PortalView({ canAct }: { canAct: boolean }) {
  const { data: kids = [], isLoading } = useMyCardStudents();
  const [pickedId, setPickedId] = useState("");
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (kids.length === 0) return <EmptyState title="ไม่พบข้อมูลนักเรียน" />;
  const kid = kids.find((k) => k.id === pickedId) ?? kids[0]!;

  return (
    <div className="space-y-3">
      {kids.length > 1 && (
        <Select value={kid.id} onChange={(e) => setPickedId(e.target.value)} aria-label="เลือกนักเรียน">
          {kids.map((k) => (
            <option key={k.id} value={k.id}>
              {fullName(k)}
            </option>
          ))}
        </Select>
      )}
      <ChildCard key={kid.id} kid={kid} canAct={canAct} />
    </div>
  );
}

function ChildCard({ kid, canAct }: { kid: PortalStudent; canAct: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: sum, isLoading } = usePortalSummary(kid.id);
  const { data: txs = [] } = useCardTransactions(kid.id);
  const { data: slips = [] } = useSlipRequests();
  const setFrozen = useSetFrozen();
  const [limitOpen, setLimitOpen] = useState(false);
  const canTopup = useCanTopup(kid);
  const [topupOpen, setTopupOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const goTopup = () => navigate(`/card-topup/${kid.id}`); // desktop: standalone page
  const mySlips = slips.filter((s) => s.student_id === kid.id && s.status !== "approved");

  const balance = (
    <div>
      <p className="text-sm text-muted-foreground">ยอดคงเหลือ</p>
      <p className="font-heading text-4xl font-semibold">{isLoading || !sum ? "…" : `${formatBaht(sum.balance)} ฿`}</p>
      {sum && (
        <p className="text-xs text-muted-foreground">
          {sum.daily_limit === null ? "ไม่จำกัดวงเงินต่อวัน" : `วงเงินต่อวัน ${formatBaht(sum.daily_limit)} ฿ · ใช้วันนี้ ${formatBaht(sum.spent_today)} ฿`}
          {sum.card_status === "frozen" && (sum.card_frozen_by === "school" ? " · บัตรถูกระงับโดยโรงเรียน — ติดต่อฝ่ายการเงิน" : " · บัตรถูกระงับ")}
          {sum.card_status === null && " · ยังไม่มี QR — ติดต่อโรงเรียน"}
        </p>
      )}
    </div>
  );

  const manageButtons = (
    <>
      {canAct && (
        <Button variant="outline" onClick={() => setLimitOpen(true)}>
          ตั้งวงเงินต่อวัน
        </Button>
      )}
      {canAct && sum?.card_status && !(sum.card_status === "frozen" && sum.card_frozen_by === "school") && (
        <Button
          variant="outline"
          disabled={setFrozen.isPending}
          onClick={() =>
            setFrozen.mutate(
              { student_id: kid.id, frozen: sum.card_status === "active" },
              { onError: (e) => toast(errMsg(e), "error") },
            )
          }
        >
          {sum.card_status === "frozen" ? "ปลดระงับบัตร" : "ระงับบัตร"}
        </Button>
      )}
    </>
  );

  const slipList = (
    <div className="space-y-1">
      {mySlips.slice(0, 5).map((s) => (
        <p key={s.id} className="text-xs text-muted-foreground">
          {new Date(s.created_at).toLocaleDateString("th-TH")} · {formatBaht(s.amount)} ฿ · {SLIP_STATUS_LABEL[s.status]}
          {s.reject_reason ? ` (${s.reject_reason})` : ""}
        </p>
      ))}
    </div>
  );

  const history = (
    <ul className="space-y-1">
      {txs.map((t) => (
        <li key={t.id} className={cn("flex items-center justify-between gap-2 text-xs", t.voided_at && "text-muted-foreground line-through")}>
          <span className="min-w-0 truncate">
            {new Date(t.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} · {TX_TYPE_LABEL[t.type]}
            {t.voided_at ? " (ยกเลิก)" : ""}
          </span>
          <span className="shrink-0">
            {t.amount > 0 ? "+" : "−"}
            {formatBaht(Math.abs(t.amount))}
          </span>
        </li>
      ))}
      {txs.length === 0 && <li className="text-xs text-muted-foreground">ยังไม่มีรายการ</li>}
    </ul>
  );

  return (
    <>
      {/* Phone: flip card, balance, top-up card, collapsible sections. */}
      <div className="space-y-3 pt-6 md:hidden">
        <TopupFlipCard kid={kid} />
        <section className="rounded-2xl bg-card p-4 shadow-card">{balance}</section>
        <button type="button" onClick={() => setHistoryOpen(true)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card active:scale-[0.99]">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <DocumentTextIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">ประวัติรายการ</span>
          <ChevronForward className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        {mySlips.length > 0 && (
          <Disclosure icon={FileUp} title="คำขอเติมเงินผ่านสลิป" meta={mySlips.length}>
            {slipList}
          </Disclosure>
        )}
        {canAct && (
          <Disclosure icon={ShieldIcon} title="วงเงินและสถานะบัตร">
            <div className="flex flex-wrap gap-2">{manageButtons}</div>
          </Disclosure>
        )}
        {canTopup && (
          <Disclosure
            icon={PricetagIcon}
            title="เติมเงิน"
            subtitle="โอนพร้อมเพย์แล้วแนบสลิป"
            tile="bg-primary text-primary-foreground"
            open={topupOpen}
            onOpenChange={setTopupOpen}
          >
            <TopupSlipForm kid={kid} onSent={() => setTopupOpen(false)} />
          </Disclosure>
        )}
      </div>

      <Card className="hidden space-y-4 md:block">
        <div className="flex items-center gap-3">
          <Avatar name={fullName(kid)} src={studentAvatarUrl(kid)} className="size-14 text-lg" />
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-semibold">{fullName(kid)}</p>
            <p className="text-xs text-muted-foreground">{kid.student_code}</p>
          </div>
        </div>
        {balance}
        <StudentQrCard studentId={kid.id} studentName={fullName(kid)} />
        {(canTopup || canAct) && (
          <div className="flex flex-wrap gap-2">
            {canTopup && <Button onClick={goTopup}>เติมเงิน (โอนพร้อมเพย์)</Button>}
            {manageButtons}
          </div>
        )}
        {mySlips.length > 0 && (
          <div className="space-y-1">
            <p className="font-ui text-sm font-semibold">คำขอเติมเงินผ่านสลิป</p>
            {slipList}
          </div>
        )}
        <div className="space-y-1">
          <p className="font-ui text-sm font-semibold">ประวัติรายการ</p>
          <div className="max-h-[40vh] overflow-y-auto">{history}</div>
        </div>
      </Card>

      {/* The student shell makes Sheets bottom cards on phones; this one is a side drawer. */}
      <SheetStyleContext.Provider value="drawer">
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen} title="ประวัติรายการ" closable>
          {history}
        </Sheet>
      </SheetStyleContext.Provider>
      {canAct && <LimitModal open={limitOpen} kid={kid} current={sum?.daily_limit ?? null} onClose={() => setLimitOpen(false)} />}
    </>
  );
}

/** Native <details> row: icon tile, title, chevron — the phone layout's collapsible sections. Pass open/onOpenChange to control it. */
function Disclosure({
  icon: Icon,
  title,
  subtitle,
  tile = "bg-accent-soft text-accent",
  meta,
  open,
  onOpenChange,
  children,
}: {
  icon: typeof DocumentTextIcon;
  title: string;
  subtitle?: string;
  tile?: string;
  meta?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-2xl bg-card shadow-card" open={open} onToggle={onOpenChange ? (e) => onOpenChange(e.currentTarget.open) : undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tile)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{title}</span>
          {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        {!!meta && <span className="rounded-full bg-primary px-2 text-xs font-semibold leading-5 text-primary-foreground">{meta}</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function LimitModal({ open, kid, current, onClose }: { open: boolean; kid: PortalStudent; current: number | null; onClose: () => void }) {
  const toast = useToast();
  const setLimit = useSetDailyLimit();
  const [text, setText] = useState("");
  const value = text.trim() === "" ? null : Number(text);
  const valid = value === null || (Number.isInteger(value) && value > 0 && value <= 100000);

  async function save(limit: number | null) {
    try {
      await setLimit.mutateAsync({ student_id: kid.id, limit });
      toast(limit === null ? "ยกเลิกวงเงินแล้ว (ไม่จำกัด)" : "ตั้งวงเงินแล้ว");
      setText("");
      onClose();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="วงเงินใช้จ่ายต่อวัน"
      description={current === null ? "ตอนนี้ไม่จำกัดวงเงิน" : `ตอนนี้ ${formatBaht(current)} บาทต่อวัน`}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" disabled={setLimit.isPending} onClick={() => void save(null)}>
            ไม่จำกัด
          </Button>
          <Button type="button" className="flex-1" disabled={!valid || value === null || setLimit.isPending} onClick={() => void save(value)}>
            บันทึกวงเงิน
          </Button>
        </div>
      }
    >
      <Field label="วงเงินต่อวัน (บาท)">
        <Input inputMode="numeric" autoComplete="off" value={text} onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      </Field>
    </Modal>
  );
}
