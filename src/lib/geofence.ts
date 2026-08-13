/** Time-clock geofence — see migration 0032. Client-side GPS is not a real
 * security boundary (same caveat as src/lib/roles.ts) — this only filters
 * honest mistakes, not deliberate spoofing. */

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance between two lat/lng points, in meters. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type Position = { lat: number; lng: number };
export type PositionError = "denied" | "unavailable" | "timeout";

/** Promisified navigator.geolocation.getCurrentPosition — no wrapper existed yet. */
export function getCurrentPosition(): Promise<Position | { error: PositionError }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ error: "unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve({ error: "denied" });
        else if (err.code === err.TIMEOUT) resolve({ error: "timeout" });
        else resolve({ error: "unavailable" });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}
