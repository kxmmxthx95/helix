import { motion } from "framer-motion";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { GraduationCap } from "@/components/icons";
import { Button, BuddhistDateSelect, Field, Input, PasswordInput, Spinner } from "@/components/ui";

type Mode = "signin" | "reset";

const inputClass =
  "h-11 rounded-2xl border border-pink-200 bg-pink-50/60 px-3.5 text-sm font-medium text-rose-900 shadow-none placeholder:font-normal placeholder:text-rose-300 focus-visible:border-pink-400 focus-visible:bg-white focus-visible:ring-0";

export function StudentLogin() {
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
      // Sign-in stays vague on purpose — see src/routes/Login.tsx for why.
      setError(
        mode === "signin"
          ? "รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง"
          : err instanceof Error
            ? err.message
            : "ตั้งรหัสผ่านใหม่ไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden overscroll-none bg-[#ffe3ee]">
      <img
        src="/student-login-bg.webp"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Soft pink wash so the card reads over the scene on every screen size */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "linear-gradient(180deg, rgba(255,232,242,0.35) 0%, rgba(255,214,232,0.55) 55%, rgba(255,192,220,0.8) 100%)",
        }}
      />

      <div className="relative z-10 flex flex-1 items-center justify-center overflow-y-auto px-5 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <div className="mb-5 text-center">
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-white shadow-[0_8px_24px_rgba(255,105,160,0.35)]"
            >
              <GraduationCap className="h-8 w-8 text-pink-500" />
            </motion.div>
            <h1 className="font-heading mt-3 text-2xl font-extrabold text-rose-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]">
              เข้าสู่ระบบนักเรียน 🌸
            </h1>
            <p className="mt-1 text-sm font-medium text-rose-900/70">
              ยินดีต้อนรับกลับมา พร้อมเรียนวันนี้หรือยัง?
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(255,105,160,0.25)] backdrop-blur-xl">
            <form onSubmit={submit} className="space-y-3.5">
              <Field label="รหัสนักเรียน / เบอร์โทร">
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
                      className={inputClass.replace("px-3.5", "px-2.5")}
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
                  iconClassName="text-rose-300 hover:text-pink-500"
                />
              </Field>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                  {error}
                </p>
              )}
              {notice && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">
                  {notice}
                </p>
              )}

              <motion.div whileTap={{ scale: 0.97 }}>
                <Button
                  type="submit"
                  disabled={busy}
                  className="h-12 w-full rounded-2xl bg-gradient-to-r from-pink-400 to-rose-400 text-sm font-bold text-white shadow-[0_10px_24px_rgba(244,63,140,0.4)] transition-[filter] hover:brightness-105 disabled:opacity-70"
                >
                  {busy ? <Spinner /> : mode === "signin" ? "เข้าสู่ระบบ" : "ตั้งรหัสผ่านใหม่"}
                </Button>
              </motion.div>
            </form>

            <button
              type="button"
              className="tappable mt-3.5 w-full text-center text-xs font-semibold text-rose-400 hover:text-pink-500"
              onClick={() => switchMode(mode === "signin" ? "reset" : "signin")}
            >
              {mode === "signin" ? "ลืมรหัสผ่าน?" : "กลับไปเข้าสู่ระบบ"}
            </button>
          </div>

          <p className="mt-5 text-center text-xs font-medium text-rose-950/60">
            Designed & Developed by Team Adah tech.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
