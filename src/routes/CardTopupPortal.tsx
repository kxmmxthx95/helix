import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, EmptyState, Field, Input, Select, Skeleton, Spinner } from "@/components/ui";
import { studentAvatarUrl } from "@/hooks/useAvatar";
import {
  useCardTransactions,
  useMyCardStudents,
  usePortalSummary,
  useSetDailyLimit,
  useSetFrozen,
  useSlipRequests,
  useSubmitSlip,
  type PortalStudent,
} from "@/hooks/useCardTopup";
import { useSchoolSettings, schoolLogoUrl } from "@/hooks/useSettings";
import { parseAmount, TOPUP_MAX, TOPUP_MIN, TX_TYPE_LABEL } from "@/lib/cardTopup";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";
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
  const toast = useToast();
  const { data: sum, isLoading } = usePortalSummary(kid.id);
  const { data: txs = [] } = useCardTransactions(kid.id);
  const { data: slips = [] } = useSlipRequests();
  const setFrozen = useSetFrozen();
  const [topupOpen, setTopupOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const mySlips = slips.filter((s) => s.student_id === kid.id && s.status !== "approved");

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={fullName(kid)} src={studentAvatarUrl(kid)} className="size-14 text-lg" />
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-semibold">{fullName(kid)}</p>
          <p className="text-xs text-muted-foreground">{kid.student_code}</p>
        </div>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">ยอดคงเหลือ</p>
        <p className="font-heading text-4xl font-semibold">{isLoading || !sum ? "…" : `${formatBaht(sum.balance)} ฿`}</p>
        {sum && (
          <p className="text-xs text-muted-foreground">
            {sum.daily_limit === null ? "ไม่จำกัดวงเงินต่อวัน" : `วงเงินต่อวัน ${formatBaht(sum.daily_limit)} ฿ · ใช้วันนี้ ${formatBaht(sum.spent_today)} ฿`}
            {sum.card_status === "frozen" && (sum.card_frozen_by === "school" ? " · บัตรถูกระงับโดยโรงเรียน — ติดต่อฝ่ายการเงิน" : " · บัตรถูกระงับ")}
            {sum.card_status === null && " · ยังไม่ได้ผูกบัตร"}
          </p>
        )}
      </div>
      {canAct && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setTopupOpen(true)}>เติมเงิน (โอนพร้อมเพย์)</Button>
          <Button variant="outline" onClick={() => setLimitOpen(true)}>
            ตั้งวงเงินต่อวัน
          </Button>
          {sum?.card_status && !(sum.card_status === "frozen" && sum.card_frozen_by === "school") && (
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
        </div>
      )}

      {mySlips.length > 0 && (
        <div className="space-y-1">
          <p className="font-ui text-sm font-semibold">คำขอเติมเงินผ่านสลิป</p>
          {mySlips.slice(0, 5).map((s) => (
            <p key={s.id} className="text-xs text-muted-foreground">
              {new Date(s.created_at).toLocaleDateString("th-TH")} · {formatBaht(s.amount)} ฿ · {SLIP_STATUS_LABEL[s.status]}
              {s.reject_reason ? ` (${s.reject_reason})` : ""}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <p className="font-ui text-sm font-semibold">ประวัติรายการ</p>
        <ul className="max-h-[40vh] space-y-1 overflow-y-auto">
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
      </div>

      {canAct && <TopupSlipModal open={topupOpen} kid={kid} onClose={() => setTopupOpen(false)} />}
      {canAct && <LimitModal open={limitOpen} kid={kid} current={sum?.daily_limit ?? null} onClose={() => setLimitOpen(false)} />}
    </Card>
  );
}

function TopupSlipModal({ open, kid, onClose }: { open: boolean; kid: PortalStudent; onClose: () => void }) {
  const toast = useToast();
  const { profile: me } = useAuth();
  const { data: settings } = useSchoolSettings();
  const submit = useSubmitSlip();
  const [amount, setAmount] = useState("");
  const [at, setAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const value = parseAmount(amount, TOPUP_MIN, TOPUP_MAX);
  const qr = settings ? schoolLogoUrl({ logo_path: settings.promptpay_qr_path, updated_at: settings.updated_at }) : null;
  const ready = value !== null && !!at && !!file && !!me;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !me) return;
    try {
      await submit.mutateAsync({ student_id: kid.id, requested_by: me.id, amount: value, transferred_at: new Date(at).toISOString(), file });
      toast("ส่งสลิปแล้ว — รอโรงเรียนตรวจสอบและอนุมัติ");
      setAmount("");
      setAt("");
      setFile(null);
      onClose();
    } catch (err) {
      toast(errMsg(err), "error");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="เติมเงินผ่านพร้อมเพย์"
      description={`บัตรของ ${fullName(kid)}`}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" form="slip-form" className="flex-1" disabled={!ready || submit.isPending}>
            {submit.isPending ? <Spinner /> : "ส่งสลิป"}
          </Button>
        </div>
      }
    >
      <form id="slip-form" onSubmit={send} className="space-y-3">
        <div className="space-y-1 text-center">
          {qr ? <img src={qr} alt="QR พร้อมเพย์ของโรงเรียน" className="mx-auto max-h-56 object-contain" /> : null}
          {settings?.promptpay_id ? (
            <p className="text-sm">
              พร้อมเพย์: <span data-selectable className="font-semibold">{settings.promptpay_id}</span>
            </p>
          ) : (
            !qr && <p className="text-xs text-muted-foreground">โรงเรียนยังไม่ได้ตั้งค่าพร้อมเพย์</p>
          )}
        </div>
        <Field label={`จำนวนเงินที่โอน (${TOPUP_MIN}–${TOPUP_MAX} บาท)`}>
          <Input inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </Field>
        <Field label="วันและเวลาที่โอน">
          <Input type="datetime-local" value={at} max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <Field label="รูปสลิป">
          <input type="file" accept="image/*" aria-label="รูปสลิป" className="block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </form>
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
