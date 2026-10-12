"use client";

// Live hints for one online table (SSE on /api/tables/{id}/live). Each event says only "something changed";
// the page refetches the table through the normal API, which checks access.

import { useEffect, useRef } from "react";

export function useTableLive(tableId: string | null, onChange: () => void) {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!tableId || typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let everConnected = false;
    let closed = false;

    const open = () => {
      source = new EventSource(`/api/tables/${tableId}/live`, { withCredentials: true });
      source.addEventListener("ready", () => {
        retry = 0;
        // after a gap we may have missed changes
        if (everConnected) callback.current();
        everConnected = true;
      });
      source.addEventListener("table", () => callback.current());
      source.onerror = () => {
        source?.close();
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(open, 500 * 2 ** retry);
      };
    };
    open();
    const onVisible = () => {
      if (document.visibilityState === "visible") callback.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      source?.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tableId]);
}
