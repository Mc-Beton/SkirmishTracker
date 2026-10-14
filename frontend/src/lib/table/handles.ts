/**
 * Selection frame of a terrain picture on the board (map editor and free game): four corner handles for a uniform
 * scale and a knob on a stalk above the top edge for rotation; also the terrain info under the pointer.
 */
import { pointInPolygon, type Env, type Vec } from "./geometry.ts";
import { rotate } from "./terrain.ts";

export type Frame = { x: number; y: number; widthIn: number; heightIn: number; rotation: number };
export type FrameHandles = { corners: Vec[]; topMid: Vec; knob: Vec };
export type HandleHit = "rotate" | "scale" | null;

/** Gap between the top edge and the rotation knob, in inches. */
export const ROTATE_GAP = 1.2;

/** Handle grab radius in inches: at least `minPx` screen pixels (fingers), at least 0.35″. */
export const grabRadius = (pxPerInch: number, minPx = 16) => Math.max(0.35, minPx / Math.max(1, pxPerInch));

export function frameHandles(f: Frame): FrameHandles {
  const w = f.widthIn / 2, h = f.heightIn / 2;
  const world = (c: Vec) => { const r = rotate(c, f.rotation); return { x: r.x + f.x, y: r.y + f.y }; };
  return {
    corners: [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }].map(world),
    topMid: world({ x: 0, y: -h }),
    knob: world({ x: 0, y: -h - ROTATE_GAP }),
  };
}

export function hitHandle(p: Vec, f: Frame, r: number): HandleHit {
  const h = frameHandles(f);
  const near = (a: Vec) => Math.hypot(a.x - p.x, a.y - p.y) <= r;
  return near(h.knob) ? "rotate" : h.corners.some(near) ? "scale" : null;
}

/** Point inside the (rotated) picture? */
export function insideFrame(p: Vec, f: Frame): boolean {
  const local = rotate({ x: p.x - f.x, y: p.y - f.y }, -f.rotation);
  return Math.abs(local.x) <= f.widthIn / 2 && Math.abs(local.y) <= f.heightIn / 2;
}

/** Rotation (degrees, clockwise on screen) that points the knob at `p`; Shift-like snapping to `snap` degrees. */
export function rotationToward(f: Frame, p: Vec, snap = 1): number {
  const deg = (Math.atan2(p.y - f.y, p.x - f.x) * 180) / Math.PI + 90;
  return (((Math.round(deg / snap) * snap) % 360) + 360) % 360;
}

/** Scale after dragging a corner from `start` to `p` (distance from the centre). */
export function scaleToward(f: Frame, startScale: number, start: Vec, p: Vec): number {
  const d0 = Math.max(0.1, Math.hypot(start.x - f.x, start.y - f.y));
  return (startScale * Math.hypot(p.x - f.x, p.y - f.y)) / d0;
}

/** Draws the frame: dashed outline, the rotation stalk and knob, square corner handles. */
export function drawFrame(ctx: CanvasRenderingContext2D, px: (i: number) => number, f: Frame, withHandles: boolean, handlePx = 7) {
  const h = frameHandles(f);
  ctx.save();
  ctx.strokeStyle = "#33d3e0";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  h.corners.forEach((c, i) => (i ? ctx.lineTo(px(c.x), px(c.y)) : ctx.moveTo(px(c.x), px(c.y))));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  if (withHandles) {
    ctx.beginPath();
    ctx.moveTo(px(h.topMid.x), px(h.topMid.y));
    ctx.lineTo(px(h.knob.x), px(h.knob.y));
    ctx.stroke();
    ctx.fillStyle = "#0d1322";
    ctx.beginPath();
    ctx.arc(px(h.knob.x), px(h.knob.y), handlePx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const c of h.corners) {
      ctx.fillRect(px(c.x) - handlePx, px(c.y) - handlePx, 2 * handlePx, 2 * handlePx);
      ctx.strokeRect(px(c.x) - handlePx, px(c.y) - handlePx, 2 * handlePx, 2 * handlePx);
    }
  }
  ctx.restore();
}

export type TerrainLike = { kind: "OBSTACLE" | "AREA"; points: Vec[]; height: number; envs: Env[] };

/** What the rules see under the pointer: the highest terrain there and its kinds / Environments. */
export function terrainInfoAt(p: Vec, terrain: TerrainLike[]): { height: number; obstacle: boolean; envs: Env[] } | null {
  const hits = terrain.filter((t) => pointInPolygon(p, t.points));
  if (hits.length === 0) return null;
  const envs = [...new Set(hits.flatMap((t) => t.envs))];
  return { height: Math.max(...hits.map((t) => t.height)), obstacle: hits.some((t) => t.kind === "OBSTACLE"), envs };
}

/** A small label near the pointer (screen pixels). */
export function drawTooltip(ctx: CanvasRenderingContext2D, px: (i: number) => number, at: Vec, text: string) {
  ctx.save();
  ctx.font = `600 ${Math.max(11, px(0.36))}px ui-sans-serif, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 12, h = Math.max(18, px(0.6));
  let x = px(at.x) + 14, y = px(at.y) - h - 8;
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  if (x + w > cw) x = px(at.x) - w - 14;
  if (y < 0) y = px(at.y) + 14;
  if (y + h > ch) y = ch - h;
  ctx.fillStyle = "rgba(6,19,32,.92)";
  ctx.strokeStyle = "rgba(51,211,224,.8)";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#e6f6f8";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 6, y + h / 2);
  ctx.restore();
}
