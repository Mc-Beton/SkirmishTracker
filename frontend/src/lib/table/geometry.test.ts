// Run from frontend/: npm run test:table   (Node 22.6+ strips the types)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Piece, type Table, type Terrain, v, hitbox, planMove, lineOfSight, visibleModels,
  modelDistance, insideIntervals, isSlowedBy, moveBudget, visibilityPolygon,
} from "./geometry.ts";

const piece = (id: string, side: "A" | "B", x: number, y: number, extra: Partial<Piece> = {}): Piece => ({
  id, side, pos: v(x, y), facing: 0, size: "MEDIUM", spd: 6, ag: 10, faction: "HELIAN_LEAGUE", keywords: [], states: [], ...extra,
});
const rect = (id: string, x: number, y: number, w: number, h: number, height: number, kind: Terrain["kind"] = "OBSTACLE", envs: Terrain["envs"] = []): Terrain => ({
  id, kind, height, envs, points: [v(x, y), v(x + w, y), v(x + w, y + h), v(x, y + h)],
});
const table = (pieces: Piece[], terrain: Terrain[] = []): Table => ({ width: 36, height: 36, pieces, terrain });
const near = (a: number, b: number, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test("hitbox sizes: Medium 32 mm base, 45 mm high; crouched is the base", () => {
  const h = hitbox("MEDIUM");
  near(h.r, 16 / 25.4, 1e-9);
  near(h.h, 45 / 25.4, 1e-9);
  assert.ok(hitbox("MEDIUM", true).h < 0.2);
});

test("walk: free path within SPD, run doubles the budget", () => {
  const t = table([piece("a", "A", 5, 5)]);
  const p = planMove(t, "a", [v(9, 5)], "WALK");
  near(p.cost, 4); assert.equal(p.stoppedBy, null);
  const q = planMove(t, "a", [v(20, 5)], "WALK");
  near(q.cost, 6); assert.deepEqual(q.stoppedBy, { kind: "BUDGET" });
  near(q.path.at(-1)!.x, 11);
  assert.equal(moveBudget(t.pieces[0], "RUN"), 12);
  t.pieces[0].states = ["CROUCHED"];
  assert.equal(moveBudget(t.pieces[0], "RUN"), 6); // Crouched: Walk only

});

test("the whole route counts, not the straight-line distance", () => {
  const t = table([piece("a", "A", 5, 5)]);
  const p = planMove(t, "a", [v(8, 5), v(8, 8), v(5, 8)], "WALK"); // 9" of zig-zag, SPD 6
  near(p.cost, 6); assert.deepEqual(p.stoppedBy, { kind: "BUDGET" });
  near(p.path.at(-1)!.x, 8); near(p.path.at(-1)!.y, 8);
});

test("tall obstacle blocks, the base stops at contact", () => {
  const t = table([piece("a", "A", 5, 10)], [rect("wall", 8, 5, 1, 10, 3)]);
  const p = planMove(t, "a", [v(12, 10)], "WALK");
  assert.deepEqual(p.stoppedBy, { kind: "TERRAIN", terrainId: "wall" });
  near(p.path.at(-1)!.x, 8 - hitbox("MEDIUM").r, 0.01);
});

test("low obstacle (not taller than the hitbox) is crossed for free", () => {
  const t = table([piece("a", "A", 5, 10)], [rect("log", 8, 5, 1, 10, 0.5)]);
  const p = planMove(t, "a", [v(11, 10)], "WALK");
  assert.equal(p.stoppedBy, null); near(p.cost, 6);
});

test("Difficult area costs 2\" per 1\", Survival (Difficult) ignores it", () => {
  const area = rect("bog", 7, 0, 10, 36, 0, "AREA", ["DIFFICULT"]);
  const t = table([piece("a", "A", 5, 10)], [area]);
  const p = planMove(t, "a", [v(15, 10)], "WALK");
  // 2" - r of free movement, then every inch costs 2
  const r = hitbox("MEDIUM").r;
  near(p.path.at(-1)!.x, 5 + (2 - r) + (6 - (2 - r)) / 2, 0.06);
  const s = table([piece("a", "A", 5, 10, { keywords: ["SURVIVAL:DIFFICULT,FOREST"] })], [area]);
  near(planMove(s, "a", [v(11, 10)], "WALK").cost, 6);
  assert.equal(isSlowedBy(s.pieces[0], "DIFFICULT"), false);
});

test("enemies cannot be passed: movement ends in base contact (engaged)", () => {
  const t = table([piece("a", "A", 5, 10), piece("e", "B", 9, 10)]);
  const p = planMove(t, "a", [v(12, 10)], "WALK");
  assert.equal(p.engagedWith, "e");
  near(modelDistance({ ...t.pieces[0], pos: p.path.at(-1)! }, t.pieces[1]), 0, 0.01);
});

test("allies can be passed through but not ended on", () => {
  const t = table([piece("a", "A", 5, 10), piece("f", "A", 8, 10)]);
  assert.equal(planMove(t, "a", [v(11, 10)], "WALK").stoppedBy, null);
  assert.equal(planMove(t, "a", [v(8.2, 10)], "WALK").endsOnAlly, "f");
});

test("the base must stay on the table", () => {
  const t = table([piece("a", "A", 3, 10)]);
  const p = planMove(t, "a", [v(0, 10)], "WALK");
  assert.deepEqual(p.stoppedBy, { kind: "EDGE" });
  near(p.path.at(-1)!.x, hitbox("MEDIUM").r, 0.01);
});

test("unscalable only with Climbing", () => {
  const cliff = rect("cliff", 8, 0, 2, 36, 0, "AREA", ["UNSCALABLE"]);
  const t = table([piece("a", "A", 5, 10)], [cliff]);
  assert.equal(planMove(t, "a", [v(11, 10)], "WALK").stoppedBy?.kind, "UNSCALABLE");
  const c = table([piece("a", "A", 5, 10, { keywords: ["CLIMBING"] })], [cliff]);
  assert.equal(planMove(c, "a", [v(11, 10)], "WALK").stoppedBy, null);
});

test("LoS: front arc 180°, Vigilance sees all around", () => {
  const t = table([piece("a", "A", 10, 10, { facing: 0 }), piece("front", "B", 15, 12), piece("back", "B", 5, 10)]);
  assert.equal(lineOfSight(t, "a", "front").visible, true);
  const back = lineOfSight(t, "a", "back");
  assert.equal(back.visible, false); assert.equal(back.reason, "BACK_ARC");
  t.pieces[0].keywords = ["VIGILANCE"];
  assert.equal(lineOfSight(t, "a", "back").visible, true);
  t.pieces[0].keywords = [];
  assert.equal(lineOfSight(t, "a", "back", { moving: true }).visible, true);
});

test("LoS: a model just behind the side line is still in the front arc (hitbox reaches forward)", () => {
  const t = table([piece("a", "A", 10, 10, { facing: 0 }), piece("side", "B", 9.6, 15)]);
  assert.equal(lineOfSight(t, "a", "side").inFrontArc, true);
});

test("LoS: blocked by a tall wall, not by a low one", () => {
  const tall = table([piece("a", "A", 5, 10), piece("e", "B", 15, 10)], [rect("wall", 9, 4, 1, 12, 3)]);
  const r = lineOfSight(tall, "a", "e");
  assert.equal(r.visible, false); assert.equal(r.reason, "BLOCKED");
  const low = table([piece("a", "A", 5, 10), piece("e", "B", 15, 10)], [rect("wall", 9, 4, 1, 12, 0.5)]);
  assert.equal(lineOfSight(low, "a", "e").visible, true);
});

test("LoS: partially hidden model is visible around the edge", () => {
  const t = table([piece("a", "A", 5, 10), piece("e", "B", 15, 10.9)], [rect("rock", 9, 4, 1, 6.6, 3)]);
  assert.equal(lineOfSight(t, "a", "e").visible, true);
});

test("LoS: other models (also allies) obscure it", () => {
  const t = table([piece("a", "A", 5, 10), piece("f", "A", 7, 10), piece("e", "B", 9, 10, { size: "SMALL" })]);
  // a Medium ally right in front hides a Small enemy right behind it
  assert.equal(lineOfSight(t, "a", "e").visible, false);
});

test("LoS: not through two Forest areas", () => {
  const f1 = rect("f1", 8, 0, 2, 36, 0, "AREA", ["FOREST"]);
  const f2 = rect("f2", 12, 0, 2, 36, 0, "AREA", ["FOREST"]);
  const one = table([piece("a", "A", 5, 10), piece("e", "B", 11, 10)], [f1, f2]);
  assert.equal(lineOfSight(one, "a", "e").visible, true);
  const two = table([piece("a", "A", 5, 10), piece("e", "B", 16, 10)], [f1, f2]);
  assert.equal(lineOfSight(two, "a", "e").reason, "FOREST");
});

test("LoS: Flying sees and is seen over walls", () => {
  const t = table([piece("a", "A", 5, 10), piece("e", "B", 15, 10, { states: ["FLYING"] })], [rect("wall", 9, 4, 1, 12, 3)]);
  assert.equal(lineOfSight(t, "a", "e").visible, true);
});

test("visibleModels marks allies and enemies", () => {
  const t = table([piece("a", "A", 5, 10), piece("f", "A", 8, 5), piece("e", "B", 15, 14)]);
  const res = Object.fromEntries(visibleModels(t, "a").map((r) => [r.targetId, r.visible]));
  assert.deepEqual(res, { f: true, e: true });
});

test("insideIntervals handles concave polygons", () => {
  const u = [v(0, 0), v(3, 0), v(3, 3), v(2, 3), v(2, 1), v(1, 1), v(1, 3), v(0, 3)]; // a "U"
  const iv = insideIntervals(v(-1, 2), v(4, 2), u);
  assert.equal(iv.length, 2);
});

test("visibility polygon stops at walls", () => {
  const t = table([piece("a", "A", 5, 10)], [rect("wall", 9, 4, 1, 12, 3)]);
  const poly = visibilityPolygon(t, "a", {}, 5);
  const straight = poly.find((p) => Math.abs(p.y - 10) < 0.01 && p.x > 5)!;
  near(straight.x, 9, 0.01);
});

test("Dark limits LoS to Awareness, Coalition of Thenion is not affected", () => {
  const dark = rect("night", 0, 0, 36, 36, 0, "AREA", ["DARK"]);
  const t = table([piece("a", "A", 5, 10, { ag: 8 }), piece("near", "B", 12, 10), piece("far", "B", 20, 16)], [dark]);
  assert.equal(lineOfSight(t, "a", "near").visible, true);
  assert.equal(lineOfSight(t, "a", "far").reason, "DARK");
  t.pieces[0].faction = "COALITION_OF_THENION";
  assert.equal(lineOfSight(t, "a", "far").visible, true);
});

test("movement already spent in the activation is taken off the budget", () => {
  const t = table([piece("a", "A", 5, 5)]);
  const p = planMove(t, "a", [v(20, 5)], "WALK", 4);
  near(p.cost, 2); near(p.path.at(-1)!.x, 7);
});

test("terrain library: a rotated ruin wall blocks movement and LoS", async () => {
  const { buildTerrain } = await import("./terrain.ts");
  const ruin = { id: "ruin", widthIn: 6, heightIn: 6, shapes: [
    { type: "WALL" as const, points: [v(-3, -3), v(3, -3), v(3, 3)], thickness: 0.5, height: 3 },
    { type: "AREA" as const, points: [v(-3, -3), v(3, -3), v(3, 3), v(-3, 3)], height: 0, envs: ["DIFFICULT" as const] },
  ] };
  const terrain = buildTerrain([], [{ assetId: "ruin", x: 18, y: 18, rotation: 90 }], { ruin });
  // rotated 90°: the first wall now runs vertically along x = 21
  assert.equal(terrain.filter((t) => t.kind === "OBSTACLE").length, 2);
  const t = table([piece("a", "A", 24, 18, { facing: 180 }), piece("e", "B", 18, 18)], terrain);
  assert.equal(planMove(t, "a", [v(19, 18)], "WALK").stoppedBy?.kind, "TERRAIN");
  assert.equal(lineOfSight(t, "a", "e").visible, false);
});

test("terrain library: a scaled piece grows its outline and wall thickness, not its height", async () => {
  const { buildTerrain } = await import("./terrain.ts");
  const ruin = { id: "ruin", widthIn: 6, heightIn: 6, shapes: [
    { type: "WALL" as const, points: [v(-3, -3), v(3, -3), v(3, 3)], thickness: 0.5, height: 3 },
  ] };
  const [wall] = buildTerrain([], [{ assetId: "ruin", x: 18, y: 18, rotation: 0, scale: 2 }], { ruin });
  // wall along y = 12 (−3 × 2), 1″ thick (0.5 × 2), still 3″ high
  const ys = wall.points.map((p) => p.y);
  near(Math.min(...ys), 11.5); near(Math.max(...ys), 12.5);
  near(Math.max(...wall.points.map((p) => p.x)), 24.5);
  assert.equal(wall.height, 3);
});
