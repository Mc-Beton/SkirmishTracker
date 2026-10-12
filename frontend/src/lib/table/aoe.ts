/**
 * Templates (AoE), Cover and Awareness for the online table – hints for the players, computed in the browser
 * (the server stores where a template lies, the players resolve the Attack).
 *
 * Rules (Core Rules v1.6 p.25–26, 54 + errata APR 2026):
 * - Circular S/L (70 / 120 mm): affects every model whose hitbox is at least partly under it or touches it,
 *   only if the centre of the template has LoS to the model; the main target must be fully covered.
 * - Spray S/L (213 / 260 mm long): narrow end in base contact with the attacker; affected models need LoS
 *   from the attacker. The drawn teardrop ends in a circle 40% of its length across (measured from the rulebook
 *   picture – confirm with the physical templates).
 * - Cover vs Ranged Attacks: Small/Medium/Large model within 1" of scenery taller than its base that partly hides
 *   it from the attacker. Heavy (-4): the scenery is taller and wider than the model; Light (-2) otherwise;
 *   Crouched gives at least Light; Flying never benefits.
 */
import {
  type Piece, type Table, type Terrain, type Vec, MM, add, dist, distPointPolygon, fromAngle, lineOfSight, mul,
  pieceBox, rayBlocked, sub,
} from "./geometry.ts";

export type TemplateKind = "CIRCLE_S" | "CIRCLE_L" | "SPRAY_S" | "SPRAY_L";
export const TEMPLATE_KINDS: TemplateKind[] = ["CIRCLE_S", "CIRCLE_L", "SPRAY_S", "SPRAY_L"];

/** Placed template: circles centred at (x, y); sprays start at (x, y) and point along `rotation`. */
export type PlacedTemplate = { id: string; kind: TemplateKind; x: number; y: number; rotation: number; modelId: string | null };

const SIZE_MM: Record<TemplateKind, number> = { CIRCLE_S: 70, CIRCLE_L: 120, SPRAY_S: 213, SPRAY_L: 260 };
export const SPRAY_WIDTH_RATIO = 0.4;
const SPRAY_TIP_MM = 5;

export const isSpray = (k: TemplateKind) => k.startsWith("SPRAY");

/** Template outline as a polygon (inches). */
export function templatePolygon(t: PlacedTemplate): Vec[] {
  const o = { x: t.x, y: t.y };
  if (!isSpray(t.kind)) {
    const r = (SIZE_MM[t.kind] * MM) / 2;
    return Array.from({ length: 48 }, (_, i) => add(o, mul(fromAngle((360 * i) / 48), r)));
  }
  const len = SIZE_MM[t.kind] * MM;
  const rn = SPRAY_TIP_MM * MM, rw = (len * SPRAY_WIDTH_RATIO) / 2;
  const d = fromAngle(t.rotation);
  const cn = add(o, mul(d, rn)), cw = add(o, mul(d, len - rw));
  const between = len - rw - rn;
  // half-angle of the outer tangent lines between the two circles
  const alpha = Math.acos(Math.max(-1, Math.min(1, (rw - rn) / between)));
  const base = t.rotation;
  const pts: Vec[] = [];
  const toDeg = (a: number) => (a * 180) / Math.PI;
  // wide end arc (around the far side), then narrow end arc (around the attacker side)
  for (let i = 0; i <= 24; i++) {
    const a = base - toDeg(alpha) + ((2 * toDeg(alpha)) * i) / 24;
    pts.push(add(cw, mul(fromAngle(a), rw)));
  }
  for (let i = 0; i <= 12; i++) {
    const a = base + toDeg(alpha) + ((360 - 2 * toDeg(alpha)) * i) / 12;
    pts.push(add(cn, mul(fromAngle(a), rn)));
  }
  return pts;
}

/** Narrow end of a spray in base contact with the attacker, pointing at `toward`. */
export function sprayFrom(attacker: Piece, toward: Vec): { x: number; y: number; rotation: number } {
  const dir = sub(toward, attacker.pos);
  const rot = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  const start = add(attacker.pos, mul(fromAngle(rot), pieceBox(attacker).r));
  return { x: start.x, y: start.y, rotation: rot };
}

export type TemplateHit = { id: string; covered: "FULL" | "PARTIAL"; los: boolean };

/** Models touched by a template and whether they can be affected (LoS from the centre or the attacker). */
export function templateHits(table: Table, t: PlacedTemplate): TemplateHit[] {
  const poly = templatePolygon(t);
  const out: TemplateHit[] = [];
  for (const p of table.pieces) {
    if (p.id === t.modelId || p.states.includes("DEAD")) continue; // the user does not suffer its own Attack
    const r = pieceBox(p).r;
    if (distPointPolygon(p.pos, poly) > r + 1e-6) continue;
    const full = Array.from({ length: 16 }, (_, i) => add(p.pos, mul(fromAngle((360 * i) / 16), r)))
      .every((q) => distPointPolygon(q, poly) === 0);
    let los: boolean;
    if (isSpray(t.kind) && t.modelId && table.pieces.some((x) => x.id === t.modelId)) {
      los = lineOfSight(table, t.modelId, p.id, { moving: true }).visible;
    } else {
      // circle: from its centre; a spray without its attacker on the table: from its narrow end
      los = pointSees(table, { x: t.x, y: t.y }, p, [t.modelId ?? ""]);
    }
    out.push({ id: p.id, covered: full ? "FULL" : "PARTIAL", los });
  }
  return out;
}

/** LoS from a point on the field (template centre) to a model: rays to its base at two heights. */
export function pointSees(table: Table, from: Vec, target: Piece, ignore: string[] = []): boolean {
  const box = pieceBox(target);
  // the model the template is centred on does not hide its neighbours
  const under = table.pieces.filter((p) => dist(p.pos, from) < pieceBox(p).r).map((p) => p.id);
  ignore = [...ignore, ...under];
  const zFrom = Math.max(0.5, box.h * 0.5);
  const targets = [target.pos, ...Array.from({ length: 12 }, (_, i) => add(target.pos, mul(fromAngle(30 * i), box.r * 0.98)))];
  for (const b of targets) {
    for (const fb of [0.95, 0.5]) {
      if (!rayBlocked(table, from, zFrom, b, box.h * fb, [target.id, ...ignore])) return true;
    }
  }
  return false;
}

export type Cover = "NONE" | "LIGHT" | "HEAVY";
export const COVER_MODIFIER: Record<Cover, number> = { NONE: 0, LIGHT: -2, HEAVY: -4 };

/** Cover of `targetId` against a Ranged Attack from `attackerId` (p.54). */
export function coverAgainst(table: Table, attackerId: string, targetId: string): { cover: Cover; terrainId: string | null } {
  const attacker = table.pieces.find((p) => p.id === attackerId);
  const target = table.pieces.find((p) => p.id === targetId);
  if (!attacker || !target || target.states.includes("FLYING")) return { cover: "NONE", terrainId: null };
  let best: { cover: Cover; terrainId: string | null } = target.states.includes("CROUCHED")
    ? { cover: "LIGHT", terrainId: null }
    : { cover: "NONE", terrainId: null };
  if (!["SMALL", "MEDIUM", "LARGE"].includes(target.size)) return best;
  const tb = pieceBox(target), ab = pieceBox(attacker);
  const near = table.terrain.filter((t) => t.height > 4 * MM && distPointPolygon(target.pos, t.points) <= tb.r + 1 + 1e-6);
  const axis = sub(target.pos, attacker.pos);
  const len = Math.hypot(axis.x, axis.y) || 1;
  const perp = { x: -axis.y / len, y: axis.x / len };
  for (const t of near) {
    if (!obscures(table, attacker, target, t, ab.h)) continue;
    const proj = t.points.map((p) => p.x * perp.x + p.y * perp.y);
    const width = Math.max(...proj) - Math.min(...proj);
    const heavy = t.height >= tb.h && width >= tb.r * 2;
    const c: Cover = heavy ? "HEAVY" : "LIGHT";
    if (c === "HEAVY" || best.cover === "NONE") best = { cover: c, terrainId: t.id };
    if (c === "HEAVY") break;
  }
  return best;
}

/** At least one sight line from the attacker to the target passes through this piece of scenery below its height. */
function obscures(table: Table, attacker: Piece, target: Piece, t: Terrain, attackerH: number): boolean {
  const tb = pieceBox(target);
  const only: Table = { ...table, terrain: [t], pieces: [] };
  const targets = [target.pos, ...Array.from({ length: 12 }, (_, i) => add(target.pos, mul(fromAngle(30 * i), tb.r * 0.98)))];
  for (const b of targets) {
    for (const fb of [0.95, 0.5]) {
      if (rayBlocked(only, attacker.pos, attackerH * 0.95, b, tb.h * fb, [])) return true;
    }
  }
  return false;
}

/** Awareness: radius AG inches from the edge of the base (p.22). */
export const awarenessRadius = (p: Piece) => pieceBox(p).r + p.ag;

/** Distance between the closest points of two hitboxes, or from a model to a point. */
export function measure(a: Piece | Vec, b: Piece | Vec): number {
  const ra = "id" in a ? pieceBox(a).r : 0, rb = "id" in b ? pieceBox(b).r : 0;
  const pa = "id" in a ? a.pos : a, pb = "id" in b ? b.pos : b;
  return Math.max(0, dist(pa, pb) - ra - rb);
}
