import { motion } from "framer-motion";
import { lazy, Suspense, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, BuddhistDateSelect, Field, Input, PasswordInput, Spinner } from "@/components/ui";

const Beams = lazy(() => import("@/components/Beams/Beams"));

type Mode = "signin" | "reset";

const inputClass =
  "border-white/20 bg-white/5 text-white shadow-inner placeholder:text-white/40 focus-visible:border-white/40";

export function Login() {
  const { signIn, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(undefined);
    setNotice(undefined);
    setPassword("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(loginId.trim(), password);
      } else {
        await resetPassword(loginId.trim(), nationalId.trim(), dateOfBirth, password);
        setNotice("ตั้งรหัสผ่านใหม่สำเร็จ เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย");
        switchMode("signin");
      }
    } catch (err) {
      // Sign-in is deliberately vague: a precise message tells an attacker
      // which half of the credential pair was right. Reset surfaces the
      // server's message (lockout / bad match) since there's no credential
      // pair to protect there.
      setError(
        mode === "signin"
          ? "รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
          : err instanceof Error
            ? err.message
            : "ตั้งรหัสผ่านใหม่ไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    // Login is always dark — Beams + glass; ignores app ThemeProvider.
    <div className="dark relative flex h-dvh flex-col overflow-hidden overscroll-none bg-black">
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
            <img src="/logo.webp" alt="Helix" className="mx-auto h-28 w-auto invert" />
            <p className="mt-2 text-sm text-white/65">Academic Enterprise Resource Planning</p>
          </div>

          <div className="glass-panel space-y-4 rounded-2xl p-5 text-card-foreground">
            <form onSubmit={submit} className="space-y-4">
              <Field label="รหัสประจำตัว / เบอร์โทร">
                <Input
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="username"
                  required
                  className={inputClass}
                />
              </Field>

              {mode === "reset" && (
                <>
                  <Field label="เลขบัตรประชาชน">
                    <Input
                      value={nationalId}
                      onChange={(e) => setNationalId(e.target.value)}
                      inputMode="numeric"
                      required
                      className={inputClass}
                    />
                  </Field>
                  <Field label="วันเดือนปีเกิด">
                    <BuddhistDateSelect
                      value={dateOfBirth}
                      onChange={setDateOfBirth}
                      required
                      className={inputClass}
                    />
                  </Field>
                </>
              )}

              <Field label={mode === "signin" ? "รหัสผ่าน" : "รหัสผ่านใหม่"}>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "reset" ? 8 : undefined}
                  className={inputClass}
                  iconClassName="text-white/40 hover:text-white"
                />
              </Field>

              {error && <p className="text-xs text-destructive">{error}</p>}
              {notice && <p className="text-xs text-success">{notice}</p>}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? <Spinner /> : mode === "signin" ? "เข้าสู่ระบบ" : "ตั้งรหัสผ่านใหม่"}
              </Button>
            </form>

            <button
              type="button"
              className="tappable w-full text-center text-sm text-white/55 hover:text-white/80"
              onClick={() => switchMode(mode === "signin" ? "reset" : "signin")}
            >
              {mode === "signin" ? "ลืมรหัสผ่าน?" : "กลับไปเข้าสู่ระบบ"}
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-white/45">
            Designed & Developed by Team Adah tech.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
