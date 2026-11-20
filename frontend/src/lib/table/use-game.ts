"use client";

// The state of a table of the game engine in the browser: the event log folded with the engine's own `apply`,
// kept in step with the server. Live hints only say "something changed"; the events are fetched through the API.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { apply as applyEvent, emptyState, ownerNames } from "@/lib/eld/engine.ts";
import type { Command, GameEvent, Model, TableState } from "@/lib/eld/types.ts";
import { fetchGame, sendGameCommand, type GameMeta, type GameView, type Hands } from "./game-api";
import { useTableLive } from "./live";

/**
 * Applies an event as the server sent it to this viewer. A Shrouded model of the other player arrives as a plain
 * token; the event that reveals it carries the model as it then is (`unmask`), which takes the token's place.
 */
function apply(state: TableState, ev: GameEvent): void {
  applyEvent(state, ev);
  const shown = (ev as GameEvent & { unmask?: Model[] }).unmask;
  if (!shown) return;
  for (const m of shown) {
    const i = state.models.findIndex((x) => x.id === m.id);
    if (i >= 0) state.models[i] = structuredClone(m);
  }
  ownerNames(state);
}

type Core = { state: TableState; queue: GameEvent[]; queued: number; draining: boolean; polling: boolean; again: boolean };

export type GameHooks = {
  /**
   * Asked before a live event is applied. A promise holds that event and everything after it back until it
   * resolves: the dice of an Attack are shown first, its outcome when they have landed.
   */
  gate?: (ev: GameEvent) => Promise<void> | null;
  /** After a live event was applied (not for the events of the first load). */
  onEvent?: (ev: GameEvent, state: TableState) => void;
};

export function useGame(tableId: string | null, hooks: GameHooks) {
  const core = useRef<Core | null>(null);
  const hooksRef = useRef(hooks);
  useEffect(() => {
    hooksRef.current = hooks;
  });
  const [state, setState] = useState<TableState | null>(null);
  const [meta, setMeta] = useState<GameMeta | null>(null);
  const [hands, setHands] = useState<Hands>([null, null]);
  const [error, setError] = useState<ApiError | null>(null);

  const publish = useCallback(() => {
    if (core.current) setState(structuredClone(core.current.state));
  }, []);

  /** Everything from the start (first load, and after a gap in the sequence): fetched and folded, not yet shown. */
  const fetchAll = useCallback(async (): Promise<GameView | null> => {
    if (!tableId) return null;
    const view = await fetchGame(tableId, 0);
    const state = emptyState(tableId);
    for (const ev of view.events) apply(state, ev);
    core.current = { state, queue: [], queued: state.seq, draining: false, polling: false, again: false };
    return view;
  }, [tableId]);

  const show = useCallback((view: GameView | null) => {
    if (!view) return;
    setMeta(view.meta);
    setHands(view.hands);
    publish();
  }, [publish]);

  const drain = useCallback(async () => {
    const c = core.current;
    if (!c || c.draining) return;
    c.draining = true;
    try {
      while (c.queue.length > 0 && core.current === c) {
        const ev = c.queue[0]!;
        if (ev.seq <= c.state.seq) {
          c.queue.shift();
          continue;
        }
        if (ev.seq !== c.state.seq + 1) {
          c.queue = [];
          show(await fetchAll());
          return;
        }
        const wait = hooksRef.current.gate?.(ev);
        if (wait) await wait;
        if (core.current !== c) return; // the table was reloaded while this one waited
        c.queue.shift();
        apply(c.state, ev);
        publish();
        hooksRef.current.onEvent?.(ev, c.state);
      }
    } finally {
      c.draining = false;
    }
  }, [fetchAll, show, publish]);

  /** New events since the last one seen. */
  const poll = useCallback(async () => {
    const c = core.current;
    if (!tableId || !c) return;
    if (c.polling) {
      c.again = true;
      return;
    }
    c.polling = true;
    try {
      do {
        c.again = false;
        const view = await fetchGame(tableId, c.queued);
        if (core.current !== c) return;
        setMeta(view.meta);
        setHands(view.hands);
        for (const ev of view.events) {
          if (ev.seq <= c.queued) continue;
          c.queue.push(ev);
          c.queued = ev.seq;
        }
        void drain();
      } while (c.again);
    } catch (e) {
      if (e instanceof ApiError && e.status !== 0) setError(e);
    } finally {
      c.polling = false;
    }
  }, [tableId, drain]);

  useEffect(() => {
    if (!tableId) return;
    let active = true;
    fetchAll().then(
      (view) => {
        if (active) show(view);
      },
      (e: unknown) => {
        if (active) setError(e instanceof ApiError ? e : new ApiError(500, "INTERNAL_ERROR"));
      },
    );
    return () => {
      active = false;
      core.current = null;
    };
  }, [tableId, fetchAll, show]);

  useTableLive(tableId, () => void poll());

  /** Sends a command; the events it caused arrive through the same path as everybody else's. */
  const send = useCallback(
    async (cmd: Command): Promise<void> => {
      if (!tableId) return;
      await sendGameCommand(tableId, cmd);
      void poll();
    },
    [tableId, poll],
  );

  return { state, meta, hands, error, send, reload: poll };
}
