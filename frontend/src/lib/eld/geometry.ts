import type { BaseSize, Model, Pt, TableState } from './types.ts';

/** Hitbox = cylinder: base diameter x height, in millimetres. */
export const HITBOX_MM: Record<BaseSize, { d: number; h: number }> = {
  small: { d: 25, h: 25 },
  medium: { d: 32, h: 45 },
  large: { d: 40, h: 45 },
  huge: { d: 50, h: 50 },
  gigantic: { d: 60, h: 60 },
  colossal: { d: 80, h: 80 },
  epic: { d: 100, h: 100 },
};

const INCH = 25.4;
const EPS = 1e-6;

export const baseRadius = (size: BaseSize): number => HITBOX_MM[size].d / INCH / 2;
export const baseHeight = (size: BaseSize): number => HITBOX_MM[size].h / INCH;

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

// ---- height ----
// Scenery tops are surfaces a model can stand on. A model's `z` is the height of its base (0 = the table).

/** Height of the surface at a point: the top of the highest piece of scenery whose footprint contains it, or 0. */
export function surfaceAt(state: Pick<TableState, 'terrain'>, p: Pt): number {
  let z = 0;
  for (const t of state.terrain) if (t.kind === 'obstacle' && t.height > z && pointInPolygon(p, t.shape)) z = t.height;
  return z;
}

/** How close (inches, from the centre of the base) a model has to pass a Ladder to use it. */
export const LADDER_REACH = 1;

/** A Ladder up a piece of this height within reach of the point. */
export function ladderAt(state: Pick<TableState, 'terrain'>, p: Pt, top: number): Pt | null {
  for (const t of state.terrain) {
    if (t.kind !== 'obstacle' || Math.abs(t.height - top) > 0.01) continue;
    for (const l of t.ladders ?? []) if (dist(l, p) <= LADDER_REACH + 1e-6) return l;
  }
  return null;
}

/** Surface heights along the straight line a→b, every `step` inches (both ends included). */
export function heightProfile(state: Pick<TableState, 'terrain'>, a: Pt, b: Pt, step = 0.1): number[] {
  const n = Math.max(1, Math.ceil(dist(a, b) / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(surfaceAt(state, { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
  return out;
}

/** Vertical space between two Hitboxes (0 when they overlap in height). */
export function verticalGap(a: Pick<Model, 'size'> & { z?: number }, b: Pick<Model, 'size'> & { z?: number }): number {
  const za = a.z ?? 0;
  const zb = b.z ?? 0;
  return Math.max(0, zb - (za + baseHeight(a.size)), za - (zb + baseHeight(b.size)));
}
export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when a circle overlaps a polygon (touching edges is allowed). */
export function circleHitsPolygon(c: Pt, r: number, poly: Pt[]): boolean {
  if (pointInPolygon(c, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (distToSegment(c, poly[i]!, poly[j]!) < r - EPS) return true;
  }
  return false;
}

/** Distance between the closest points of two bases (0 = base contact). */
export function edgeDistance(a: Model, b: Model): number {
  return Math.max(0, dist(a, b) - baseRadius(a.size) - baseRadius(b.size));
}

export type PlacementProblem = 'OFF_TABLE' | 'MODEL' | 'TERRAIN';
export type PathProblem = 'PATH_TERRAIN' | 'PATH_ENEMY';

/** Can a base of this size stand at (x, y)? `ignoreId` = the model being moved. */
export function checkPlacement(
  state: TableState,
  size: BaseSize,
  x: number,
  y: number,
  ignoreId?: string,
  /** Allow standing on top of scenery (moves); otherwise scenery is solid (deployment, summoning). */
  tops = false,
): PlacementProblem | null {
  const r = baseRadius(size);
  if (x < r - EPS || y < r - EPS || x > state.width - r + EPS || y > state.height - r + EPS) return 'OFF_TABLE';
  const z = tops ? surfaceAt(state, { x, y }) : 0;
  const h = HITBOX_MM[size].h / INCH;
  for (const m of state.models) {
    if (m.id === ignoreId) continue;
    // Models at different heights (one on a roof, one below) do not get in each other's way.
    const mz = m.z ?? 0;
    if (mz >= z + h - EPS || z >= mz + baseHeight(m.size) - EPS) continue;
    // Positions are stored to 1/100 inch, so bases in contact may overlap by a hair.
    if (dist(m, { x, y }) < r + baseRadius(m.size) - 0.02) return 'MODEL';
  }
  for (const t of state.terrain) {
    if (t.kind !== 'obstacle' || !circleHitsPolygon({ x, y }, r, t.shape)) continue;
    // On top of scenery: only taller scenery next to it is in the way.
    if (tops && t.height <= z + EPS) continue;
    return 'TERRAIN';
  }
  return null;
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** Shortest distance between two line segments. */
export function segmentDistance(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(distToSegment(a, c, d), distToSegment(b, c, d), distToSegment(c, a, b), distToSegment(d, a, b));
}

/** True when a circle of radius r sliding from a to b touches the inside of the polygon. */
export function sweepHitsPolygon(a: Pt, b: Pt, r: number, poly: Pt[]): boolean {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (segmentDistance(a, b, poly[i]!, poly[j]!) < r - EPS) return true;
  }
  return false;
}

/**
 * Can this model travel in a straight line from where it stands to `to`?
 * Scenery taller than the model's Hitbox blocks it, and so do enemy models (allies let it pass).
 * A Flying model moves over both.
 */
export function checkPath(state: TableState, model: Model, to: Pt, trample = false): PathProblem | null {
  if (model.states.includes('Flying')) return null;
  const r = baseRadius(model.size);
  const tall = baseHeight(model.size);
  for (const t of state.terrain) {
    if (t.kind === 'obstacle' && t.height > tall + EPS && sweepHitsPolygon(model, to, r, t.shape)) return 'PATH_TERRAIN';
  }
  for (const m of state.models) {
    if (m.side === model.side || m.states.includes('Dead')) continue;
    // Trample: it runs through smaller models.
    if (trample && HITBOX_MM[m.size].d < HITBOX_MM[model.size].d) continue;
    if (distToSegment(m, model, to) < r + baseRadius(m.size) - 0.02) return 'PATH_ENEMY';
  }
  return null;
}

/** Everflowing (Water Elemental): 4" around it is a Shallow Aquatic Environment – for everyone else. */
export const EVERFLOWING_RADIUS = 4;
const EVERFLOWING = new Set(['sum-water-elemental']);
const everflowing = (state: TableState, model: Pick<Model, 'id'>): Model[] => state.models.filter((o) => o.id !== model.id && EVERFLOWING.has(o.profileId ?? '') && o.hp > 0 && !o.states.includes('Dead'));

/** Does the model stand in a Shallow Aquatic Environment (a pond, a Spell's area, around a Water Elemental)? */
export function inShallowWater(state: TableState, model: Model): boolean {
  if (model.states.includes('Flying') || (model.z ?? 0) > 0.01) return false;
  return (
    state.terrain.some((t) => t.env === 'water' && (t.only === undefined || t.only === model.side) && pointInPolygon(model, t.shape)) ||
    everflowing(state, model).some((o) => dist(o, model) <= EVERFLOWING_RADIUS + baseRadius(o.size))
  );
}

/**
 * Speed spent on a straight move. Water costs double (2 Speed per inch) unless the model is Flying.
 * Measured in small steps so the server and the preview always agree.
 */
export function moveCost(state: TableState, model: Model, to: Pt): number {
  const length = dist(model, to);
  const water = state.terrain.filter((t) => t.env === 'water' && (t.only === undefined || t.only === model.side));
  const springs = everflowing(state, model);
  if (length === 0 || (water.length === 0 && springs.length === 0) || model.states.includes('Flying')) return round2(length);
  const steps = Math.max(1, Math.ceil(length / 0.05));
  let cost = 0;
  for (let i = 0; i < steps; i++) {
    const f = (i + 0.5) / steps;
    const p = { x: model.x + (to.x - model.x) * f, y: model.y + (to.y - model.y) * f };
    cost += (length / steps) * (water.some((t) => pointInPolygon(p, t.shape)) || springs.some((o) => dist(o, p) <= EVERFLOWING_RADIUS + baseRadius(o.size)) ? 2 : 1);
  }
  return round2(cost);
}

/** Is a base of this size fully inside its side's Deployment Zone? Blue (0) deploys at the bottom edge. */
export function inDeployZone(state: TableState, side: 0 | 1, size: BaseSize, y: number, depth = state.deployDepth, x?: number): boolean {
  const r = baseRadius(size);
  // WarBracket: corner deployment – a quarter circle around the side's corner (Blue bottom-left, Red top-right).
  if (state.deploy === 'corner' && x !== undefined) {
    const c = side === 0 ? { x: 0, y: state.height } : { x: state.width, y: 0 };
    return Math.hypot(x - c.x, y - c.y) + r <= depth + EPS;
  }
  return side === 0 ? y - r >= state.height - depth - EPS : y + r <= depth + EPS;
}

// ---- shelves ----
// Beyond each player's table edge lies a shelf where the party stands before it is deployed. A quarter of it
// (the player's right-hand end) is out of the other player's sight.

export const SHELF = { gap: 1, depth: 4.6, hidden: 0.25 } as const;

/** The shelf of a side as a rectangle in table coordinates (Blue's lies beyond y = height, Red's before y = 0). */
export function shelfRect(state: Pick<TableState, 'width' | 'height'>, side: 0 | 1): { x0: number; x1: number; y0: number; y1: number } {
  return side === 0 ? { x0: 0, x1: state.width, y0: state.height + SHELF.gap, y1: state.height + SHELF.gap + SHELF.depth } : { x0: 0, x1: state.width, y0: -SHELF.gap - SHELF.depth, y1: -SHELF.gap };
}

/** Whose shelf a point lies on (anything beyond a table edge counts), or null on the table. */
export const onShelf = (state: Pick<TableState, 'height'>, p: Pt): 0 | 1 | null => (p.y > state.height + 1e-6 ? 0 : p.y < -1e-6 ? 1 : null);

/** The part of a shelf the other player cannot see: the owner's right-hand quarter. */
export const shelfHidden = (state: Pick<TableState, 'width' | 'height'>, p: Pt): boolean => {
  const side = onShelf(state, p);
  return side === 0 ? p.x >= state.width * (1 - SHELF.hidden) : side === 1 ? p.x <= state.width * SHELF.hidden : false;
};

/** Can a base stand at this spot of the shelf? */
export function shelfPlacement(state: TableState, size: BaseSize, x: number, y: number, side: 0 | 1, ignoreId?: string): PlacementProblem | null {
  const r = baseRadius(size);
  const box = shelfRect(state, side);
  if (x < box.x0 + r - EPS || x > box.x1 - r + EPS || y < box.y0 + r - EPS || y > box.y1 - r + EPS) return 'OFF_TABLE';
  return state.models.some((m) => m.id !== ignoreId && onShelf(state, m) === side && dist(m, { x, y }) < r + baseRadius(m.size) - 0.02) ? 'MODEL' : null;
}

/** First free spot for a base on the visible part of a side's shelf, from the far end of the hidden part. */
export function shelfSpot(state: TableState, side: 0 | 1, size: BaseSize): Pt | null {
  const box = shelfRect(state, side);
  const r = baseRadius(size);
  const step = Math.max(2.4, 2 * r + 0.5);
  for (const row of [0, 1]) {
    // The row nearest the table first.
    const y = side === 0 ? box.y0 + r + 0.2 + row * 2.3 : box.y1 - r - 0.2 - row * 2.3;
    // From the middle of the visible part outwards.
    const span = state.width * (1 - SHELF.hidden);
    const mid = side === 0 ? span / 2 : state.width - span / 2;
    for (let i = 0; Math.ceil(i / 2) * step + r + 0.4 < span / 2; i++) {
      const x = mid + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * step;
      if (!shelfPlacement(state, size, x, y, side)) return { x: round2(x), y: round2(y) };
    }
  }
  return null;
}

/** Facing (degrees, 0 = towards -y, clockwise) that looks from `from` to `to`. */
export function facingTo(from: Pt, to: Pt): number {
  const deg = (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
  return normDeg(deg);
}

export const normDeg = (d: number): number => ((Math.round(d) % 360) + 360) % 360;

// ---- shape helpers for building maps ----

export function rect(cx: number, cy: number, w: number, h: number, rotDeg = 0): Pt[] {
  const a = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([px, py]) => ({ x: round2(cx + px! * cos - py! * sin), y: round2(cy + px! * sin + py! * cos) }));
}

/** A point given relative to a rectangle's centre, turned with it (for ladders on a wall). */
export function turned(cx: number, cy: number, dx: number, dy: number, rotDeg = 0): Pt {
  const a = (rotDeg * Math.PI) / 180;
  return { x: round2(cx + dx * Math.cos(a) - dy * Math.sin(a)), y: round2(cy + dx * Math.sin(a) + dy * Math.cos(a)) };
}

export function ngon(cx: number, cy: number, r: number, n: number, rotDeg = 0, squash = 1): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((rotDeg + (360 / n) * i) * Math.PI) / 180;
    out.push({ x: round2(cx + Math.cos(a) * r), y: round2(cy + Math.sin(a) * r * squash) });
  }
  return out;
}
