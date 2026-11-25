import { idbStore } from "@/lib/outbox";

export const IDLE_MS = 5 * 60 * 1000;

/** Reload only when user has been idle long enough and no offline writes are queued. */
export const shouldReload = (idleMs: number, pendingOps: number) =>
  idleMs >= IDLE_MS && pendingOps === 0;

/** A student is mid-exam: unsent answers backup exists (removed on submit) and the exams page is open. */
const examInProgress = () =>
  location.pathname.startsWith("/exams") &&
  Object.keys(localStorage).some((k) => k.startsWith("helix-exam-answers:"));

/** Apply an already-waiting service worker if the user is idle and the outbox is empty. */
export async function applyWaitingIfIdle(reg: ServiceWorkerRegistration, idleMs: number, apply: () => void) {
  if (!reg.waiting) return;
  if (examInProgress()) return;
  const pending = await idbStore.all().then((o) => o.length, () => 0);
  if (shouldReload(idleMs, pending)) apply();
}

/**
 * Check for a new service worker, then apply it if idle. `idleMs` = time since last user input
 * (a backgrounded or forgotten PWA stops getting input, so it counts as idle); Infinity on cold start.
 */
export async function applyIfIdle(reg: ServiceWorkerRegistration, idleMs: number, apply: () => void) {
  await reg.update().catch(() => {});
  await applyWaitingIfIdle(reg, idleMs, apply);
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
