// Generates parity vectors: the Java Geometry must give the same answers as this file's engine.
// Run from frontend/: node src/lib/table/make-vectors.ts ../backend/src/test/resources/table/vectors.json
import { writeFileSync } from "node:fs";
import { type Piece, type Table, type Terrain, type Size, type Env, v, planMove, lineOfSight } from "./geometry.ts";
import { buildTerrain } from "./terrain.ts";

let seed = 20261012;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const r = (a: number, b: number) => Math.round((a + rnd() * (b - a)) * 100) / 100;

const sizes: Size[] = ["SMALL", "MEDIUM", "MEDIUM", "LARGE", "HUGE"];
const kw = [[], [], ["VIGILANCE"], ["SURVIVAL:DIFFICULT,FOREST"], ["CLIMBING"], ["FLICKER"]];
const scenarios = [];
for (let s = 0; s < 40; s++) {
  const terrain: Terrain[] = [];
  for (let i = 0; i < 4; i++) {
    const x = r(4, 28), y = r(4, 28), w = r(1, 6), h = r(0.5, 5);
    terrain.push({ id: "o" + i, kind: "OBSTACLE", height: pick([0.5, 1, 2.5, 3.5]), envs: [],
      points: [v(x, y), v(x + w, y + r(-1, 1)), v(x + w, y + h), v(x + r(-1, 1), y + h)] });
  }
  for (let i = 0; i < 2; i++) {
    const x = r(2, 26), y = r(2, 26);
    terrain.push({ id: "a" + i, kind: "AREA", height: 0, envs: [pick<Env>(["DIFFICULT", "FOREST", "AQUATIC_SHALLOW", "UNSCALABLE"])],
      points: [v(x, y), v(x + r(3, 8), y), v(x + r(3, 8), y + r(3, 8)), v(x, y + r(3, 8))] });
  }
  terrain.push(...buildTerrain([], [{ assetId: "ruin", x: r(8, 28), y: r(8, 28), rotation: r(0, 360) }], {
    ruin: { id: "ruin", widthIn: 6, heightIn: 6, shapes: [{ type: "WALL", points: [v(-3, -3), v(3, -3), v(3, 3)], thickness: 0.5, height: 3 }] } }));
  const pieces: Piece[] = [];
  for (let i = 0; i < 6; i++) {
    pieces.push({ id: "m" + i, side: i % 2 ? "B" : "A", pos: v(r(2, 34), r(2, 34)), facing: r(0, 360), size: pick(sizes),
      spd: pick([4, 5, 6, 7]), ag: pick([8, 10, 13]), faction: "HELIAN_LEAGUE", keywords: pick(kw),
      states: pick([[], [], [], ["CROUCHED"], ["FLYING"]]) });
  }
  const table: Table = { width: 36, height: 36, terrain, pieces };
  const moves = [];
  for (let i = 0; i < 4; i++) {
    const id = "m" + Math.floor(rnd() * 6), mode = pick(["WALK", "RUN"] as const);
    const wps = [v(r(0, 36), r(0, 36)), ...(rnd() < 0.5 ? [v(r(0, 36), r(0, 36))] : [])];
    const p = planMove(table, id, wps, mode);
    moves.push({ piece: id, mode, waypoints: wps, expect: { end: p.path.at(-1), cost: p.cost, length: p.length,
      stoppedBy: p.stoppedBy?.kind ?? null, engagedWith: p.engagedWith, endsOnAlly: p.endsOnAlly } });
  }
  const los = [];
  for (let i = 0; i < 6; i++) {
    const a = "m" + Math.floor(rnd() * 6), b = "m" + Math.floor(rnd() * 6);
    const res = lineOfSight(table, a, b);
    los.push({ from: a, to: b, visible: res.visible, reason: res.reason });
  }
  scenarios.push({ table, moves, los });
}
writeFileSync(process.argv[2] ?? "vectors.json", JSON.stringify({ generatedBy: "frontend/src/lib/table/make-vectors.ts", scenarios }, null, 0));
console.log("scenarios", scenarios.length);
