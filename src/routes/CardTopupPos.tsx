import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AlertTriangle } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import {
  posLookup,
  useOnline,
  usePinStatus,
  usePosMyToday,
  usePosSale,
  usePosTopupCash,
  usePosVoid,
  useSetPin,
  useStudentSearch,
  useTerminals,
} from "@/hooks/useCardTopup";
import { studentAvatarUrl } from "@/hooks/useAvatar";
import { parseSwipe } from "@/lib/cardSwipe";
import { parseAmount, SALE_MAX, SALE_MIN, TOPUP_MAX, TOPUP_MIN, TX_TYPE_LABEL } from "@/lib/cardTopup";
import { profileFullName, type PosStudent } from "@/lib/database.types";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";

const TERMINAL_KEY = "helix-pos-terminal";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
const readTerminal = () => {
  try {
    return localStorage.getItem(TERMINAL_KEY) ?? "";
  } catch {
    return "";
  }
};

type Done = { kind: "sale" | "topup"; amount: number; balance: number };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"] as const;

/** ขาย — full-screen point of sale: swipe a card, key in an amount, charge. Online only: nothing is queued if the request fails. */
export function PosTab({ orgWide, onManage }: { orgWide: boolean; onManage?: () => void }) {
  const toast = useToast();
  const online = useOnline();
  const { profile, signOut } = useAuth();
  const { data: terminals = [] } = useTerminals();
  const { data: today } = usePosMyToday();
  const [terminalId, setTerminalId] = useState(readTerminal);
  const [student, setStudent] = useState<(PosStudent & { card_uid?: string }) | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [looking, setLooking] = useState(false);
  // One always-focused capture input takes the card reader's keystrokes AND typed digits: a swipe
  // starts with % or ; and ends in Enter, a short digits-only entry is the amount.
  const [entry, setEntry] = useState("");
  const [topupOpen, setTopupOpen] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [search, setSearch] = useState("");
  const capture = useRef<HTMLInputElement>(null);
  // Idempotency key for the sale on screen: a retry after a lost response reuses it, so the server never charges twice.
  const saleKey = useRef(crypto.randomUUID());
  const sale = usePosSale();

  const activeTerminals = terminals.filter((t) => t.active);
  const terminal = activeTerminals.find((t) => t.id === terminalId) ?? null;
  const pickTerminal = (id: string) => {
    setTerminalId(id);
    try {
      localStorage.setItem(TERMINAL_KEY, id);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };

  const modalOpen = topupOpen || todayOpen || findOpen;
  useEffect(() => {
    if (terminal && !modalOpen) capture.current?.focus();
  }, [terminal, modalOpen, student, done]);

  // The "done" screen clears itself so the next customer starts from a clean idle state.
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(null), 8000);
    return () => window.clearTimeout(t);
  }, [done]);

  async function lookup(a: { card_uid?: string; student_id?: string }) {
    setLooking(true);
    setDone(null);
    setEntry("");
    saleKey.current = crypto.randomUUID();
    try {
      setStudent({ ...(await posLookup(a)), card_uid: a.card_uid });
    } catch (e) {
      setStudent(null);
      toast(errMsg(e), "error");
    } finally {
      setLooking(false);
    }
  }

  const amountText = /^\d{0,3}$/.test(entry) ? entry : "";
  const price = parseAmount(amountText, SALE_MIN, SALE_MAX);
  const canSell = !!student?.card_uid && student.card_status === "active";
  async function charge() {
    if (!student?.card_uid || !canSell || price === null) return;
    try {
      const r = await sale.mutateAsync({ card_uid: student.card_uid, amount: price, terminal_id: terminal?.id ?? null, client_tx_id: saleKey.current });
      saleKey.current = crypto.randomUUID();
      setDone({ kind: "sale", amount: r.amount, balance: r.balance });
      setStudent(null);
      setEntry("");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  function press(k: (typeof KEYS)[number]) {
    if (!student) return;
    setEntry((p) => (k === "C" ? "" : k === "⌫" ? p.slice(0, -1) : /^\d{0,2}$/.test(p) ? p + k : p));
  }

  const topBar = (
    <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
      <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Helix · POS</span>
      {terminal && (
        <button type="button" className="tappable rounded-md border border-border px-2.5 py-1 text-xs font-semibold" onClick={() => setTerminalId("")}>
          {terminal.name} · เปลี่ยน
        </button>
      )}
      <span className={cn("flex items-center gap-1.5 text-xs", online ? "text-success" : "font-semibold text-destructive")} role="status">
        <span className={cn("size-2 rounded-full", online ? "bg-success" : "bg-destructive")} aria-hidden />
        {online ? "ออนไลน์" : "ออฟไลน์"}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {terminal && (
          <Button variant="outline" size="sm" onClick={() => setTodayOpen(true)}>
            วันนี้ {formatBaht(today?.sales_total ?? 0)} ฿
          </Button>
        )}
        {terminal && orgWide && (
          <Button variant="outline" size="sm" onClick={() => setFindOpen(true)}>
            ค้นหานักเรียน
          </Button>
        )}
        {orgWide && onManage && (
          <Button variant="outline" size="sm" onClick={onManage}>
            จัดการ
          </Button>
        )}
        <span className="hidden text-xs text-muted-foreground sm:inline">{profile ? profileFullName(profile) : ""}</span>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          ออกจากระบบ
        </Button>
      </div>
    </header>
  );

  // Portalled to <body>: AppShell's sidebar toggle sits in a higher stacking context than the page area.
  if (!terminal) {
    return createPortal(
      <div className="fixed inset-0 z-40 flex flex-col bg-background">
        {topBar}
        <div className="flex flex-1 items-center justify-center p-5">
          <Card className="w-full max-w-md space-y-3">
            <p className="font-ui text-lg font-semibold">เลือกเครื่องขายของอุปกรณ์นี้</p>
            <p className="text-xs text-muted-foreground">ใช้สำหรับรายงานเท่านั้น — จดจำไว้ในเครื่องนี้ และเปลี่ยนได้ภายหลัง</p>
            <Select value="" onChange={(e) => pickTerminal(e.target.value)} aria-label="เครื่องขาย" placeholder="เลือกเครื่องขาย">
              {activeTerminals.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            {activeTerminals.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีเครื่องขาย — ให้ผู้ดูแลเพิ่มที่แท็บ "เครื่องขาย"</p>}
          </Card>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex flex-col bg-background"
      onClick={(e) => !(e.target as HTMLElement).closest("input,select,textarea,dialog") && capture.current?.focus()}
    >
      {topBar}
      {!online && (
        <p className="flex items-center gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
          <AlertTriangle className="size-4" />
          ออฟไลน์ — ขายและเติมเงินไม่ได้จนกว่าจะเชื่อมต่ออินเทอร์เน็ต
        </p>
      )}

      <input
        ref={capture}
        className="sr-only"
        aria-label="รูดบัตรนักเรียนหรือพิมพ์ยอดเงิน"
        autoComplete="off"
        value={entry}
        disabled={looking}
        onChange={(e) => setEntry(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") return void (setStudent(null), setEntry(""));
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (student && /^\d{1,3}$/.test(entry)) return void charge();
          const uid = parseSwipe(entry);
          setEntry("");
          if (uid) void lookup({ card_uid: uid });
        }}
      />

      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Customer panel */}
        <section className="flex min-h-0 flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 text-center">
          {looking ? (
            <Spinner className="size-8" />
          ) : done ? (
            <div role="status" className="space-y-2">
              <p className="text-lg text-success">{done.kind === "sale" ? "ตัดเงินสำเร็จ" : "เติมเงินสำเร็จ"}</p>
              <p className="font-heading text-7xl font-semibold tabular-nums">{formatBaht(done.amount)} ฿</p>
              <p className="pt-6 text-sm text-muted-foreground">ยอดคงเหลือ</p>
              <p className="font-heading text-5xl font-semibold tabular-nums text-success">{formatBaht(done.balance)} ฿</p>
            </div>
          ) : student ? (
            <div className="w-full max-w-xl space-y-6">
              <div className="flex items-center justify-center gap-5">
                <Avatar
                  name={student.name}
                  src={studentAvatarUrl({ avatar_path: student.avatar_path, updated_at: student.avatar_updated_at })}
                  className="size-28 text-3xl"
                />
                <div className="min-w-0 text-left">
                  <p className="truncate font-heading text-3xl font-semibold">{student.name}</p>
                  <p className="text-base text-muted-foreground">
                    {student.student_code}
                    {student.classroom ? ` · ${student.classroom}` : ""}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">ยอดคงเหลือ</p>
                <p className="font-heading text-7xl font-semibold tabular-nums">{formatBaht(student.balance)} ฿</p>
                {student.daily_limit !== null && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    วงเงินต่อวัน {formatBaht(student.daily_limit)} · ใช้ไปแล้ววันนี้ {formatBaht(student.spent_today)}
                  </p>
                )}
              </div>
              {student.card_status === "frozen" && <p className="text-base font-semibold text-destructive">บัตรนี้ถูกระงับ — ขายไม่ได้</p>}
              {student.card_status === null && <p className="text-sm text-muted-foreground">นักเรียนยังไม่ได้ผูกบัตร — เติมเงินได้ แต่ขายไม่ได้</p>}
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="lg" disabled={!online} onClick={() => setTopupOpen(true)}>
                  เติมเงินสด
                </Button>
                <Button variant="ghost" size="lg" onClick={() => (setStudent(null), setEntry(""))}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <svg viewBox="0 0 120 76" className="mx-auto w-48 animate-pulse text-muted-foreground" aria-hidden>
                <rect x="1.5" y="1.5" width="117" height="73" rx="9" fill="none" stroke="currentColor" strokeWidth="3" />
                <rect x="1.5" y="14" width="117" height="14" fill="currentColor" opacity="0.5" />
                <rect x="12" y="44" width="20" height="14" rx="3" fill="currentColor" opacity="0.35" />
              </svg>
              <p className="font-heading text-4xl font-semibold">รูดบัตรนักเรียน</p>
              <p className="text-sm text-muted-foreground">เพื่อเริ่มรายการขาย หรือเติมเงินสด</p>
            </div>
          )}
        </section>

        {/* Amount keypad */}
        <section className={cn("flex min-h-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4", !canSell && "opacity-50")}>
          <div className="rounded-xl bg-muted px-4 py-3 text-right">
            <p className="text-xs text-muted-foreground">ยอดที่ขาย ({SALE_MIN}–{SALE_MAX} บาท)</p>
            <p className="font-heading text-6xl font-semibold tabular-nums">{amountText || "0"} ฿</p>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={!canSell}
                aria-label={k === "⌫" ? "ลบ" : k === "C" ? "ล้าง" : k}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => press(k)}
                className="tappable min-h-16 rounded-xl border border-border bg-background text-2xl font-semibold transition-colors hover:bg-foreground/5 active:bg-foreground/10 disabled:pointer-events-none"
              >
                {k}
              </button>
            ))}
          </div>
          <Button size="lg" className="h-20 text-2xl" disabled={!canSell || price === null || sale.isPending || !online} onClick={() => void charge()}>
            {sale.isPending ? <Spinner /> : price === null ? "ตัดเงิน" : `ตัดเงิน ${formatBaht(price)} ฿`}
          </Button>
        </section>
      </div>

      <Modal open={todayOpen} onOpenChange={setTodayOpen} title="รายการวันนี้">
        <TodayPanel />
      </Modal>
      {orgWide && (
        <Modal open={findOpen} onOpenChange={setFindOpen} title="ค้นหานักเรียน">
          <StudentFallback search={search} setSearch={setSearch} onPick={(id) => (setFindOpen(false), void lookup({ student_id: id }))} />
        </Modal>
      )}
      {student && (
        <TopupModal
          open={topupOpen}
          student={student}
          terminalId={terminal.id}
          onClose={() => setTopupOpen(false)}
          onDone={(d) => {
            setDone(d);
            setStudent(null);
            setEntry("");
          }}
        />
      )}
    </div>,
    document.body,
  );
}

/** Org-wide only: a cashier has no student list, so this fallback is hidden for them. */
function StudentFallback({ search, setSearch, onPick }: { search: string; setSearch: (s: string) => void; onPick: (id: string) => void }) {
  const { data: hits = [] } = useStudentSearch(search);
  return (
    <div className="space-y-1">
      <Field label="หรือค้นหาด้วยรหัส/ชื่อนักเรียน">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร" />
      </Field>
      {hits.map((h) => (
        <button
          key={h.id}
          type="button"
          className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-foreground/5"
          onClick={() => (setSearch(""), onPick(h.id))}
        >
          {h.student_code} · {h.prefix ?? ""}
          {h.first_name} {h.last_name}
        </button>
      ))}
    </div>
  );
}

function TopupModal({
  open,
  student,
  terminalId,
  onClose,
  onDone,
}: {
  open: boolean;
  student: PosStudent & { card_uid?: string };
  terminalId: string;
  onClose: () => void;
  onDone: (d: Done) => void;
}) {
  const toast = useToast();
  const { data: pinStatus } = usePinStatus();
  const topup = usePosTopupCash();
  const setPin = useSetPin();
  const [amount, setAmount] = useState("");
  const [pin, setPinText] = useState("");
  const [pin2, setPin2] = useState("");
  // Same idea as the sale key: reused while the attempt is unresolved, renewed once it succeeds.
  const txKey = useRef(crypto.randomUUID());
  const value = parseAmount(amount, TOPUP_MIN, TOPUP_MAX);
  const hasPin = pinStatus?.has_pin ?? true;
  const pinOk = /^\d{6}$/.test(pin);

  function reset() {
    setAmount("");
    setPinText("");
    setPin2("");
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value === null || !pinOk) return;
    try {
      if (!hasPin) {
        if (pin !== pin2) return toast("PIN สองครั้งไม่ตรงกัน", "error");
        await setPin.mutateAsync(pin);
      }
      const r = await topup.mutateAsync({
        card_uid: student.card_uid,
        student_id: student.card_uid ? undefined : student.student_id,
        amount: value,
        terminal_id: terminalId,
        pin,
        client_tx_id: txKey.current,
      });
      if (r.ok) {
        txKey.current = crypto.randomUUID();
        onDone({ kind: "topup", amount: r.amount, balance: r.balance });
        return reset();
      }
      setPinText("");
      toast(
        r.status === "locked"
          ? "PIN ผิดเกินกำหนด — ล็อกการเติมเงิน 15 นาที"
          : r.status === "bad"
            ? `PIN ไม่ถูกต้อง (เหลือ ${r.attempts_left} ครั้ง)`
            : "ยังไม่ได้ตั้ง PIN",
        "error",
      );
    } catch (err) {
      toast(errMsg(err), "error");
    }
  }

  const locked = !!pinStatus?.locked_until;
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && reset()}
      title="เติมเงินสด"
      description={`${student.name} · คงเหลือ ${formatBaht(student.balance)} ฿`}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={reset}>
            ยกเลิก
          </Button>
          <Button type="submit" form="pos-topup" className="flex-1" disabled={value === null || !pinOk || topup.isPending || locked}>
            {topup.isPending ? <Spinner /> : "ยืนยันเติมเงิน"}
          </Button>
        </div>
      }
    >
      <form id="pos-topup" onSubmit={submit} className="space-y-3">
        <Field label={`จำนวนเงิน (${TOPUP_MIN}–${TOPUP_MAX} บาท)`}>
          <Input inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </Field>
        {!hasPin && <p className="text-xs text-muted-foreground">ครั้งแรก: ตั้ง PIN 6 หลักของคุณเอง ใช้ยืนยันทุกครั้งที่เติมเงินสด</p>}
        <Field label={hasPin ? "PIN แคชเชียร์ (6 หลัก)" : "ตั้ง PIN ใหม่ (6 หลัก)"}>
          <Input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPinText(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        </Field>
        {!hasPin && (
          <Field label="ยืนยัน PIN อีกครั้ง">
            <Input type="password" inputMode="numeric" autoComplete="off" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </Field>
        )}
        {locked && <p className="text-xs text-destructive">ล็อกการเติมเงินชั่วคราว เพราะใส่ PIN ผิดหลายครั้ง — ให้ผู้ดูแลรีเซ็ต หรือรอ 15 นาที</p>}
      </form>
    </Modal>
  );
}

/** The caller's own shift today, with void for their own rows. */
function TodayPanel() {
  const toast = useToast();
  const { data, isLoading, error } = usePosMyToday();
  const voidTx = usePosVoid();
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function confirmVoid() {
    if (!target || !reason.trim()) return;
    try {
      await voidTx.mutateAsync({ tx_id: target, reason: reason.trim() });
      toast("ยกเลิกรายการแล้ว");
      setTarget(null);
      setReason("");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  return (
    <Card className="space-y-3 self-start">
      <p className="font-ui text-sm font-semibold">รายการวันนี้ของฉัน</p>
      {isLoading && <Spinner />}
      {error && <p className="text-xs text-destructive">{errMsg(error)}</p>}
      {data && (
        <>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">ขาย ({data.sales_count} ครั้ง)</dt>
              <dd className="text-base font-semibold">{formatBaht(data.sales_total)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">เติมเงินสด</dt>
              <dd className="text-base font-semibold">{formatBaht(data.topup_total)}</dd>
            </div>
          </dl>
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {data.transactions.map((t) => (
              <li key={t.id} className={cn("flex items-center justify-between gap-2 text-xs", t.voided_at && "text-muted-foreground line-through")}>
                <span className="min-w-0 truncate">
                  {new Date(t.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · {TX_TYPE_LABEL[t.type]} · {t.student_name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {formatBaht(Math.abs(t.amount))}
                  {!t.voided_at && (t.type === "sale" || t.type === "topup_cash") && (
                    <button type="button" className="underline" aria-label={`ยกเลิกรายการ ${t.student_name}`} onClick={() => setTarget(t.id)}>
                      ยกเลิก
                    </button>
                  )}
                </span>
              </li>
            ))}
            {data.transactions.length === 0 && <li className="text-xs text-muted-foreground">ยังไม่มีรายการ</li>}
          </ul>
        </>
      )}
      <Modal
        open={!!target}
        onOpenChange={(o) => !o && (setTarget(null), setReason(""))}
        title="ยกเลิกรายการ"
        description="ยกเลิกได้เฉพาะรายการของตนเองในวันนี้"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => (setTarget(null), setReason(""))}>
              ปิด
            </Button>
            <Button variant="destructive" className="flex-1" disabled={!reason.trim() || voidTx.isPending} onClick={() => void confirmVoid()}>
              ยืนยันยกเลิก
            </Button>
          </div>
        }
      >
        <Field label="เหตุผล" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </Card>
  );
}
