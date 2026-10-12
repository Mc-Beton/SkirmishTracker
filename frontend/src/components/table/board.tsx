"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Env, Vec } from "@/lib/table/geometry.ts";
import { imageUrl } from "@/lib/table/api";

/** A picture placed on the board: centre in inches, real size in inches, rotation in degrees. */
export type BoardPicture = { imageId: string | null; x: number; y: number; widthIn: number; heightIn: number; rotation: number };

export type BoardTerrain = { id: string; kind: "OBSTACLE" | "AREA"; points: Vec[]; height: number; envs: Env[] };

export type BoardModel = {
  id: string;
  side: number;
  x: number;
  y: number;
  facing: number;
  radiusIn: number;
  label: string;
  /** ring around the base: LoS highlight, selection… */
  ring?: string | null;
  dim?: boolean;
  selected?: boolean;
  states?: string[];
};

export type Painter = (ctx: CanvasRenderingContext2D, px: (inches: number) => number) => void;

type Props = {
  widthIn: number;
  heightIn: number;
  background?: BoardPicture | null;
  pictures?: BoardPicture[];
  terrain?: BoardTerrain[];
  showTerrain?: boolean;
  deploymentDepth?: number | null;
  models?: BoardModel[];
  /** Extra drawing under the models (areas, paths) and over them (labels, handles). */
  under?: Painter;
  over?: Painter;
  onPointerDown?: (p: Vec, e: React.PointerEvent) => void;
  onPointerMove?: (p: Vec, e: React.PointerEvent) => void;
  onPointerUp?: (p: Vec, e: React.PointerEvent) => void;
  onWheel?: (p: Vec, e: WheelEvent) => void;
  cursor?: string;
  ariaLabel: string;
};

const images = new Map<string, HTMLImageElement>();

function useImages(ids: (string | null | undefined)[]) {
  const [, setTick] = useState(0);
  const key = ids.filter(Boolean).sort().join(",");
  useEffect(() => {
    for (const id of key.split(",")) {
      if (!id || images.has(id)) continue;
      const img = new Image();
      img.onload = () => setTick((t) => t + 1);
      img.src = imageUrl(id);
      images.set(id, img);
    }
  }, [key]);
  return images;
}

export const SIDE_COLORS = ["#d9b45a", "#c84646"];

const ENV_FILL: Partial<Record<Env, string>> = {
  AQUATIC_SHALLOW: "rgba(60,140,200,.35)",
  AQUATIC_DEEP: "rgba(30,80,160,.45)",
  FOREST: "rgba(60,150,80,.35)",
  DIFFICULT: "rgba(150,120,70,.35)",
  MOUNTAINOUS: "rgba(140,140,140,.35)",
  UNSCALABLE: "rgba(90,90,90,.45)",
  DARK: "rgba(10,10,30,.45)",
  SWAMP: "rgba(90,110,60,.4)",
};

/**
 * The table drawn on a canvas, in inches. Shared by the game, the map editor and the terrain editor:
 * background art, placed terrain art, an optional terrain overlay (what the rules see), deployment zones,
 * models with their front arc, and painter hooks for anything else.
 */
export function Board(props: Props) {
  const { widthIn, heightIn } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cssWidth, setCssWidth] = useState(600);
  const imgs = useImages([props.background?.imageId, ...(props.pictures ?? []).map((p) => p.imageId)]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCssWidth(el.clientWidth));
    ro.observe(el);
    setCssWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const cssHeight = (cssWidth * heightIn) / widthIn;

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(cssWidth * dpr);
    c.height = Math.round(cssHeight * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const k = (cssWidth * dpr) / widthIn;
    const px = (inches: number) => inches * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#2b2a22";
    ctx.fillRect(0, 0, c.width, c.height);

    const picture = (p: BoardPicture) => {
      const img = p.imageId ? imgs.get(p.imageId) : undefined;
      ctx.save();
      ctx.translate(px(p.x), px(p.y));
      ctx.rotate((p.rotation * Math.PI) / 180);
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, -px(p.widthIn) / 2, -px(p.heightIn) / 2, px(p.widthIn), px(p.heightIn));
      } else {
        ctx.fillStyle = "rgba(255,255,255,.08)";
        ctx.fillRect(-px(p.widthIn) / 2, -px(p.heightIn) / 2, px(p.widthIn), px(p.heightIn));
      }
      ctx.restore();
    };
    if (props.background) picture(props.background);

    // 1" grid, stronger every 6"
    ctx.lineWidth = 1;
    for (let i = 0; i <= Math.max(widthIn, heightIn); i++) {
      ctx.strokeStyle = i % 6 === 0 ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)";
      if (i <= widthIn) { ctx.beginPath(); ctx.moveTo(px(i), 0); ctx.lineTo(px(i), px(heightIn)); ctx.stroke(); }
      if (i <= heightIn) { ctx.beginPath(); ctx.moveTo(0, px(i)); ctx.lineTo(px(widthIn), px(i)); ctx.stroke(); }
    }

    (props.pictures ?? []).forEach(picture);

    if (props.deploymentDepth) {
      const d = props.deploymentDepth;
      ctx.fillStyle = "rgba(200,70,70,.08)";
      ctx.fillRect(0, 0, px(widthIn), px(d));
      ctx.fillStyle = "rgba(217,180,90,.08)";
      ctx.fillRect(0, px(heightIn - d), px(widthIn), px(d));
      ctx.setLineDash([px(0.25), px(0.25)]);
      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.beginPath();
      ctx.moveTo(0, px(d)); ctx.lineTo(px(widthIn), px(d));
      ctx.moveTo(0, px(heightIn - d)); ctx.lineTo(px(widthIn), px(heightIn - d));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (props.showTerrain) {
      for (const t of props.terrain ?? []) {
        ctx.beginPath();
        t.points.forEach((p, i) => (i ? ctx.lineTo(px(p.x), px(p.y)) : ctx.moveTo(px(p.x), px(p.y))));
        ctx.closePath();
        if (t.kind === "OBSTACLE") {
          ctx.fillStyle = "rgba(20,16,12,.55)";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,210,150,.9)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = ENV_FILL[t.envs[0]] ?? "rgba(255,255,255,.15)";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,.35)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    props.under?.(ctx, px);

    for (const m of props.models ?? []) {
      const r = px(m.radiusIn);
      const cx = px(m.x), cy = px(m.y);
      ctx.globalAlpha = m.dim ? 0.45 : 1;
      if (m.ring) {
        ctx.strokeStyle = m.ring;
        ctx.lineWidth = Math.max(3, px(0.08));
        ctx.beginPath(); ctx.arc(cx, cy, r + px(0.12), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = "#0d1322";
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      const f = (m.facing * Math.PI) / 180;
      ctx.fillStyle = SIDE_COLORS[m.side] ?? "#999";
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, f - Math.PI / 2, f + Math.PI / 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = m.selected ? "#33d3e0" : "#000";
      ctx.lineWidth = m.selected ? 3 : 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      if (m.states?.includes("CROUCHED")) {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = "#fff";
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      if (m.states?.includes("DEAD") || m.states?.includes("INCAPACITATED")) {
        ctx.strokeStyle = m.states.includes("DEAD") ? "#f26d6d" : "#f2b84b"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy - r * 0.6); ctx.lineTo(cx + r * 0.6, cy + r * 0.6);
        ctx.moveTo(cx + r * 0.6, cy - r * 0.6); ctx.lineTo(cx - r * 0.6, cy + r * 0.6); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.font = `600 ${Math.max(10, px(0.38))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(m.label, cx, cy + r + Math.max(11, px(0.45)));
      ctx.textAlign = "start";
    }

    props.over?.(ctx, px);
  }, [cssWidth, cssHeight, widthIn, heightIn, props, imgs]);

  useEffect(() => {
    draw();
  }, [draw]);

  const toInches = (e: { clientX: number; clientY: number }): Vec => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * widthIn, y: ((e.clientY - r.top) / r.height) * heightIn };
  };

  const onWheel = props.onWheel;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !onWheel) return;
    const h = (e: WheelEvent) => onWheel(toInches(e), e);
    c.addEventListener("wheel", h, { passive: false });
    return () => c.removeEventListener("wheel", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onWheel, widthIn, heightIn]);

  return (
    <div ref={wrap} className="w-full">
      <canvas
        ref={canvas}
        role="img"
        aria-label={props.ariaLabel}
        style={{ width: "100%", height: cssHeight, cursor: props.cursor ?? "crosshair", touchAction: "none" }}
        className="block rounded-md"
        onPointerDown={(e) => props.onPointerDown?.(toInches(e), e)}
        onPointerMove={(e) => props.onPointerMove?.(toInches(e), e)}
        onPointerUp={(e) => props.onPointerUp?.(toInches(e), e)}
      />
    </div>
  );
}

/** Draws a closed polygon or an open polyline in inches. */
export function tracePath(ctx: CanvasRenderingContext2D, px: (i: number) => number, pts: Vec[], close: boolean) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(px(p.x), px(p.y)) : ctx.moveTo(px(p.x), px(p.y))));
  if (close) ctx.closePath();
}
