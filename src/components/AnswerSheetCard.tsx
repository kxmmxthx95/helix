import { useEffect, useMemo, useState } from "react";
import { AnswerSheetPrint, type SheetStudent } from "@/components/AnswerSheetPrint";
import { Collapse } from "@/components/Collapse";
import { DetailRow } from "@/components/DetailRow";
import { seatLabel } from "@/components/ExamSeatingCard";
import { CheckmarkCircleIcon, Plus } from "@/components/icons";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useAnswerSheetData } from "@/hooks/useAnswerSheetData";
import { useSessionRooms, useSessionSeats } from "@/hooks/useExamSeating";
import { useRooms } from "@/hooks/useSchedule";
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
  const subjectIds = useMemo(() => subjects.map((x) => x.id), [subjects]);
  const { rows, manualNumbers, loaded, problems } = useAnswerSheetData(questionIds, subjectIds, open || printing);
  const { data: seats = [] } = useSessionSeats(open || printing ? session.id : null);
  const { data: sessionRooms = [] } = useSessionRooms(open || printing ? session.id : null);
  const { data: venues = [] } = useRooms(profile?.department_id ?? null);

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
        <div className="space-y-4 border-t border-border bg-card p-3.5">
          {problems.map((p) => (
            <p key={p} role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{p}</p>
          ))}
          {loaded && problems.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">ใบละ 1 คน มีชื่อ รหัส ชั้น/ห้อง ที่นั่ง และ QR ให้นักเรียนฝนหรือกาคำตอบ</p>
              <dl className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl bg-muted/60">
                <div className="px-3.5 py-2.5">
                  <dd className="text-lg font-semibold leading-6 tabular-nums">{rows.length}</dd>
                  <dt className="text-xs text-muted-foreground">ข้อที่กาฝนได้</dt>
                </div>
                <div className="px-3.5 py-2.5">
                  <dd className="text-lg font-semibold leading-6 tabular-nums">{manualNumbers.length}</dd>
                  <dt className="text-xs text-muted-foreground">
                    {manualNumbers.length > 0 ? `ข้อเติมคำตอบ (ข้อ ${manualNumbers.join(", ")})` : "ข้อเติมคำตอบ"}
                  </dt>
                </div>
              </dl>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor="sheet-spares" className="text-sm font-medium">ใบเปล่าสำรอง</label>
              <p className="text-xs text-muted-foreground">สำหรับนักเรียนที่เพิ่มเข้ามาวันสอบ</p>
            </div>
            <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-border">
              <button type="button" aria-label="ลดใบสำรอง" disabled={spareCount <= 0} onClick={() => setSpares(String(spareCount - 1))} className="tappable flex h-9 w-9 items-center justify-center text-lg text-muted-foreground hover:bg-muted disabled:opacity-40">−</button>
              <Input id="sheet-spares" type="number" inputMode="numeric" min={0} max={20} value={spares} onChange={(e) => setSpares(e.target.value)} className="!h-9 w-12 rounded-none !border-y-0 text-center tabular-nums" />
              <button type="button" aria-label="เพิ่มใบสำรอง" disabled={spareCount >= 20} onClick={() => setSpares(String(spareCount + 1))} className="tappable flex h-9 w-9 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          {roster.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">นักเรียน <span className="tabular-nums text-muted-foreground">{chosen.length}/{roster.length} คน</span></span>
                <span className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" className="ui-control-compact h-7 text-accent" disabled={!picked} onClick={() => setPicked(null)}>เลือกทั้งหมด</Button>
                  <Button type="button" size="sm" variant="ghost" className="ui-control-compact h-7 text-accent" disabled={chosen.length === 0} onClick={() => setPicked(new Set())}>ล้าง</Button>
                </span>
              </div>
              <ul className="scrollbar-hidden max-h-60 divide-y divide-border overflow-y-auto rounded-xl bg-muted/40">
                {roster.map((r) => {
                  const on = !picked || picked.has(r.student_id);
                  return (
                    <li key={r.student_id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                        <input type="checkbox" checked={on} onChange={() => toggle(r.student_id)} className="size-4 shrink-0 accent-[hsl(var(--primary))]" />
                        <span className={cn("min-w-0 flex-1 truncate", !on && "text-muted-foreground")}>{r.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{r.code}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <Button type="button" className="h-11 w-full flex-col gap-0 leading-tight" disabled={!loaded || problems.length > 0 || sheets.length === 0} onClick={() => setPrinting(true)}>
            <span>พิมพ์กระดาษคำตอบ {sheets.length} ใบ</span>
            {spareCount > 0 && <span className="text-[11px] font-normal opacity-80">{chosen.length} คน + ใบสำรอง {spareCount}</span>}
          </Button>
        </div>
      </Collapse>
      {printing && (
        <AnswerSheetPrint session={session} rows={rows} manualNumbers={manualNumbers} students={sheets} subjectsLabel={subjects.map((s) => `${s.code} ${s.name_th}`).join(", ")} onDone={() => setPrinting(false)} />
      )}
    </div>
  );
}
