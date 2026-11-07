import JsBarcode from "jsbarcode";
import { useEffect, useRef, useState } from "react";
import { FiSidebar } from "react-icons/fi";
import { createPortal } from "react-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AlertTriangle, AppsIcon, BarChartIcon, BarcodeIcon, CalendarIcon, CheckmarkCircleIcon, CoinIcon, LockIcon, LogOut, Moon, Monitor, Search, Sun } from "@/components/icons";
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

const TERMINAL_KEY = "helix-pos-terminal";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
const readTerminal = () => {
  try {
    return localStorage.getItem(TERMINAL_KEY) ?? "";
  } catch {
    return "";
  }
};

const SIDEBAR_KEY = "helix-pos-sidebar-collapsed";
const VIEWS = [
  { key: "sale", label: "POS", icon: AppsIcon },
  { key: "topup", label: "เติมเงิน", icon: CoinIcon },
  { key: "slips", label: "อนุมัติสลิป", icon: CheckmarkCircleIcon },
  { key: "report", label: "รายงาน", icon: BarChartIcon },
  { key: "products", label: "สินค้า", icon: BarcodeIcon },
  { key: "terminals", label: "เครื่องขาย", icon: Monitor },
] as const;
type View = (typeof VIEWS)[number]["key"];
/** Cashiers get these two in the sidebar; the rest are org-wide only. */
const isCounterView = (k: View) => k === "sale" || k === "topup";

/** True from Tailwind's `lg` (1024px) up — below it the sidebar is a drawer instead of a column. */
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

type Done = { kind: "sale"; amount: number; balance: number };

/** Code128 text; not a `qr_` token and not a student code, so it only exists to be scanned in ScannerTest. */
const TEST_CODE = "HELIX-SCANNER-TEST";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"] as const;

/** ขาย — full-screen point of sale: swipe a card, key in an amount, charge. Online only: nothing is queued if the request fails. */
export function PosTab({ orgWide }: { orgWide: boolean }) {
  const toast = useToast();
  const online = useOnline();
  const { profile, signOut } = useAuth();
  const { data: terminals = [] } = useTerminals();
  const { data: today } = usePosMyToday();
  const [terminalId, setTerminalId] = useState(readTerminal);
  // org-wide only: the other card-top-up tabs live in a sidebar (collapsible like the portal's; a drawer below lg).
  const [view, setView] = useState<View>("sale");
  const onSale = isCounterView(view);
  const wide = useWide();
  const { preference, cycle } = useTheme();
  const roleSubtitle = useRoleSubtitle(profile?.id, profile?.roles ?? []);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [drawer, setDrawer] = useState(false);
  const sidebarOpen = wide ? !collapsed : drawer;
  const toggleSidebar = () => {
    if (!wide) return setDrawer((v) => !v);
    setCollapsed((v) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, v ? "0" : "1");
      } catch {
        /* private mode: the choice just isn't remembered */
      }
      return !v;
    });
  };
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const topupKey = useRef(crypto.randomUUID());
  const topup = usePosTopupCash();
  const lockPin = usePinLock();
  const { data: pinStatus } = usePinStatus();
  const unlockedUntil = pinStatus?.unlocked_until ? Date.parse(pinStatus.unlocked_until) : 0;
  const isUnlocked = unlockedUntil > Date.now();
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

  const modalOpen = pinOpen || confirmOpen || todayOpen || codeOpen || testOpen;
  useEffect(() => {
    if (terminal && onSale && !modalOpen) capture.current?.focus();
  }, [terminal, onSale, modalOpen, student, done]);

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
    else setPinOpen(true);
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
      toast(`เติมเงิน ${formatBaht(r.amount)} ฿ สำเร็จ`);
    } catch (e) {
      setConfirmOpen(false);
      // The hour ran out (or the lock was pressed elsewhere): ask for the PIN again.
      if (e instanceof Error && e.message.includes("PIN")) {
        setView("sale");
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
  );

  const toggleButton = (
    <Button
      variant="ghost"
      size="icon"
      className="hover:bg-transparent active:bg-transparent"
      onClick={toggleSidebar}
      aria-label={sidebarOpen ? "หุบแถบด้านข้าง" : "ขยายแถบด้านข้าง"}
      aria-expanded={sidebarOpen}
      title={sidebarOpen ? "หุบแถบด้านข้าง" : "ขยายแถบด้านข้าง"}
    >
      <FiSidebar className="h-3.5 w-3.5" />
    </Button>
  );
  const statusDot = (
    <span className={cn("flex items-center gap-1.5 text-xs", online ? "text-success" : "font-semibold text-destructive")} role="status">
      <span className={cn("size-2 rounded-full", online ? "bg-success" : "bg-destructive")} aria-hidden />
      {online ? "ออนไลน์" : "ออฟไลน์"}
    </span>
  );
  const itemClass = (active = false) =>
    cn(
      "group font-ui tappable flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-colors",
      active ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
    );
  const footerIconClass = "tappable flex h-10 flex-1 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground";
  const themeLabel = preference === "system" ? "ตามระบบ" : preference === "dark" ? "โหมดมืด" : "โหมดสว่าง";
  // Tools only make sense on the sale screen; each one also closes the drawer on narrow screens.
  const tools = terminal && onSale && (
    <div>
      <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">เครื่องมือ</p>
      <div className="flex flex-col gap-0.5">
        {[
          { label: `วันนี้ ${formatBaht(today?.sales_total ?? 0)} ฿`, icon: CalendarIcon, run: () => setTodayOpen(true), show: true },
          { label: "ค้นหานักเรียน", icon: Search, run: () => setCodeOpen(true), show: true },
          { label: "ทดสอบเครื่องอ่านบาร์โค้ด", icon: BarcodeIcon, run: () => setTestOpen(true), show: true },
        ]
          .filter((t) => t.show)
          .map(({ label, icon: Icon, run }) => (
            <button key={label} type="button" className={itemClass()} onClick={() => (run(), setDrawer(false))}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        {isUnlocked && (
          <button type="button" className={itemClass()} onClick={() => void lockPin.mutateAsync().then(() => (setView("sale"), setTopupAmount("")))}>
            <LockIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">ล็อกการเติมเงิน · เหลือ {Math.max(1, Math.ceil((unlockedUntil - Date.now()) / 60000))} นาที</span>
          </button>
        )}
      </div>
    </div>
  );

  // Same frame as the portal's AppShell: shell-coloured sidebar, toggle pinned top-left, logo top-right,
  // user card + icon row at the foot. Collapsed = zero width; below lg it is a drawer.
  const sidebar = (
    <>
      {!wide && drawer && <button type="button" aria-label="ปิดแถบด้านข้าง" className="absolute inset-0 z-20 bg-black/35" onClick={() => setDrawer(false)} />}
      <aside
        inert={!sidebarOpen}
        className={cn(
          "font-ui bg-shell relative z-10 shrink-0 overflow-hidden transition-[width] duration-200 ease-ios max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:shadow-card",
          sidebarOpen ? "w-60" : "w-0",
        )}
      >
        <div className="flex h-full w-60 flex-col">
          <div className="flex h-12 shrink-0 items-center px-3">
            <img src="/logo.webp" alt="Helix" className="ml-auto h-6 w-auto dark:invert" />
          </div>
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
            {terminal && (
              <button type="button" className="tappable rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold" onClick={() => (setTerminalId(""), setDrawer(false))}>
                {terminal.name} · เปลี่ยน
              </button>
            )}
            {statusDot}
          </div>
          <nav className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-2" aria-label="เมนูบัตรเติมเงิน">
              <div>
                <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">บัตรเติมเงิน</p>
                <div className="flex flex-col gap-0.5">
                  {VIEWS.filter((v) => orgWide || isCounterView(v.key)).map(({ key, label, icon: Icon }) => (
                    <button key={key} type="button" aria-current={view === key ? "page" : undefined} onClick={() => (key === "topup" ? openTopup() : setView(key), setDrawer(false))} className={itemClass(view === key)}>
                      <Icon className="h-4 w-4 shrink-0 group-aria-[current=page]:text-accent" />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            {tools}
          </nav>
          <div className="mt-auto flex flex-col gap-2 border-t border-border/60 p-3">
            <div className="flex items-center gap-2.5 rounded-xl bg-card p-2.5 shadow-card">
              <Avatar name={profile ? profileFullName(profile) : "Helix"} src={profile ? avatarUrl(profile) : null} className="h-9 w-9 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight">{profile ? profileFullName(profile) : ""}</p>
                {profile && <p className="truncate text-[11px] leading-tight text-muted-foreground">{roleSubtitle}</p>}
              </div>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={cycle} title={themeLabel} aria-label={`Theme: ${preference}. Tap to cycle.`} className={footerIconClass}>
                {preference === "system" ? <Monitor className="h-4 w-4" /> : preference === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => void signOutAndLock()} title="ออกจากระบบ" aria-label="ออกจากระบบ" className={cn(footerIconClass, "hover:bg-destructive/10 hover:text-destructive")}>
                <LogOut className="h-4 w-4" />
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
      {view === "report" && <ReportTab />}
      {view === "products" && <ProductsTab />}
      {view === "terminals" && <TerminalsTab />}
    </div>
  );

  const keypad = (
    <div className="grid flex-1 grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === "⌫" ? "ลบ" : k === "C" ? "ล้าง" : k}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => press(k)}
          className="tappable min-h-16 rounded-xl border border-border bg-background text-2xl font-semibold transition-colors hover:bg-foreground/5 active:bg-foreground/10"
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
          const raw = entry.trim();
          setEntry("");
          // Typed digits with a student on screen set the amount; the cashier then confirms with ตัดเงิน.
          if (student && mode === "topup" && /^\d{1,4}$/.test(raw)) return void setTopupAmount(raw);
          if (student && mode === "sale" && !cart.length && /^\d{1,3}$/.test(raw)) return void setKeyed(raw);
          if (isProductCode(raw)) return void (mode === "sale" ? addByCode(raw) : toast("สแกนสินค้าได้ที่แท็บ POS", "error"));
          else if (raw.startsWith("qr_")) void lookup({ card_uid: raw });
          else if (raw) void lookupCode(raw);
        }}
      />

      <div className={cn("grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_24rem]", !sidebarOpen && "pt-14")}>
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
              {price !== null && canSell && (
                <p className={cn("text-2xl font-semibold tabular-nums", over && "text-destructive")} role={over ? "alert" : undefined}>
                  ยอดชำระ {formatBaht(price)} ฿{over && " — ยอดคงเหลือไม่พอหรือเกินวงเงิน"}
                </p>
              )}
              {student.card_status === "frozen" && <p className="text-base font-semibold text-destructive">บัตรนี้ถูกระงับ — ขายไม่ได้</p>}
              {student.card_status === null && <p className="text-sm text-muted-foreground">นักเรียนยังไม่ได้ผูกบัตร — เติมเงินได้ แต่ขายไม่ได้</p>}
              <RecentTx studentId={student.student_id} />
              <div className="flex justify-center gap-2">
                <Button variant="ghost" size="lg" onClick={() => (setStudent(null), setEntry(""))}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : (
            <div className={cn("flex h-full min-h-0 w-full flex-col gap-4", mode === "topup" && "justify-center")}>
              <div className={cn("flex items-center justify-center gap-4", mode === "sale" && "pt-2")}>
                <svg viewBox="0 0 120 76" className={cn("w-14 shrink-0", mode === "topup" ? "text-amber-500" : "text-muted-foreground")} aria-hidden>
                  <rect x="1.5" y="1.5" width="117" height="73" rx="9" fill="none" stroke="currentColor" strokeWidth="3" />
                  <rect x="1.5" y="14" width="117" height="14" fill="currentColor" opacity="0.5" />
                  <rect x="12" y="44" width="20" height="14" rx="3" fill="currentColor" opacity="0.35" />
                </svg>
                {/* Top-up tab: blinking amber light = reader is waiting for the student's barcode. */}
                {mode === "topup" && (
                  <span className="relative flex size-4 shrink-0" role="status" aria-label="รอสแกนบาร์โค้ดนักเรียน">
                    <span className="absolute inline-flex size-full rounded-full bg-amber-400 opacity-75 motion-safe:animate-ping" />
                    <span className="relative inline-flex size-4 rounded-full bg-amber-400 motion-safe:animate-pulse" />
                  </span>
                )}
                <div className="text-left">
                  <p className="font-heading text-2xl font-semibold">{mode === "topup" ? "สแกนบัตรนักเรียนเพื่อเติมเงิน" : price !== null ? "สแกนบัตรนักเรียนเพื่อตัดเงิน" : "สแกนบัตรนักเรียน"}</p>
                  <p className="text-sm text-muted-foreground">
                    {mode === "topup" ? "หรือกดค้นหานักเรียนในแถบด้านข้าง" : price !== null ? `ยอดชำระ ${formatBaht(price)} ฿` : "หรือสแกน/แตะสินค้าเพื่อเริ่มรายการขาย"}
                  </p>
                </div>
              </div>
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
              <Button variant="ghost" onClick={() => (setStudent(null), setEntry(""), setTopupAmount(""))}>
                ล้าง
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
              {price !== null && price > SALE_MAX && <p className="text-sm text-destructive">ยอดรวมเกิน {SALE_MAX} บาทต่อรายการ — ลดสินค้า</p>}
              <Button size="lg" className="h-20 text-2xl" disabled={!canSell || !priceOk || over || paying || !online} onClick={() => void charge()}>
                {paying ? <Spinner /> : price === null ? "ตัดเงิน" : `ยืนยันตัดเงิน ${formatBaht(price)} ฿`}
              </Button>
              {priceOk && !student && <p className="text-center text-xs text-muted-foreground">สแกนบัตรนักเรียนเพื่อตัดเงิน</p>}
            </>
          )}
        </section>
      </div>

    </>
  );

  // Portalled to <body>: AppShell's sidebar toggle sits in a higher stacking context than the page area.
  return createPortal(
    <div
      className={cn("fixed inset-0 z-40 flex overflow-hidden lg:p-2", sidebarOpen && "lg:gap-2")}
      onClick={(e) => onSale && terminal && !(e.target as HTMLElement).closest("input,select,textarea,dialog") && capture.current?.focus()}
    >
      <div className="absolute inset-0 z-0 bg-shell" aria-hidden />
      {/* Toggle pinned in the header slot whether the sidebar is open or not, like the portal. */}
      <div className="pointer-events-none absolute left-2 top-2 z-40 lg:left-3 lg:top-4">
        <div className="pointer-events-auto">{toggleButton}</div>
      </div>
      {sidebar}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background lg:rounded-2xl lg:shadow-card">
        {!onSale && (
          <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-border px-12">
            <p className="font-heading truncate text-[15px] font-semibold tracking-[-0.01em]">{VIEWS.find((v) => v.key === view)?.label}</p>
          </header>
        )}
        {!online && onSale && terminal && (
          <p className="flex items-center gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
            <AlertTriangle className="size-4" />
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
          <p className="text-xs text-muted-foreground">
            {orgWide ? "พิมพ์รหัสแล้วกด Enter หรือพิมพ์ชื่อเพื่อเลือกจากรายชื่อ" : "พิมพ์รหัสนักเรียนให้ครบแล้วกด Enter"}
          </p>
          <Button type="submit" className="w-full" disabled={!code.trim()}>
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
          setView("topup");
        }}
      />
      <Modal
        open={confirmOpen && !!student && topupValue !== null}
        onOpenChange={(o) => !o && !topup.isPending && setConfirmOpen(false)}
        title="ยืนยันการเติมเงินสด"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={topup.isPending} onClick={() => setConfirmOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="button" className="flex-1" disabled={topup.isPending || !online} onClick={() => void confirmTopup()}>
              {topup.isPending ? <Spinner /> : "ยืนยัน"}
            </Button>
          </div>
        }
      >
        {student && topupValue !== null && (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">นักเรียน</dt>
              <dd className="text-right font-semibold">{student.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">เติมเงินสด</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatBaht(topupValue)} ฿</dd>
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
  if (loading) return <Spinner className="mx-auto size-6" />;
  if (error) return <p className="text-sm text-destructive">โหลดรายการสินค้าไม่สำเร็จ — {errMsg(error)}</p>;
  if (products.length === 0)
    return (
      <p className="m-auto text-sm text-muted-foreground">ยังไม่มีสินค้าที่เปิดขาย{canManage ? ' — เพิ่มได้ที่แท็บ "สินค้า" ในแถบด้านข้าง' : " — แจ้งผู้ดูแลเพื่อเพิ่มสินค้า"}</p>
    );
  const cats = [...new Set(products.map(categoryOf))].sort();
  const shown = products.filter((p) => !category || categoryOf(p) === category);
  const chip = (active: boolean) =>
    cn("tappable shrink-0 rounded-full border px-3 py-1 text-sm", active ? "border-foreground bg-foreground text-background" : "border-border");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 text-left">
      <div className="flex shrink-0 gap-2 overflow-x-auto" role="tablist" aria-label="หมวดหมู่สินค้า">
        <button type="button" role="tab" aria-selected={!category} className={chip(!category)} onMouseDown={(e) => e.preventDefault()} onClick={() => onCategory(null)}>
          ทั้งหมด
        </button>
        {cats.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={category === c} className={chip(category === c)} onMouseDown={(e) => e.preventDefault()} onClick={() => onCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(p)}
            className="tappable flex min-h-16 flex-col gap-1 overflow-hidden rounded-xl border border-border bg-background text-left transition-colors hover:bg-foreground/5 active:bg-foreground/10"
          >
            {productImageUrl(p) && <img src={productImageUrl(p)!} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />}
            <span className="flex flex-col px-3 pb-2 pt-2">
              <span className="line-clamp-2 text-sm font-semibold">{p.name}</span>
              <span className="text-sm tabular-nums text-muted-foreground">{p.price} ฿</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Cart lines with quantity steppers; replaces the keypad while the cart has items. */
function CartPanel({ cart, onQty, onClear }: { cart: CartLine[]; onQty: (productId: string, qty: number) => void; onClear: () => void }) {
  const step = "tappable size-11 rounded-lg border border-border text-xl font-semibold hover:bg-foreground/5";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-ui text-sm font-semibold">ตะกร้า ({cart.reduce((n, l) => n + l.qty, 0)} ชิ้น)</p>
        <button type="button" className="text-xs underline" onMouseDown={(e) => e.preventDefault()} onClick={onClear}>
          ล้างตะกร้า
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {cart.map((l) => (
          <li key={l.product.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{l.product.name}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {l.product.price} ฿ × {l.qty} = {l.product.price * l.qty} ฿
              </p>
            </div>
            <button type="button" className={step} aria-label={`ลด ${l.product.name}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onQty(l.product.id, l.qty - 1)}>
              −
            </button>
            <span className="w-6 text-center font-semibold tabular-nums">{l.qty}</span>
            <button type="button" className={step} aria-label={`เพิ่ม ${l.product.name}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onQty(l.product.id, l.qty + 1)}>
              +
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded-xl bg-muted px-4 py-3 text-right">
        <p className="text-xs text-muted-foreground">ยอดรวม</p>
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
    <ul className="mt-2 space-y-0.5" aria-label="รายชื่อที่ตรงกัน">
      {hits.map((h) => (
        <li key={h.id}>
          <button type="button" className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-foreground/5" onClick={() => onPick(h.id)}>
            <Avatar name={`${h.first_name} ${h.last_name}`} src={studentAvatarUrl(h)} className="size-10 shrink-0 text-xs" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {h.prefix ?? ""}
                {h.first_name} {h.last_name}
              </span>
              <span className="block text-xs text-muted-foreground">{h.student_code}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Shows what the reader typed and how fast; nothing is looked up or charged. A scanner "types" a whole code in well under 50 ms per key. */
function ScannerTest() {
  const [result, setResult] = useState<{ text: string; perKey: number } | null>(null);
  const [value, setValue] = useState("");
  const first = useRef(0);
  const bars = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (bars.current) JsBarcode(bars.current, TEST_CODE, { format: "CODE128", height: 70, fontSize: 14, margin: 8 });
  }, []);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">ยิงบาร์โค้ดด้านล่าง ขณะเคอร์เซอร์อยู่ในช่อง (ไม่มีการค้นหาหรือตัดเงิน)</p>
      <Input
        autoFocus
        autoComplete="off"
        aria-label="ช่องทดสอบเครื่องอ่านบาร์โค้ด"
        value={value}
        onChange={(e) => {
          if (!value) first.current = performance.now();
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !value) return;
          e.preventDefault();
          setResult({ text: value, perKey: (performance.now() - first.current) / value.length });
          setValue("");
        }}
      />
      <div className="flex justify-center">
        <svg ref={bars} role="img" aria-label={`บาร์โค้ดทดสอบ ${TEST_CODE}`} className="max-w-full rounded-lg border border-border bg-white" />
      </div>
      {result ? (
        <div role="status" className="space-y-1 rounded-lg border border-border p-3 text-sm">
          <p className="font-semibold text-success">อ่านได้ ({result.text.length} ตัวอักษร)</p>
          <p className="break-all font-mono">{result.text}</p>
          <p className="text-muted-foreground">
            {result.perKey < 50
              ? `ความเร็ว ${result.perKey.toFixed(0)} ms/ตัว — เหมือนเครื่องยิง`
              : `ความเร็ว ${result.perKey.toFixed(0)} ms/ตัว — ช้า เหมือนพิมพ์มือ`}
            {" · "}
            {result.text.startsWith("qr_") ? "บาร์โค้ดนักเรียน" : "รหัสนักเรียน/อื่นๆ"}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">ถ้ายิงแล้วไม่มีข้อความขึ้น ให้ตรวจว่าเครื่องอยู่โหมด keyboard (HID) และตั้งให้ส่ง Enter ต่อท้าย</p>
      )}
    </div>
  );
}

/** PIN popup with an on-screen pad: one correct PIN unlocks cash top-up for an hour (the server keeps the proof).
 *  Six digits submit by themselves. First use sets the PIN: enter it, then enter it again. */
function PinUnlockModal({ open, onClose, onUnlocked }: { open: boolean; onClose: () => void; onUnlocked: () => void }) {
  const toast = useToast();
  const { data: pinStatus } = usePinStatus();
  const unlock = usePinUnlock();
  const setPin = useSetPin();
  const [pin, setPinText] = useState("");
  const [first, setFirst] = useState<string | null>(null); // first entry while choosing a new PIN
  const hasPin = pinStatus?.has_pin ?? true;
  const locked = !!pinStatus?.locked_until;
  const busy = unlock.isPending || setPin.isPending;

  function reset() {
    setPinText("");
    setFirst(null);
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
          return toast("PIN สองครั้งไม่ตรงกัน — ตั้งใหม่", "error");
        }
        await setPin.mutateAsync(full);
      }
      const r = await unlock.mutateAsync(full);
      setPinText("");
      setFirst(null);
      if (r.ok) return onUnlocked();
      toast(
        r.status === "locked"
          ? "PIN ผิดเกินกำหนด — ล็อก 15 นาที"
          : r.status === "bad"
            ? `PIN ไม่ถูกต้อง (เหลือ ${r.attempts_left} ครั้ง)`
            : "ยังไม่ได้ตั้ง PIN",
        "error",
      );
    } catch (err) {
      setPinText("");
      setFirst(null);
      toast(errMsg(err), "error");
    }
  }

  function press(k: (typeof KEYS)[number]) {
    if (busy || locked) return;
    if (k === "C") return setPinText("");
    if (k === "⌫") return setPinText((p) => p.slice(0, -1));
    if (pin.length >= 6) return;
    const next = pin + k;
    setPinText(next);
    if (next.length === 6) void submit(next);
  }

  const title = hasPin ? "ใส่ PIN เพื่อเติมเงินสด" : first === null ? "ตั้ง PIN ใหม่ (6 หลัก)" : "ยืนยัน PIN อีกครั้ง";
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && !busy && reset()}
      title={title}
      description={hasPin ? "ใส่ครั้งเดียว เติมเงินสดได้ต่อเนื่อง 1 ชั่วโมง" : "ครั้งแรก: ตั้ง PIN 6 หลักของคุณเอง ใช้ปลดล็อกการเติมเงินสด"}
      footer={
        <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={reset}>
          ยกเลิก
        </Button>
      }
    >
      <div
        className="space-y-4"
        tabIndex={-1}
        // Physical keyboard works too: digits, Backspace.
        onKeyDown={(e) => {
          if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
          else if (e.key === "Backspace") press("⌫");
        }}
      >
        <div className="flex justify-center gap-3" role="status" aria-label={`ใส่แล้ว ${pin.length} จาก 6 หลัก`}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={cn("size-4 rounded-full border-2 border-foreground transition-colors", i < pin.length && "bg-foreground")} />
          ))}
        </div>
        <div className="mx-auto grid max-w-64 grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              disabled={busy || locked}
              aria-label={k === "⌫" ? "ลบ" : k === "C" ? "ล้าง" : k}
              onClick={() => press(k)}
              className="tappable flex h-14 items-center justify-center rounded-xl border border-border bg-background text-xl font-semibold transition-colors hover:bg-foreground/5 active:bg-foreground/10 disabled:opacity-40"
            >
              {busy && k === "0" ? <Spinner /> : k}
            </button>
          ))}
        </div>
        {locked && <p className="text-center text-xs text-destructive">ล็อกชั่วคราว เพราะใส่ PIN ผิดหลายครั้ง — ให้ผู้ดูแลรีเซ็ต หรือรอ 15 นาที</p>}
      </div>
    </Modal>
  );
}

/** The caller's own shift today, with void for their own rows. */
/** The student's last 10 transactions on the POS card: time · type · amount (voided ones struck through). */
function RecentTx({ studentId }: { studentId: string }) {
  const { data = [], isLoading } = usePosStudentRecent(studentId);
  if (isLoading) return <Spinner className="mx-auto size-5" />;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">ยังไม่มีรายการ</p>;
  return (
    <div className="mx-auto w-full max-w-md text-left">
      <p className="pb-1 text-xs font-medium text-muted-foreground">รายการล่าสุด</p>
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-background px-3">
        {data.map((t) => (
          <li key={t.id} className={cn("flex items-center justify-between gap-2 py-1.5 text-sm", t.voided_at && "text-muted-foreground line-through")}>
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
