import { useState } from "react";
import { useToast } from "@/components/Toast";
import { Button, Field, FormSection, Input, Spinner, Switch } from "@/components/ui";
import { useMyTodayStudentExits, useRequestStudentExit } from "@/hooks/useStudentPremisesExit";
import type { Student } from "@/lib/database.types";
import { todayIso } from "@/lib/utils";
import { bangkokTime } from "@/routes/TimeTracking";

export const EXIT_STATUS_LABEL = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ" } as const;

/** Student "ขอออกนอกโรงเรียน" (migration 0184): request, then wait for the homeroom teacher's approval before leaving. */
export function StudentExitSection({ student, submittedBy }: { student: Student; submittedBy: string }) {
  const toast = useToast();
  const date = todayIso();
  const { data: requests = [] } = useMyTodayStudentExits(student.id, date);
  const request = useRequestStudentExit();
  const [reason, setReason] = useState("");
  const [exitAt, setExitAt] = useState(() => bangkokTime(new Date().toISOString()));
  const [returnAt, setReturnAt] = useState("");
  const [willReturn, setWillReturn] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const returnBad = willReturn && !!returnAt && returnAt <= exitAt;
  const iso = (hhmm: string) => `${date}T${hhmm}:00+07:00`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!reason.trim() || !exitAt || returnBad) return;
    request.mutate(
      { studentId: student.id, submittedBy, date, reason: reason.trim(), exitTime: iso(exitAt), plannedReturnTime: willReturn && returnAt ? iso(returnAt) : null, noReturn: !willReturn },
      {
        onSuccess: () => {
          toast("ส่งคำขอแล้ว รอครูประจำชั้นอนุมัติก่อนออก");
          setReason("");
          setReturnAt("");
          setWillReturn(false);
          setAttempted(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <p className="px-1 text-xs text-muted-foreground">ต้องรอครูประจำชั้นอนุมัติก่อนออกนอกโรงเรียน</p>
      <FormSection>
        <Field label="เหตุผล" required error={attempted && !reason.trim() ? "กรอกเหตุผล" : undefined}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น พบแพทย์" />
        </Field>
        <Field label="เวลาออก" required error={attempted && !exitAt ? "เลือกเวลาออก" : undefined}>
          <Input type="time" value={exitAt} onChange={(e) => setExitAt(e.target.value)} />
        </Field>
        <div className="flex min-h-10 items-center justify-between gap-4 text-sm leading-5 md:min-h-7">
          <span>ไป-กลับ</span>
          <Switch size="sm" checked={willReturn} onChange={setWillReturn} label="ไป-กลับ" />
        </div>
        {willReturn && (
          <Field label="เวลากลับ" error={attempted && returnBad ? "ต้องหลังเวลาออก" : undefined}>
            <Input type="time" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} />
          </Field>
        )}
      </FormSection>
      <Button type="submit" className="w-full" disabled={request.isPending}>
        {request.isPending ? <Spinner className="h-3 w-3" /> : "ส่งคำขอ"}
      </Button>
      {requests.length > 0 && (
        <FormSection>
          {requests.map((r) => (
            <div key={r.id} className="min-h-[3.25rem] py-1 text-sm leading-5">
              <p className="truncate">{r.reason}</p>
              <p className="text-xs text-muted-foreground">
                ออก {bangkokTime(r.exit_time)}
                {r.no_return ? " · ไม่กลับ" : r.planned_return_time ? ` · คาดว่ากลับ ${bangkokTime(r.planned_return_time)}` : ""}
                {r.return_time ? ` · กลับ ${bangkokTime(r.return_time)}` : ""} · {EXIT_STATUS_LABEL[r.status]}
              </p>
            </div>
          ))}
        </FormSection>
      )}
    </form>
  );
}
