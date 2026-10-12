// Run from frontend/: npm run test:table
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Piece, type Table, type Terrain, v, hitbox, MM, pointInPolygon } from "./geometry.ts";
import { awarenessRadius, coverAgainst, measure, sprayFrom, templateHits, templatePolygon } from "./aoe.ts";

const piece = (id: string, side: "A" | "B", x: number, y: number, extra: Partial<Piece> = {}): Piece => ({
  id, side, pos: v(x, y), facing: 0, size: "MEDIUM", spd: 6, ag: 10, faction: "HELIAN_LEAGUE", keywords: [], states: [], ...extra,
});
const rect = (id: string, x: number, y: number, w: number, h: number, height: number): Terrain => ({
  id, kind: "OBSTACLE", height, envs: [], points: [v(x, y), v(x + w, y), v(x + w, y + h), v(x, y + h)],
});
const table = (pieces: Piece[], terrain: Terrain[] = []): Table => ({ width: 36, height: 36, pieces, terrain });

test("large circle is 120 mm wide; spray is a teardrop of the right length", () => {
  const c = templatePolygon({ id: "s1", kind: "CIRCLE_L", x: 10, y: 10, rotation: 0, modelId: null });
  const xs = c.map((p) => p.x);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 120 * MM) < 0.01);
  const s = templatePolygon({ id: "s2", kind: "SPRAY_L", x: 0, y: 10, rotation: 0, modelId: null });
  const sx = s.map((p) => p.x), sy = s.map((p) => p.y);
  assert.ok(Math.abs(Math.max(...sx) - Math.min(...sx) - 260 * MM) < 0.02);
  const width = Math.max(...sy) - Math.min(...sy);
  assert.ok(width <= 0.4 * 260 * MM + 0.01 && width > 0.35 * 260 * MM, `width ${width}`);
  assert.ok(pointInPolygon(v(8, 10), s));
  assert.ok(!pointInPolygon(v(0.6, 11), s)); // narrow near the attacker
});

test("circle hits every model it touches, the main target fully covered", () => {
  const t = table([piece("a", "A", 5, 20), piece("e1", "B", 15, 10), piece("e2", "B", 16.9, 10), piece("far", "B", 25, 10)]);
  const hits = templateHits(t, { id: "s1", kind: "CIRCLE_L", x: 15, y: 10, rotation: 0, modelId: "a" });
  const byId = Object.fromEntries(hits.map((h) => [h.id, h]));
  assert.equal(byId.e1.covered, "FULL");
  assert.equal(byId.e2.covered, "PARTIAL");
  assert.equal(byId.far, undefined);
  assert.ok(byId.e1.los && byId.e2.los);
});

test("no LoS from the centre of a circle: the model behind a wall is not affected", () => {
  const t = table([piece("a", "A", 5, 20), piece("e", "B", 17.5, 10)], [rect("wall", 16.4, 7, 0.3, 6, 3)]);
  const h = templateHits(t, { id: "s1", kind: "CIRCLE_L", x: 15.2, y: 10, rotation: 0, modelId: "a" });
  assert.equal(h.find((x) => x.id === "e")?.los, false);
});

test("spray starts at the attacker's base and the user is not hit", () => {
  const a = piece("a", "A", 10, 10);
  const t = table([a, piece("e", "B", 14, 10), piece("ally", "A", 13, 13)]);
  const s = sprayFrom(a, v(20, 10));
  assert.ok(Math.abs(s.x - (10 + hitbox("MEDIUM").r)) < 1e-9);
  const hits = templateHits(t, { id: "s1", kind: "SPRAY_S", ...s, modelId: "a" });
  assert.deepEqual(hits.map((h) => h.id), ["e"]);
});

test("cover: heavy behind a tall wide wall, light behind a low one, none when too far", () => {
  const shooter = piece("s", "A", 18, 30, { facing: 270 });
  const heavy = table([shooter, piece("t", "B", 18, 10)], [rect("wall", 15, 11, 6, 0.5, 3)]);
  assert.equal(coverAgainst(heavy, "s", "t").cover, "HEAVY");
  const light = table([shooter, piece("t", "B", 18, 10)], [rect("wall", 15, 11, 6, 0.5, 1)]);
  assert.equal(coverAgainst(light, "s", "t").cover, "LIGHT");
  const far = table([shooter, piece("t", "B", 18, 10)], [rect("wall", 15, 13, 6, 0.5, 1)]);
  assert.equal(coverAgainst(far, "s", "t").cover, "NONE");
  const crouched = table([shooter, piece("t", "B", 18, 10, { states: ["CROUCHED"] })]);
  assert.equal(coverAgainst(crouched, "s", "t").cover, "LIGHT");
  const flying = table([shooter, piece("t", "B", 18, 10, { states: ["FLYING"] })], [rect("wall", 15, 11, 6, 0.5, 3)]);
  assert.equal(coverAgainst(flying, "s", "t").cover, "NONE");
});

test("awareness and measuring between hitboxes", () => {
  const a = piece("a", "A", 10, 10, { ag: 12 });
  assert.ok(Math.abs(awarenessRadius(a) - (12 + hitbox("MEDIUM").r)) < 1e-9);
  const b = piece("b", "B", 15, 10);
  assert.ok(Math.abs(measure(a, b) - (5 - 2 * hitbox("MEDIUM").r)) < 1e-9);
  assert.ok(Math.abs(measure(a, v(20, 10)) - (10 - hitbox("MEDIUM").r)) < 1e-9);
});
