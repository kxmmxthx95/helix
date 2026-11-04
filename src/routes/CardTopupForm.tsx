import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileUp } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Skeleton, Spinner } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useMyCardStudents, useSubmitSlip, type PortalStudent } from "@/hooks/useCardTopup";
import { useDepartments } from "@/hooks/useProfiles";
import { schoolLogoUrl, useSchoolSettings } from "@/hooks/useSettings";
import { parseAmount, TOPUP_MAX, TOPUP_MIN } from "@/lib/cardTopup";

/** Parents top up for their children; secondary-school (SEC) students for themselves — RLS in migration 0123 enforces the same. */
export function useCanTopup(kid: PortalStudent | undefined) {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  if (!kid || !me) return false;
  return me.roles.includes("parent") || (kid.profile_id === me.id && departments.find((d) => d.id === kid.department_id)?.code === "SEC");
}

/** /card-topup/:studentId — standalone page around the same form the card expands inline on phones. */
export function CardTopupForm() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { data: kids = [], isLoading } = useMyCardStudents();
  const kid = kids.find((k) => k.id === studentId);
  const allowed = useCanTopup(kid);
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!kid || !allowed) return <EmptyState title="ไม่มีสิทธิ์เติมเงินให้บัตรนี้" />;
  return <TopupSlipForm kid={kid} onSent={() => navigate("/card-topup", { replace: true })} />;
}

/** PromptPay slip top-up request form; the caller has already checked the viewer may top up this card. */
export function TopupSlipForm({ kid, onSent }: { kid: PortalStudent; onSent: () => void }) {
  const toast = useToast();
  const { profile: me } = useAuth();
  const { data: settings } = useSchoolSettings();
  const submit = useSubmitSlip();
  const [amount, setAmount] = useState("");
  const [at, setAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const value = parseAmount(amount, TOPUP_MIN, TOPUP_MAX);
  const qr = settings ? schoolLogoUrl({ logo_path: settings.promptpay_qr_path, updated_at: settings.updated_at }) : null;
  const ready = value !== null && !!at && !!file && !!me;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !me) return;
    try {
      await submit.mutateAsync({ student_id: kid.id, requested_by: me.id, amount: value, transferred_at: new Date(at).toISOString(), file });
      toast("ส่งสลิปแล้ว — รอโรงเรียนตรวจสอบและอนุมัติ");
      setAmount("");
      setAt("");
      setFile(null);
      onSent();
    } catch (err) {
      toast(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ", "error");
    }
  }

  return (
    <form onSubmit={send} className="mx-auto w-full max-w-md space-y-3">
      <Card className="space-y-2 text-center">
        {qr ? <img src={qr} alt="QR พร้อมเพย์ของโรงเรียน" className="mx-auto max-h-64 object-contain" /> : null}
        {settings?.promptpay_id ? (
          <p className="text-sm">
            พร้อมเพย์: <span data-selectable className="font-semibold">{settings.promptpay_id}</span>
          </p>
        ) : (
          !qr && <p className="text-xs text-muted-foreground">โรงเรียนยังไม่ได้ตั้งค่าพร้อมเพย์</p>
        )}
        <p className="text-xs text-muted-foreground">โอนเงินแล้วกรอกรายละเอียดและแนบสลิปด้านล่าง</p>
      </Card>

      <Card className="space-y-3">
        <Field label={`จำนวนเงินที่โอน (${TOPUP_MIN}–${TOPUP_MAX} บาท)`}>
          <Input inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </Field>
        <Field label="วันและเวลาที่โอน">
          <Input type="datetime-local" value={at} max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setAt(e.target.value)} />
        </Field>
      </Card>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-border bg-card p-4 text-center">
        <input type="file" accept="image/*" aria-label="รูปสลิป" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {preview ? (
          <img src={preview} alt="ตัวอย่างสลิป" className="max-h-72 rounded-xl object-contain" />
        ) : (
          <FileUp className="h-8 w-8 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{file ? "เปลี่ยนรูปสลิป" : "เลือกรูปสลิป"}</span>
      </label>

      <Button type="submit" className="h-12 w-full rounded-2xl text-[15px]" disabled={!ready || submit.isPending}>
        {submit.isPending ? <Spinner /> : "ส่งสลิป"}
      </Button>
    </form>
  );
}
