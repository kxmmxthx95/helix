import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Button, Field, Input, PasswordInput, Spinner } from "@/components/ui";
import { POS_TERMINAL_KEY, posPin } from "@/lib/posPin";
import { tick } from "@/lib/sound";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/** Set by PosDenied (App.tsx) when a signed-in account has no POS access, so the redirect back here can say so. */
export const POS_DENIED_KEY = "helix.posDenied";
export const POS_DENIED_MSG = "เข้าสู่ระบบไม่ได้ — ติดต่อฝ่ายการเงิน";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"] as const;
const inputClass = "h-14 border-white/15 bg-white/5 text-lg text-white placeholder:text-white/35 focus-visible:border-white/40";

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

type Info = { name: string; active: boolean; has_pin: boolean };
type PinResult =
  | { status: "ok"; session: { access_token: string; refresh_token: string } }
  | { status: "bad"; attempts_left?: number }
  | { status: "locked"; locked_until?: string };

/** Dedicated sign-in for a POS terminal (/pos-login): a 6-digit PIN, no username. Gate sends the signed-in terminal account to /card-topup.
 *  A device is bound to one terminal once (an admin signs in here and picks it); the choice lives in localStorage. */
export function PosLogin() {
  const [terminalId, setTerminalId] = useState(readTerminal);
  const [pairing, setPairing] = useState(false);
  const [info, setInfo] = useState<Info | null | undefined>(undefined); // undefined = loading, null = unknown terminal
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | undefined>(takeDeniedMessage);

  useEffect(() => {
    document.documentElement.classList.add("pos-large");
    return () => document.documentElement.classList.remove("pos-large");
  }, []);

  useEffect(() => {
    if (!terminalId) return setInfo(null);
    let live = true;
    setInfo(undefined);
    setOffline(false);
    posPin<Info>({ action: "terminal_info", terminal_id: terminalId }).then(
      (r) => live && setInfo(r),
      (e: Error) => {
        // "not found" = this terminal no longer exists; anything else is a network problem — keep the binding.
        if (!live) return;
        if (e.message === "not found") setInfo(null);
        else setOffline(true);
      },
    );
    return () => {
      live = false;
    };
  }, [terminalId]);

  const bound = !!terminalId && info !== null;

  return (
    <div className="dark fixed inset-0 flex flex-col overflow-y-auto overscroll-none bg-[#0a0a0a] text-foreground">
      {/* Terminal bar: the one thing you'd recognise with the logo removed. */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 font-mono text-base uppercase tracking-[0.2em] text-white/70">
        <span>Helix · POS</span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-success" aria-hidden />
          พร้อมใช้งาน
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-lg"
        >

          {pairing || !bound ? (
            <Pair
              onPaired={(id) => {
                try {
                  localStorage.setItem(POS_TERMINAL_KEY, id);
                } catch {
                  /* private mode: the binding lasts until reload */
                }
                setError(undefined);
                setTerminalId(id);
                setPairing(false);
              }}
              onCancel={bound ? () => setPairing(false) : undefined}
            />
          ) : offline ? (
            <p className="rounded-xl bg-destructive/10 px-4 py-3 text-center text-lg text-destructive">เชื่อมต่อไม่ได้ — ตรวจอินเทอร์เน็ตแล้วโหลดหน้าใหม่</p>
          ) : info === undefined ? (
            <Spinner className="mx-auto size-8 text-white/60" />
          ) : (
            <PinEntry terminalId={terminalId} info={info!} initialError={error} onRepair={() => setPairing(true)} />
          )}
        </motion.div>
      </div>
    </div>
  );
}

/** Admin pairing: sign in with an admin account (nothing is kept on this device), then pick which terminal this device is. */
function Pair({ onPaired, onCancel }: { onPaired: (id: string) => void; onCancel?: () => void }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [terminals, setTerminals] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      const r = await posPin<{ terminals: { id: string; name: string }[] }>({ action: "pair_list", loginId, password });
      setTerminals(r.terminals);
    } catch {
      setError("เข้าสู่ระบบแอดมินไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-center text-3xl font-semibold tracking-tight">ผูกเครื่องนี้กับเครื่อง POS</h1>
      <p className="mt-2 text-center text-lg text-white/75">{terminals ? "เลือกเครื่องที่ตั้งอยู่ตรงนี้" : "ผู้ดูแลเข้าสู่ระบบเพื่อเลือกเครื่อง"}</p>
      {terminals ? (
        <div className="glass-panel mt-6 space-y-3 rounded-2xl p-6">
          {terminals.length === 0 && <p className="text-center text-lg text-white/75">ยังไม่มีเครื่องที่เปิดใช้งาน — เพิ่มได้ที่เมนู บัตรเติมเงิน แท็บเครื่องขาย</p>}
          {terminals.map((t) => (
            <Button key={t.id} type="button" variant="outline" className="h-16 w-full text-xl" onClick={() => onPaired(t.id)}>
              {t.name}
            </Button>
          ))}
        </div>
      ) : (
        <form onSubmit={submit} className="glass-panel mt-6 space-y-5 rounded-2xl p-6">
          <Field label="รหัสผู้ใช้ผู้ดูแล">
            <Input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" autoFocus required className={inputClass} />
          </Field>
          <Field label="รหัสผ่าน">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={inputClass}
              iconClassName="text-white/40 hover:text-white"
            />
          </Field>
          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-lg text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-16 w-full text-xl" disabled={busy}>
            {busy ? <Spinner /> : "ต่อไป"}
          </Button>
        </form>
      )}
      {onCancel && (
        <button type="button" onClick={onCancel} className="tappable mx-auto mt-5 block text-base text-white/70 underline underline-offset-4">
          ยกเลิก
        </button>
      )}
    </>
  );
}

/** Six boxes + on-screen pad (a physical keyboard works too). Six digits submit by themselves. */
function PinEntry({ terminalId, info, initialError, onRepair }: { terminalId: string; info: Info; initialError?: string; onRepair: () => void }) {
  const reduce = useReducedMotion();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);
  const [shake, setShake] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const locked = lockedUntil > Date.now();
  const ready = info.active && info.has_pin;

  const submit = useCallback(
    async (full: string) => {
      setBusy(true);
      setError(undefined);
      try {
        const r = await posPin<PinResult>({ action: "login", terminal_id: terminalId, pin: full });
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
    [terminalId],
  );

  const press = useCallback(
    (k: (typeof KEYS)[number]) => {
      if (busy || locked || !ready) return;
      tick(k === "C" || k === "⌫" ? 700 : 1000);
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

  return (
    <>
      <h1 className="text-center text-3xl font-semibold tracking-tight">{info.name}</h1>
      <p className="mt-2 text-center text-lg text-white/75">
        {!info.active ? "เครื่องนี้ถูกปิดใช้งาน" : !info.has_pin ? "ยังไม่ได้ตั้ง PIN — ติดต่อผู้ดูแล" : "ใส่ PIN 6 หลักเพื่อเริ่มใช้งาน"}
      </p>

      <motion.div
        key={shake}
        initial={false}
        animate={shake && !reduce ? { x: [0, -14, 12, -8, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-6 flex justify-center gap-2.5"
        role="status"
        aria-label={`ใส่แล้ว ${pin.length} จาก 6 หลัก`}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex size-12 items-center justify-center rounded-xl border-2 transition-colors",
              error ? "border-destructive" : i < pin.length ? "border-white bg-white" : i === pin.length && ready && !busy && !locked ? "border-white" : "border-white/20",
            )}
          >
            {i < pin.length && <span className="size-3.5 rounded-full bg-[#0a0a0a]" />}
          </span>
        ))}
      </motion.div>

      <div className="min-h-[4rem] pt-4" aria-live="assertive">
        {busy ? (
          <p className="flex items-center justify-center gap-3 text-lg font-medium">
            <Spinner className="size-6" />
            กำลังตรวจสอบ…
          </p>
        ) : error ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-center text-lg font-semibold text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mx-auto mt-2 grid max-w-sm grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={busy || locked || !ready}
            aria-label={k === "⌫" ? "ลบหนึ่งตัว" : k === "C" ? "ล้างทั้งหมด" : k}
            onClick={() => press(k)}
            className={cn(
              "tappable flex h-20 items-center justify-center rounded-2xl border border-white/15 font-semibold transition-colors active:bg-white/20 disabled:opacity-40",
              k === "C" || k === "⌫" ? "bg-white/5 text-xl" : "bg-white/10 text-4xl tabular-nums hover:bg-white/15",
            )}
          >
            {k === "C" ? "ล้าง" : k === "⌫" ? "ลบ" : k}
          </button>
        ))}
      </div>

      <button type="button" onClick={onRepair} className="tappable mx-auto mt-6 block text-base text-white/70 underline underline-offset-4">
        เปลี่ยนเครื่อง (ผู้ดูแล)
      </button>
    </>
  );
}
