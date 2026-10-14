"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Vec } from "@/lib/table/geometry.ts";
import type { BoardApi } from "@/components/table/board";
import { imageUrl } from "@/lib/table/api";

type Drag<T> = { payload: T; imageId: string | null; label: string; x: number; y: number };

/**
 * Drag a library item (terrain, model) from a panel onto the board. Mouse: starts after a few pixels. Touch / pen:
 * hold ~0.3 s, then drag (a plain swipe keeps scrolling the list). A short tap is a click (the caller keeps the
 * click-to-place fallback). While dragging, a ghost follows the pointer; dropping over the board calls `onDrop`.
 */
export function useBoardDrag<T>(api: React.MutableRefObject<BoardApi | null>, onDrop: (payload: T, at: Vec) => void) {
  const [drag, setDrag] = useState<Drag<T> | null>(null);
  const dropRef = useRef(onDrop);
  useEffect(() => {
    dropRef.current = onDrop;
  }, [onDrop]);
  const pending = useRef<{ payload: T; imageId: string | null; label: string; x0: number; y0: number; touch: boolean;
    timer: ReturnType<typeof setTimeout> | null; started: boolean } | null>(null);
  const draggingRef = useRef(false);
  /** Set for one tick after a drop: the click that follows pointerup must not count as a click. */
  const justDropped = useRef(false);

  const finish = useCallback(() => {
    const p = pending.current;
    if (p?.timer) clearTimeout(p.timer);
    pending.current = null;
    draggingRef.current = false;
    setDrag(null);
  }, []);

  useEffect(() => {
    const begin = (x: number, y: number) => {
      const p = pending.current;
      if (!p || p.started) return;
      p.started = true;
      draggingRef.current = true;
      setDrag({ payload: p.payload, imageId: p.imageId, label: p.label, x, y });
    };
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!p.started) {
        const moved = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
        if (!p.touch && moved > 4) begin(e.clientX, e.clientY);
        else if (p.touch && moved > 8) finish(); // a swipe: let the list scroll
        return;
      }
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    };
    const up = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (p.started) {
        const at = api.current?.clientToInches(e.clientX, e.clientY);
        if (at) dropRef.current(p.payload, at);
        justDropped.current = true;
        setTimeout(() => { justDropped.current = false; }, 0);
      }
      finish();
    };
    // blocks page scrolling while a touch drag is on
    const touchMove = (e: TouchEvent) => { if (draggingRef.current) e.preventDefault(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("touchmove", touchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("touchmove", touchMove);
    };
  }, [api, finish]);

  /** Spread on the draggable element: `onPointerDown={(e) => start(e, payload, imageId, label)}`. */
  const start = useCallback((e: React.PointerEvent, payload: T, imageId: string | null, label: string) => {
    if (e.button !== 0) return;
    const touch = e.pointerType !== "mouse";
    const p = { payload, imageId, label, x0: e.clientX, y0: e.clientY, touch, timer: null as ReturnType<typeof setTimeout> | null, started: false };
    pending.current = p;
    if (touch) {
      p.timer = setTimeout(() => {
        if (pending.current === p && !p.started) {
          p.started = true;
          draggingRef.current = true;
          setDrag({ payload, imageId, label, x: p.x0, y: p.y0 });
        }
      }, 300);
    }
  }, []);

  /** True right after a drag ended – lets the item's onClick ignore the click that ends a drag. */
  const wasDragging = useCallback(() => justDropped.current, []);

  const ghost = drag ? (
    <div aria-hidden className="pointer-events-none fixed z-50 grid -translate-x-1/2 -translate-y-1/2 place-items-center gap-1"
      style={{ left: drag.x, top: drag.y }}>
      {drag.imageId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl(drag.imageId)} alt="" className="size-16 rounded border border-primary bg-card/80 object-contain opacity-90 shadow-lg" />
      ) : (
        <span className="grid size-10 place-items-center rounded-full border-2 border-primary bg-card/90 shadow-lg" />
      )}
      <span className="rounded bg-card/90 px-1.5 py-0.5 text-[11px] shadow">{drag.label}</span>
    </div>
  ) : null;

  return { start, ghost, dragging: !!drag, wasDragging };
}
