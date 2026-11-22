import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Collapse } from "@/components/Collapse";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AlertTriangle, ChevronForward, PencilIcon, Plus, TimetableIcon, TrashIcon } from "@/components/icons";
import { IconTile } from "@/components/IconTile";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Field, FormSection, Input, Select } from "@/components/ui";
import {
  useAddSessionRoom,
  useAddSpecialSeat,
  useDeleteSeatTemplate,
  useDeleteSpecialSeat,
  useRemoveSessionRoom,
  useRoomsConflictSeats,
  useSaveSeatTemplate,
  useSeatTemplates,
  useSessionRooms,
  useSessionSeats,
  useSetSpecialSeat,
  useSpecialSeats,
  useSetRoomSeating,
  useSetSessionSeats,
} from "@/hooks/useExamSeating";
import type { ExamSeatTemplate, ExamSession, ExamSessionRoom, ExamSessionSpecialSeat } from "@/lib/database.types";
import { ICON, ICON_BTN } from "@/lib/iconButton";
import { isDeptHead, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

type SeatStudent = { student_id: string; name: string; code: string; avatar?: string | null };
/** `room` is the exam_session_rooms row the seat is in. */
type Seat = { student_id: string; room: string; seat_row: number; seat_col: number };
/** `special`: id of a special seat that has a student in it. */
type Picked = { kind: "seat"; room: string; row: number; col: number } | { kind: "student"; id: string } | { kind: "special"; id: string } | null;
/** A seat another overlapping session holds in the same physical room. */
type TakenSeat = { title: string; student_name: string; student_code: string; seat_row: number; seat_col: number; seat_rows: number; seat_cols: number };

const PREFIX_SHORT: Record<string, string> = { เด็กชาย: "ด.ช.", เด็กหญิง: "ด.ญ.", นางสาว: "น.ส." };
/** Seat cells are narrow: "เด็กหญิงสมใจ ใจดี" → "ด.ญ.สมใจ ใจดี" (นาย/นาง stay as they are). */
/** Seat badge tint per column, cycling, so columns read apart at a glance. */
const COL_TONES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];
/** Seat label: column as letters (1→A … 26→Z, 27→AA), then row number, e.g. "C2". */
const seatLabel = (row: number, col: number) => {
  let letters = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return `${letters}${row}`;
};
const shortName = (name: string) => name.replace(/^(เด็กชาย|เด็กหญิง|นางสาว)/, (p) => PREFIX_SHORT[p]!);

const shuffled = <T,>(items: T[]) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/**
 * ผังห้องสอบ: one or more rooms, each with a department template; fill automatically (per room or all rooms) and fix by tapping seats.
 * A room can be added when the seats of all rooms together are too few. Teachers only.
 */
export function ExamSeatingCard({
  session,
  students,
  roomPicker,
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
  session: ExamSession;
  students: SeatStudent[];
  /** Physical-room picker of one room row (`usedRoomIds`: physical rooms already used by the session). */
  roomPicker?: (room: ExamSessionRoom, usedRoomIds: string[]) => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [managing, setManaging] = useState(false);
  const [roomTab, setRoomTab] = useState(0);
  const [clearing, setClearing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ExamSessionRoom | null>(null);
  const [removingSpecial, setRemovingSpecial] = useState<ExamSessionSpecialSeat | null>(null);
  const [picked, setPicked] = useState<Picked>(null);
  const toast = useToast();
  const { data: templates = [] } = useSeatTemplates();
  const { data: rooms = [] } = useSessionRooms(session.id);
  const { data: seats = [] } = useSessionSeats(session.id);
  const applyTemplate = useSetRoomSeating();
  const setSeats = useSetSessionSeats();
  const addRoom = useAddSessionRoom();
  const removeRoom = useRemoveSessionRoom();
  const takenByRoom = useRoomsConflictSeats(session, rooms);
  const { data: specialSeats = [] } = useSpecialSeats(session.id);
  const addSpecial = useAddSpecialSeat();
  const setSpecial = useSetSpecialSeat();
  const deleteSpecial = useDeleteSpecialSeat();

  const byId = new Map(students.map((s) => [s.student_id, s]));
  const roomRowIds = new Set(rooms.map((r) => r.id));
  // A seat held by someone who is no longer on the roster is ignored and dropped on the next change.
  const seated: Seat[] = seats
    .filter((x) => byId.has(x.student_id) && roomRowIds.has(x.session_room_id))
    .map(({ student_id, session_room_id, seat_row, seat_col }) => ({ student_id, room: session_room_id, seat_row, seat_col }));
  const at = new Map(seated.map((x) => [`${x.room}:${x.seat_row}:${x.seat_col}`, x]));
  const seatedIds = new Set(seated.map((x) => x.student_id));
  // Special seats (outside the grid): a student in one counts as seated but is left alone by the auto-arrange buttons.
  const specials = specialSeats.filter((x) => roomRowIds.has(x.session_room_id));
  const specialIds = new Set(specials.flatMap((x) => (x.student_id && byId.has(x.student_id) ? [x.student_id] : [])));
  const placed = seated.length + specialIds.size;
  const unseated = students.filter((s) => !seatedIds.has(s.student_id) && !specialIds.has(s.student_id));

  // Seats other sessions hold in a room, keyed "row:col" (earliest session first, so it wins a shared cell); only cells inside this room's grid.
  const heldOf = (r: ExamSessionRoom) => {
    const m = new Map<string, TakenSeat>();
    for (const t of takenByRoom.get(r.id) ?? []) if (t.seat_row <= (r.seat_rows ?? 0) && t.seat_col <= (r.seat_cols ?? 0) && !m.has(`${t.seat_row}:${t.seat_col}`)) m.set(`${t.seat_row}:${t.seat_col}`, t);
    return m;
  };
  /** Seats of a room in reading order that no other session holds. */
  const freeCells = (r: ExamSessionRoom) => {
    const rows = r.seat_rows ?? 0;
    const cols = r.seat_cols ?? 0;
    const held = heldOf(r);
    return Array.from({ length: rows * cols }, (_, i) => ({ room: r.id, seat_row: Math.floor(i / cols) + 1, seat_col: (i % cols) + 1 })).filter((c) => !held.has(`${c.seat_row}:${c.seat_col}`));
  };
  const tabIdx = Math.min(roomTab, Math.max(0, rooms.length - 1));
  const anyGrid = rooms.some((r) => r.seat_rows != null);
  const missing = Math.max(0, students.length - rooms.reduce((n, r) => n + freeCells(r).length, 0));
  const busy = setSeats.isPending || applyTemplate.isPending || addRoom.isPending || removeRoom.isPending || addSpecial.isPending || setSpecial.isPending || deleteSpecial.isPending;
  // Seating needs the exam window first; the room pickers stay usable so rooms can be set beforehand.
  const noTime = !(session.opens_at && session.closes_at);
  const locked = busy || noTime;

  const write = (next: Seat[]) =>
    setSeats.mutate(
      { sessionId: session.id, seats: next },
      { onError: (e) => toast((e as { message?: string }).message?.includes("ถูกใช้ในรอบสอบอื่น") ? "ที่นั่งนี้ถูกใช้ในรอบสอบอื่นที่เวลาทับกัน" : "บันทึกผังไม่สำเร็จ", "error") },
    );
  // One room: clear it, then fill it row by row from the students without a seat plus its own students. Skips seats another session holds.
  const fillRoom = (r: ExamSessionRoom, order: (list: SeatStudent[]) => SeatStudent[]) => {
    const mine = new Set(seated.filter((x) => x.room === r.id).map((x) => x.student_id));
    const free = freeCells(r);
    const pool = order(students.filter((s) => !specialIds.has(s.student_id) && (!seatedIds.has(s.student_id) || mine.has(s.student_id))));
    write([...seated.filter((x) => x.room !== r.id), ...pool.slice(0, free.length).map((s, i) => ({ student_id: s.student_id, ...free[i]! }))]);
  };
  // All rooms: everyone in order, room 1 first, spilling into the next room.
  const fillAll = (order: SeatStudent[]) => {
    const cells = rooms.flatMap(freeCells);
    write(order.filter((s) => !specialIds.has(s.student_id)).slice(0, cells.length).map((s, i) => ({ student_id: s.student_id, ...cells[i]! })));
  };

  function tapSeat(room: string, row: number, col: number) {
    const here = at.get(`${room}:${row}:${col}`);
    const r = rooms.find((x) => x.id === room);
    if (!here && r && heldOf(r).has(`${row}:${col}`)) return;
    if (!picked) {
      if (here) setPicked({ kind: "seat", room, row, col });
      return;
    }
    if (picked.kind === "student" || picked.kind === "special") {
      // Place the unseated student (or the one from a special seat; the database frees that seat); whoever was there becomes unseated.
      const sid = picked.kind === "student" ? picked.id : specials.find((x) => x.id === picked.id)?.student_id;
      if (sid) write([...seated.filter((x) => !(x.room === room && x.seat_row === row && x.seat_col === col)), { student_id: sid, room, seat_row: row, seat_col: col }]);
    } else if (picked.room !== room || picked.row !== row || picked.col !== col) {
      const from = at.get(`${picked.room}:${picked.row}:${picked.col}`);
      if (from) {
        write(
          seated.map((x) => {
            if (x.student_id === from.student_id) return { ...x, room, seat_row: row, seat_col: col };
            if (here && x.student_id === here.student_id) return { ...x, room: picked.room, seat_row: picked.row, seat_col: picked.col };
            return x;
          }),
        );
      }
    }
    setPicked(null);
  }

  // Tap a special seat: pick its student, or put the picked student there (a displaced occupant becomes unseated).
  function tapSpecial(x: ExamSessionSpecialSeat) {
    if (!picked) {
      if (x.student_id && byId.has(x.student_id)) setPicked({ kind: "special", id: x.id });
      return;
    }
    const sid = picked.kind === "student" ? picked.id : picked.kind === "special" ? specials.find((y) => y.id === picked.id)?.student_id : at.get(`${picked.room}:${picked.row}:${picked.col}`)?.student_id;
    if (sid && !(picked.kind === "special" && picked.id === x.id)) {
      setSpecial.mutate({ sessionId: session.id, seatId: x.id, studentId: sid }, { onError: () => toast("บันทึกผังไม่สำเร็จ", "error") });
    }
    setPicked(null);
  }

  const pickedStudent = picked
    ? picked.kind === "student"
      ? byId.get(picked.id)
      : picked.kind === "special"
        ? byId.get(specials.find((x) => x.id === picked.id)?.student_id ?? "")
        : byId.get(at.get(`${picked.room}:${picked.row}:${picked.col}`)?.student_id ?? "")
    : undefined;
  const usedRoomIds = rooms.flatMap((r) => (r.room_id ? [r.room_id] : []));
  const first = rooms[0];

  const renderRoom = (r: ExamSessionRoom, index: number) => {
    const rows = r.seat_rows ?? 0;
    const cols = r.seat_cols ?? 0;
    const held = heldOf(r);
    const gridDiffers = (takenByRoom.get(r.id) ?? []).some((t) => t.seat_rows !== rows || t.seat_cols !== cols);
    const hasSeats = seated.some((x) => x.room === r.id);
    const roomSpecials = specials.filter((x) => x.session_room_id === r.id);
    return (
      <section key={r.id} className={cn("space-y-3", rooms.length > 1 && "rounded-lg border border-border p-3")}>
        {rooms.length > 1 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">ห้องที่ {index + 1}</span>
            {r.position > 1 && (
              <Button size="icon" variant="outline" className={ICON_BTN} aria-label="ลบห้องนี้" disabled={busy} onClick={() => setRemoving(r)}>
                <TrashIcon className={ICON} />
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {roomPicker?.(r, usedRoomIds)}
          <Select
            aria-label="Template ผังที่นั่ง"
            placeholder="เลือก template ผังที่นั่ง"
            className="ui-control-compact h-8 min-w-0 flex-1 px-2.5 pr-7 text-[13px] sm:w-64 sm:flex-none"
            value={r.template_id ?? ""}
            disabled={locked}
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) applyTemplate.mutate({ sessionId: session.id, roomRowId: r.id, template: t }, { onError: () => toast("เลือก template ไม่สำเร็จ", "error") });
            }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.seat_cols}×{t.seat_rows})
              </option>
            ))}
          </Select>
          <Button size="sm" variant="outline" className="ui-control-compact h-8" onClick={() => setManaging(true)}>
            จัดการ template
          </Button>
        </div>

        {r.seat_rows == null ? (
          <p className="text-xs text-muted-foreground">{templates.length > 0 ? "เลือก template เพื่อเริ่มจัดผังที่นั่ง" : "ยังไม่มี template สร้างจาก \"จัดการ template\" ก่อน"}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="ui-control-compact h-8" disabled={locked || students.length === 0} onClick={() => fillRoom(r, (l) => l)}>
                เรียงตามลำดับ
              </Button>
              <Button size="sm" variant="outline" className="ui-control-compact h-8" disabled={locked || students.length === 0} onClick={() => fillRoom(r, shuffled)}>
                สุ่ม
              </Button>
              <Button size="sm" variant="outline" className="ui-control-compact h-8" disabled={locked || !hasSeats} onClick={() => setClearing(r.id)}>
                ล้างผัง
              </Button>
            </div>

            <div className="-mx-1 overflow-x-auto px-1 py-1">
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(8rem, 1fr))` }}>
                {Array.from({ length: rows * cols }, (_, i) => {
                  const row = Math.floor(i / cols) + 1;
                  const col = (i % cols) + 1;
                  const x = at.get(`${r.id}:${row}:${col}`);
                  const st = x ? byId.get(x.student_id) : undefined;
                  const isPicked = picked?.kind === "seat" && picked.room === r.id && picked.row === row && picked.col === col;
                  const other = held.get(`${row}:${col}`);
                  return (
                    <button
                      key={`${row}:${col}`}
                      type="button"
                      disabled={locked || (!!other && !x)}
                      aria-label={
                        other && !x
                          ? `ที่นั่ง ${seatLabel(row, col)} ถูกจองโดยรอบอื่น ${other.student_name}`
                          : st
                            ? `ที่นั่ง ${seatLabel(row, col)} ${st.name}${other ? " ชนกับรอบอื่น" : ""}`
                            : `ที่นั่ง ${seatLabel(row, col)} ว่าง`
                      }
                      onClick={() => tapSeat(r.id, row, col)}
                      className={cn(
                        "relative flex h-14 min-w-0 items-center gap-2 rounded-lg border px-2 text-left text-[11px] leading-tight",
                        other && !x ? "border-border bg-muted text-muted-foreground opacity-70" : st ? "border-border bg-card" : "border-dashed border-border text-muted-foreground",
                        other && x && "border-destructive ring-1 ring-destructive",
                        isPicked && "ring-2 ring-primary",
                      )}
                    >
                      {other && !x ? (
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="line-clamp-2 break-words font-medium">{shortName(other.student_name)}</span>
                          <span className="tabular-nums">{other.student_code}</span>
                        </span>
                      ) : st ? (
                        <>
                          <Avatar name={st.name} src={st.avatar ?? null} className="h-8 w-8 shrink-0 text-[10px] ring-2 ring-border ring-offset-1 ring-offset-card" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="line-clamp-2 break-words font-medium text-foreground">{shortName(st.name)}</span>
                            <span className="tabular-nums text-muted-foreground">{st.code}</span>
                          </span>
                          <span className={cn("absolute right-1 top-1 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums", COL_TONES[(col - 1) % COL_TONES.length])}>{seatLabel(row, col)}</span>
                        </>
                      ) : (
                        <span className="tabular-nums">
                          {seatLabel(row, col)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">ที่นั่งพิเศษ</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ui-control-compact h-7"
                  disabled={locked || roomSpecials.length >= 10}
                  onClick={() =>
                    addSpecial.mutate(
                      { sessionId: session.id, roomRowId: r.id },
                      { onError: (e) => toast((e as { message?: string }).message?.includes("ที่นั่งพิเศษ") ? (e as { message: string }).message : "เพิ่มที่นั่งพิเศษไม่สำเร็จ", "error") },
                    )
                  }
                >
                  <Plus className="h-3 w-3" /> เพิ่มที่นั่งพิเศษ
                </Button>
              </div>
              {roomSpecials.length > 0 && (
                <div className="-mx-1 overflow-x-auto px-1 py-1">
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(cols, 1)}, minmax(8rem, 1fr))` }}>
                    {roomSpecials.map((x) => {
                      const st = x.student_id ? byId.get(x.student_id) : undefined;
                      const isPicked = picked?.kind === "special" && picked.id === x.id;
                      return (
                        <div key={x.id} className="relative">
                          <button
                            type="button"
                            disabled={locked}
                            aria-label={st ? `ที่นั่งพิเศษ ${x.special_no} ${st.name}` : `ที่นั่งพิเศษ ${x.special_no} ว่าง`}
                            onClick={() => tapSpecial(x)}
                            className={cn(
                              "flex h-14 w-full min-w-0 items-center gap-2 rounded-lg border px-2 text-left text-[11px] leading-tight",
                              st ? "border-border bg-card" : "border-dashed border-border text-muted-foreground",
                              isPicked && "ring-2 ring-primary",
                            )}
                          >
                            {st ? (
                              <>
                                <Avatar name={st.name} src={st.avatar ?? null} className="h-8 w-8 shrink-0 text-[10px] ring-2 ring-border ring-offset-1 ring-offset-card" />
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span className="line-clamp-2 break-words font-medium text-foreground">{shortName(st.name)}</span>
                                  <span className="tabular-nums text-muted-foreground">{st.code}</span>
                                </span>
                              </>
                            ) : (
                              <span className="tabular-nums">พิเศษ {x.special_no}</span>
                            )}
                          </button>
                          {st && <span className="absolute right-1 top-1 rounded-full bg-orange-500/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-orange-700 dark:text-orange-300">พิเศษ {x.special_no}</span>}
                          <button
                            type="button"
                            aria-label={`ลบที่นั่งพิเศษ ${x.special_no}`}
                            disabled={locked}
                            onClick={() => setRemovingSpecial(x)}
                            className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                          >
                            <TrashIcon className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {held.size > 0 && (
              <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                ช่องสีเทาถูกจองโดยรอบอื่นในห้องเดียวกันที่เวลาทับกัน: {[...new Set([...held.values()].map((t) => t.title))].join(", ")}
              </p>
            )}
            {gridDiffers && (
              <p role="alert" className="rounded-xl bg-[hsl(var(--warning)/0.12)] px-3 py-2 text-xs text-warning">
                ผังขนาดไม่ตรงกับอีกรอบในห้องเดียวกัน ที่นั่งอาจไม่ตรงกับห้องจริง
              </p>
            )}
          </>
        )}
      </section>
    );
  };

  return (
    <div className="shrink-0 overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-offset-[-2px] focus-visible:ring-inset"
      >
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <IconTile tone="bg-gradient-to-b from-neutral-400 to-neutral-500 text-white shadow-sm ring-1 ring-inset ring-white/25">
            <TimetableIcon className="h-4 w-4" />
          </IconTile>
          ผังห้องสอบ
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-3 text-foreground">
          {anyGrid ? (
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", students.length > 0 && placed >= students.length ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
              จัดแล้ว {placed}/{students.length} · {rooms.length > 1 ? `${rooms.length} ห้อง` : `ผัง ${first?.seat_cols}×${first?.seat_rows}`}
            </span>
          ) : (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">ยังไม่ได้เลือก template</span>
          )}
          {!anyGrid && <span className="flex shrink-0 text-destructive" role="img" aria-label="ยังไม่ได้ตั้งค่า"><AlertTriangle className="h-4 w-4" /></span>}
        </span>
        <ChevronForward className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      <Collapse open={open}>
        <div className="space-y-3 border-t border-border bg-card p-3">
          {noTime && (
            <p role="alert" className="rounded-xl bg-[hsl(var(--warning)/0.12)] px-3 py-2 text-xs text-warning">
              ตั้งเวลาสอบก่อน จึงจะจัดผังห้องสอบได้
            </p>
          )}

          {rooms.length > 1 && anyGrid && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">จัดทุกห้อง</span>
              <Button size="sm" variant="outline" className="ui-control-compact h-8" disabled={locked || students.length === 0} onClick={() => fillAll(students)}>
                เรียงตามลำดับ
              </Button>
              <Button size="sm" variant="outline" className="ui-control-compact h-8" disabled={locked || students.length === 0} onClick={() => fillAll(shuffled(students))}>
                สุ่ม
              </Button>
            </div>
          )}

          {pickedStudent && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
              <span className="min-w-0 flex-1">
                เลือก <span className="font-medium">{pickedStudent.name}</span> แตะที่นั่งเพื่อย้ายหรือสลับ
              </span>
              {(picked?.kind === "seat" || picked?.kind === "special") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ui-control-compact h-7"
                  onClick={() => {
                    if (picked.kind === "special") setSpecial.mutate({ sessionId: session.id, seatId: picked.id, studentId: null }, { onError: () => toast("บันทึกผังไม่สำเร็จ", "error") });
                    else write(seated.filter((x) => x.student_id !== pickedStudent.student_id));
                    setPicked(null);
                  }}
                >
                  นำออกจากที่นั่ง
                </Button>
              )}
              <Button size="sm" variant="outline" className="ui-control-compact h-7" onClick={() => setPicked(null)}>
                ยกเลิก
              </Button>
            </div>
          )}

          {rooms.length > 1 && (
            <div className="flex w-full border-b border-border" role="tablist">
              {rooms.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={tabIdx === i}
                  onClick={() => setRoomTab(i)}
                  className={cn(
                    "-mb-px flex-1 border-b-2 px-2 py-2 text-xs font-medium whitespace-nowrap",
                    tabIdx === i ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  ห้องที่ {i + 1}
                </button>
              ))}
            </div>
          )}
          {rooms.length > 1 ? renderRoom(rooms[tabIdx]!, tabIdx) : rooms.map(renderRoom)}

          {anyGrid && missing > 0 && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-[hsl(var(--warning)/0.12)] px-3 py-2 text-xs text-warning">
              <span className="min-w-0 flex-1">ที่นั่งไม่พอ ขาดอีก {missing} ที่ เลือก template ที่ใหญ่ขึ้น เพิ่มห้อง หรือจัดนักเรียนที่เหลือเอง</span>
              {rooms.every((r) => r.seat_rows != null) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ui-control-compact h-7 shrink-0"
                  disabled={locked}
                  onClick={() => addRoom.mutate(session.id, { onError: () => toast("เพิ่มห้องไม่สำเร็จ", "error") })}
                >
                  <Plus className="h-3 w-3" /> เพิ่มห้อง
                </Button>
              )}
            </div>
          )}

          {anyGrid && unseated.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">ยังไม่มีที่นั่ง ({unseated.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {unseated.map((s) => (
                  <button
                    key={s.student_id}
                    type="button"
                    disabled={locked}
                    onClick={() => setPicked(picked?.kind === "student" && picked.id === s.student_id ? null : { kind: "student", id: s.student_id })}
                    className={cn("rounded-full border border-border bg-card px-2.5 py-1 text-xs", picked?.kind === "student" && picked.id === s.student_id && "ring-2 ring-primary")}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Collapse>

      <ConfirmDialog
        open={clearing !== null}
        title="ล้างผังที่นั่ง?"
        description="นักเรียนในห้องนี้จะกลับไปอยู่ในรายการ ยังไม่มีที่นั่ง ผังขนาดเดิมยังอยู่"
        confirmLabel="ล้างผัง"
        pending={setSeats.isPending}
        onCancel={() => setClearing(null)}
        onConfirm={() => {
          write(seated.filter((x) => x.room !== clearing));
          setClearing(null);
          setPicked(null);
        }}
      />
      <ConfirmDialog
        open={removingSpecial !== null}
        title="ลบที่นั่งพิเศษ?"
        description="นักเรียนที่นั่งอยู่จะกลับไปอยู่ในรายการ ยังไม่มีที่นั่ง"
        confirmLabel="ลบที่นั่ง"
        pending={deleteSpecial.isPending}
        onCancel={() => setRemovingSpecial(null)}
        onConfirm={() => {
          if (removingSpecial) {
            if (picked?.kind === "special" && picked.id === removingSpecial.id) setPicked(null);
            deleteSpecial.mutate({ sessionId: session.id, seatId: removingSpecial.id }, { onError: () => toast("ลบที่นั่งไม่สำเร็จ", "error") });
          }
          setRemovingSpecial(null);
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        title="ลบห้องนี้?"
        description="นักเรียนที่นั่งในห้องนี้จะกลับไปอยู่ในรายการ ยังไม่มีที่นั่ง"
        confirmLabel="ลบห้อง"
        pending={removeRoom.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) removeRoom.mutate({ sessionId: session.id, roomRowId: removing.id }, { onError: () => toast("ลบห้องไม่สำเร็จ", "error") });
          setRemoving(null);
          setPicked(null);
        }}
      />
      {managing && <SeatTemplatesSheet onClose={() => setManaging(false)} />}
    </div>
  );
}

/** Create, edit and delete the department's seat templates. Everyone in the department can use them; only the creator or a head edits. */
function SeatTemplatesSheet({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const { data: templates = [] } = useSeatTemplates();
  const save = useSaveSeatTemplate();
  const remove = useDeleteSeatTemplate();
  const [form, setForm] = useState<{ id?: string; name: string; rows: string; cols: string } | null>(null);
  const [deleting, setDeleting] = useState<ExamSeatTemplate | null>(null);
  const roles = profile?.roles ?? [];
  const canEdit = (t: ExamSeatTemplate) => t.created_by === profile?.id || isOrgWide(roles) || isDeptHead(roles);

  const rowsN = Number(form?.rows);
  const colsN = Number(form?.cols);
  const valid = !!form && form.name.trim().length > 0 && Number.isInteger(rowsN) && Number.isInteger(colsN) && rowsN >= 1 && rowsN <= 30 && colsN >= 1 && colsN <= 30;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !valid || !profile?.department_id) return;
    save.mutate(
      { id: form.id, department_id: profile.department_id, name: form.name.trim(), seat_rows: rowsN, seat_cols: colsN },
      { onSuccess: () => setForm(null), onError: () => toast("บันทึก template ไม่สำเร็จ", "error") },
    );
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Template ผังที่นั่ง" description="ใช้ร่วมกันทั้งฝ่าย ใช้กับห้องสอบไหนก็ได้">
      <div className="space-y-3">
        {form ? (
          <form onSubmit={submit} className="space-y-3">
            <FormSection>
              <Field label="ชื่อ template" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น ห้องประชุม 6 แถว" maxLength={60} />
              </Field>
            </FormSection>
            <FormSection>
              <div className="grid grid-cols-2 gap-3">
                <Field label="จำนวนคอลัมน์" required>
                  <Input type="number" min="1" max="30" value={form.cols} onChange={(e) => setForm({ ...form, cols: e.target.value })} />
                </Field>
                <Field label="จำนวนแถว" required>
                  <Input type="number" min="1" max="30" value={form.rows} onChange={(e) => setForm({ ...form, rows: e.target.value })} />
                </Field>
              </div>
            </FormSection>
            {valid && <p className="text-xs text-muted-foreground">{rowsN * colsN} ที่นั่ง</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setForm(null)}>
                ยกเลิก
              </Button>
              <Button type="submit" className="flex-1" disabled={!valid || save.isPending}>
                บันทึก
              </Button>
            </div>
          </form>
        ) : (
          <>
            <Button size="sm" onClick={() => setForm({ name: "", rows: "5", cols: "6" })}>
              <Plus className="h-3 w-3" /> สร้าง template
            </Button>
            {templates.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มี template</p>}
            <ul className="space-y-2">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.name}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {t.seat_cols} คอลัมน์ × {t.seat_rows} แถว · {t.seat_rows * t.seat_cols} ที่นั่ง
                    </p>
                  </div>
                  {canEdit(t) && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button size="icon" variant="outline" className={ICON_BTN} aria-label="แก้ไข template" title="แก้ไข template" onClick={() => setForm({ id: t.id, name: t.name, rows: String(t.seat_rows), cols: String(t.seat_cols) })}>
                        <PencilIcon className={ICON} />
                      </Button>
                      <Button size="icon" variant="outline" className={ICON_BTN} aria-label="ลบ template" title="ลบ template" onClick={() => setDeleting(t)}>
                        <TrashIcon className={ICON} />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <ConfirmDialog
        open={!!deleting}
        title="ลบ template?"
        description={deleting ? `ลบ "${deleting.name}" ผังที่จัดไปแล้วในรอบสอบยังอยู่ แต่ครูในฝ่ายจะเลือก template นี้ไม่ได้อีก` : undefined}
        pending={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null), onError: () => toast("ลบ template ไม่สำเร็จ", "error") })}
      />
    </Sheet>
  );
}
