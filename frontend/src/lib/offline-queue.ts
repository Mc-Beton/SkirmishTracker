// Outbox for changes made without a connection (results, per-turn points at the table).
// Items live in IndexedDB so they survive a closed tab or a restarted phone, and are replayed in order
// through the normal API client (CSRF, session refresh) once the network is back.

import { api, ApiError, isOfflineError, OFFLINE } from "@/lib/api";

export type OutboxItem = {
  /** Deduplication key: a newer change with the same key replaces the older one (e.g. the same turn). */
  key: string;
  /** Owner of the change; replayed only while the same user is signed in. */
  userId: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  /** Translation key under `offline.labels` describing the change for the user. */
  label: string;
  labelParams?: Record<string, string | number>;
  seq: number;
  createdAt: string;
};

export type FailedItem = OutboxItem & { error: string };

export type Queued = { queued: true };
export type SendResult = Queued | { queued: false };

const DB_NAME = "warbracket";
const OUTBOX = "outbox";
const FAILED = "failed";
const CHANNEL = "warbracket-outbox";

/** Window event fired after stored changes reached the server; pages refetch their data. */
export const SYNCED_EVENT = "warbracket:synced";

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(OUTBOX)) d.createObjectStore(OUTBOX, { keyPath: "key" });
        if (!d.objectStoreNames.contains(FAILED)) d.createObjectStore(FAILED, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

// ------------------------------------------------------------------ change notifications (all tabs)

type Listener = () => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function emit(broadcast = true) {
  listeners.forEach((l) => l());
  if (broadcast) channel?.postMessage("changed");
}

/** Subscribes to outbox changes in this and other tabs. */
export function onOutboxChange(listener: Listener): () => void {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => emit(false);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ------------------------------------------------------------------ storage

let counter = 0;

export async function enqueue(item: Omit<OutboxItem, "seq" | "createdAt">): Promise<void> {
  // A replaced change moves to the end, so it is sent after everything recorded before it.
  const full: OutboxItem = { ...item, seq: Date.now() * 1000 + (counter++ % 1000), createdAt: new Date().toISOString() };
  await tx(OUTBOX, "readwrite", (s) => s.put(full));
  emit();
}

export async function pending(userId?: string): Promise<OutboxItem[]> {
  const all = await tx<OutboxItem[]>(OUTBOX, "readonly", (s) => s.getAll());
  return all.filter((i) => !userId || i.userId === userId).sort((a, b) => a.seq - b.seq);
}

export async function failures(userId?: string): Promise<FailedItem[]> {
  const all = await tx<FailedItem[]>(FAILED, "readonly", (s) => s.getAll());
  return all.filter((i) => !userId || i.userId === userId).sort((a, b) => a.seq - b.seq);
}

export async function dismissFailure(key: string): Promise<void> {
  await tx(FAILED, "readwrite", (s) => s.delete(key));
  emit();
}

async function remove(key: string): Promise<void> {
  await tx(OUTBOX, "readwrite", (s) => s.delete(key));
}

async function fail(item: OutboxItem, error: string): Promise<void> {
  await remove(item.key);
  await tx(FAILED, "readwrite", (s) => s.put({ ...item, error }));
}

// ------------------------------------------------------------------ sending

/**
 * Sends the change now or, without a connection, stores it for later. Throws for every other error
 * (validation, permissions...) exactly like `api()`.
 */
export async function sendOrQueue(item: Omit<OutboxItem, "seq" | "createdAt">): Promise<SendResult> {
  const queueIt = async (cause: unknown): Promise<Queued> => {
    try {
      await enqueue(item);
    } catch {
      throw cause;  // no local storage (e.g. some private modes): report the original problem
    }
    return { queued: true };
  };
  // Keep the order: while older changes wait, a new one must not overtake them.
  const waiting = await pending(item.userId).then((p) => p.length, () => 0);
  if (!navigator.onLine || waiting > 0) return queueIt(new ApiError(0, OFFLINE));
  try {
    await api(item.method, item.path, item.body);
    return { queued: false };
  } catch (err) {
    if (isOfflineError(err)) return queueIt(err);
    throw err;
  }
}

let flushing = false;

/**
 * Replays the user's stored changes in order. Stops at the first network problem and keeps the rest;
 * a change the server rejects (e.g. the round has ended meanwhile) is moved to the failures list.
 * Returns how many changes were delivered.
 */
export async function flush(userId: string): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  try {
    const run = async () => {
      let sent = 0;
      for (const item of await pending(userId)) {
        try {
          await api(item.method, item.path, item.body);
          await remove(item.key);
          sent++;
          emit();
        } catch (err) {
          if (!(err instanceof ApiError) || err.status === 0 || err.status === 401 || err.status >= 500
            || err.status === 429) {
            break;  // no network, signed out or server trouble: try again later
          }
          await fail(item, err.code);
          emit();
        }
      }
      return sent;
    };
    // Only one tab replays at a time (Web Locks); without the API a per-tab flag is the best we can do.
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    return locks ? await locks.request("warbracket-outbox", run) : await run();
  } finally {
    flushing = false;
  }
}
