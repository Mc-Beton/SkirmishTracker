// WarBracket: what the 3D table is still fetching (models, the ground picture), so the page can show a progress bar.

interface Item {
  loaded: number;
  total: number;
  done: boolean;
  failed: boolean;
}

export interface LoadState {
  /** Something is still on its way. */
  busy: boolean;
  files: number;
  done: number;
  failed: number;
  /** Bytes so far and, when every file has said how big it is, bytes in all (otherwise 0). */
  loaded: number;
  total: number;
}

const items = new Map<string, Item>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function changed(now = false): void {
  if (now) {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const fn of listeners) fn();
    return;
  }
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    for (const fn of listeners) fn();
  }, 120);
}

export function loadBegin(url: string): void {
  items.set(url, { loaded: 0, total: 0, done: false, failed: false });
  changed(true);
}

export function loadProgress(url: string, loaded: number, total: number): void {
  const it = items.get(url);
  if (!it) return;
  it.loaded = loaded;
  it.total = Math.max(total, loaded);
  changed();
}

export function loadEnd(url: string, ok: boolean): void {
  const it = items.get(url);
  if (!it) return;
  it.done = true;
  it.failed = !ok;
  if (it.total > 0) it.loaded = it.total;
  changed(true);
}

/** Forget what has finished: called when a table is opened, so its bar starts from nothing. */
export function loadReset(): void {
  for (const [url, it] of items) if (it.done) items.delete(url);
  changed(true);
}

export function loadState(): LoadState {
  const all = [...items.values()];
  const sized = all.length > 0 && all.every((it) => it.total > 0 || it.done);
  return {
    busy: all.some((it) => !it.done),
    files: all.length,
    done: all.filter((it) => it.done).length,
    failed: all.filter((it) => it.failed).length,
    loaded: all.reduce((n, it) => n + it.loaded, 0),
    total: sized ? all.reduce((n, it) => n + it.total, 0) : 0,
  };
}

export function onLoadChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
