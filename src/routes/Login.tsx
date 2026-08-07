import { motion } from "framer-motion";
import { lazy, Suspense, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Input, Spinner } from "@/components/ui";

const Beams = lazy(() => import("@/components/Beams/Beams"));

type Mode = "signin" | "reset";

export function Login() {
  const { signIn, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await resetPassword(email.trim());
        setNotice("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว");
      }
    } catch {
      // Deliberately vague: a precise message tells an attacker which
      // half of the credential pair was right.
      setError(
        mode === "signin" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : "ส่งอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    // Login is always dark — Beams + glass; ignores app ThemeProvider.
    <div className="dark relative flex h-screen flex-col overflow-hidden overscroll-none bg-black">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <Suspense fallback={null}>
          <Beams
            beamWidth={2.2}
            beamHeight={18}
            beamNumber={14}
            lightColor="#ffffff"
            speed={1.6}
            noiseIntensity={1.6}
            scale={0.18}
            rotation={28}
          />
        </Suspense>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white">Helix</h1>
            <p className="mt-2 text-sm text-white/65">Academic Enterprise Resource Planning</p>
          </div>

          <div className="glass-panel space-y-4 rounded-2xl p-5 text-card-foreground">
            <form onSubmit={submit} className="space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  required
                  className="border-white/20 bg-white/5 text-white shadow-inner placeholder:text-white/40 focus-visible:border-white/40"
                />
              </Field>

              {mode === "signin" && (
                <Field label="Password">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="border-white/20 bg-white/5 text-white shadow-inner placeholder:text-white/40 focus-visible:border-white/40"
                  />
                </Field>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
              {notice && <p className="text-sm text-success">{notice}</p>}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? <Spinner /> : mode === "signin" ? "เข้าสู่ระบบ" : "ส่งลิงก์ตั้งรหัสผ่าน"}
              </Button>
            </form>

            <button
              type="button"
              className="tappable w-full text-center text-sm text-white/55 hover:text-white/80"
              onClick={() => {
                setMode(mode === "signin" ? "reset" : "signin");
                setError(undefined);
                setNotice(undefined);
              }}
            >
              {mode === "signin" ? "ลืมรหัสผ่าน?" : "กลับไปเข้าสู่ระบบ"}
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-white/45">
            Designed & Developed by Team Aadh tech.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
