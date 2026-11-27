import { useEffect, useMemo, useState } from "react";
import { AnswerSheetPrint, type SheetStudent } from "@/components/AnswerSheetPrint";
import { Collapse } from "@/components/Collapse";
import { DetailRow } from "@/components/DetailRow";
import { seatLabel } from "@/components/ExamSeatingCard";
import { CheckmarkCircleIcon } from "@/components/icons";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useExamQuestionsOf } from "@/hooks/useExamBank";
import { useSessionRooms, useSessionSeats } from "@/hooks/useExamSeating";
import { useRooms } from "@/hooks/useSchedule";
import { sheetProblems, sheetRows } from "@/lib/answerSheet";
import type { ExamSession, Subject } from "@/lib/database.types";
import { cn } from "@/lib/utils";

export type SheetRosterStudent = { student_id: string; name: string; code: string; room: string };

/** Room detail: print bubble answer sheets, one per student (with their details and a QR), plus spare blanks. */
export function AnswerSheetCard({
  session,
  roster,
  questionIds,
  subjects,
}: {
  session: ExamSession;
  roster: SheetRosterStudent[];
  /** Question ids of the room in exam order (the numbering of the printed exam). */
  questionIds: string[];
  subjects: Subject[];
}) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [spares, setSpares] = useState("2");
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = everyone
  const { profile } = useAuth();
  const { data: bank = [], isLoading } = useExamQuestionsOf(open || printing ? [...new Set(subjects.map((s) => s.id))] : []);
  const { data: seats = [] } = useSessionSeats(open || printing ? session.id : null);
  const { data: sessionRooms = [] } = useSessionRooms(open || printing ? session.id : null);
  const { data: venues = [] } = useRooms(profile?.department_id ?? null);

  const byId = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const ordered = useMemo(() => questionIds.map((id) => byId.get(id)).filter((q): q is NonNullable<typeof q> => !!q), [questionIds, byId]);
  const rows = useMemo(() => sheetRows(ordered), [ordered]);
  const manualNumbers = ordered.flatMap((q, i) => (q.question_type === "short_answer" ? [i + 1] : []));
  const loaded = !isLoading && ordered.length === questionIds.length;
  const problems = loaded ? sheetProblems(rows) : [];

  const seatOf = useMemo(() => {
    const venueOfRoom = new Map(sessionRooms.map((r) => [r.id, venues.find((v) => v.id === r.room_id)?.name ?? null]));
    return new Map(seats.map((x) => [x.student_id, `${venueOfRoom.get(x.session_room_id) ? `${venueOfRoom.get(x.session_room_id)} · ` : ""}${seatLabel(x.seat_row, x.seat_col)}`]));
  }, [seats, sessionRooms, venues]);

  const chosen = picked ? roster.filter((r) => picked.has(r.student_id)) : roster;
  const spareCount = Math.max(0, Math.min(20, Number(spares) || 0));
  const sheets: SheetStudent[] = [
    ...chosen.map((r) => ({ id: r.student_id, name: r.name, code: r.code, classroom: r.room === "—" ? "" : r.room, seat: seatOf.get(r.student_id) ?? null })),
    ...Array.from({ length: spareCount }, () => ({ id: null, name: "", code: "", classroom: "", seat: null })),
  ];
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev ?? roster.map((r) => r.student_id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  useEffect(() => setPicked(null), [roster.length]);

  const summary = problems.length > 0 ? problems[0] : loaded ? `${roster.length} คน · ${rows.length} ข้อที่กาฝนได้` : `${roster.length} คน`;
  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
      <DetailRow icon={CheckmarkCircleIcon} tone="check" title="พิมพ์กระดาษคำตอบ" open={open} onClick={() => setOpen((v) => !v)} summary={summary} alert={problems.length > 0} />
      <Collapse open={open}>
        <div className="space-y-3 border-t border-border bg-muted/40 p-3">
          {problems.map((p) => (
            <p key={p} role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{p}</p>
          ))}
          {loaded && problems.length === 0 && (
            <p className="text-xs text-muted-foreground">
              พิมพ์ใบละ 1 คน มีชื่อ รหัส ชั้น/ห้อง ที่นั่ง และ QR ให้นักเรียนฝนหรือกาคำตอบ {rows.length} ข้อ
              {manualNumbers.length > 0 && <> · ข้อเติมคำตอบ (ครูตรวจเอง) ข้อที่ {manualNumbers.join(", ")}</>}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="sheet-spares" className="font-medium">ใบเปล่าสำรอง</label>
            <Input id="sheet-spares" type="number" min={0} max={20} value={spares} onChange={(e) => setSpares(e.target.value)} className="!h-8 w-16" />
            <span className="text-muted-foreground">ใบ (สำหรับนักเรียนที่เพิ่มเข้ามาวันสอบ)</span>
          </div>
          {roster.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">นักเรียน {chosen.length}/{roster.length} คน</span>
                <span className="flex gap-3">
                  <button type="button" className="text-accent" onClick={() => setPicked(null)}>เลือกทั้งหมด</button>
                  <button type="button" className="text-accent" onClick={() => setPicked(new Set())}>ล้าง</button>
                </span>
              </div>
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
                {roster.map((r) => {
                  const on = !picked || picked.has(r.student_id);
                  return (
                    <li key={r.student_id}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-xs">
                        <input type="checkbox" checked={on} onChange={() => toggle(r.student_id)} className="size-4 accent-[hsl(var(--primary))]" />
                        <span className={cn("min-w-0 flex-1 truncate", !on && "text-muted-foreground")}>{r.name}</span>
                        <span className="tabular-nums text-muted-foreground">{r.code}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <Button type="button" className="w-full" disabled={!loaded || problems.length > 0 || sheets.length === 0} onClick={() => setPrinting(true)}>
            พิมพ์กระดาษคำตอบ {sheets.length} ใบ
          </Button>
        </div>
      </Collapse>
      {printing && (
        <AnswerSheetPrint session={session} rows={rows} manualNumbers={manualNumbers} students={sheets} subjectsLabel={subjects.map((s) => `${s.code} ${s.name_th}`).join(", ")} onDone={() => setPrinting(false)} />
      )}
    </div>
  );
}
