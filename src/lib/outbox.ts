/**
 * Offline write queue. Mutations made while offline are appended here and
 * replayed in order once the connection returns (grill decision: offline
 * edit + background sync is v1).
 *
 * Reads are handled separately by the service worker's NetworkFirst cache
 * (vite.config.ts) — cache-as-you-go, no full prefetch.
 */

export type Op = {
  id: string;
  table: "students" | "profiles";
  type: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  createdAt: number;
};

export type OpStore = {
  all(): Promise<Op[]>;
  add(op: Op): Promise<void>;
  remove(id: string): Promise<void>;
};

export type Sender = (op: Op) => Promise<void>;

export type FlushResult = { sent: number; pending: number; failed?: Op };

/**
 * Replay queued ops oldest-first. Stops at the first failure and leaves that
 * op — and everything after it — queued, because a later op may depend on an
 * earlier one (create student, then edit it). Order is the whole point.
 */
export async function flush(store: OpStore, send: Sender): Promise<FlushResult> {
  const ops = (await store.all()).sort((a, b) => a.createdAt - b.createdAt);
  let sent = 0;

  for (const op of ops) {
    try {
      await send(op);
      await store.remove(op.id);
      sent++;
    } catch {
      return { sent, pending: ops.length - sent, failed: op };
    }
  }

  return { sent, pending: 0 };
}

// ------------------------------------------------------------- IndexedDB

const DB_NAME = "helix-outbox";
const STORE = "ops";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbStore: OpStore = {
  all: () => tx("readonly", (s) => s.getAll() as IDBRequest<Op[]>),
  add: (op) => tx("readwrite", (s) => s.add(op)).then(() => undefined),
  remove: (id) => tx("readwrite", (s) => s.delete(id)).then(() => undefined),
};

export function enqueue(
  op: Omit<Op, "id" | "createdAt">,
  store: OpStore = idbStore,
): Promise<void> {
  return store.add({ ...op, id: crypto.randomUUID(), createdAt: Date.now() });
}

/** Flush now, and again on every reconnect. Returns an unsubscribe. */
export function startAutoFlush(send: Sender, store: OpStore = idbStore): () => void {
  const run = () => {
    if (navigator.onLine) void flush(store, send);
  };
  run();
  window.addEventListener("online", run);
  return () => window.removeEventListener("online", run);
}
