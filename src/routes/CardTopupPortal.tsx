import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronForward, DocumentTextIcon, FileUp, CoinIcon, LockIcon, ShieldIcon } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { tick } from "@/lib/sound";
import { Sheet } from "@/components/Sheet";
import { TopupFlipCard } from "@/components/TopupFlipCard";
import { StudentQrCard } from "@/components/StudentQrCard";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, EmptyState, Field, Input, Select, Skeleton } from "@/components/ui";
import { studentAvatarUrl } from "@/hooks/useAvatar";
import {
  useCardPinStatus,
  useCardTransactions,
  useMyCardStudents,
  useRfidStatus,
  useSetRfidFrozen,
  usePortalSummary,
  useSetCardPin,
  useSetDailyLimit,
  useSetFrozen,
  useSlipRequests,
  type PortalStudent,
} from "@/hooks/useCardTopup";
import { TOPUP_OPEN, TX_TYPE_LABEL } from "@/lib/cardTopup";
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
  const [pinOpen, setPinOpen] = useState(false);
  const { data: pinSt } = useCardPinStatus(kid.id);
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

  // Student and parent both set it: a cloned card alone cannot make a big purchase once a PIN exists.
  const pinButton = (
    <Button variant="outline" onClick={() => setPinOpen(true)}>
      {pinSt?.has_pin ? "เปลี่ยน PIN บัตร" : "ตั้ง PIN บัตร"}
    </Button>
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
        <section className="rounded-2xl bg-card p-4 text-center shadow-card">{balance}</section>
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
        <button type="button" onClick={() => setPinOpen(true)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card active:scale-[0.99]">
          <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <LockIcon className="h-4 w-4" />
            {pinSt && !pinSt.has_pin && <span aria-label="ยังไม่ได้ตั้ง PIN" className="absolute -right-1 -top-1 size-3 rounded-full bg-destructive ring-2 ring-card" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">PIN บัตร</span>
            <span className="block truncate text-xs text-muted-foreground">{pinSt?.has_pin ? "ตั้งแล้ว · แตะเพื่อเปลี่ยน" : "ยังไม่ได้ตั้ง · แตะเพื่อตั้ง"}</span>
          </span>
          <ChevronForward className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        <RfidCard kid={kid} canAct={canAct} />
        {canAct && (
          <Disclosure icon={ShieldIcon} title="วงเงินและสถานะบัตร">
            <div className="flex flex-wrap gap-2">{manageButtons}</div>
          </Disclosure>
        )}
        {canTopup && !TOPUP_OPEN && (
          <div aria-disabled="true" className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 opacity-60 shadow-card">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <CoinIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">เติมเงิน</span>
              <span className="block truncate text-xs text-muted-foreground">ยังไม่เปิดใช้งาน</span>
            </span>
            <LockIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        )}
        {canTopup && TOPUP_OPEN && (
          <Disclosure
            icon={CoinIcon}
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
        {(
          <div className="flex flex-wrap gap-2">
            {pinButton}
            {canTopup && (
              <Button onClick={goTopup} disabled={!TOPUP_OPEN}>
                {TOPUP_OPEN ? "เติมเงิน (โอนพร้อมเพย์)" : "เติมเงิน (ยังไม่เปิดใช้งาน)"}
              </Button>
            )}
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

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen} title="ประวัติรายการ" closable bottomOnPhone bodyClassName="px-0 pt-1">
        <ul className="divide-y divide-border/60">
          {txs.map((t) => {
            const d = new Date(t.created_at);
            const plus = t.amount > 0;
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-semibold", t.voided_at ? "bg-muted text-muted-foreground" : plus ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600")}>
                  {plus ? "+" : "−"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-[15px] font-semibold", t.voided_at && "text-muted-foreground line-through")}>{TX_TYPE_LABEL[t.type]}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                    {t.voided_at && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">ยกเลิกแล้ว</span>}
                  </p>
                </div>
                <span className={cn("shrink-0 text-[15px] font-semibold tabular-nums", t.voided_at ? "text-muted-foreground line-through" : plus ? "text-emerald-600" : "text-foreground")}>
                  {plus ? "+" : "−"}
                  {formatBaht(Math.abs(t.amount))}
                </span>
              </li>
            );
          })}
          {txs.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">ยังไม่มีรายการ</li>}
        </ul>
      </Sheet>
      <PinModal open={pinOpen} kid={kid} hasPin={!!pinSt?.has_pin} threshold={pinSt?.pin_threshold ?? null} onClose={() => setPinOpen(false)} />
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

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

/** Lost RFID card: freeze just the RFID card (phone barcode keeps working). Hidden when no RFID card is bound. */
function RfidCard({ kid, canAct }: { kid: PortalStudent; canAct: boolean }) {
  const toast = useToast();
  const { data: rfid } = useRfidStatus(kid.id);
  const setFrozen = useSetRfidFrozen();
  const [confirm, setConfirm] = useState(false);
  if (!rfid) return null;
  const frozen = rfid.status === "frozen";
  const bySchool = frozen && rfid.frozen_by === "school";
  const tappable = !frozen || (canAct && !bySchool);
  const subtitle = !frozen ? "แตะเพื่อระงับ (บัตรหาย)" : bySchool ? "ระงับโดยโรงเรียน — ติดต่อฝ่ายการเงิน" : canAct ? "ระงับอยู่ · แตะเพื่อปลดระงับ" : "ระงับอยู่ · ให้ผู้ปกครองปลดระงับ";

  function run(frozenNext: boolean) {
    setFrozen.mutate(
      { student_id: kid.id, frozen: frozenNext },
      { onSuccess: () => (setConfirm(false), toast(frozenNext ? "ระงับบัตร RFID แล้ว" : "ปลดระงับบัตร RFID แล้ว")), onError: (e) => toast(errMsg(e), "error") },
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={!tappable || setFrozen.isPending}
        onClick={() => (frozen ? run(false) : setConfirm(true))}
        className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card active:scale-[0.99] disabled:active:scale-100"
      >
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", frozen ? "bg-destructive/10 text-destructive" : "bg-accent-soft text-accent")}>
          <ShieldIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">บัตร RFID · ลงท้าย {rfid.last4}</span>
          <span className={cn("block truncate text-xs", frozen ? "text-destructive" : "text-muted-foreground")}>{subtitle}</span>
        </span>
        {tappable && <ChevronForward className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      <Modal
        open={confirm}
        centered
        onOpenChange={setConfirm}
        title="ระงับบัตร RFID?"
        description={`บัตรที่ลงท้าย ${rfid.last4} จะใช้ซื้อของไม่ได้ทันที บาร์โค้ดในมือถือยังใช้ได้ตามปกติ`}
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirm(false)}>
              ยกเลิก
            </Button>
            <Button type="button" variant="destructive" className="flex-1 bg-destructive text-white hover:bg-destructive/90" disabled={setFrozen.isPending} onClick={() => run(true)}>
              ระงับบัตร
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">ปลดระงับได้โดยผู้ปกครองหรือโรงเรียนเท่านั้น</p>
      </Modal>
    </>
  );
}

/** Centered pop-up with an on-screen keypad: enter the 4-digit PIN, then enter it again; saves when both match. */
function PinModal({ open, kid, hasPin, threshold, onClose }: { open: boolean; kid: PortalStudent; hasPin: boolean; threshold: number | null; onClose: () => void }) {
  const toast = useToast();
  const setPin = useSetCardPin();
  const [first, setFirst] = useState<string | null>(null); // null = step 1 (new PIN), set = step 2 (confirm)
  const [digits, setDigits] = useState("");
  const [mismatch, setMismatch] = useState(false);

  function reset() {
    setFirst(null);
    setDigits("");
    setMismatch(false);
  }

  async function save(pin: string) {
    try {
      await setPin.mutateAsync({ student_id: kid.id, pin });
      toast(hasPin ? "เปลี่ยน PIN แล้ว" : "ตั้ง PIN แล้ว");
      reset();
      onClose();
    } catch (e) {
      toast(errMsg(e), "error");
      reset();
    }
  }

  function press(k: string) {
    if (setPin.isPending) return;
    tick(k === "C" || k === "⌫" ? 700 : 1000);
    if (k === "C") return setDigits("");
    if (k === "⌫") return setDigits((d) => d.slice(0, -1));
    if (digits.length >= 4) return;
    const next = digits + k;
    setDigits(next);
    if (next.length < 4) return;
    if (first === null) {
      setMismatch(false);
      setTimeout(() => (setFirst(next), setDigits("")), 150);
    } else if (next === first) {
      void save(next);
    } else {
      setTimeout(() => (reset(), setMismatch(true)), 250);
    }
  }

  return (
    <Modal
      open={open}
      centered
      onOpenChange={(o) => {
        if (!o) (reset(), onClose());
      }}
      title={hasPin ? "เปลี่ยน PIN บัตร" : "ตั้ง PIN บัตร"}
    >
      <div className="flex flex-col items-center gap-4">
        <p className={cn("text-sm font-medium", mismatch ? "text-destructive" : "text-muted-foreground")}>
          {mismatch ? "PIN ไม่ตรงกัน เริ่มใหม่อีกครั้ง" : first === null ? "ตั้ง PIN ใหม่" : "ยืนยัน PIN อีกครั้ง"}
        </p>
        <div className="flex gap-3" aria-label={`ใส่แล้ว ${digits.length} จาก 4 หลัก`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("size-3.5 rounded-full border-2 border-primary transition-colors", i < digits.length && "bg-primary")} />
          ))}
        </div>
        <div className="grid w-full max-w-[16rem] grid-cols-3 gap-2">
          {PAD_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              disabled={setPin.isPending}
              className="tappable h-14 rounded-2xl bg-muted text-xl font-semibold active:scale-95 disabled:opacity-50"
            >
              {k}
            </button>
          ))}
        </div>
        <p className="text-center text-sm text-destructive">
          {threshold === null ? "ตัวเลข 4 หลัก ใช้ยืนยันเมื่อซื้อยอดสูง" : `ตัวเลข 4 หลัก ใช้ยืนยันเมื่อซื้อตั้งแต่ ${formatBaht(threshold)} บาท ขึ้นไป`}
        </p>
        <p className="text-center text-xs text-muted-foreground">ลืม PIN ให้ติดต่อโรงเรียนเพื่อรีเซ็ต แล้วตั้งใหม่ได้ที่หน้านี้</p>
      </div>
    </Modal>
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
