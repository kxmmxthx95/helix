import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Select, Spinner } from "@/components/ui";
import { POS_TERMINAL_KEY, posPin } from "@/lib/posPin";
import { POS_DENIED_KEY } from "@/lib/roles";
import { useWakeLock } from "@/hooks/usePosDevice";
import { buzz, tick } from "@/lib/sound";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/** Set by PosDenied (App.tsx) when a signed-in account has no POS access, so the redirect back here can say so. */
export const POS_DENIED_MSG = "เข้าสู่ระบบไม่ได้ — ติดต่อฝ่ายการเงิน";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"] as const;

function takeDeniedMessage() {
  try {
    const hit = sessionStorage.getItem(POS_DENIED_KEY);
    sessionStorage.removeItem(POS_DENIED_KEY);
    return hit ? POS_DENIED_MSG : undefined;
  } catch {
    return undefined;
  }
}

function readTerminal(): string {
  try {
    return localStorage.getItem(POS_TERMINAL_KEY) ?? "";
  } catch {
    return "";
  }
}

type Terminal = { id: string; name: string; has_pin: boolean };
type PinResult =
  | { status: "ok"; session: { access_token: string; refresh_token: string } }
  | { status: "bad"; attempts_left?: number }
  | { status: "locked"; locked_until?: string };

/** Dedicated sign-in for a POS terminal (/pos-login): pick the terminal, then its 6-digit PIN. Gate sends the signed-in terminal account to /card-topup.
 *  The pick is remembered in localStorage so the next sign-in on this device starts on the same terminal. */
export function PosLogin() {
  const [terminals, setTerminals] = useState<Terminal[] | undefined>(undefined); // undefined = loading
  const [terminalId, setTerminalId] = useState(readTerminal);
  const [offline, setOffline] = useState(false);
  const [error] = useState<string | undefined>(takeDeniedMessage);

  useWakeLock();
  useEffect(() => {
    document.documentElement.classList.add("pos-large");
    return () => document.documentElement.classList.remove("pos-large");
  }, []);

  useEffect(() => {
    let live = true;
    posPin<{ terminals: Terminal[] }>({ action: "terminal_list" }).then(
      (r) => live && setTerminals(r.terminals.sort((a, b) => a.name.localeCompare(b.name, "th", { numeric: true }))),
      () => live && setOffline(true),
    );
    return () => {
      live = false;
    };
  }, []);

  function pick(id: string) {
    setTerminalId(id);
    try {
      localStorage.setItem(POS_TERMINAL_KEY, id);
    } catch {
      /* private mode: the pick lasts until reload */
    }
  }

  const selected = terminals?.find((t) => t.id === terminalId) ?? null;

  return (
    <div className="fixed inset-0 flex flex-col overflow-y-auto overscroll-none bg-background text-foreground">
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-border bg-card px-5">
        <span className="flex items-center gap-3">
          <img src="/logo.webp" alt="Helix" className="h-7 w-auto dark:invert" />
          <span className="rounded-lg bg-primary px-3 py-1 text-lg font-bold tracking-wide text-primary-foreground">POS</span>
        </span>
        <span className="flex h-12 items-center gap-2 rounded-full bg-success px-4 text-base font-semibold text-white">
          <span className="size-3 rounded-full bg-white" aria-hidden />
          พร้อมใช้งาน
        </span>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="flex h-full max-h-[46rem] w-full max-w-md items-center landscape:max-w-3xl"
        >
          {offline ? (
            <p className="rounded-xl bg-destructive/10 px-4 py-3 text-center text-xl text-destructive">เชื่อมต่อไม่ได้ — ตรวจอินเทอร์เน็ตแล้วโหลดหน้าใหม่</p>
          ) : terminals === undefined ? (
            <Spinner className="mx-auto size-8 text-muted-foreground" />
          ) : (
            <PinEntry terminals={terminals} selected={selected} onPick={pick} initialError={error} />
          )}
        </motion.div>
      </div>
    </div>
  );
}

/** Six boxes + on-screen pad (a physical keyboard works too). Six digits submit by themselves. */
function PinEntry({ terminals, selected, onPick, initialError }: { terminals: Terminal[]; selected: Terminal | null; onPick: (id: string) => void; initialError?: string }) {
  const reduce = useReducedMotion();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);
  const [shake, setShake] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const locked = lockedUntil > Date.now();
  const ready = !!selected?.has_pin;

  const submit = useCallback(
    async (full: string) => {
      setBusy(true);
      setError(undefined);
      try {
        const r = await posPin<PinResult>({ action: "login", terminal_id: selected!.id, pin: full });
        if (r.status === "ok") {
          // Gate redirects to /card-topup once the auth listener sees the session.
          await supabase.auth.setSession(r.session);
          return;
        }
        setPin("");
        setShake((n) => n + 1);
        if (r.status === "locked") {
          setLockedUntil(r.locked_until ? Date.parse(r.locked_until) : Date.now() + 15 * 60_000);
          setError("ใส่ PIN ผิดเกินกำหนด — ล็อก 15 นาที หรือให้ผู้ดูแลตั้ง PIN ใหม่");
        } else {
          setError(r.attempts_left ? `PIN ไม่ถูกต้อง — ลองได้อีก ${r.attempts_left} ครั้ง` : "PIN ไม่ถูกต้อง");
        }
      } catch {
        setPin("");
        setError("เข้าสู่ระบบไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่");
      } finally {
        setBusy(false);
      }
    },
    [selected],
  );

  const press = useCallback(
    (k: (typeof KEYS)[number]) => {
      if (busy || locked || !ready) return;
      tick(k === "C" || k === "⌫" ? 700 : 1000);
      buzz();
      setError(undefined);
      if (k === "C") return setPin("");
      if (k === "⌫") return setPin((p) => p.slice(0, -1));
      if (pin.length >= 6) return;
      const next = pin + k;
      setPin(next);
      if (next.length === 6) void submit(next);
    },
    [busy, locked, ready, pin, submit],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("⌫");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const hint = terminals.length === 0 ? "ยังไม่มีเครื่องที่เปิดใช้งาน — ติดต่อผู้ดูแล" : !selected ? "เลือกเครื่องก่อน แล้วใส่ PIN" : !selected.has_pin ? "ยังไม่ได้ตั้ง PIN — ติดต่อผู้ดูแล" : "ใส่ PIN 6 หลัก";

  // One card that always fits the screen: portrait = one column whose keys stretch to the height left over,
  // landscape = form on the left, key pad on the right. Nothing scrolls.
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 rounded-3xl border-2 border-border bg-card p-4 shadow-card landscape:flex-row landscape:gap-5">
      <div className="flex flex-col justify-center gap-3 landscape:flex-1">
      <label className="block space-y-2">
        <span className="block text-lg font-semibold text-muted-foreground">เครื่อง</span>
        <Select
          className="h-16 border-2 text-2xl font-semibold md:text-2xl"
          placeholder="เลือกเครื่อง"
          value={selected?.id ?? ""}
          disabled={busy}
          onChange={(e) => {
            setPin("");
            setError(undefined);
            onPick(e.target.value);
          }}
        >
          {terminals.map((t) => (
            <option key={t.id} value={t.id} disabled={!t.has_pin}>
              {t.has_pin ? t.name : `${t.name} (ยังไม่ตั้ง PIN)`}
            </option>
          ))}
        </Select>
      </label>

      <div className="flex min-h-12 items-center justify-center" aria-live="assertive">
        {busy ? (
          <p className="flex items-center gap-3 text-xl font-medium">
            <Spinner className="size-6" />
            กำลังตรวจสอบ…
          </p>
        ) : error ? (
          <p role="alert" className="w-full rounded-xl bg-destructive/10 px-4 py-3 text-center text-xl font-semibold text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-center text-xl text-muted-foreground">{hint}</p>
        )}
      </div>

      <motion.div
        key={shake}
        initial={false}
        animate={shake && !reduce ? { x: [0, -14, 12, -8, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-6 gap-2"
        role="status"
        aria-label={`ใส่แล้ว ${pin.length} จาก 6 หลัก`}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex h-14 items-center justify-center rounded-xl border-2 transition-colors",
              error
                ? "border-destructive bg-background"
                : i < pin.length
                  ? "border-primary bg-primary"
                  : i === pin.length && ready && !busy && !locked
                    ? "border-primary bg-background"
                    : "border-border bg-background",
            )}
          >
            {i < pin.length && <span className="size-4 rounded-full bg-white" />}
          </span>
        ))}
      </motion.div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-[repeat(4,minmax(0,1fr))] gap-3 landscape:flex-1">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={busy || locked || !ready}
            aria-label={k === "⌫" ? "ลบหนึ่งตัว" : k === "C" ? "ล้างทั้งหมด" : k}
            onClick={() => press(k)}
            className={cn(
              "tappable pos-key flex h-full min-h-12 items-center justify-center rounded-2xl border-2 border-border bg-background font-bold transition-colors active:bg-muted disabled:opacity-40",
              k === "C" && "border-destructive/50 bg-destructive/10 text-xl text-destructive",
              k === "⌫" && "bg-muted text-xl",
              k !== "C" && k !== "⌫" && "text-4xl tabular-nums",
            )}
          >
            {k === "C" ? "ล้าง" : k === "⌫" ? "ลบ" : k}
          </button>
        ))}
      </div>
    </div>
  );
}
