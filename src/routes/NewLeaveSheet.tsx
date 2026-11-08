import { useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Field, Input, Select, Spinner } from "@/components/ui";
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

  const selectedType = types.find((t) => t.id === leaveTypeId);
  const days = startDate && endDate ? dayCount(startDate, endDate) : 0;
  const needsAttachment =
    !!selectedType?.requires_attachment_after_days &&
    days > selectedType.requires_attachment_after_days &&
    !file;

  function reset() {
    setLeaveTypeId("");
    setStartDate("");
    setEndDate("");
    setReason("");
    setFile(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!leaveTypeId || !startDate || !endDate || !reason.trim()) return;
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
            disabled={!leaveTypeId || !startDate || !endDate || !reason.trim() || request.isPending}
          >
            {request.isPending ? <Spinner className="h-3 w-3" /> : "ส่งคำขอ"}
          </Button>
        </div>
      }
    >
      <form id="request-leave" className="space-y-4" onSubmit={submit}>
        <Field label="ประเภทการลา">
          <Select
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            required
            placeholder="เลือกประเภท"
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="วันเริ่ม">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label="วันสิ้นสุด">
            <Input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </Field>
        </div>
        {days > 0 && <p className="text-xs text-muted-foreground">รวม {days} วัน</p>}
        <Field label="เหตุผล">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="เช่น ลาป่วย มีไข้"
          />
        </Field>
        <Field
          label={
            selectedType?.requires_attachment_after_days
              ? `ไฟล์แนบ (บังคับถ้าลาเกิน ${selectedType.requires_attachment_after_days} วัน)`
              : "ไฟล์แนบ (ถ้ามี)"
          }
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            {file ? file.name : "เลือกไฟล์"}
          </Button>
        </Field>
        {needsAttachment && (
          <p className="text-xs text-destructive">
            ลาต่อเนื่องเกิน {selectedType!.requires_attachment_after_days} วัน ต้องแนบเอกสารประกอบ
          </p>
        )}
      </form>
    </Sheet>
  );
}
