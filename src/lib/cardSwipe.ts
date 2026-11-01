/**
 * A USB magnetic-stripe reader types the swipe like a keyboard, e.g.
 * `%B4111^DOE/JOHN^2512?;1234567890=2512?`. The card id is track 2 (between `;`
 * and `?`, before any `=`), else the PAN of track 1, else whatever was typed.
 */
export function parseSwipe(raw: string): string {
  const t2 = /;([^=?]+)/.exec(raw)?.[1]?.trim();
  if (t2) return t2;
  const t1 = /%[A-Za-z]?([^^?]+)\^/.exec(raw)?.[1]?.trim();
  if (t1) return t1;
  return raw.trim();
}
