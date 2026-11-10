import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Field, FormSection, Input, Spinner } from "@/components/ui";
import { useConfirmReturn, useRequestPremisesExit, useTodayPremisesExits } from "@/hooks/usePremisesExit";
import { bangkokTime } from "@/routes/TimeTracking";

const STATUS_LABEL = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ" } as const;

/** Staff "ขอออกนอกโรงเรียน" form drawer (same look as NewLeaveSheet) + today's requests with "กลับมาแล้ว". */
export function PremisesExitSheet({ profileId, date, open, onOpenChange }: { profileId: string; date: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const toast = useToast();
  const { data: requests = [] } = useTodayPremisesExits(profileId, date);
  const request = useRequestPremisesExit();
  const confirmReturn = useConfirmReturn();
  const [reason, setReason] = useState("");
  const [exitAt, setExitAt] = useState("");
  const [returnAt, setReturnAt] = useState("");
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (open) setExitAt(bangkokTime(new Date().toISOString()));
  }, [open]);

  const returnBad = !!returnAt && returnAt <= exitAt;
  const iso = (hhmm: string) => `${date}T${hhmm}:00+07:00`;

  const reset = () => {
    setReason("");
    setReturnAt("");
    setAttempted(false);
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!reason.trim() || !exitAt || returnBad) return;
    request.mutate(
      { profileId, date, reason: reason.trim(), exitTime: iso(exitAt), plannedReturnTime: returnAt ? iso(returnAt) : null },
      {
        onSuccess: () => {
          toast("ส่งคำขอออกนอกโรงเรียนสำเร็จ");
          reset();
          onOpenChange(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title="ขอออกนอกโรงเรียน"
      bottomOnPhone
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button type="submit" form="request-premises-exit" className="flex-1" disabled={request.isPending}>
            {request.isPending ? <Spinner className="h-3 w-3" /> : "ส่งคำขอ"}
          </Button>
        </div>
      }
    >
      <form id="request-premises-exit" className="space-y-4" onSubmit={submit} noValidate>
        <FormSection>
          <Field label="เหตุผล" required error={attempted && !reason.trim() ? "กรอกเหตุผล" : undefined}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ไปธนาคาร" />
          </Field>
          <Field label="เวลาออก" required error={attempted && !exitAt ? "เลือกเวลาออก" : undefined}>
            <Input type="time" value={exitAt} onChange={(e) => setExitAt(e.target.value)} />
          </Field>
          <Field label="เวลากลับ" error={attempted && returnBad ? "ต้องหลังเวลาออก" : undefined}>
            <Input type="time" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} />
          </Field>
        </FormSection>
        {requests.length > 0 && (
          <FormSection>
            {requests.map((r) => (
              <div key={r.id} className="flex min-h-[3.25rem] items-center justify-between gap-3 py-1 text-sm leading-5">
                <div className="min-w-0">
                  <p className="truncate">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    ออก {bangkokTime(r.exit_time)}
                    {r.planned_return_time ? ` · คาดว่ากลับ ${bangkokTime(r.planned_return_time)}` : ""}
                    {r.return_time ? ` · กลับ ${bangkokTime(r.return_time)}` : ""} · {STATUS_LABEL[r.status]}
                  </p>
                </div>
                {!r.return_time && (
                  <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => confirmReturn.mutate(r.id)} disabled={confirmReturn.isPending}>
                    กลับมาแล้ว
                  </Button>
                )}
              </div>
            ))}
          </FormSection>
        )}
      </form>
    </Sheet>
  );
}
