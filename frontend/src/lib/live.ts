"use client";

// Live change hints from the backend (Server-Sent Events on /api/live). One connection per tab carries
// hints for the watched tournaments and the signed-in user's notifications. Events say only *what* changed;
// components refetch through the normal API, so nothing here bypasses authorization.

import { useEffect, useRef, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { SYNCED_EVENT } from "@/lib/offline-queue";

export type LiveEvent =
  | { type: "notifications" }
  | { type: "tournament"; id: string; kind: string }
  | { type: "reconnected" };

type Listener = (e: LiveEvent) => void;

const listeners = new Map<Listener, string | null>();
const statusListeners = new Set<() => void>();
let source: EventSource | null = null;
let connected = false;
let url: string | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectPending: ReturnType<typeof setTimeout> | null = null;
let everConnected = false;

const MAX_TOPICS = 5;

function setConnected(value: boolean) {
  if (connected !== value) {
    connected = value;
    statusListeners.forEach((l) => l());
  }
}

function dispatch(e: LiveEvent) {
  listeners.forEach((topic, l) => {
    if (e.type !== "tournament" || topic === e.id) l(e);
  });
}

function desiredUrl(): string | null {
  if (listeners.size === 0) return null;
  const topics = [...new Set([...listeners.values()].filter((t): t is string => !!t))].sort().slice(0, MAX_TOPICS);
  const q = topics.map((t) => `t=${encodeURIComponent(t)}`).join("&");
  return q ? `/api/live?${q}` : "/api/live";
}

function close() {
  source?.close();
  source = null;
  setConnected(false);
}

function connect() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const next = desiredUrl();
  if (next === url && source) return;
  close();
  url = next;
  if (!url || typeof EventSource === "undefined") return;

  const es = new EventSource(url, { withCredentials: true });
  source = es;
  es.addEventListener("ready", () => {
    retry = 0;
    setConnected(true);
    // After a gap we may have missed hints: let everyone refresh once.
    if (everConnected) dispatch({ type: "reconnected" });
    everConnected = true;
  });
  es.addEventListener("notifications", () => dispatch({ type: "notifications" }));
  es.addEventListener("tournament", (msg) => {
    try {
      const data = JSON.parse((msg as MessageEvent<string>).data) as { id: string; kind: string };
      dispatch({ type: "tournament", id: data.id, kind: data.kind });
    } catch {
      // Malformed hint: ignore.
    }
  });
  es.onerror = () => {
    // Also fires when the server recycles the stream (every few minutes) or the access token expired (401).
    if (source !== es) return;
    close();
    scheduleRetry();
  };
}

function scheduleRetry() {
  if (retryTimer || listeners.size === 0) return;
  const delay = Math.min(30_000, 1_000 * 2 ** Math.min(retry, 5));
  retry++;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (!navigator.onLine) {
      window.addEventListener("online", () => connect(), { once: true });
      return;
    }
    // Renews an expired session cookie (the API client refreshes on 401); harmless when signed out.
    await api("GET", "/api/me").catch(() => undefined);
    url = null;
    connect();
  }, delay);
}

function scheduleConnect() {
  // Several components mount in one render: batch their subscriptions into one connection.
  if (reconnectPending) return;
  reconnectPending = setTimeout(() => {
    reconnectPending = null;
    if (listeners.size === 0) {
      close();
      url = null;
      return;
    }
    connect();
  }, 50);
}

function subscribe(listener: Listener, tournamentId: string | null): () => void {
  listeners.set(listener, tournamentId);
  scheduleConnect();
  return () => {
    listeners.delete(listener);
    scheduleConnect();
  };
}

/** Reconnects with the current session (call after sign-in or sign-out). */
export function resetLiveConnection() {
  close();
  url = null;
  retry = 0;
  scheduleConnect();
}

/** True while the live stream is open; polling can back off then. */
export function useLiveConnected(): boolean {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => connected,
    () => false,
  );
}

/**
 * Calls `onChange` (debounced) when the given tournament changes – or, with `null`, when the signed-in
 * user's notifications change. Also fires after a reconnect (hints may have been missed), when the tab becomes
 * visible again and after changes stored offline were delivered.
 */
export function useLiveRefresh(tournamentId: string | null, onChange: () => void, delayMs = 400) {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const listener: Listener = (e) => {
      if (tournamentId ? e.type === "notifications" : e.type === "tournament") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") callback.current();
      }, delayMs);
    };
    const unsubscribe = subscribe(listener, tournamentId);
    // A hidden tab ignores hints; catch up when it becomes visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") callback.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Changes stored offline were just delivered: show the server's view of them.
    const onSynced = () => callback.current();
    window.addEventListener(SYNCED_EVENT, onSynced);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(SYNCED_EVENT, onSynced);
    };
  }, [tournamentId, delayMs]);
}
