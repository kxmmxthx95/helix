type Timed = { id: string; opens_at: string | null; closes_at: string | null };

/** End of a session in ms; one without a close time counts as a point in time. */
export const endOf = (s: Timed) => new Date(s.closes_at ?? s.opens_at!).getTime();

/** Exam is in progress at `now` (ms). Needs both ends: without a close time we cannot tell when it stops. */
export const isLive = (s: Timed, now: number) =>
  !!s.opens_at && !!s.closes_at && new Date(s.opens_at).getTime() <= now && now < new Date(s.closes_at).getTime();

/** Key for "this session clashes in this room"; a session spanning several rooms may clash in only some of them. */
export const clashKey = (roomId: string, sessionId: string) => `${roomId}|${sessionId}`;

/** clashKey()s of sessions that overlap another session in the same physical room (a room can host one exam at a time).
 *  Sessions without an opens_at are ignored; touching windows (one ends when the next starts) do not clash.
 *  Two exams in exactly the same window may share a room (same rule as exam_seating_status, migration 0232);
 *  a desk claimed twice is reported by that RPC, not here. */
export function roomClashes<T extends Timed>(sessions: T[], roomIdsOf: Map<string, string[]> | undefined): Set<string> {
  const out = new Set<string>();
  const perRoom = new Map<string, T[]>();
  for (const s of sessions) {
    if (!s.opens_at) continue;
    for (const id of roomIdsOf?.get(s.id) ?? []) perRoom.set(id, [...(perRoom.get(id) ?? []), s]);
  }
  for (const [room, list] of perRoom) {
    const sorted = list.slice().sort((a, b) => a.opens_at!.localeCompare(b.opens_at!));
    sorted.forEach((a, i) => {
      for (const b of sorted.slice(i + 1)) {
        if (new Date(b.opens_at!).getTime() >= endOf(a)) break;
        if (a.closes_at && a.opens_at === b.opens_at && a.closes_at === b.closes_at) continue;
        out.add(clashKey(room, a.id));
        out.add(clashKey(room, b.id));
      }
    });
  }
  return out;
}

/** Local calendar day as "YYYY-MM-DD" (the key days are grouped by). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
