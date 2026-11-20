"use client";

import { useEffect, useRef, useState } from "react";
import { apply, emptyState } from "@/lib/eld/engine.ts";
import { BASES, buildItems, type Placement } from "@/lib/eld/maps.ts";
import type { GameEvent } from "@/lib/eld/types.ts";
import { TableScene } from "@/lib/eld3d/scene";

/** The map as a 3D table without figures: what the admin's map creator shows as "3D preview". Brings three.js. */
export function Map3dPreview({ base, items, noWebgl }: { base: string; items: Placement[]; noWebgl: string }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TableScene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let made: TableScene;
    try {
      made = new TableScene(el, {
        canAct: () => false, canDrag: () => false, hidden: () => false, onSelect: () => undefined, onMove: () => undefined,
        previewMove: () => ({ ok: false, label: "" }), previewAim: () => undefined, onAim: () => undefined, onTurn: () => undefined,
        onTokenSelect: () => undefined, onTokenPlace: () => undefined, onTokenMove: () => undefined,
      });
    } catch {
      const timer = window.setTimeout(() => setFailed(true), 0);
      return () => window.clearTimeout(timer);
    }
    made.setShowZones(false);
    scene.current = made;
    return () => {
      scene.current = null;
      made.dispose();
    };
  }, []);

  const key = JSON.stringify([base, items]);
  useEffect(() => {
    const ground = BASES.find((b) => b.id === base) ?? BASES[0]!;
    const state = emptyState("preview");
    apply(state, {
      type: "TABLE_CREATED", name: "Preview", width: 36, height: 36, deployDepth: 8, terrain: [...ground.fixed, ...buildItems(items)],
      ...(ground.ground ? { ground: ground.ground } : {}), ...(ground.relief ? { relief: ground.relief } : {}), seq: 1, ts: 0, side: null, by: "",
    } as GameEvent);
    scene.current?.setState(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` says when base or items changed
  }, [key]);

  if (failed) return <p role="alert" className="rounded-lg border bg-card p-4 text-center text-sm">{noWebgl}</p>;
  return <div ref={host} className="relative aspect-square w-full overflow-hidden rounded-md bg-[#12141c]" />;
}
