export type RoomSeat = { student_id: string; room: string; seat_row: number; seat_col: number };

/** Plan for "คัดลอกผังจาก…": what the destination room's seats and special seats become.
 *  Only students on the destination roster are seated; a student already seated in another room of the destination
 *  session keeps that seat; cells another overlapping session holds, or outside the grid, are skipped. */
export function planCopy(i: {
  roomId: string;
  rows: number;
  cols: number;
  srcSeats: { student_id: string; seat_row: number; seat_col: number }[];
  /** Source special seats; the destination gets the same number of them (up to 10), each holding the same student if possible. */
  srcSpecials: { special_no: number; student_id: string | null }[];
  roster: Set<string>;
  /** Seats the destination session already has in its other rooms (kept as they are). */
  keep: RoomSeat[];
  /** "row:col" cells another session holds in the destination room. */
  held: Set<string>;
}): { seats: RoomSeat[]; specials: (string | null)[]; copied: number; skipped: number } {
  const keptIds = new Set(i.keep.map((x) => x.student_id));
  const usable = (id: string) => i.roster.has(id) && !keptIds.has(id);
  const placed: RoomSeat[] = [];
  let skipped = 0;
  for (const s of i.srcSeats) {
    const inGrid = s.seat_row >= 1 && s.seat_row <= i.rows && s.seat_col >= 1 && s.seat_col <= i.cols;
    if (usable(s.student_id) && inGrid && !i.held.has(`${s.seat_row}:${s.seat_col}`)) placed.push({ student_id: s.student_id, room: i.roomId, seat_row: s.seat_row, seat_col: s.seat_col });
    else skipped++;
  }
  const inGrid = new Set(placed.map((x) => x.student_id));
  const specials = i.srcSpecials
    .slice()
    .sort((a, b) => a.special_no - b.special_no)
    .slice(0, 10)
    .map((x) => {
      if (!x.student_id) return null;
      if (usable(x.student_id) && !inGrid.has(x.student_id)) return x.student_id;
      skipped++;
      return null;
    });
  return { seats: [...i.keep, ...placed], specials, copied: placed.length + specials.filter(Boolean).length, skipped };
}
