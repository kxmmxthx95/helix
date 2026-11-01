import { useState } from "react";
import { FileUp } from "@/components/icons";
import { ImportCardsSheet } from "@/components/ImportCardsSheet";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input, Spinner } from "@/components/ui";
import {
  useBindCard,
  useCardTransactions,
  useCashiers,
  useLiveCards,
  usePosVoid,
  useRefundWithdraw,
  useResetPin,
  useSaveTerminal,
  useSetCardStatus,
  useStudentLookup,
  useStudentSearch,
  useTerminals,
  type StudentHit,
} from "@/hooks/useCardTopup";
import { parseSwipe } from "@/lib/cardSwipe";
import { TX_TYPE_LABEL } from "@/lib/cardTopup";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
const nameOf = (s: Pick<StudentHit, "prefix" | "first_name" | "last_name">) => `${s.prefix ?? ""}${s.first_name} ${s.last_name}`;

/** บัตรและยอดคงเหลือ — search a student, then bind / freeze / cash out / void. */
export function CardsTab() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { data: hits = [] } = useStudentSearch(search);

  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="ค้นหานักเรียน (รหัสหรือชื่อ)">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร" />
            </Field>
          </div>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="size-4" />
            นำเข้าบัตร (CSV)
          </Button>
        </div>
        {hits.map((h) => (
          <button
            key={h.id}
            type="button"
            className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-foreground/5"
            onClick={() => (setPicked(h), setSearch(""))}
          >
            {h.student_code} · {nameOf(h)}
          </button>
        ))}
      </Card>
      {picked && <StudentCardPanel key={picked.id} student={picked} onError={(e) => toast(errMsg(e), "error")} />}
      <ImportCardsSheet open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function StudentCardPanel({ student, onError }: { student: StudentHit; onError: (e: unknown) => void }) {
  const toast = useToast();
  const { data: info, isLoading } = useStudentLookup(student.id);
  const { data: cards = [] } = useLiveCards();
  const { data: txs = [] } = useCardTransactions(student.id);
  const bind = useBindCard();
  const setStatus = useSetCardStatus();
  const [uid, setUid] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [voidId, setVoidId] = useState<string | null>(null);

  const card = cards.find((c) => c.student_id === student.id) ?? null;

  async function saveCard() {
    const value = parseSwipe(uid);
    if (!value) return;
    try {
      await bind.mutateAsync({ student_id: student.id, card_uid: value });
      toast(card ? "เปลี่ยนบัตรแล้ว — บัตรเดิมใช้ไม่ได้อีก" : "ผูกบัตรแล้ว");
      setUid("");
    } catch (e) {
      onError(e);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-heading text-lg font-semibold">{nameOf(student)}</p>
          <p className="text-xs text-muted-foreground">{student.student_code}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">ยอดคงเหลือ</p>
          <p className="font-heading text-3xl font-semibold">{isLoading ? "…" : formatBaht(info?.balance ?? 0)} ฿</p>
        </div>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void saveCard();
        }}
      >
        <div className="min-w-56 flex-1">
          <Field label={card ? `เปลี่ยนบัตร (ปัจจุบัน ${card.card_uid}${card.status === "frozen" ? " · ระงับ" : ""})` : "ผูกบัตร — รูดบัตรที่นี่"}>
            <Input value={uid} onChange={(e) => setUid(e.target.value)} autoComplete="off" placeholder="รูดบัตรเพื่อกรอกเลขบัตร" />
          </Field>
        </div>
        <Button type="submit" disabled={!uid.trim() || bind.isPending}>
          {card ? "เปลี่ยนบัตร" : "ผูกบัตร"}
        </Button>
        {card && (
          <Button
            type="button"
            variant="outline"
            disabled={setStatus.isPending}
            onClick={() =>
              setStatus.mutate(
                { id: card.id, status: card.status === "frozen" ? "active" : "frozen" },
                { onError },
              )
            }
          >
            {card.status === "frozen" ? "ปลดระงับบัตร" : "ระงับบัตร"}
          </Button>
        )}
        <Button type="button" variant="destructive" disabled={!info || info.balance <= 0} onClick={() => setRefundOpen(true)}>
          ถอนคืนเงิน
        </Button>
      </form>

      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {txs.map((t) => (
          <li key={t.id} className={cn("flex items-center justify-between gap-2 text-xs", t.voided_at && "text-muted-foreground line-through")}>
            <span className="min-w-0 truncate">
              {new Date(t.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} · {TX_TYPE_LABEL[t.type]}
              {t.voided_at ? ` (ยกเลิก: ${t.void_reason})` : ""}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {t.amount > 0 ? "+" : "−"}
              {formatBaht(Math.abs(t.amount))}
              {!t.voided_at && (
                <button type="button" className="underline" onClick={() => setVoidId(t.id)}>
                  ยกเลิก
                </button>
              )}
            </span>
          </li>
        ))}
        {txs.length === 0 && <li className="text-xs text-muted-foreground">ยังไม่มีรายการ</li>}
      </ul>

      <RefundModal open={refundOpen} studentId={student.id} balance={info?.balance ?? 0} onClose={() => setRefundOpen(false)} />
      <VoidModal txId={voidId} onClose={() => setVoidId(null)} />
    </Card>
  );
}

function RefundModal({ open, studentId, balance, onClose }: { open: boolean; studentId: string; balance: number; onClose: () => void }) {
  const toast = useToast();
  const refund = useRefundWithdraw();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= balance;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      await refund.mutateAsync({ student_id: studentId, amount: value, note: note.trim() || null });
      toast("บันทึกการถอนคืนเงินแล้ว");
      setAmount("");
      setNote("");
      onClose();
    } catch (e2) {
      toast(errMsg(e2), "error");
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="ถอนคืนเงิน"
      description={`ยอดคงเหลือ ${formatBaht(balance)} ฿ — ใช้ตอนจบการศึกษา/ย้ายออก`}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" form="refund-form" className="flex-1" disabled={!valid || refund.isPending}>
            ยืนยันถอนคืน
          </Button>
        </div>
      }
    >
      <form id="refund-form" onSubmit={submit} className="space-y-3">
        <Field label="จำนวนเงินที่คืน (บาท)">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAmount(String(balance))}>
          คืนทั้งหมด
        </Button>
        <Field label="หมายเหตุ">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function VoidModal({ txId, onClose }: { txId: string | null; onClose: () => void }) {
  const toast = useToast();
  const voidTx = usePosVoid();
  const [reason, setReason] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!txId || !reason.trim()) return;
    try {
      await voidTx.mutateAsync({ tx_id: txId, reason: reason.trim() });
      toast("ยกเลิกรายการแล้ว");
      setReason("");
      onClose();
    } catch (e2) {
      toast(errMsg(e2), "error");
    }
  }

  return (
    <Modal
      open={!!txId}
      onOpenChange={(o) => !o && onClose()}
      title="ยกเลิกรายการ"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ปิด
          </Button>
          <Button type="submit" form="void-form" variant="destructive" className="flex-1" disabled={!reason.trim() || voidTx.isPending}>
            {voidTx.isPending ? <Spinner /> : "ยืนยันยกเลิก"}
          </Button>
        </div>
      }
    >
      <form id="void-form" onSubmit={submit}>
        <Field label="เหตุผล" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/** เครื่องขาย — terminals (reporting only) and cashier PIN resets. */
export function TerminalsTab() {
  const toast = useToast();
  const { data: terminals = [] } = useTerminals();
  const { data: cashiers = [] } = useCashiers();
  const save = useSaveTerminal();
  const resetPin = useResetPin();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast(ok), (e) => toast(errMsg(e), "error"));

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="space-y-3 self-start">
        <p className="font-ui text-sm font-semibold">เครื่องขาย</p>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void run(save.mutateAsync({ name: name.trim() }), "เพิ่มเครื่องขายแล้ว").then(() => setName(""));
          }}
        >
          <div className="flex-1">
            <Field label="ชื่อเครื่องใหม่">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น โรงอาหาร 1" />
            </Field>
          </div>
          <Button type="submit" disabled={!name.trim() || save.isPending}>
            เพิ่ม
          </Button>
        </form>
        <ul className="space-y-1">
          {terminals.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
              {editing?.id === t.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editing.name.trim()) void run(save.mutateAsync({ id: t.id, name: editing.name.trim() }), "แก้ชื่อแล้ว").then(() => setEditing(null));
                  }}
                >
                  <Input aria-label="ชื่อเครื่อง" value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} />
                  <Button type="submit" size="sm">
                    บันทึก
                  </Button>
                </form>
              ) : (
                <>
                  <span className={cn(!t.active && "text-muted-foreground line-through")}>{t.name}</span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ id: t.id, name: t.name })}>
                      เปลี่ยนชื่อ
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void run(save.mutateAsync({ id: t.id, active: !t.active }), t.active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว")}>
                      {t.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </Button>
                  </span>
                </>
              )}
            </li>
          ))}
          {terminals.length === 0 && <li className="text-xs text-muted-foreground">ยังไม่มีเครื่องขาย</li>}
        </ul>
      </Card>

      <Card className="space-y-2 self-start">
        <p className="font-ui text-sm font-semibold">รีเซ็ต PIN แคชเชียร์</p>
        <p className="text-xs text-muted-foreground">หลังรีเซ็ต แคชเชียร์จะตั้ง PIN ใหม่เองเมื่อเติมเงินสดครั้งถัดไป (ปลดล็อกที่ติดอยู่ด้วย)</p>
        <ul className="space-y-1">
          {cashiers.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              {c.name}
              <Button size="sm" variant="outline" disabled={resetPin.isPending} onClick={() => void run(resetPin.mutateAsync(c.id), "รีเซ็ต PIN แล้ว")}>
                รีเซ็ต PIN
              </Button>
            </li>
          ))}
          {cashiers.length === 0 && <li className="text-xs text-muted-foreground">ยังไม่มีบัญชีแคชเชียร์ — สร้างได้ที่เมนูผู้ใช้งาน (บทบาท แคชเชียร์)</li>}
        </ul>
      </Card>
    </div>
  );
}
