import { motion } from "framer-motion";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { Button, Card, Field, Input, Spinner } from "@/components/ui";

type Mode = "signin" | "reset";

export function Login() {
  const { signIn, resetPassword } = useAuth();
  const { theme } = useTheme();
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
    <div className="flex h-screen flex-col overflow-hidden overscroll-none">
      <div className="relative flex flex-1 items-center justify-center px-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Helix</h1>
            <p className="mt-1 text-sm text-muted-foreground">ระบบจัดการสถานศึกษา</p>
          </div>

          <Card className="space-y-4">
            <form onSubmit={submit} className="space-y-4">
              <Field label="อีเมล">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  required
                />
              </Field>

              {mode === "signin" && (
                <Field label="รหัสผ่าน">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
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
              className="tappable w-full text-center text-sm text-muted-foreground"
              onClick={() => {
                setMode(mode === "signin" ? "reset" : "signin");
                setError(undefined);
                setNotice(undefined);
              }}
            >
              {mode === "signin" ? "ลืมรหัสผ่าน?" : "กลับไปเข้าสู่ระบบ"}
            </button>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            บัญชีสร้างโดยผู้ดูแลระบบเท่านั้น
          </p>
        </motion.div>
      </div>
    </div>
  );
}
