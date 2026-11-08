import { idbStore } from "@/lib/outbox";

export const IDLE_MS = 5 * 60 * 1000;

/** Reload only when user has been away long enough and no offline writes are queued. */
export const shouldReload = (hiddenMs: number, pendingOps: number) =>
  hiddenMs >= IDLE_MS && pendingOps === 0;

/**
 * Apply a waiting service worker on return from background (iOS suspends installed PWAs,
 * so the old page would otherwise live forever). `hiddenMs` = Infinity on cold start.
 */
export async function applyIfIdle(reg: ServiceWorkerRegistration, hiddenMs: number, apply: () => void) {
  await reg.update().catch(() => {});
  if (!reg.waiting) return;
  const pending = await idbStore.all().then((o) => o.length, () => 0);
  if (shouldReload(hiddenMs, pending)) apply();
}
