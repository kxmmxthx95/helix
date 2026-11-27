/** `blur` and `visibility_hidden` usually fire together for one switch of app or screen, so events this close count once. */
export const LEAVE_WINDOW_MS = 3000;

/** Number of times a student left the exam page, from the times of their blur / visibility_hidden events. */
export function countLeaves(times: (string | number | Date)[]): number {
  const ms = times.map((t) => new Date(t).getTime()).sort((a, b) => a - b);
  let leaves = 0;
  let last = -Infinity;
  for (const t of ms) {
    if (t - last > LEAVE_WINDOW_MS) leaves++;
    last = t;
  }
  return leaves;
}
