/**
 * Terrain library format (shared with the backend `TerrainShapes`): an admin uploads a picture of a piece with
 * its real size and draws shapes over it in inches around the picture centre. A map = decorative background
 * with natural areas + placed pieces. `buildTerrain` turns that into world terrain for the geometry.
 */
import { type Env, type Terrain, type Vec, add, mul, sub, dist } from "./geometry.ts";

export type ShapeType = "WALL" | "OBSTACLE" | "AREA";

/** WALL: polyline with thickness (each segment becomes a solid rectangle); OBSTACLE: solid polygon;
 *  AREA: Environment footprint, walkable (height only matters for LoS). */
export type Shape = { type: ShapeType; points: Vec[]; thickness?: number; height: number; envs?: Env[] };

export type TerrainAsset = { id: string; widthIn: number; heightIn: number; shapes: Shape[] };

/** A piece on a map: centre position (inches) and rotation in degrees, clockwise on screen. */
export type Placement = { assetId: string; x: number; y: number; rotation: number };

/** Natural area on a background picture, in absolute inches. */
export type Area = { points: Vec[]; height: number; envs: Env[] };

export function rotate(p: Vec, deg: number): Vec {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function wallPolygons(line: Vec[], thickness: number): Vec[][] {
  const out: Vec[][] = [];
  const h = thickness / 2;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const len = dist(a, b);
    if (len < 1e-9) continue;
    const d = mul(sub(b, a), 1 / len), n = mul({ x: -d.y, y: d.x }, h);
    const a2 = sub(a, mul(d, h)), b2 = add(b, mul(d, h));
    out.push([add(a2, n), add(b2, n), sub(b2, n), sub(a2, n)]);
  }
  return out;
}

export function buildTerrain(background: Area[], placements: Placement[], assets: Record<string, TerrainAsset>): Terrain[] {
  const out: Terrain[] = background.map((a, i) => ({ id: "bg" + i, kind: "AREA", points: a.points, height: a.height, envs: a.envs }));
  placements.forEach((pl, k) => {
    const asset = assets[pl.assetId];
    if (!asset) throw new Error("unknown terrain " + pl.assetId);
    asset.shapes.forEach((shape, s) => {
      const id = `p${k}s${s}`;
      const world = shape.points.map((p) => add(rotate(p, pl.rotation), { x: pl.x, y: pl.y }));
      const envs = shape.envs ?? [];
      if (shape.type === "WALL") {
        wallPolygons(world, shape.thickness ?? 0.25).forEach((rect, w) =>
          out.push({ id: `${id}w${w}`, kind: "OBSTACLE", points: rect, height: shape.height, envs }));
      } else {
        out.push({ id, kind: shape.type, points: world, height: shape.height, envs });
      }
    });
  });
  return out;
}
