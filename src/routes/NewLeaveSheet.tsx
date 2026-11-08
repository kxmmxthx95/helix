import { useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Field, FormSection, Input, Select, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useLeaveTypes, useRequestLeave } from "@/hooks/useLeave";

export function dayCount(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(ms / 86400000) + 1);
}

/** Staff "ลาใหม่" form drawer. Shared by the Leave page and the teacher home leave card. */
export function NewLeaveSheet({ profileId, open, onOpenChange }: { profileId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const toast = useToast();
  const { data: types = [] } = useLeaveTypes();
  const request = useRequestLeave();

  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attempted, setAttempted] = useState(false);

  const selectedType = types.find((t) => t.id === leaveTypeId);
  const days = startDate && endDate ? dayCount(startDate, endDate) : 0;
  const needsAttachment =
    !!selectedType?.requires_attachment_after_days &&
    days > selectedType.requires_attachment_after_days &&
    !file;

  const err = (bad: boolean, msg: string) => (attempted && bad ? msg : undefined);

  function reset() {
    setLeaveTypeId("");
    setStartDate("");
    setEndDate("");
    setReason("");
    setFile(null);
    setAttempted(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = [!leaveTypeId, !startDate, !endDate || (!!startDate && endDate < startDate), !reason.trim(), needsAttachment].filter(Boolean).length;
    if (invalid) {
      setAttempted(true);
      toast(`กรอกข้อมูลให้ถูกต้อง (${invalid} ช่อง)`, "error");
      return;
    }
    request.mutate(
      { profileId, leaveTypeId, startDate, endDate, reason: reason.trim(), file },
      {
        onSuccess: () => {
          toast("ส่งคำขอลาสำเร็จ");
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
      title="ลาใหม่"
      bottomOnPhone
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            type="submit"
            form="request-leave"
            className="flex-1"
            disabled={request.isPending}
          >
            {request.isPending ? <Spinner className="h-3 w-3" /> : "ส่งคำขอ"}
          </Button>
        </div>
      }
    >
      <form id="request-leave" className="space-y-4" onSubmit={submit} noValidate>
        <FormSection>
          <Field label="ประเภทการลา" required error={err(!leaveTypeId, "เลือกประเภทการลา")}>
            <Select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} placeholder="เลือกประเภท">
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="วันเริ่ม" required error={err(!startDate, "เลือกวันเริ่ม")}>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="วันสิ้นสุด" required error={err(!endDate, "เลือกวันสิ้นสุด") ?? err(!!startDate && !!endDate && endDate < startDate, "ต้องไม่ก่อนวันเริ่ม")}>
            <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <div className="flex min-h-[3.25rem] items-center justify-between gap-4 text-sm leading-5">
            <span>รวม</span>
            <span className="text-muted-foreground">{days > 0 ? `${days} วัน` : "—"}</span>
          </div>
        </FormSection>
        <FormSection>
          <Field label="เหตุผล" required error={err(!reason.trim(), "กรอกเหตุผล")}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ลาป่วย มีไข้" />
          </Field>
          <div className="flex min-h-[3.25rem] items-center justify-between gap-4 text-sm leading-5">
            <span>
              ไฟล์แนบ
              {selectedType?.requires_attachment_after_days ? <span className="text-destructive" aria-hidden> *</span> : null}
            </span>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileRef.current?.click()} className="min-w-0 truncate text-muted-foreground hover:text-foreground">
              {file ? file.name : "เลือกไฟล์"}
            </button>
          </div>
        </FormSection>
        {selectedType?.requires_attachment_after_days ? (
          <p className={cn("px-1 text-xs", attempted && needsAttachment ? "text-destructive" : "text-muted-foreground")}>
            ลาต่อเนื่องเกิน {selectedType.requires_attachment_after_days} วัน ต้องแนบเอกสารประกอบ
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
