import { baseHeight, baseRadius, dist, pointInPolygon, verticalGap } from './geometry.ts';
import { hasTrait, profileOf } from './stats.ts';
import type { Model, Pt, TableState } from './types.ts';

// Line of sight, Cover and Engaged. The table is treated as 2.5D: every figure is a cylinder (base x Hitbox
// height) and every obstacle a prism (footprint x height). A sight line runs from the top of one Hitbox to
// the top of the other, which is the most generous line the rules allow.

const EPS = 1e-6;
const LOW = 0.12; // Hitbox of a Crouched, Incapacitated or Dead model: just its base

export const hitboxHeight = (m: Model): number =>
  m.states.includes('Crouched') || m.states.includes('Incapacitated') || m.states.includes('Dead') ? LOW : baseHeight(m.size);


/** Stretches of the segment a→b (as fractions 0..1) that lie inside the polygon. */
function insidePolygon(a: Pt, b: Pt, poly: Pt[]): [number, number][] {
  const ts = [0, 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j]!;
    const q = poly[i]!;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < EPS) continue;
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den;
    const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]!;
    const t1 = ts[i + 1]!;
    if (t1 - t0 < EPS) continue;
    const mid = (t0 + t1) / 2;
    if (pointInPolygon({ x: a.x + dx * mid, y: a.y + dy * mid }, poly)) out.push([t0, t1]);
  }
  return out;
}

/** Stretch of the segment a→b inside a circle, or null. */
function insideCircle(a: Pt, b: Pt, c: Pt, r: number): [number, number] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - c.x;
  const fy = a.y - c.y;
  const A = dx * dx + dy * dy;
  if (A < EPS) return null;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  const disc = B * B - 4 * A * C;
  if (disc <= EPS) return null;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - s) / (2 * A));
  const t1 = Math.min(1, (-B + s) / (2 * A));
  return t1 - t0 > EPS ? [t0, t1] : null;
}

function distToPolygon(p: Pt, r: number, poly: Pt[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return Math.max(0, best - r);
}

/** Centre and the two side points of a base, as seen from `other`. */
function edgePoints(m: Model, other: Pt): Pt[] {
  const d = dist(m, other) || 1;
  const nx = -(other.y - m.y) / d;
  const ny = (other.x - m.x) / d;
  const r = baseRadius(m.size) * 0.95;
  return [{ x: m.x, y: m.y }, { x: m.x + nx * r, y: m.y + ny * r }, { x: m.x - nx * r, y: m.y - ny * r }];
}

export interface Sight {
  /** The viewer can draw line of sight to the target. */
  los: boolean;
  /** Why not, when it cannot. */
  reason: '' | 'blinded' | 'behind' | 'blocked' | 'forest';
  /** Cover modifier for a Ranged Attack against the target: 0, -2 (Light) or -4 (Heavy). */
  cover: 0 | -2 | -4;
  /** The line crosses a Forest: Ranged Attacks suffer -3. */
  forest: boolean;
}

/** Vigilance and Flying models have no Back arc. */
export const seesAllAround = (m: Model): boolean => hasTrait(m, 'Vigilance') || m.states.includes('Flying') || m.states.includes('Shrouded');

/** Is the target at least partly inside the viewer's Front arc (180°)? Vigilance and Flying see all around. */
export function inFrontArc(viewer: Model, target: Model): boolean {
  if (seesAllAround(viewer)) return true;
  const a = (viewer.facing * Math.PI) / 180;
  const fx = Math.sin(a);
  const fy = -Math.cos(a);
  return (target.x - viewer.x) * fx + (target.y - viewer.y) * fy >= -baseRadius(target.size) - EPS;
}

export function sight(state: TableState, viewer: Model, target: Model): Sight {
  const none = (reason: Sight['reason']): Sight => ({ los: false, reason, cover: 0, forest: false });
  if (viewer.id === target.id) return { los: true, reason: '', cover: 0, forest: false };
  if (viewer.states.includes('Blinded')) return none('blinded');
  const flying = viewer.states.includes('Flying') || target.states.includes('Flying');
  if (!flying && !inFrontArc(viewer, target)) return none('behind');

  // "LoS cannot be drawn through two or more Forest areas."
  const forests = state.terrain.filter((t) => t.env === 'forest' && insidePolygon(viewer, target, t.shape).length > 0);
  const throughForest = forests.length > 0;
  if (!flying && forests.length >= 2) return none('forest');
  if (flying) return { los: true, reason: '', cover: 0, forest: throughForest };

  // Heights above the table: a model standing on scenery sees and is seen from higher up.
  const zA = (viewer.z ?? 0) + hitboxHeight(viewer);
  const zB = (target.z ?? 0) + hitboxHeight(target);
  const footB = target.z ?? 0;
  const targetR = baseRadius(target.size);
  const obstacles = state.terrain.filter((t) => t.kind === 'obstacle');
  const others = state.models.filter((m) => m.id !== viewer.id && m.id !== target.id && hitboxHeight(m) > LOW + EPS);

  let clear = 0;
  let coverHeight = 0; // tallest scenery near the target that hides part of it
  for (const a of edgePoints(viewer, target)) {
    for (const b of edgePoints(target, viewer)) {
      // High line: top of the viewer to the top of the target. Low line: to the foot of the target.
      // Something exactly as tall as the line still blocks it (a model hides a model of its own size).
      const under = (t0: number, t1: number, h: number) => Math.min(zA + (zB - zA) * t0, zA + (zB - zA) * t1) <= h + EPS;
      const underLow = (t0: number, t1: number, h: number) => Math.min(zA + (footB - zA) * t0, zA + (footB - zA) * t1) < h - EPS;
      let blocked = false;
      for (const o of obstacles) {
        const inside = insidePolygon(a, b, o.shape);
        if (inside.length === 0) continue;
        if (inside.some(([t0, t1]) => under(t0, t1, o.height))) blocked = true;
        // Scenery within 1" of the target that hides at least part of it gives Cover.
        if (inside.some(([t0, t1]) => underLow(t0, t1, o.height)) && distToPolygon(target, targetR, o.shape) <= 1 + EPS) {
          coverHeight = Math.max(coverHeight, o.height);
        }
      }
      if (!blocked) {
        for (const m of others) {
          const hit = insideCircle(a, b, m, baseRadius(m.size));
          if (hit && under(hit[0], hit[1], (m.z ?? 0) + hitboxHeight(m))) {
            blocked = true;
            break;
          }
        }
      }
      if (!blocked) clear++;
    }
  }
  if (clear === 0) return none('blocked');

  let cover: Sight['cover'] = 0;
  const small = target.size === 'small' || target.size === 'medium' || target.size === 'large';
  if (small && coverHeight > footB + EPS) cover = coverHeight >= zB - EPS ? -4 : -2;
  if (cover === 0 && target.states.includes('Crouched')) cover = -2;
  return { los: true, reason: '', cover, forest: throughForest };
}

export const hasLos = (state: TableState, viewer: Model, target: Model): boolean => sight(state, viewer, target).los;

/** Reach of the model's melee weapon in inches (the first Melee weapon on its card; unarmed = 0). */
export function meleeReach(m: Model): number {
  const w = profileOf(m).weapons.find((x) => x.type.startsWith('Melee') && /^\d+$/.test(x.rch));
  return w ? Number(w.rch) : 0;
}

const cannotEngage = (m: Model): boolean => ['Dead', 'Incapacitated', 'Crouched', 'Flying'].some((s) => m.states.includes(s as never));

/** Enemies that keep this model Engaged: it stands within their melee Reach and line of sight. */
export function engagers(state: TableState, m: Model): Model[] {
  // Everflowing (Water Elemental) and Incorporeal models cannot become Engaged.
  if (m.states.includes('Dead') || m.states.includes('Incapacitated') || m.states.includes('Flying') || hasTrait(m, 'Everflowing')) return [];
  return state.models.filter((e) => {
    if (e.side === m.side || cannotEngage(e)) return false;
    const gap = Math.hypot(Math.max(0, dist(e, m) - baseRadius(e.size) - baseRadius(m.size)), verticalGap(e, m));
    return gap <= meleeReach(e) + 0.06 && hasLos(state, e, m);
  });
}
