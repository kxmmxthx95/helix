type Timed = { id: string; opens_at: string | null; closes_at: string | null };

/** End of a session in ms; one without a close time counts as a point in time. */
export const endOf = (s: Timed) => new Date(s.closes_at ?? s.opens_at!).getTime();

/** Ids of sessions that overlap another session in the same physical room (a room can host one exam at a time).
 *  Sessions without an opens_at are ignored; touching windows (one ends when the next starts) do not clash. */
export function roomClashes<T extends Timed>(sessions: T[], roomIdsOf: Map<string, string[]> | undefined): Set<string> {
  const out = new Set<string>();
  const perRoom = new Map<string, T[]>();
  for (const s of sessions) {
    if (!s.opens_at) continue;
    for (const id of roomIdsOf?.get(s.id) ?? []) perRoom.set(id, [...(perRoom.get(id) ?? []), s]);
  }
  for (const list of perRoom.values()) {
    const sorted = list.slice().sort((a, b) => a.opens_at!.localeCompare(b.opens_at!));
    sorted.forEach((a, i) => {
      for (const b of sorted.slice(i + 1)) {
        if (new Date(b.opens_at!).getTime() >= endOf(a)) break;
        out.add(a.id);
        out.add(b.id);
      }
    });
  }
  return out;
}

/** Local calendar day as "YYYY-MM-DD" (the key days are grouped by). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
