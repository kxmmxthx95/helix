import JsBarcode from "jsbarcode";
import { fromThaiLayout } from "@/lib/scanText";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { FiSidebar } from "react-icons/fi";
import { createPortal } from "react-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AlertTriangle, LockIcon, BarChartIcon, BarcodeIcon, CartIcon, CheckmarkCircleIcon, CoinIcon, DesktopIcon, LogOut, Moon, Monitor, Search, Sun } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/components/ThemeProvider";
import { Avatar, Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import {
  posLookup,
  posStudentByCode,
  useOnline,
  usePinLock,
  usePinStatus,
  usePinUnlock,
  productImageUrl,
  usePosMyToday,
  usePosProducts,
  usePosStudentRecent,
  usePosSale,
  usePosSaleItems,
  usePosTopupCash,
  usePosVoid,
  useSetPin,
  useStudentSearch,
  useTerminals,
} from "@/hooks/useCardTopup";
import { avatarUrl, studentAvatarUrl } from "@/hooks/useAvatar";
import { useRoleSubtitle } from "@/hooks/useProfiles";
import { addToCart, cartTotal, categoryOf, isProductCode, setQty, type CartLine } from "@/lib/posCart";
import { parseAmount, SALE_MAX, SALE_MIN, TOPUP_MAX, TOPUP_MIN, TX_TYPE_LABEL } from "@/lib/cardTopup";
import { profileFullName, type PosProduct, type PosStudent } from "@/lib/database.types";
import { formatBaht } from "@/lib/tuition";
import { cn } from "@/lib/utils";
import { TerminalsTab } from "@/routes/CardTopupAdmin";
import { ProductsTab } from "@/routes/CardTopupProducts";
import { ReportTab } from "@/routes/CardTopupReport";
import { SlipsTab } from "@/routes/CardTopupSlips";
import { VoidTopupTab } from "@/routes/CardTopupVoid";

const TERMINAL_KEY = "helix-pos-terminal";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
const readTerminal = () => {
  try {
    return localStorage.getItem(TERMINAL_KEY) ?? "";
  } catch {
    return "";
  }
};

const VIEWS = [
  { key: "sale", label: "ขายสินค้า", icon: CartIcon },
  { key: "topup", label: "เติมเงิน", icon: CoinIcon },
  { key: "slips", label: "อนุมัติสลิป", icon: CheckmarkCircleIcon },
  { key: "void", label: "ยกเลิกรายการ", icon: AlertTriangle },
  { key: "report", label: "รายงาน", icon: BarChartIcon },
  { key: "products", label: "สินค้า", icon: BarcodeIcon },
  { key: "terminals", label: "เครื่องขาย", icon: DesktopIcon },
] as const;
type View = (typeof VIEWS)[number]["key"];
/** Cashiers get these two in the sidebar; the rest are org-wide only. */
const isCounterView = (k: View) => k === "sale" || k === "topup";

type Done = { kind: "sale" | "topup"; amount: number; balance: number };

/** Code128 text; not a `qr_` token and not a student code, so it only exists to be scanned in ScannerTest. */
const TEST_CODE = "HELIX-SCANNER-TEST";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"] as const;

/** ขาย — full-screen point of sale: swipe a card, key in an amount, charge. Online only: nothing is queued if the request fails. */
export function PosTab({ orgWide }: { orgWide: boolean }) {
  const toast = useToast();
  const online = useOnline();
  const { profile, signOut } = useAuth();
  const { data: terminals = [] } = useTerminals();
  const [terminalId, setTerminalId] = useState(readTerminal);
  // org-wide only: the other card-top-up tabs live in a sidebar (collapsible like the portal's; a drawer below lg).
  const [view, setView] = useState<View>("sale");
  const onSale = isCounterView(view);
  const { preference, cycle } = useTheme();
  const roleSubtitle = useRoleSubtitle(profile?.id, profile?.roles ?? []);
  // Tablet-first: the menu is a drawer at every width, opened from the labelled "เมนู" button in the top bar.
  const [drawer, setDrawer] = useState(false);
  const sidebarOpen = drawer;
  const toggleSidebar = () => setDrawer((v) => !v);
  const [student, setStudent] = useState<(PosStudent & { card_uid?: string }) | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [looking, setLooking] = useState(false);
  // One always-focused capture input takes the card reader's keystrokes AND typed digits: a swipe
  // starts with % or ; and ends in Enter, a short digits-only entry is the amount.
  const [entry, setEntry] = useState("");
  // Cash top-up: PIN popup (once per hour, server-side) -> keypad amount in the right panel -> confirm popup.
  const mode: "sale" | "topup" = view === "topup" ? "topup" : "sale";
  const [topupAmount, setTopupAmount] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinFor, setPinFor] = useState<"topup" | "void">("topup"); // what the PIN popup unlocks
  const [confirmOpen, setConfirmOpen] = useState(false);
  const topupKey = useRef(crypto.randomUUID());
  const topup = usePosTopupCash();
  const lockPin = usePinLock();
  const { data: pinStatus } = usePinStatus();
  const unlockedUntil = pinStatus?.unlocked_until ? Date.parse(pinStatus.unlocked_until) : 0;
  // Re-render every 20 s so the minutes left on the top-up tab count down.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  const isUnlocked = unlockedUntil > now;
  const minutesLeft = Math.max(1, Math.ceil((unlockedUntil - now) / 60000));
  const [todayOpen, setTodayOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [code, setCode] = useState("");
  // Sale on screen: scanned / tapped products (cart) or an on-screen keypad amount (keyed) — the cart wins when both exist.
  const [cart, setCart] = useState<CartLine[]>([]);
  const [keyed, setKeyed] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const { data: allProducts = [], isLoading: productsLoading, error: productsError } = usePosProducts();
  const products = allProducts.filter((p) => p.active);
  const capture = useRef<HTMLInputElement>(null);
  // Idempotency key for the sale on screen: a retry after a lost response reuses it, so the server never charges twice.
  const saleKey = useRef(crypto.randomUUID());
  const sale = usePosSale();
  const saleItems = usePosSaleItems();

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

  useEffect(() => {
    document.documentElement.classList.add("pos-large");
    return () => document.documentElement.classList.remove("pos-large");
  }, []);

  const modalOpen = pinOpen || confirmOpen || todayOpen || codeOpen || testOpen;
  useEffect(() => {
    if (terminal && onSale && !modalOpen) capture.current?.focus();
  }, [terminal, onSale, modalOpen, student, done, looking]); // looking: a disabled input drops focus, so re-take it when the lookup ends (also after a failed one)

  // The "done" screen clears itself so the next customer starts from a clean idle state.
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(null), 8000);
    return () => window.clearTimeout(t);
  }, [done]);

  // Leaving the student screen drops the half-typed top-up amount.
  useEffect(() => {
    if (!student) setTopupAmount("");
  }, [student]);

  async function lookup(a: { card_uid?: string; student_id?: string }) {
    setLooking(true);
    setDone(null);
    setEntry("");
    saleKey.current = crypto.randomUUID();
    topupKey.current = crypto.randomUUID();
    try {
      setStudent({ ...(await posLookup(a)), card_uid: a.card_uid });
    } catch (e) {
      setStudent(null);
      toast(errMsg(e), "error");
    } finally {
      setLooking(false);
    }
  }

  // A student code is not a secret, so a code lookup has no card_uid and can only top up (canSell below).
  async function lookupCode(raw: string) {
    const c = raw.trim();
    if (!c) return;
    setLooking(true);
    try {
      await lookup({ student_id: await posStudentByCode(c) });
    } catch (e) {
      setLooking(false);
      toast(errMsg(e), "error");
    }
  }

  const price = cart.length ? cartTotal(cart) : parseAmount(keyed, SALE_MIN, SALE_MAX);
  const priceOk = price !== null && price >= SALE_MIN && price <= SALE_MAX;
  const canSell = !!student?.card_uid && student.card_status === "active";
  const over =
    price !== null && !!student && (price > student.balance || (student.daily_limit !== null && student.spent_today + price > student.daily_limit));
  const paying = sale.isPending || saleItems.isPending;

  // A changed cart is a new intent, so it gets a new idempotency key.
  function editCart(next: CartLine[]) {
    saleKey.current = crypto.randomUUID();
    setCart(next);
    setKeyed("");
    setDone(null);
  }
  function addByCode(raw: string) {
    const p = products.find((x) => x.code === raw.trim().toUpperCase());
    if (!p) return toast("ไม่พบสินค้านี้ หรือปิดขายแล้ว", "error");
    editCart(addToCart(cart, p));
  }

  async function charge() {
    if (!student?.card_uid || !canSell || !priceOk || over) return;
    const card_uid = student.card_uid;
    const common = { card_uid, terminal_id: terminal?.id ?? null, client_tx_id: saleKey.current };
    try {
      const r = cart.length
        ? await saleItems.mutateAsync({ ...common, items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty })) })
        : await sale.mutateAsync({ ...common, amount: price! });
      saleKey.current = crypto.randomUUID();
      setDone({ kind: "sale", amount: r.amount, balance: r.balance });
      setStudent(null);
      setEntry("");
      setCart([]);
      setKeyed("");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  const topupValue = parseAmount(topupAmount, TOPUP_MIN, TOPUP_MAX);
  // The top-up tab is behind the cashier PIN (valid an hour, server-side).
  function openTopup() {
    if (isUnlocked) setView("topup");
    else (setPinFor("topup"), setPinOpen(true));
  }
  async function confirmTopup() {
    if (!student || !terminal || topupValue === null) return;
    try {
      const r = await topup.mutateAsync({
        card_uid: student.card_uid,
        student_id: student.card_uid ? undefined : student.student_id,
        amount: topupValue,
        terminal_id: terminal.id,
        client_tx_id: topupKey.current,
      });
      topupKey.current = crypto.randomUUID();
      // Stay on the top-up tab, ready for the next student.
      setStudent(null);
      setEntry("");
      setConfirmOpen(false);
      setTopupAmount("");
      setDone({ kind: "topup", amount: r.amount, balance: r.balance });
    } catch (e) {
      setConfirmOpen(false);
      // The hour ran out (or the lock was pressed elsewhere): ask for the PIN again.
      if (e instanceof Error && e.message.includes("PIN")) {
        setView("sale");
        setPinFor("topup");
        setPinOpen(true);
      }
      toast(errMsg(e), "error");
    }
  }
  async function signOutAndLock() {
    try {
      await lockPin.mutateAsync();
    } catch {
      /* offline: the hour simply runs out on the server */
    }
    await signOut();
  }

  function press(k: (typeof KEYS)[number]) {
    if (mode === "topup") {
      topupKey.current = crypto.randomUUID();
      return setTopupAmount((p) => (k === "C" ? "" : k === "⌫" ? p.slice(0, -1) : /^\d{0,3}$/.test(p) ? p + k : p));
    }
    if (cart.length) return;
    saleKey.current = crypto.randomUUID();
    setDone(null);
    setKeyed((p) => (k === "C" ? "" : k === "⌫" ? p.slice(0, -1) : /^\d{0,2}$/.test(p) ? p + k : p));
  }

  const picker = (
    <div className="flex flex-1 items-center justify-center p-5">
      <Card className="w-full max-w-md space-y-3">
        <p className="font-ui text-2xl font-semibold">เลือกเครื่องขายของอุปกรณ์นี้</p>
        <p className="text-base text-muted-foreground">ใช้สำหรับรายงานเท่านั้น — จดจำไว้ในเครื่องนี้ และเปลี่ยนได้ภายหลัง</p>
        <Select value="" onChange={(e) => pickTerminal(e.target.value)} aria-label="เครื่องขาย" placeholder="เลือกเครื่องขาย">
          {activeTerminals.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        {activeTerminals.length === 0 && <p className="text-base text-muted-foreground">ยังไม่มีเครื่องขาย — ให้ผู้ดูแลเพิ่มที่แท็บ "เครื่องขาย"</p>}
      </Card>
    </div>
  );

  const toggleButton = (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-expanded={sidebarOpen}
      className="tappable flex h-14 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-4 text-lg font-semibold transition-colors hover:bg-foreground/5 active:bg-foreground/10"
    >
      <FiSidebar className="h-5 w-5" />
      เมนู
    </button>
  );
  const itemClass = (active = false) =>
    cn(
      "group font-ui tappable flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-lg font-semibold transition-colors",
      active ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
    );
  const footerIconClass = "tappable flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-base font-semibold text-foreground transition-colors hover:bg-foreground/5";
  const themeLabel = preference === "system" ? "ตามระบบ" : preference === "dark" ? "โหมดมืด" : "โหมดสว่าง";
  // Same frame as the portal's AppShell: shell-coloured sidebar, toggle pinned top-left, logo top-right,
  // user card + icon row at the foot. Collapsed = zero width; below lg it is a drawer.
  const sidebar = (
    <>
      {drawer && <button type="button" aria-label="ปิดเมนู" className="absolute inset-0 z-20 bg-black/40" onClick={() => setDrawer(false)} />}
      <aside
        inert={!sidebarOpen}
        className={cn(
          "font-ui absolute inset-y-0 left-0 z-30 shrink-0 overflow-hidden bg-shell shadow-card transition-[width] duration-200 ease-ios",
          sidebarOpen ? "w-80" : "w-0",
        )}
      >
        <div className="flex h-full w-80 flex-col">
          <div className="flex h-[4.5rem] shrink-0 items-center gap-3 px-4">
            <button type="button" onClick={() => setDrawer(false)} className="tappable flex h-12 items-center rounded-xl border border-border bg-card px-4 text-base font-semibold">
              ปิดเมนู
            </button>
            <img src="/logo.webp" alt="Helix" className="ml-auto h-7 w-auto dark:invert" />
          </div>
          <nav className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-2" aria-label="เมนูบัตรเติมเงิน">
              <div>
                <div className="flex flex-col gap-0.5">
                  {VIEWS.filter((v) => orgWide || isCounterView(v.key)).map(({ key, label, icon: Icon }) => (
                    <button key={key} type="button" aria-current={view === key ? "page" : undefined} onClick={() => (key === "topup" ? openTopup() : setView(key), setDrawer(false))} className={itemClass(view === key)}>
                      <Icon className="h-6 w-6 shrink-0 group-aria-[current=page]:text-accent" />
                      <span className="truncate">{label}</span>
                      {key === "topup" && isUnlocked && <span className={cn("ml-auto shrink-0 text-base font-semibold tabular-nums", minutesLeft <= 5 ? "font-semibold text-destructive motion-safe:animate-pulse" : "text-muted-foreground")}>เหลือ {minutesLeft} นาที</span>}
                    </button>
                  ))}
                  <button type="button" className={itemClass()} onClick={() => (setTestOpen(true), setDrawer(false))}>
                    <BarcodeIcon className="h-6 w-6 shrink-0" />
                    <span className="truncate">ทดสอบเครื่องอ่านบาร์โค้ด</span>
                  </button>
                </div>
              </div>
          </nav>
          <div className="mt-auto flex flex-col gap-2 border-t border-border/60 p-3">
            {terminal && (
              <button type="button" className="tappable min-h-12 rounded-xl border border-border bg-card px-4 py-2 text-left text-base font-semibold" onClick={() => (setTerminalId(""), setDrawer(false))}>
                {terminal.name} · เปลี่ยนเครื่อง
              </button>
            )}
            <div className="flex items-center gap-2.5 rounded-xl bg-card p-2.5 shadow-card">
              {/* Connection status: pulsing ring around the photo — green online, red offline. */}
              <span className="relative flex shrink-0 rounded-full" role="status" aria-label={online ? "ออนไลน์" : "ออฟไลน์"} title={online ? "ออนไลน์" : "ออฟไลน์"}>
                <span aria-hidden className={cn("absolute -inset-1 rounded-full border-2 motion-safe:animate-pulse", online ? "border-success" : "border-destructive")} />
                <Avatar name={profile ? profileFullName(profile) : "Helix"} src={profile ? avatarUrl(profile) : null} className="h-12 w-12 text-sm" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold leading-tight">{profile ? profileFullName(profile) : ""}</p>
                {profile && <p className="truncate text-base leading-tight text-muted-foreground">{roleSubtitle}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={cycle} title={themeLabel} aria-label={`Theme: ${preference}. Tap to cycle.`} className={footerIconClass}>
                {preference === "system" ? <Monitor className="h-5 w-5" /> : preference === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                {themeLabel}
              </button>
              <button type="button" onClick={() => void signOutAndLock()} title="ออกจากระบบ" aria-label="ออกจากระบบ" className={cn(footerIconClass, "hover:bg-destructive/10 hover:text-destructive")}>
                <LogOut className="h-5 w-5" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );

  const adminView = (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {view === "slips" && <SlipsTab />}
      {view === "void" && <VoidTopupTab unlocked={isUnlocked} onNeedPin={() => (setPinFor("void"), setPinOpen(true))} />}
      {view === "report" && <ReportTab />}
      {view === "products" && <ProductsTab />}
      {view === "terminals" && <TerminalsTab />}
    </div>
  );

  const keypad = (
    <div className="grid flex-1 grid-cols-3 gap-3">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === "⌫" ? "ลบ" : k === "C" ? "ล้าง" : k}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => press(k)}
          className="tappable min-h-[4.5rem] rounded-2xl border border-border bg-background text-3xl font-semibold tabular-nums transition-colors hover:bg-foreground/5 active:bg-foreground/15"
        >
          {k}
        </button>
      ))}
    </div>
  );

  // The sale screen: one always-focused capture input plus the customer / cart panels.
  const saleBody = (
    <>
      <input
        ref={capture}
        className="sr-only"
        aria-label="สแกนบัตรนักเรียน สินค้า หรือพิมพ์ยอดเงิน"
        autoComplete="off"
        value={entry}
        disabled={looking}
        onChange={(e) => setEntry(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") return void (setStudent(null), setEntry(""));
          if (e.key !== "Enter") return;
          e.preventDefault();
          const raw = fromThaiLayout(entry.trim());
          setEntry("");
          // Typed digits with a student on screen set the amount; the cashier then confirms with ตัดเงิน.
          if (student && mode === "topup" && /^\d{1,4}$/.test(raw)) return void setTopupAmount(raw);
          if (student && mode === "sale" && !cart.length && /^\d{1,3}$/.test(raw)) return void setKeyed(raw);
          if (isProductCode(raw)) return void (mode === "sale" ? addByCode(raw) : toast("สแกนสินค้าได้ที่แท็บ POS", "error"));
          else if (raw.startsWith("qr_")) void lookup({ card_uid: raw });
          else if (raw) void lookupCode(raw);
        }}
      />

      <div className="grid min-h-0 flex-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_21rem] lg:grid-cols-[minmax(0,1fr)_25rem]">
        {/* Customer panel */}
        <section className={cn("flex min-h-0 flex-col items-center justify-center overflow-y-auto rounded-2xl border p-6 text-center", done ? "border-success/40 bg-success/10" : "border-border bg-card")}>
          {looking ? (
            <Spinner className="size-8" />
          ) : done ? (
            <div role="status" className="flex flex-col items-center gap-2">
              <span className="flex size-24 items-center justify-center rounded-full bg-success text-white shadow-lg" aria-hidden>
                <CheckmarkCircleIcon className="size-14" />
              </span>
              <p className="pt-2 text-3xl font-bold text-success">{done.kind === "sale" ? "ตัดเงินสำเร็จ" : "เติมเงินสำเร็จ"}</p>
              <p className="font-heading text-7xl font-semibold tabular-nums">{formatBaht(done.amount)} ฿</p>
              <p className="pt-6 text-xl text-muted-foreground">ยอดคงเหลือ</p>
              <p className="font-heading text-5xl font-semibold tabular-nums">{formatBaht(done.balance)} ฿</p>
              <Button size="lg" variant="outline" className="mt-6 h-14 px-8 text-lg" onClick={() => setDone(null)}>
                ทำรายการต่อไป
              </Button>
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
                  <p className="truncate font-heading text-4xl font-semibold">{student.name}</p>
                  <p className="text-xl text-muted-foreground">
                    {student.student_code}
                    {student.classroom ? ` · ${student.classroom}` : ""}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xl text-muted-foreground">ยอดคงเหลือ</p>
                <p className="font-heading text-7xl font-semibold tabular-nums">{formatBaht(student.balance)} ฿</p>
                {student.daily_limit !== null && (
                  <p className="mt-1 text-lg text-muted-foreground">
                    วงเงินต่อวัน {formatBaht(student.daily_limit)} · ใช้ไปแล้ววันนี้ {formatBaht(student.spent_today)}
                  </p>
                )}
              </div>
              {price !== null && canSell && (
                <p className={cn("text-3xl font-semibold tabular-nums", over && "rounded-xl bg-destructive/10 px-4 py-3 text-destructive")} role={over ? "alert" : undefined}>
                  ยอดชำระ {formatBaht(price)} ฿{over && " — ยอดคงเหลือไม่พอหรือเกินวงเงิน"}
                </p>
              )}
              {student.card_status === "frozen" && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-xl font-semibold text-destructive">บัตรนี้ถูกระงับ — ขายไม่ได้</p>}
              {student.card_status === null && <p className="rounded-xl bg-warning/15 px-4 py-3 text-lg font-medium">นักเรียนยังไม่ได้ผูกบัตร — เติมเงินได้ แต่ขายไม่ได้</p>}
              <RecentTx studentId={student.student_id} />
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="lg" className="h-14 px-8 text-lg font-bold text-destructive" onClick={() => (setStudent(null), setEntry(""))}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <div className={cn("flex h-full min-h-0 w-full flex-col gap-4", mode === "topup" && "justify-center")}>
              {mode === "topup" && (
                <>
                  <div className="flex items-center justify-center gap-4">
                    <svg viewBox="0 0 120 76" className="w-14 shrink-0 text-amber-500" aria-hidden>
                      <rect x="1.5" y="1.5" width="117" height="73" rx="9" fill="none" stroke="currentColor" strokeWidth="3" />
                      <rect x="1.5" y="14" width="117" height="14" fill="currentColor" opacity="0.5" />
                      <rect x="12" y="44" width="20" height="14" rx="3" fill="currentColor" opacity="0.35" />
                    </svg>
                    {/* Blinking amber light = reader is waiting for the student's barcode. */}
                    <span className="relative flex size-4 shrink-0" role="status" aria-label="รอสแกนบาร์โค้ดนักเรียน">
                      <span className="absolute inline-flex size-full rounded-full bg-amber-400 opacity-75 motion-safe:animate-ping" />
                      <span className="relative inline-flex size-4 rounded-full bg-amber-400 motion-safe:animate-pulse" />
                    </span>
                    <p className="text-left font-heading text-3xl font-semibold">สแกนบัตรนักเรียนเพื่อเติมเงิน</p>
                  </div>
                  <div className="flex justify-center">
                    <Button variant="outline" size="lg" className="h-14 px-8 text-lg" onClick={() => setCodeOpen(true)}>
                      <Search className="mr-2 size-5" />
                      ค้นหาข้อมูลนักเรียน
                    </Button>
                  </div>
                </>
              )}
              {mode === "sale" && <ProductGrid products={products} loading={productsLoading} error={productsError} canManage={orgWide} category={category} onCategory={setCategory} onPick={(pr) => editCart(addToCart(cart, pr))} />}
            </div>
          )}
        </section>

        {/* Amount keypad: sale amount / cart, or the cash top-up amount while mode === "topup" */}
        <section className="flex min-h-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          {mode === "topup" ? (
            <>
              <div className="rounded-xl bg-muted px-4 py-3 text-right">
                <p className="font-heading text-6xl font-semibold tabular-nums">{topupAmount || "0"} ฿</p>
              </div>
              {keypad}
              <Button size="lg" className="h-20 text-2xl" disabled={!student || topupValue === null || !online || topup.isPending} onClick={() => setConfirmOpen(true)}>
                {topupValue === null ? "ยืนยันเติมเงิน" : `ยืนยันเติมเงิน ${formatBaht(topupValue)} ฿`}
              </Button>
              <Button variant="outline" className="h-14 text-lg" onClick={() => (setStudent(null), setEntry(""), setTopupAmount(""))}>
                ล้างทั้งหมด
              </Button>
            </>
          ) : (
            <>
              {cart.length ? (
                <CartPanel cart={cart} onQty={(id, q) => editCart(setQty(cart, id, q))} onClear={() => editCart([])} />
              ) : (
                <>
                  <div className="rounded-xl bg-muted px-4 py-3 text-right">
                    <p className="font-heading text-6xl font-semibold tabular-nums">{keyed || "0"} ฿</p>
                  </div>
                  {keypad}
                </>
              )}
              {price !== null && price > SALE_MAX && <p className="text-base font-medium text-destructive">ยอดรวมเกิน {SALE_MAX} บาทต่อรายการ — ลดสินค้า</p>}
              <Button size="lg" className="h-20 text-2xl" disabled={!canSell || !priceOk || over || paying || !online} onClick={() => void charge()}>
                {paying ? <Spinner /> : price === null ? "ตัดเงิน" : `ยืนยันตัดเงิน ${formatBaht(price)} ฿`}
              </Button>
              {!paying && (
                <p className="text-center text-base text-muted-foreground" aria-live="polite">
                  {!online
                    ? "ออฟไลน์ — รอเชื่อมต่ออินเทอร์เน็ต"
                    : !priceOk
                      ? "① เลือกสินค้า หรือกดยอดเงิน"
                      : !student
                        ? "② สแกนบัตรนักเรียน"
                        : canSell && !over
                          ? "③ กดปุ่มด้านบนเพื่อตัดเงิน"
                          : ""}
                </p>
              )}
            </>
          )}
        </section>
      </div>

    </>
  );

  // Portalled to <body>: AppShell's sidebar toggle sits in a higher stacking context than the page area.
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex overflow-hidden"
      onClick={(e) => onSale && terminal && !(e.target as HTMLElement).closest("input,select,textarea,dialog") && capture.current?.focus()}
    >
      <div className="absolute inset-0 z-0 bg-shell" aria-hidden />
      {sidebar}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="flex h-[5rem] shrink-0 items-center gap-3 border-b border-border bg-card px-4 pt-safe">
          {toggleButton}
          {onSale ? (
            <div role="tablist" aria-label="งานหน้าเคาน์เตอร์" className="flex min-w-0 gap-1 rounded-2xl bg-muted p-1">
              {VIEWS.filter((v) => isCounterView(v.key)).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => (key === "topup" ? openTopup() : setView(key))}
                  className={cn(
                    "tappable flex h-12 min-w-0 items-center gap-2 rounded-xl px-4 text-lg font-semibold transition-colors sm:px-6",
                    view === key ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-6 w-6 shrink-0" />
                  <span className="truncate">{label}</span>
                  {key === "topup" && isUnlocked && (
                    <span className={cn("shrink-0 text-base font-semibold tabular-nums", minutesLeft <= 5 ? "text-destructive motion-safe:animate-pulse" : "text-muted-foreground")}>
                      {minutesLeft} น.
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="font-heading truncate text-2xl font-semibold">{VIEWS.find((v) => v.key === view)?.label}</p>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span
              role="status"
              className={cn(
                "hidden h-12 items-center gap-2 rounded-full px-4 text-base font-semibold md:flex",
                online ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
              )}
            >
              <span className={cn("size-3 rounded-full", online ? "bg-success" : "bg-destructive motion-safe:animate-pulse")} aria-hidden />
              {online ? "ออนไลน์" : "ออฟไลน์"}
            </span>
            {onSale && terminal && (
              <button
                type="button"
                onClick={() => setTodayOpen(true)}
                className="tappable flex h-14 items-center rounded-xl border border-border bg-card px-4 text-lg font-semibold transition-colors hover:bg-foreground/5"
              >
                รายการวันนี้
              </button>
            )}
          </div>
        </header>
        {!online && onSale && terminal && (
          <p className="flex items-center gap-3 bg-destructive/10 px-4 py-3 text-lg font-semibold text-destructive" role="alert">
            <AlertTriangle className="size-6" />
            ออฟไลน์ — ขายและเติมเงินไม่ได้จนกว่าจะเชื่อมต่ออินเทอร์เน็ต
          </p>
        )}
        {!onSale ? adminView : !terminal ? picker : saleBody}
      </div>

      <Modal open={todayOpen} onOpenChange={setTodayOpen} title="รายการวันนี้">
        <TodayPanel />
      </Modal>
      <Modal open={codeOpen} onOpenChange={(o) => (setCodeOpen(o), !o && setCode(""))} title="ค้นหานักเรียน">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const c = code;
            setCode("");
            setCodeOpen(false);
            void lookupCode(c);
          }}
        >
          <Field label={orgWide ? "รหัสหรือชื่อนักเรียน" : "รหัสนักเรียน"}>
            <Input autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <p className="text-base text-muted-foreground">
            {orgWide ? "พิมพ์รหัสแล้วกด Enter หรือพิมพ์ชื่อเพื่อเลือกจากรายชื่อ" : "พิมพ์รหัสนักเรียนให้ครบแล้วกด Enter"}
          </p>
          <Button type="submit" className="h-14 w-full text-lg" disabled={!code.trim()}>
            ค้นหา
          </Button>
        </form>
        {/* Cashiers have no student list access, so only org-wide gets name matches. Enter never picks one — tap to choose. */}
        {orgWide && codeOpen && (
          <StudentHits
            term={code}
            onPick={(id) => {
              setCode("");
              setCodeOpen(false);
              void lookup({ student_id: id });
            }}
          />
        )}
      </Modal>
      <Modal open={testOpen} onOpenChange={setTestOpen} title="ทดสอบเครื่องอ่านบาร์โค้ด">
        <ScannerTest />
      </Modal>
      <PinUnlockModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onUnlocked={() => {
          setPinOpen(false);
          if (pinFor === "topup") setView("topup");
        }}
        forVoid={pinFor === "void"}
      />
      <Modal
        open={confirmOpen && !!student && topupValue !== null}
        onOpenChange={(o) => !o && !topup.isPending && setConfirmOpen(false)}
        title="ยืนยันการเติมเงินสด"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-16 flex-1 text-xl" disabled={topup.isPending} onClick={() => setConfirmOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="button" className="h-16 flex-[2] text-xl" disabled={topup.isPending || !online} onClick={() => void confirmTopup()}>
              {topup.isPending ? (
                <span role="status" className="flex items-center gap-3">
                  {/* Blinking amber light = the top-up request is in flight. */}
                  <span className="relative flex size-4 shrink-0">
                    <span className="absolute inline-flex size-full rounded-full bg-amber-300 opacity-75 motion-safe:animate-ping" />
                    <span className="relative inline-flex size-4 rounded-full bg-amber-300 motion-safe:animate-pulse" />
                  </span>
                  กำลังเติมเงิน…
                </span>
              ) : (
                "ยืนยันเติมเงิน"
              )}
            </Button>
          </div>
        }
      >
        {student && topupValue !== null && (
          <dl className="space-y-4 text-lg">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">นักเรียน</dt>
              <dd className="text-right font-semibold">{student.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">เติมเงินสด</dt>
              <dd className="text-4xl font-bold tabular-nums">{formatBaht(topupValue)} ฿</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">ยอดคงเหลือ</dt>
              <dd className="tabular-nums">
                {formatBaht(student.balance)} → <span className="font-semibold">{formatBaht(student.balance + topupValue)} ฿</span>
              </dd>
            </div>
          </dl>
        )}
      </Modal>
    </div>,
    document.body,
  );
}

/** Tap-to-add tiles for the active catalogue, filtered by category chip. */
function ProductGrid({
  products,
  loading,
  error,
  canManage,
  category,
  onCategory,
  onPick,
}: {
  products: PosProduct[];
  loading: boolean;
  error: unknown;
  canManage: boolean;
  category: string | null;
  onCategory: (c: string | null) => void;
  onPick: (p: PosProduct) => void;
}) {
  if (loading) return <Spinner className="mx-auto size-8" />;
  if (error) return <p className="text-lg text-destructive">โหลดรายการสินค้าไม่สำเร็จ — {errMsg(error)}</p>;
  if (products.length === 0)
    return (
      <p className="m-auto text-lg text-muted-foreground">ยังไม่มีสินค้าที่เปิดขาย{canManage ? ' — เพิ่มได้ที่แท็บ "สินค้า" ในแถบด้านข้าง' : " — แจ้งผู้ดูแลเพื่อเพิ่มสินค้า"}</p>
    );
  const cats = [...new Set(products.map(categoryOf))].sort();
  const shown = products.filter((p) => !category || categoryOf(p) === category);
  const chip = (active: boolean) =>
    cn("tappable flex h-12 shrink-0 items-center rounded-full border px-5 text-lg font-semibold", active ? "border-foreground bg-foreground text-background" : "border-border bg-background");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 text-left">
      <div className="scrollbar-hidden flex shrink-0 gap-2 overflow-x-auto pb-1" role="tablist" aria-label="หมวดหมู่สินค้า">
        <button type="button" role="tab" aria-selected={!category} className={chip(!category)} onMouseDown={(e) => e.preventDefault()} onClick={() => onCategory(null)}>
          ทั้งหมด
        </button>
        {cats.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={category === c} className={chip(category === c)} onMouseDown={(e) => e.preventDefault()} onClick={() => onCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-3 overflow-y-auto lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(p)}
            className="tappable flex min-h-24 flex-col gap-1 overflow-hidden rounded-2xl border border-border bg-background text-left transition-colors hover:bg-foreground/5 active:scale-[0.98] active:bg-foreground/10"
          >
            {productImageUrl(p) && <img src={productImageUrl(p)!} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />}
            <span className="flex flex-col gap-0.5 px-4 pb-3 pt-3">
              <span className="line-clamp-2 text-lg font-semibold leading-snug">{p.name}</span>
              <span className="text-xl font-bold tabular-nums">{p.price} ฿</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Cart lines with quantity steppers; replaces the keypad while the cart has items. */
function CartPanel({ cart, onQty, onClear }: { cart: CartLine[]; onQty: (productId: string, qty: number) => void; onClear: () => void }) {
  const step = "tappable size-14 shrink-0 rounded-xl border border-border text-3xl font-semibold hover:bg-foreground/5 active:bg-foreground/10";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-ui text-xl font-semibold">ตะกร้า ({cart.reduce((n, l) => n + l.qty, 0)} ชิ้น)</p>
        <button type="button" className="tappable h-12 rounded-xl border border-border px-4 text-base font-semibold text-destructive" onMouseDown={(e) => e.preventDefault()} onClick={onClear}>
          ล้างตะกร้า
        </button>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {cart.map((l) => (
          <li key={l.product.id} className="flex items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{l.product.name}</p>
              <p className="text-base tabular-nums text-muted-foreground">
                {l.product.price} ฿ × {l.qty} = {l.product.price * l.qty} ฿
              </p>
            </div>
            <button type="button" className={step} aria-label={`ลด ${l.product.name}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onQty(l.product.id, l.qty - 1)}>
              −
            </button>
            <span className="w-8 text-center text-2xl font-semibold tabular-nums">{l.qty}</span>
            <button type="button" className={step} aria-label={`เพิ่ม ${l.product.name}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onQty(l.product.id, l.qty + 1)}>
              +
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded-xl bg-muted px-4 py-3 text-right">
        <p className="text-lg text-muted-foreground">ยอดรวม</p>
        <p className="font-heading text-5xl font-semibold tabular-nums">{cartTotal(cart)} ฿</p>
      </div>
    </div>
  );
}

/** Org-wide only: a cashier has no student list, so this match list is never mounted for them. */
function StudentHits({ term, onPick }: { term: string; onPick: (id: string) => void }) {
  const { data: hits = [] } = useStudentSearch(term);
  if (hits.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1" aria-label="รายชื่อที่ตรงกัน">
      {hits.map((h) => (
        <li key={h.id}>
          <button type="button" className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left text-lg hover:bg-foreground/5" onClick={() => onPick(h.id)}>
            <Avatar name={`${h.first_name} ${h.last_name}`} src={studentAvatarUrl(h)} className="size-12 shrink-0 text-base" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {h.prefix ?? ""}
                {h.first_name} {h.last_name}
              </span>
              <span className="block text-base text-muted-foreground">{h.student_code}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Shows what the reader typed and how fast; nothing is looked up or charged. A scanner "types" a whole code in well under 50 ms per key. */
function ScannerTest() {
  type Result =
    | { kind: "ok"; text: string; perKey: number }
    | { kind: "mismatch"; text: string; perKey: number; thai: boolean }
    | { kind: "slow"; text: string; perKey: number }
    | { kind: "noEnter"; text: string };
  const [result, setResult] = useState<Result | null>(null);
  const [okCount, setOkCount] = useState(0);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(true);
  const first = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const noEnter = useRef<number | undefined>(undefined);
  const bars = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (bars.current) JsBarcode(bars.current, TEST_CODE, { format: "CODE128", height: 110, width: 2.4, fontSize: 18, margin: 12 });
  }, []);
  useEffect(() => () => window.clearTimeout(noEnter.current), []);

  function finish(text: string) {
    window.clearTimeout(noEnter.current);
    const perKey = (performance.now() - first.current) / text.length;
    setValue("");
    if (perKey >= 50) return setResult({ kind: "slow", text, perKey });
    if (text === TEST_CODE) {
      setOkCount((n) => n + 1);
      return setResult({ kind: "ok", text, perKey });
    }
    setResult({ kind: "mismatch", text, perKey, thai: /[฀-๿]/.test(text) });
  }

  const tone =
    !result ? "border-warning/50 bg-warning/10" : result.kind === "ok" ? "border-success/50 bg-success/10" : "border-destructive/40 bg-destructive/10";

  return (
    <div className="space-y-4" onClick={() => input.current?.focus()}>
      {/* The reader "types" here; kept off-screen so nobody tries to type into it. */}
      <input
        ref={input}
        autoFocus
        autoComplete="off"
        className="sr-only"
        aria-label="ช่องรับสัญญาณเครื่องอ่านบาร์โค้ด"
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          if (!value) first.current = performance.now();
          const next = e.target.value;
          setValue(next);
          // Characters but no Enter within 1.5 s: the reader isn't sending a suffix.
          window.clearTimeout(noEnter.current);
          if (next) noEnter.current = window.setTimeout(() => (setResult({ kind: "noEnter", text: next }), setValue("")), 1500);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !value) return;
          e.preventDefault();
          finish(value);
        }}
      />

      {/* Status — the one thing to look at */}
      <div role="status" aria-live="polite" className={cn("flex items-center gap-4 rounded-2xl border-2 p-5", tone)}>
        {!result ? (
          <>
            <span className="relative flex size-6 shrink-0" aria-hidden>
              <span className="absolute inline-flex size-full rounded-full bg-amber-400 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-6 rounded-full bg-amber-400" />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-bold">{focused ? "พร้อมแล้ว — ยิงบาร์โค้ดด้านล่างได้เลย" : "แตะที่หน้าต่างนี้ก่อน แล้วค่อยยิง"}</p>
              <p className="text-lg text-muted-foreground">ระบบจะไม่ค้นหาหรือตัดเงิน เป็นการทดสอบเท่านั้น</p>
            </div>
          </>
        ) : result.kind === "ok" ? (
          <>
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-success text-white" aria-hidden>
              <CheckmarkCircleIcon className="h-9 w-9" />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-success">เครื่องอ่านทำงานปกติ</p>
              <p className="text-lg">อ่านถูกต้องครบ {result.text.length} ตัวอักษร · เร็ว {result.perKey.toFixed(0)} ms/ตัว</p>
              {okCount > 1 && <p className="text-base text-muted-foreground">ยิงสำเร็จแล้ว {okCount} ครั้ง</p>}
            </div>
          </>
        ) : (
          <>
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-destructive text-white" aria-hidden>
              <AlertTriangle className="h-8 w-8" />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-destructive">
                {result.kind === "noEnter" ? "อ่านได้ แต่เครื่องไม่ส่ง Enter" : result.kind === "slow" ? "สัญญาณช้าเหมือนพิมพ์มือ" : "อ่านได้ แต่ตัวอักษรไม่ตรง"}
              </p>
              <p className="text-lg">
                {result.kind === "noEnter"
                  ? "ตั้งค่าเครื่องอ่านให้ส่ง Enter (CR) ต่อท้าย ตามคู่มือของเครื่อง"
                  : result.kind === "slow"
                    ? "ถ้าใช้เครื่องยิงจริงอยู่ ให้ตรวจสายหรือการเชื่อมต่อบลูทูธ"
                    : result.thai
                      ? "แป้นพิมพ์ของเครื่องเป็นภาษาไทยอยู่ — เปลี่ยนเป็นภาษาอังกฤษ แล้วยิงใหม่"
                      : "ตรวจว่าเครื่องอ่านตั้งเป็นโหมดแป้นพิมพ์ (HID) และภาษาอังกฤษ (US)"}
              </p>
              <p className="mt-1 break-all font-mono text-base text-muted-foreground">ได้รับ: {result.text}</p>
            </div>
          </>
        )}
      </div>

      {/* Steps */}
      <ol className="grid gap-2 text-lg">
        {["เล็งเครื่องยิงที่บาร์โค้ดด้านล่าง", "กดปุ่มยิงที่เครื่อง", "ดูผลในกล่องด้านบน"].map((t, i) => (
          <li key={t} className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>

      <div className="flex justify-center rounded-2xl border border-border bg-white p-3">
        <svg ref={bars} role="img" aria-label={`บาร์โค้ดทดสอบ ${TEST_CODE}`} className="h-auto max-w-full" />
      </div>

      {result && (
        <Button
          variant="outline"
          className="h-14 w-full text-lg"
          onClick={(e) => {
            e.stopPropagation();
            setResult(null);
            input.current?.focus();
          }}
        >
          ทดสอบอีกครั้ง
        </Button>
      )}

      {!result && (
        <details className="rounded-xl border border-border px-4 py-3 text-lg">
          <summary className="cursor-pointer font-semibold">ยิงแล้วไม่มีอะไรขึ้นเลย?</summary>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-base">
            <li>ตรวจว่าเครื่องอ่านเปิดอยู่ และเชื่อมต่อกับแท็บเล็ตนี้ (สาย USB หรือบลูทูธ)</li>
            <li>ตั้งเครื่องอ่านเป็นโหมดแป้นพิมพ์ (HID / Keyboard)</li>
            <li>แป้นพิมพ์ของแท็บเล็ตต้องเป็นภาษาอังกฤษ</li>
            <li>แตะที่หน้าต่างนี้หนึ่งครั้งก่อนยิง</li>
          </ul>
        </details>
      )}
    </div>
  );
}

/** PIN popup with an on-screen pad: one correct PIN unlocks cash top-up for an hour (the server keeps the proof).
 *  Six digits submit by themselves. First use sets the PIN: enter it, then enter it again. */
function PinUnlockModal({ open, onClose, onUnlocked, forVoid = false }: { open: boolean; onClose: () => void; onUnlocked: () => void; forVoid?: boolean }) {
  const { data: pinStatus } = usePinStatus();
  const unlock = usePinUnlock();
  const setPin = useSetPin();
  const reduce = useReducedMotion();
  const [pin, setPinText] = useState("");
  const [first, setFirst] = useState<string | null>(null); // first entry while choosing a new PIN
  // Errors stay on screen (not a toast) so they can be read; `shake` replays the wobble on each new error.
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const hasPin = pinStatus?.has_pin ?? true;
  const locked = !!pinStatus?.locked_until;
  const busy = unlock.isPending || setPin.isPending;

  const fail = (msg: string) => {
    setError(msg);
    setShake((n) => n + 1);
  };

  function reset() {
    setPinText("");
    setFirst(null);
    setError(null);
    onClose();
  }

  async function submit(full: string) {
    try {
      if (!hasPin) {
        if (first === null) {
          setFirst(full);
          return setPinText("");
        }
        if (full !== first) {
          setFirst(null);
          setPinText("");
          return fail("PIN สองครั้งไม่ตรงกัน — เริ่มตั้งใหม่อีกครั้ง");
        }
        await setPin.mutateAsync(full);
      }
      const r = await unlock.mutateAsync(full);
      setPinText("");
      setFirst(null);
      if (r.ok) {
        setError(null);
        return onUnlocked();
      }
      fail(
        r.status === "locked"
          ? "ใส่ PIN ผิดเกินกำหนด — ล็อก 15 นาที"
          : r.status === "bad"
            ? `PIN ไม่ถูกต้อง — ลองได้อีก ${r.attempts_left} ครั้ง`
            : "ยังไม่ได้ตั้ง PIN",
      );
    } catch (err) {
      setPinText("");
      setFirst(null);
      fail(errMsg(err));
    }
  }

  function press(k: (typeof KEYS)[number]) {
    if (busy || locked) return;
    setError(null);
    if (k === "C") return setPinText("");
    if (k === "⌫") return setPinText((p) => p.slice(0, -1));
    if (pin.length >= 6) return;
    const next = pin + k;
    setPinText(next);
    if (next.length === 6) void submit(next);
  }

  const settingUp = !hasPin;
  const what = forVoid ? "ยกเลิกรายการ" : "เติมเงินสด";
  const title = settingUp ? `ตั้ง PIN สำหรับ${what}` : `ใส่ PIN เพื่อ${what}`;
  const instruction = locked
    ? "ล็อกชั่วคราว"
    : settingUp
      ? first === null
        ? "กด PIN ใหม่ 6 หลักที่จำได้ง่าย"
        : "กด PIN เดิมอีกครั้งเพื่อยืนยัน"
      : "กด PIN 6 หลักของคุณ";

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && !busy && reset()}
      title={title}
      footer={
        <Button type="button" variant="outline" className="h-14 w-full text-lg" disabled={busy} onClick={reset}>
          ยกเลิก
        </Button>
      }
    >
      <div
        className="space-y-5"
        tabIndex={-1}
        // Physical keyboard works too: digits, Backspace.
        onKeyDown={(e) => {
          if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
          else if (e.key === "Backspace") press("⌫");
        }}
      >
        {/* Header: lock + what to do now */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className={cn("flex size-16 items-center justify-center rounded-2xl", locked ? "bg-destructive/15 text-destructive" : "bg-muted text-foreground")} aria-hidden>
            <LockIcon className="h-8 w-8" />
          </span>
          {settingUp && !locked && (
            <div className="flex items-center gap-2" aria-label={`ขั้นที่ ${first === null ? 1 : 2} จาก 2`}>
              {[0, 1].map((i) => (
                <span key={i} className={cn("h-2 w-10 rounded-full", i <= (first === null ? 0 : 1) ? "bg-foreground" : "bg-foreground/15")} />
              ))}
            </div>
          )}
          <p className="text-2xl font-semibold">{instruction}</p>
          {!locked && (
            <p className="text-lg text-muted-foreground">
              {settingUp ? (first === null ? "ขั้นที่ 1 จาก 2 · ใช้ปลดล็อกการเติมเงินสดทุกครั้ง" : "ขั้นที่ 2 จาก 2") : "ใส่ครั้งเดียว เติมเงินสดได้ต่อเนื่อง 1 ชั่วโมง"}
            </p>
          )}
        </div>

        {/* Six boxes; the next one is outlined so it's clear where the digit goes */}
        <motion.div
          key={shake}
          initial={false}
          animate={shake && !reduce ? { x: [0, -14, 12, -8, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex justify-center gap-2.5"
          role="status"
          aria-label={`ใส่แล้ว ${pin.length} จาก 6 หลัก`}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={cn(
                "flex size-12 items-center justify-center rounded-xl border-2 transition-colors",
                error ? "border-destructive" : i < pin.length ? "border-foreground bg-foreground" : i === pin.length && !busy && !locked ? "border-foreground" : "border-border",
              )}
            >
              {i < pin.length && <span className="size-3.5 rounded-full bg-background" />}
            </span>
          ))}
        </motion.div>

        <div className="min-h-[3.25rem]" aria-live="assertive">
          {busy ? (
            <p className="flex items-center justify-center gap-3 text-lg font-medium">
              <Spinner className="size-6" />
              กำลังตรวจสอบ…
            </p>
          ) : error ? (
            <p className="rounded-xl bg-destructive/10 px-4 py-3 text-center text-lg font-semibold text-destructive">{error}</p>
          ) : null}
        </div>

        {locked ? (
          <p className="rounded-xl bg-destructive/10 px-4 py-4 text-center text-lg font-semibold text-destructive">
            ใส่ PIN ผิดหลายครั้ง — รอ 15 นาที หรือให้ผู้ดูแลรีเซ็ต PIN ที่เมนู "เครื่องขาย"
          </p>
        ) : (
          <div className="mx-auto grid max-w-sm grid-cols-3 gap-3">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={busy}
                aria-label={k === "⌫" ? "ลบหนึ่งตัว" : k === "C" ? "ล้างทั้งหมด" : k}
                onClick={() => press(k)}
                className={cn(
                  "tappable flex h-20 items-center justify-center rounded-2xl border border-border font-semibold transition-colors active:bg-foreground/15 disabled:opacity-40",
                  k === "C" || k === "⌫" ? "bg-muted text-xl" : "bg-background text-4xl tabular-nums hover:bg-foreground/5",
                )}
              >
                {k === "C" ? "ล้าง" : k === "⌫" ? "ลบ" : k}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The caller's own shift today, with void for their own rows. */
/** The student's last 10 transactions on the POS card: time · type · amount (voided ones struck through). */
function RecentTx({ studentId }: { studentId: string }) {
  const { data = [], isLoading } = usePosStudentRecent(studentId);
  if (isLoading) return <Spinner className="mx-auto size-5" />;
  if (data.length === 0) return <p className="text-lg text-muted-foreground">ยังไม่มีรายการ</p>;
  return (
    <div className="mx-auto w-full max-w-md text-left">
      <p className="pb-1 text-lg font-medium text-muted-foreground">รายการล่าสุด</p>
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-background px-3">
        {data.map((t) => (
          <li key={t.id} className={cn("flex items-center justify-between gap-2 py-2.5 text-base", t.voided_at && "text-muted-foreground line-through")}>
            <span className="min-w-0 truncate">
              {new Date(t.created_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {TX_TYPE_LABEL[t.type]}
              {t.voided_at && " (ยกเลิก)"}
            </span>
            <span className={cn("shrink-0 font-semibold tabular-nums", !t.voided_at && t.amount > 0 && "text-success")}>
              {t.amount > 0 ? "+" : ""}
              {formatBaht(t.amount)} ฿
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
      <p className="font-ui text-xl font-semibold">รายการวันนี้ของฉัน</p>
      {isLoading && <Spinner />}
      {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-lg text-destructive">{errMsg(error)}</p>}
      {data && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-base">
            <div>
              <dt className="text-muted-foreground">ขาย ({data.sales_count} ครั้ง)</dt>
              <dd className="text-3xl font-bold tabular-nums">{formatBaht(data.sales_total)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">เติมเงินสด</dt>
              <dd className="text-3xl font-bold tabular-nums">{formatBaht(data.topup_total)}</dd>
            </div>
          </dl>
          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto">
            {data.transactions.map((t) => (
              <li key={t.id} className={cn("flex min-h-14 items-center justify-between gap-3 py-2 text-base", t.voided_at && "text-muted-foreground line-through")}>
                <span className="min-w-0 truncate">
                  {new Date(t.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · {TX_TYPE_LABEL[t.type]} · {t.student_name}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-lg font-semibold tabular-nums">{formatBaht(Math.abs(t.amount))}</span>
                  {!t.voided_at && (t.type === "sale" || t.type === "topup_cash") && (
                    <button type="button" className="tappable h-11 rounded-xl border border-border px-3 text-base font-semibold text-destructive" aria-label={`ยกเลิกรายการ ${t.student_name}`} onClick={() => setTarget(t.id)}>
                      ยกเลิก
                    </button>
                  )}
                </span>
              </li>
            ))}
            {data.transactions.length === 0 && <li className="py-4 text-lg text-muted-foreground">ยังไม่มีรายการ</li>}
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
