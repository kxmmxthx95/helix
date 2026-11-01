import { useRef, useState } from "react";
import { AlertTriangle, FileUp } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Spinner } from "@/components/ui";
import { useBindCard, useLiveCards } from "@/hooks/useCardTopup";
import { readTable, type CsvIssue } from "@/lib/csv";
import { supabase } from "@/lib/supabase";

const COLUMNS = [
  { key: "student_code", header: "รหัสนักเรียน", required: true },
  { key: "card_uid", header: "เลขบัตร", required: true },
];

export type CardImportRow = { student_id: string; card_uid: string; line: number };

/**
 * Pure and exported (tested): turns CSV rows into bindings, or the reason a row is skipped.
 * An import never silently replaces a card — students who already hold one are skipped,
 * as are repeated student codes / card numbers within the file and cards already in use.
 */
export function resolveCardRows(
  rows: { student_code: string; card_uid: string }[],
  studentIdByCode: Map<string, string>,
  studentsWithCard: Set<string>,
  usedUids: Set<string>,
): { ready: CardImportRow[]; skipped: { line: number; issue: string }[] } {
  const ready: CardImportRow[] = [];
  const skipped: { line: number; issue: string }[] = [];
  const seenStudents = new Set<string>();
  const seenUids = new Set<string>();
  rows.forEach((r, i) => {
    const line = i + 2;
    const id = studentIdByCode.get(r.student_code);
    const bad = !id
      ? `ไม่พบรหัสนักเรียน "${r.student_code}"`
      : studentsWithCard.has(id) || seenStudents.has(id)
        ? "นักเรียนมีบัตรอยู่แล้ว"
        : usedUids.has(r.card_uid) || seenUids.has(r.card_uid)
          ? `เลขบัตร "${r.card_uid}" ถูกใช้แล้ว`
          : null;
    if (bad || !id) return skipped.push({ line, issue: bad ?? "" });
    seenStudents.add(id);
    seenUids.add(r.card_uid);
    ready.push({ student_id: id, card_uid: r.card_uid, line });
  });
  return { ready, skipped };
}

/** Pick file → preview → confirm. Nothing is written before the confirm. */
export function ImportCardsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: liveCards = [] } = useLiveCards();
  const bind = useBindCard();
  const [parsed, setParsed] = useState<{ ready: CardImportRow[]; skipped: { line: number; issue: string }[]; issues: CsvIssue[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<{ bound: number; failed: string[] } | null>(null);

  function reset() {
    setParsed(null);
    setOutcome(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const table = readTable<{ student_code: string; card_uid: string }>(await file.text(), COLUMNS);
    const codes = [...new Set(table.rows.map((r) => r.student_code))];
    const { data } = codes.length
      ? await supabase.from("students").select("id, student_code").in("student_code", codes)
      : { data: [] };
    const { ready, skipped } = resolveCardRows(
      table.rows,
      new Map((data ?? []).map((s) => [s.student_code, s.id])),
      new Set(liveCards.map((c) => c.student_id)),
      new Set(liveCards.map((c) => c.card_uid)),
    );
    setParsed({ ready, skipped, issues: table.issues });
  }

  async function confirm() {
    if (!parsed) return;
    setRunning(true);
    const failed: string[] = [];
    let bound = 0;
    for (const r of parsed.ready) {
      try {
        await bind.mutateAsync({ student_id: r.student_id, card_uid: r.card_uid });
        bound++;
      } catch (e) {
        failed.push(`บรรทัด ${r.line}: ${e instanceof Error ? e.message : "ผูกบัตรไม่สำเร็จ"}`);
      }
    }
    setRunning(false);
    setParsed(null);
    setOutcome({ bound, failed });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="นำเข้าเลขบัตร"
      description="ไฟล์ CSV 2 คอลัมน์ — ตรวจสอบตัวอย่างก่อนยืนยัน"
      footer={
        parsed ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={reset}>
              เลือกไฟล์ใหม่
            </Button>
            <Button className="flex-1" onClick={() => void confirm()} disabled={parsed.ready.length === 0 || running}>
              {running ? <Spinner /> : `ยืนยันผูกบัตร ${parsed.ready.length} ใบ`}
            </Button>
          </div>
        ) : outcome ? (
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            เสร็จสิ้น
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={() => fileInput.current?.click()}>
            <FileUp className="h-3 w-3" />
            เลือกไฟล์ CSV
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e)} className="hidden" />
        {!parsed && !outcome && (
          <Card className="space-y-2">
            <p className="text-sm font-medium">คอลัมน์ที่ต้องมี</p>
            <p data-selectable className="font-mono text-xs text-muted-foreground">
              {COLUMNS.map((c) => c.header).join(",")}
            </p>
            <p className="text-xs text-muted-foreground">นักเรียนที่มีบัตรอยู่แล้วจะถูกข้าม — เปลี่ยนบัตรทำที่แท็บ "บัตรและยอดคงเหลือ"</p>
          </Card>
        )}
        {parsed && (
          <>
            <p className="text-sm">พร้อมผูกบัตร {parsed.ready.length} ใบ</p>
            {[...parsed.issues.map((i) => `บรรทัด ${i.row}: ${i.message}`), ...parsed.skipped.map((s) => `บรรทัด ${s.line}: ${s.issue}`)].length > 0 && (
              <Card className="space-y-1 border-warning/40">
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  ข้ามไป {parsed.issues.length + parsed.skipped.length} แถว
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {[...parsed.issues.map((i) => `บรรทัด ${i.row}: ${i.message}`), ...parsed.skipped.map((s) => `บรรทัด ${s.line}: ${s.issue}`)].slice(0, 8).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
        {outcome && (
          <Card className="space-y-1">
            <p className="text-sm font-medium">ผูกบัตรสำเร็จ {outcome.bound} ใบ</p>
            {outcome.failed.slice(0, 8).map((m) => (
              <p key={m} className="text-xs text-destructive">
                {m}
              </p>
            ))}
          </Card>
        )}
      </div>
    </Sheet>
  );
}
