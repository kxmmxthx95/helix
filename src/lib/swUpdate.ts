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

export type UpdateCheck = "unsupported" | "latest" | "ready";

/** Manual check: look for a new service worker and wait until it is installed (waiting). */
export async function checkForUpdate(): Promise<UpdateCheck> {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return "unsupported";
  await reg.update();
  const installing = reg.installing;
  if (installing && !reg.waiting) {
    await new Promise<void>((done) => {
      installing.addEventListener("statechange", () => (installing.state === "installed" || installing.state === "redundant") && done());
    });
  }
  return reg.waiting ? "ready" : "latest";
}

/** Activate the waiting worker (vite-plugin-pwa "prompt" mode listens for SKIP_WAITING) and reload once it controls. */
export async function applyUpdate() {
  const reg = await navigator.serviceWorker.getRegistration();
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
  reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
}

export const pendingOps = () => idbStore.all().then((o) => o.length, () => 0);
