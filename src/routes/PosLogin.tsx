import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Input, PasswordInput, Spinner } from "@/components/ui";

/** Set by PosDenied (App.tsx) when a signed-in account has no POS access, so the redirect back here can say so. */
export const POS_DENIED_KEY = "helix.posDenied";
export const POS_DENIED_MSG = "รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";

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

/** Dedicated sign-in for the POS terminal (/pos-login). Same auth as Login; Gate sends allowed roles to /card-topup. */
export function PosLogin() {
  const { signIn } = useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(takeDeniedMessage);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("pos-large");
    return () => document.documentElement.classList.remove("pos-large");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await signIn(loginId.trim(), password);
    } catch {
      // Vague on purpose — same reasoning as src/routes/Login.tsx.
      setError(POS_DENIED_MSG);
    } finally {
      setBusy(false);
    }
  }

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
          <svg viewBox="0 0 320 190" className="mx-auto mb-6 w-56 landscape:max-h-[22vh] landscape:w-auto" aria-hidden>
            <rect x="1" y="1" width="318" height="188" rx="16" fill="#1c1c1e" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
            <rect x="1" y="30" width="318" height="38" fill="#000" />
            <rect x="24" y="96" width="46" height="34" rx="6" fill="rgba(255,255,255,0.14)" />
            <rect x="24" y="150" width="120" height="8" rx="4" fill="rgba(255,255,255,0.18)" />
            <rect x="24" y="166" width="72" height="8" rx="4" fill="rgba(255,255,255,0.1)" />
            <text x="296" y="160" textAnchor="end" fill="rgba(255,255,255,0.45)" fontSize="13" fontFamily="monospace" letterSpacing="3">
              SWIPE
            </text>
          </svg>

          <h1 className="text-center text-3xl font-semibold tracking-tight">เข้าสู่ระบบเครื่อง POS</h1>
          <p className="mt-2 text-center text-lg text-white/75">บัตรเติมเงินนักเรียน</p>

          <form onSubmit={submit} className="glass-panel mt-6 space-y-5 rounded-2xl p-6">
            <Field label="รหัสผู้ใช้">
              <Input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                className={inputClass}
              />
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
              {busy ? <Spinner /> : "เข้าสู่ระบบ"}
            </Button>
          </form>

          <p className="mt-5 text-center text-base text-white/70">ลืมรหัสผ่าน? ติดต่อฝ่ายการเงิน</p>
        </motion.div>
      </div>
    </div>
  );
}
