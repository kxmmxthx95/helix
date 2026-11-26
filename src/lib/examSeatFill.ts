import type { RoomSeat } from "@/lib/examSeatCopy";

export type FillRoom = { id: string; rows: number; cols: number; /** "row:col" cells another session holds. */ held: Set<string> };

/** "จัดทั้งรอบ": seats only the students who have no seat yet, filling room 1 first, then room 2…, row by row.
 *  Seats already placed (and special-seat students, and cells other sessions hold) are never touched. When the free cells run out
 *  the rest stay unseated (`left`). */
export function planFillAll(i: {
  rooms: FillRoom[];
  seats: RoomSeat[];
  specialIds: Set<string>;
  students: { student_id: string; code: string }[];
  order: "code" | "shuffle";
  shuffle: <T>(items: T[]) => T[];
}): { seats: RoomSeat[]; placed: number; left: number } {
  const seatedIds = new Set(i.seats.map((x) => x.student_id));
  const waiting = i.students.filter((s) => !seatedIds.has(s.student_id) && !i.specialIds.has(s.student_id));
  const pool = i.order === "code" ? waiting.slice().sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true })) : i.shuffle(waiting);
  const free: { room: string; seat_row: number; seat_col: number }[] = [];
  for (const r of i.rooms) {
    const used = new Set(i.seats.filter((x) => x.room === r.id).map((x) => `${x.seat_row}:${x.seat_col}`));
    for (let n = 0; n < r.rows * r.cols; n++) {
      const seat_row = Math.floor(n / r.cols) + 1;
      const seat_col = (n % r.cols) + 1;
      const key = `${seat_row}:${seat_col}`;
      if (!used.has(key) && !r.held.has(key)) free.push({ room: r.id, seat_row, seat_col });
    }
  }
  const placed = pool.slice(0, free.length).map((s, n) => ({ student_id: s.student_id, ...free[n]! }));
  return { seats: [...i.seats, ...placed], placed: placed.length, left: pool.length - placed.length };
}
