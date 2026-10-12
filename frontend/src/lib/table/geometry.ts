/**
 * Geometry for the WarBracket online table (Eldfall Chronicles skirmish, 1v1).
 *
 * Plain TypeScript, no framework imports: the same file runs in the browser (preview while dragging)
 * and in `node --test`. The backend re-implements the movement checks in Java and both sides are
 * tested against the same vectors (docs/online-play.md, "Parity").
 *
 * Units: inches on a top-down plan, origin in the top-left corner of the field, y grows downwards.
 * Heights (z) are inches above the field surface. Terrain is "2.5D": a plan polygon with one height.
 *
 * Rules (Core Rules v1.6 + errata APR 2026):
 * - distance between models = between the closest points of their hitboxes; movement is measured from
 *   the same point of the base, so we move base centres and measure the centre path (p.18–20);
 * - hitbox = cylinder, base diameter x height by Size (p.9); Crouched: hitbox = base volume (p.59);
 * - a model crosses scenery not taller than its hitbox for free; taller scenery needs Climb/Jump (p.20, 49);
 * - allies can be passed through, enemies cannot; Movement ends on base contact with an enemy (p.20);
 * - Difficult / Mountainous / Shallow / Deep: 2" of movement per 1" (Environments errata);
 *   Unscalable: only Climbing; Survival (X), Flicker and Flying ignore the listed effects;
 * - `Piece.spd` / `Piece.ag` are effective values: the server applies State modifiers (Crouched, Flying,
 *   Slowed, Crippled…) before the geometry sees them;
 * - LoS: unobstructed straight line between the hitboxes, only from the Front arc (180°) unless the
 *   model moves, has Vigilance or is Flying; models (also allies) and scenery obscure LoS;
 *   no LoS through two or more Forest areas; Flying always sees and is seen (p.20–21, 62 + errata).
 */

// ---------- vectors ----------

export type Vec = { x: number; y: number };

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const fromAngle = (deg: number): Vec => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
export const angleOf = (a: Vec): number => (Math.atan2(a.y, a.x) * 180) / Math.PI;

const EPS = 1e-9;

// ---------- sizes ----------

export type Size = "SMALL" | "MEDIUM" | "LARGE" | "HUGE" | "GIGANTIC" | "COLOSSAL" | "EPIC";

/** Base diameter x hitbox height in mm (rulebook p.9, errata: Epic 85+ mm, we use 100). */
export const SIZE_MM: Record<Size, { base: number; height: number }> = {
  SMALL: { base: 25, height: 25 },
  MEDIUM: { base: 32, height: 45 },
  LARGE: { base: 40, height: 45 },
  HUGE: { base: 50, height: 50 },
  GIGANTIC: { base: 60, height: 60 },
  COLOSSAL: { base: 80, height: 80 },
  EPIC: { base: 100, height: 100 },
};

export const MM = 1 / 25.4;
/** A Crouched hitbox is the base itself; bases are ~4 mm thick. */
export const BASE_THICKNESS_IN = 4 * MM;

export type Hitbox = { r: number; h: number };

export function hitbox(size: Size, crouched = false): Hitbox {
  const s = SIZE_MM[size];
  return { r: (s.base * MM) / 2, h: crouched ? BASE_THICKNESS_IN : s.height * MM };
}

// ---------- terrain ----------

export type Env =
  | "AQUATIC_SHALLOW" | "AQUATIC_DEEP" | "DANGEROUS" | "DARK" | "DENSE" | "DIFFICULT" | "FOREST"
  | "FREEZING" | "HAZY" | "MANAGMATIC" | "MOUNTAINOUS" | "PROFANE_MIASMA" | "SACRED_GROUND"
  | "SCORCHING" | "SWAMP" | "TOXIC" | "UNSCALABLE";

/** Environments that cost 2" of movement per 1". */
export const SLOW_ENVS: readonly Env[] = ["DIFFICULT", "MOUNTAINOUS", "AQUATIC_SHALLOW", "AQUATIC_DEEP"];

/**
 * OBSTACLE: solid scenery (rock, wall, ruin). Blocks movement of models shorter than `height`
 * and blocks LoS rays passing below `height`.
 * AREA: footprint of an Environment (forest, river, swamp). Walkable, height only matters for LoS
 * (a forest area can have height 0 – it then only applies the "two Forest areas" rule).
 */
export type Terrain = {
  id: string;
  kind: "OBSTACLE" | "AREA";
  points: Vec[]; // simple polygon, any orientation
  height: number;
  envs: Env[];
};

// ---------- pieces (models on the table) ----------

export type Side = "A" | "B";

export type Piece = {
  id: string;
  side: Side;
  pos: Vec;
  facing: number; // degrees, 0 = +x (east), 90 = +y (south / down the screen)
  size: Size;
  spd: number; // effective SPD
  /** Agility – radius of Awareness in inches (p.22). */
  ag: number;
  faction: string;
  /** Profile keywords, e.g. VIGILANCE, FLICKER, CLIMBING, SURVIVAL:DIFFICULT,FOREST */
  keywords: string[];
  states: string[]; // CROUCHED, FLYING, INCAPACITATED, DEAD, ...
};

export const has = (p: Piece, k: string) => p.keywords.includes(k);
export const inState = (p: Piece, s: string) => p.states.includes(s);
export const pieceBox = (p: Piece): Hitbox => hitbox(p.size, inState(p, "CROUCHED") || inState(p, "DEAD"));

/** Survival (X) lists the Environments a model ignores. */
export function survives(p: Piece, env: Env): boolean {
  const key = env === "AQUATIC_SHALLOW" || env === "AQUATIC_DEEP" ? "AQUATIC" : env;
  return p.keywords.some((k) => k.startsWith("SURVIVAL:") && k.slice(9).split(",").includes(key));
}

/** Does this model pay double for moving inside `env`? */
export function isSlowedBy(p: Piece, env: Env): boolean {
  if (!SLOW_ENVS.includes(env)) return false;
  if (inState(p, "FLYING")) return false;
  if (env !== "AQUATIC_SHALLOW" && env !== "AQUATIC_DEEP" && has(p, "FLICKER")) return false;
  return !survives(p, env);
}

// ---------- polygon helpers ----------

export function pointInPolygon(pt: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distPointSegment(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, lerp(a, b, t));
}

function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const d1 = cross(sub(b, a), sub(c, a)), d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c)), d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function distSegmentSegment(a: Vec, b: Vec, c: Vec, d: Vec): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(distPointSegment(a, c, d), distPointSegment(b, c, d), distPointSegment(c, a, b), distPointSegment(d, a, b));
}

/** Distance from a point to a polygon (0 inside). */
export function distPointPolygon(p: Vec, poly: Vec[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) m = Math.min(m, distPointSegment(p, poly[j], poly[i]));
  return m;
}

/** Distance between a segment and a polygon (0 when they touch or overlap). */
export function distSegmentPolygon(a: Vec, b: Vec, poly: Vec[]): number {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return 0;
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) m = Math.min(m, distSegmentSegment(a, b, poly[j], poly[i]));
  return m;
}

/** Base (circle) at `c` with radius r is in contact with or partially within the polygon. */
export const circleTouchesPolygon = (c: Vec, r: number, poly: Vec[]) => distPointPolygon(c, poly) <= r + EPS;

/**
 * Parameter intervals [t0, t1] (0..1) where segment a→b lies inside the polygon.
 * Works for non-convex simple polygons.
 */
export function insideIntervals(a: Vec, b: Vec, poly: Vec[]): [number, number][] {
  const ts = [0, 1];
  const ab = sub(b, a);
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = poly[j], cd = sub(poly[i], c);
    const den = cross(ab, cd);
    if (Math.abs(den) < EPS) continue;
    const t = cross(sub(c, a), cd) / den;
    const u = cross(sub(c, a), ab) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < ts.length; k++) {
    const t0 = ts[k], t1 = ts[k + 1];
    if (t1 - t0 < EPS) continue;
    if (pointInPolygon(lerp(a, b, (t0 + t1) / 2), poly)) {
      const last = out[out.length - 1];
      if (last && Math.abs(last[1] - t0) < EPS) last[1] = t1;
      else out.push([t0, t1]);
    }
  }
  return out;
}

/** Interval where segment a→b is inside a circle (or null). */
export function circleInterval(a: Vec, b: Vec, c: Vec, r: number): [number, number] | null {
  const d = sub(b, a), f = sub(a, c);
  const A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - r * r;
  if (A < EPS) return C <= 0 ? [0, 1] : null;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return null;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - s) / (2 * A)), t1 = Math.min(1, (-B + s) / (2 * A));
  return t0 < t1 ? [t0, t1] : null;
}

// ---------- the table ----------

export type Table = {
  width: number; // 36
  height: number; // 36
  terrain: Terrain[];
  pieces: Piece[];
};

// ---------- movement ----------

export type MoveMode = "WALK" | "RUN";

export type MoveBlock =
  | { kind: "TERRAIN"; terrainId: string }
  | { kind: "UNSCALABLE"; terrainId: string }
  | { kind: "ENEMY"; pieceId: string }
  | { kind: "EDGE" }
  | { kind: "BUDGET" };

export type MovePlan = {
  /** Polyline of base centres actually reachable (starts at the piece position). */
  path: Vec[];
  /** Movement spent in inches (slowed stretches count double). */
  cost: number;
  /** Plain length of the reachable path in inches. */
  length: number;
  budget: number;
  /** Set when the requested route was cut short, with the reason. */
  stoppedBy: MoveBlock | null;
  /** Movement ended in base contact with this enemy (rule: Movement ends, model becomes Engaged). */
  engagedWith: string | null;
  /** The final position overlaps an ally – illegal end point (allies may only be passed through). */
  endsOnAlly: string | null;
};

/** `spd` is the effective SPD (State modifiers already applied by the server); Crouched may only Walk. */
export function moveBudget(p: Piece, mode: MoveMode): number {
  return mode === "RUN" && !inState(p, "CROUCHED") ? p.spd * 2 : p.spd;
}

/** Step used to integrate the movement cost through slow Environments. */
const COST_STEP = 0.05;

/**
 * Validate a requested route (waypoints of the base centre, without the start point).
 * Returns the reachable part, cost and why it stopped. Pure function: the server runs the same checks.
 */
export function planMove(table: Table, pieceId: string, waypoints: Vec[], mode: MoveMode, spent = 0): MovePlan {
  const p = table.pieces.find((x) => x.id === pieceId);
  if (!p) throw new Error("unknown piece " + pieceId);
  const box = pieceBox(p);
  // movement already used in this activation reduces what is left
  const budget = Math.max(0, moveBudget(p, mode) - spent);
  const flying = inState(p, "FLYING");
  const path: Vec[] = [p.pos];
  let cost = 0, length = 0;
  let stoppedBy: MoveBlock | null = null;
  let engagedWith: string | null = null;

  const enemies = table.pieces.filter((x) => x.side !== p.side && x.id !== p.id && !inState(x, "DEAD"));
  const slowAreas = table.terrain.filter((t) => t.envs.some((e) => isSlowedBy(p, e)));

  let cur = p.pos;
  outer: for (const target of waypoints) {
    // 1) hard blocks along the whole segment: find the first blocking parameter
    let tBlock = 1;
    let block: MoveBlock | null = null;

    // field edge: the base must stay on the table
    const inField = (q: Vec) => q.x - box.r >= -EPS && q.y - box.r >= -EPS && q.x + box.r <= table.width + EPS && q.y + box.r <= table.height + EPS;
    if (!inField(target)) {
      const t = firstFailure(cur, target, (q) => inField(q));
      if (t < tBlock) { tBlock = t; block = { kind: "EDGE" }; }
    }

    if (!flying) {
      for (const t of table.terrain) {
        const unscalable = t.envs.includes("UNSCALABLE") && !has(p, "CLIMBING") && !has(p, "FLICKER");
        const tooHigh = t.kind === "OBSTACLE" && t.height > box.h + EPS;
        if (!unscalable && !tooHigh) continue;
        if (distSegmentPolygon(cur, target, t.points) >= box.r) continue;
        const tt = firstFailure(cur, target, (q) => distPointPolygon(q, t.points) >= box.r - 1e-6);
        if (tt < tBlock) { tBlock = tt; block = unscalable ? { kind: "UNSCALABLE", terrainId: t.id } : { kind: "TERRAIN", terrainId: t.id }; }
      }
    }

    // enemies: movement ends on base contact (we stop exactly at contact)
    let contactEnemy: string | null = null;
    if (!flying) {
      for (const e of enemies) {
        const rr = box.r + pieceBox(e).r;
        if (dist(cur, e.pos) <= rr + 1e-6) continue; // already in contact: may move away
        const iv = circleInterval(cur, target, e.pos, rr);
        if (iv && iv[0] < tBlock) { tBlock = iv[0]; block = null; contactEnemy = e.id; }
      }
    }

    // 2) walk the free part, integrating cost, and stop on budget
    const segEnd = lerp(cur, target, tBlock);
    const segLen = dist(cur, segEnd);
    const steps = Math.max(1, Math.ceil(segLen / COST_STEP));
    let prev = cur;
    for (let i = 1; i <= steps; i++) {
      const q = lerp(cur, segEnd, i / steps);
      const mid = lerp(prev, q, 0.5);
      const stepLen = dist(prev, q);
      const slowed = slowAreas.some((t) => circleTouchesPolygon(mid, box.r, t.points));
      const stepCost = stepLen * (slowed ? 2 : 1);
      if (cost + stepCost > budget + 1e-6) {
        const frac = (budget - cost) / stepCost;
        const stop = lerp(prev, q, Math.max(0, frac));
        length += dist(prev, stop);
        cost = budget;
        path.push(stop);
        stoppedBy = { kind: "BUDGET" };
        contactEnemy = null;
        break outer;
      }
      cost += stepCost;
      length += stepLen;
      prev = q;
    }
    path.push(segEnd);
    cur = segEnd;
    if (contactEnemy) { engagedWith = contactEnemy; stoppedBy = { kind: "ENEMY", pieceId: contactEnemy }; break; }
    if (block) { stoppedBy = block; break; }
  }

  const end = path[path.length - 1];
  const ally = table.pieces.find((x) => x.side === p.side && x.id !== p.id && !inState(x, "DEAD") && dist(x.pos, end) < box.r + pieceBox(x).r - 1e-6);
  return { path: simplify(path), cost: round3(cost), length: round3(length), budget, stoppedBy, engagedWith, endsOnAlly: ally ? ally.id : null };
}

/** Largest t in [0,1] such that ok(lerp(a,b,s)) holds for all s ≤ t (bisection after a coarse scan). */
function firstFailure(a: Vec, b: Vec, ok: (q: Vec) => boolean): number {
  const n = Math.max(2, Math.ceil(dist(a, b) / 0.02));
  let lo = 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!ok(lerp(a, b, t))) {
      let hi = t;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (ok(lerp(a, b, m))) lo = m; else hi = m; }
      return lo;
    }
    lo = t;
  }
  return 1;
}

function simplify(path: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const q of path) if (!out.length || dist(out[out.length - 1], q) > 1e-6) out.push(q);
  return out;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Distance between two models = closest points of their hitboxes (plan view). */
export function modelDistance(a: Piece, b: Piece): number {
  return Math.max(0, dist(a.pos, b.pos) - pieceBox(a).r - pieceBox(b).r);
}

// ---------- line of sight ----------

export type LosResult = {
  targetId: string;
  visible: boolean;
  inFrontArc: boolean;
  /** Why not visible (first reason found). */
  reason: null | "BACK_ARC" | "BLOCKED" | "FOREST" | "DARK" | "BLINDED";
  /** One clear ray (plan view) to draw on the map. */
  ray: [Vec, Vec] | null;
};

export type LosOptions = {
  /** The observer is moving: 360° LoS (p.20). */
  moving?: boolean;
};

const ARC_SAMPLES = 9; // points on the observer front half-circle
const TARGET_SAMPLES = 12; // points around the target base
const Z_FRACTIONS = [0.95, 0.5];

/** Unit vector of a facing angle. */
export const facingVec = (p: Piece) => fromAngle(p.facing);

/** 360° LoS for Vigilance, Flying, Shrouded, Engaged-by and moving models. */
export function hasFullArc(p: Piece, opts: LosOptions = {}): boolean {
  return !!opts.moving || has(p, "VIGILANCE") || inState(p, "FLYING") || inState(p, "SHROUDED");
}

/** Does the target hitbox reach into the observer's front half-plane? */
export function targetInFrontArc(obs: Piece, target: Piece, opts: LosOptions = {}): boolean {
  if (hasFullArc(obs, opts)) return true;
  return dot(sub(target.pos, obs.pos), facingVec(obs)) + pieceBox(target).r >= -EPS;
}

function observerPoints(obs: Piece, fullArc: boolean): Vec[] {
  const { r } = pieceBox(obs);
  const pts: Vec[] = [obs.pos];
  const n = fullArc ? ARC_SAMPLES * 2 : ARC_SAMPLES;
  for (let i = 0; i < n; i++) {
    const a = fullArc ? (360 * i) / n : obs.facing - 90 + (180 * i) / (n - 1);
    pts.push(add(obs.pos, mul(fromAngle(a), r * 0.98)));
  }
  return pts;
}

function targetPoints(t: Piece): Vec[] {
  const { r } = pieceBox(t);
  const pts: Vec[] = [t.pos];
  for (let i = 0; i < TARGET_SAMPLES; i++) pts.push(add(t.pos, mul(fromAngle((360 * i) / TARGET_SAMPLES), r * 0.98)));
  return pts;
}

/**
 * Is the 3D segment (a, za) → (b, zb) blocked by scenery or by other models?
 * Returns "FOREST" when it crosses two or more Forest areas.
 */
export function rayBlocked(table: Table, a: Vec, za: number, b: Vec, zb: number, ignore: string[]): null | "BLOCKED" | "FOREST" {
  const zAt = (t: number) => za + (zb - za) * t;
  let forests = 0;
  for (const t of table.terrain) {
    const ivs = insideIntervals(a, b, t.points);
    if (!ivs.length) continue;
    if (t.envs.includes("FOREST")) forests++;
    if (t.height <= EPS) continue;
    // z is linear along the ray, so the lowest point of an interval is at one of its ends
    for (const [t0, t1] of ivs) if (Math.min(zAt(t0), zAt(t1)) < t.height - EPS) return "BLOCKED";
  }
  if (forests >= 2) return "FOREST";
  for (const p of table.pieces) {
    if (ignore.includes(p.id) || inState(p, "DEAD") || inState(p, "FLYING")) continue;
    const box = pieceBox(p);
    const iv = circleInterval(a, b, p.pos, box.r);
    if (iv && Math.min(zAt(iv[0]), zAt(iv[1])) < box.h - EPS) return "BLOCKED";
  }
  return null;
}

/** Line of Sight from `obsId` to `targetId` (p.20–21). */
export function lineOfSight(table: Table, obsId: string, targetId: string, opts: LosOptions = {}): LosResult {
  const obs = table.pieces.find((x) => x.id === obsId)!;
  const tgt = table.pieces.find((x) => x.id === targetId)!;
  const base: LosResult = { targetId, visible: false, inFrontArc: false, reason: null, ray: null };
  if (obsId === targetId) return { ...base, visible: true, inFrontArc: true };
  if (inState(obs, "BLINDED")) return { ...base, reason: "BLINDED" };

  const front = targetInFrontArc(obs, tgt, opts);
  base.inFrontArc = front;
  if (!front) return { ...base, reason: "BACK_ARC" };
  if (inState(obs, "FLYING") || inState(tgt, "FLYING")) {
    return { ...base, visible: true, ray: [obs.pos, tgt.pos] };
  }

  // Dark: LoS limited to Awareness (radius AG from the base edge); Coalition of Thenion is immune.
  const inDark = table.terrain.some((t) => t.envs.includes("DARK") && circleTouchesPolygon(obs.pos, pieceBox(obs).r, t.points));
  if (inDark && obs.faction !== "COALITION_OF_THENION" && !survives(obs, "DARK") && !inAwareness(obs, tgt)) {
    return { ...base, reason: "DARK" };
  }

  const ob = pieceBox(obs), tb = pieceBox(tgt);
  const full = hasFullArc(obs, opts);
  const fv = facingVec(obs);
  let reason: LosResult["reason"] = "BLOCKED";
  for (const a of observerPoints(obs, full)) {
    for (const b of targetPoints(tgt)) {
      // the ray must leave from the front section and point into the front half-plane
      if (!full && dot(sub(b, obs.pos), fv) < -EPS) continue;
      for (const fa of Z_FRACTIONS) {
        for (const fb of Z_FRACTIONS) {
          const r = rayBlocked(table, a, ob.h * fa, b, tb.h * fb, [obs.id, tgt.id]);
          if (!r) return { ...base, visible: true, ray: [a, b] };
          if (r === "FOREST") reason = "FOREST";
        }
      }
    }
  }
  return { ...base, reason };
}

/** LoS from one model to every other model: drives the red/green highlight on the map. */
export function visibleModels(table: Table, obsId: string, opts: LosOptions = {}): LosResult[] {
  return table.pieces.filter((p) => p.id !== obsId && !inState(p, "DEAD")).map((p) => lineOfSight(table, obsId, p.id, opts));
}

/**
 * Approximate visible area for drawing (plan view): rays from the base centre at eye height,
 * stopped by scenery at least as tall as the observer, by a second Forest area and by the field edge.
 * Only a picture – the per-model check above decides.
 */
export function visibilityPolygon(table: Table, obsId: string, opts: LosOptions = {}, stepDeg = 1): Vec[] {
  const obs = table.pieces.find((x) => x.id === obsId)!;
  const eye = pieceBox(obs).h;
  const full = hasFullArc(obs, opts);
  const from = full ? 0 : obs.facing - 90;
  const to = full ? 360 : obs.facing + 90;
  const far = Math.hypot(table.width, table.height);
  const pts: Vec[] = full ? [] : [obs.pos];
  const blockers = table.terrain.filter((t) => t.height >= eye - EPS || t.envs.includes("FOREST"));
  for (let a = from; a <= to + EPS; a += stepDeg) {
    const end = add(obs.pos, mul(fromAngle(a), far));
    let tMin = clipToField(obs.pos, end, table);
    const forestHits: number[] = [];
    for (const t of blockers) {
      const ivs = insideIntervals(obs.pos, end, t.points);
      if (!ivs.length) continue;
      if (t.height >= eye - EPS) tMin = Math.min(tMin, ivs[0][0]);
      if (t.envs.includes("FOREST")) forestHits.push(ivs[0][0]);
    }
    if (forestHits.length >= 2) { forestHits.sort((x, y) => x - y); tMin = Math.min(tMin, forestHits[1]); }
    pts.push(lerp(obs.pos, end, tMin));
  }
  return pts;
}

function clipToField(a: Vec, b: Vec, table: Table): number {
  let t = 1;
  const d = sub(b, a);
  if (d.x > EPS) t = Math.min(t, (table.width - a.x) / d.x);
  if (d.x < -EPS) t = Math.min(t, -a.x / d.x);
  if (d.y > EPS) t = Math.min(t, (table.height - a.y) / d.y);
  if (d.y < -EPS) t = Math.min(t, -a.y / d.y);
  return Math.max(0, t);
}

// ---------- awareness ----------

/** Awareness: radius = AG inches from the edge of the base; a model is within if its hitbox touches it. */
export function inAwareness(obs: Piece, other: Piece): boolean {
  return modelDistance(obs, other) <= obs.ag + EPS;
}
