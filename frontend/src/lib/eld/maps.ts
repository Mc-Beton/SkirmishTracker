import { ngon, rect } from './geometry.ts';
import { defaultTerrain } from './content.ts';
import type { Pt, TerrainPiece } from './types.ts';

// Maps. A map is a ground (a base) and a list of terrain elements placed on it. Every element comes from a kit:
// a kit knows the element's rules shapes (what blocks, what can be stood on, what is water) for a size of 1, and,
// for sculpted scenery, the model file that is drawn over those shapes. Players' own maps are stored and sent as
// placements only (kit, position, size, turn); the server builds the terrain from them, so a map cannot carry
// shapes the kits do not have.

export interface KitPart {
  kind: TerrainPiece['kind'];
  env: TerrainPiece['env'];
  name: string;
  /** Footprint for a size of 1, around the element's centre; x to the right, y towards the bottom edge. */
  shape: Pt[];
  /** Height for a size of 1 – or, with `fixed`, in inches whatever the size. */
  height: number;
  fixed?: boolean;
  ladder?: Pt;
}
export interface Kit {
  id: string;
  name: string;
  /** Model file under /models/terrain/, drawn instead of the plain shapes. */
  model?: string;
  /** Sizes in inches (the element's widest side): smallest, usual, largest. */
  size: [number, number, number];
  parts: KitPart[];
}

const box = (cx: number, cy: number, w: number, d: number): Pt[] => rect(cx, cy, w, d, 0);
const round = (cx: number, cy: number, r: number, n = 8): Pt[] => ngon(cx, cy, r, n, 0);

export const KITS: Kit[] = [
  // Sculpted scenery.
  { id: 'altar', name: 'Crystal dais', model: 'altar.glb', size: [6, 8, 11], parts: [
    { kind: 'obstacle', env: 'ruin', name: 'Crystal dais', shape: round(0, 0, 0.34, 10), height: 0.17 },
    { kind: 'obstacle', env: 'ruin', name: 'Crystal', shape: round(0, 0, 0.08, 6), height: 0.5 },
  ] },
  { id: 'boulders', name: 'Mossy boulders', model: 'boulders.glb', size: [3.5, 5.5, 9], parts: [{ kind: 'obstacle', env: 'rock', name: 'Mossy boulders', shape: round(0, 0, 0.34, 8), height: 0.6 }] },
  { id: 'arch', name: 'Ruined archway', model: 'arch.glb', size: [6, 8, 12], parts: [
    { kind: 'obstacle', env: 'ruin', name: 'Archway pier', shape: box(-0.31, -0.27, 0.2, 0.22), height: 0.7 },
    { kind: 'obstacle', env: 'ruin', name: 'Archway pier', shape: box(0.31, -0.27, 0.2, 0.22), height: 0.7 },
  ] },
  { id: 'corner', name: 'Ruined temple corner', model: 'corner.glb', size: [7, 10, 14], parts: [
    { kind: 'obstacle', env: 'ruin', name: 'Temple wall', shape: box(0, -0.37, 0.82, 0.13), height: 0.55 },
    { kind: 'obstacle', env: 'ruin', name: 'Temple wall', shape: box(-0.385, -0.06, 0.13, 0.5), height: 0.5 },
  ] },
  { id: 'tree', name: 'Ancient tree', model: 'tree.glb', size: [8, 12, 16], parts: [{ kind: 'obstacle', env: 'rock', name: 'Ancient tree', shape: round(0.02, 0.12, 0.1, 8), height: 0.8 }] },
  // Plain scenery, drawn from its shapes.
  { id: 'house', name: 'House', size: [4, 6, 9], parts: [{ kind: 'obstacle', env: 'building', name: 'House', shape: box(0, 0, 1, 0.66), height: 3, fixed: true, ladder: { x: 0.5, y: 0 } }] },
  { id: 'tower', name: 'Watchtower', size: [3, 3.5, 5], parts: [{ kind: 'obstacle', env: 'building', name: 'Watchtower', shape: box(0, 0, 1, 1), height: 5, fixed: true, ladder: { x: 0, y: 0.5 } }] },
  { id: 'wall', name: 'Ruined wall', size: [3, 7, 12], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Ruined wall', shape: box(0, 0, 1, 0.09), height: 1.6, fixed: true }] },
  { id: 'rock', name: 'Rocks', size: [2, 4, 7], parts: [{ kind: 'obstacle', env: 'rock', name: 'Rocks', shape: ngon(0, 0, 0.5, 7, 10, 0.75), height: 1.4, fixed: true }] },
  { id: 'forest', name: 'Forest', size: [4, 7, 12], parts: [{ kind: 'area', env: 'forest', name: 'Forest', shape: ngon(0, 0, 0.5, 9, 0, 0.8), height: 3, fixed: true }] },
  { id: 'pond', name: 'Pond (Shallow Water)', size: [3, 5, 10], parts: [{ kind: 'area', env: 'water', name: 'Pond', shape: ngon(0, 0, 0.5, 10, 0, 0.7), height: 0, fixed: true }] },
];

/** One element on a map. */
export interface Placement {
  kit: string;
  x: number;
  y: number;
  /** Inches across. */
  size: number;
  /** Degrees, clockwise seen from above. */
  turn: number;
}

/** A ground to build on. */
export interface Base {
  id: string;
  name: string;
  /** Picture of the ground under /maps/ (otherwise the plain field). */
  ground?: string;
  /** How much the ground rises and falls, in inches. Looks only: the rules treat the table as flat. */
  relief?: number;
  /** Terrain that belongs to the ground itself (a river) and cannot be moved. */
  fixed: TerrainPiece[];
}

/** A strip of water along a line of points, `width` inches wide: Shallow Water (double movement, Dodges on half AG). */
function river(id: string, line: Pt[], width: number, per = 5): TerrainPiece[] {
  const out: TerrainPiece[] = [];
  for (let from = 0; from < line.length - 1; from += per - 1) {
    const pts = line.slice(from, from + per);
    const left: Pt[] = [];
    const right: Pt[] = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(pts.length - 1, i + 1)]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = (-(b.y - a.y) / len) * (width / 2);
      const ny = ((b.x - a.x) / len) * (width / 2);
      left.push({ x: p.x + nx, y: p.y + ny });
      right.push({ x: p.x - nx, y: p.y - ny });
    });
    out.push({ id: `${id}${out.length + 1}`, kind: 'area', env: 'water', name: 'Stream (Shallow Water)', shape: [...left, ...right.reverse()], height: 0, painted: true });
  }
  return out;
}

const STREAM: Pt[] = [
  [13.3, -0.5], [13.5, 2], [15.4, 4], [16.5, 6], [14.6, 7.6], [12.8, 9], [13.6, 10.6], [16.8, 11.3], [19.7, 12.4], [19.4, 14], [18.1, 15.1],
  [19.4, 16.2], [22.4, 16.9], [25.5, 16.4], [28.5, 16.1], [31.5, 17.3], [34, 18.2], [36.5, 18],
].map(([x, y]) => ({ x: x!, y: y! }));

export const BASES: Base[] = [
  { id: 'meadow', name: 'Open field', fixed: [] },
  { id: 'stream', name: 'Sanctuary meadow with a stream', ground: 'stream.jpg', relief: 0.16, fixed: river('river', STREAM, 1.7) },
];

/** A map: a base and what stands on it. `terrain` is for the first map of the game, kept as it always was. */
export interface GameMap {
  id: string;
  name: string;
  base: string;
  items: Placement[];
  terrain?: TerrainPiece[];
}

export const MAPS: GameMap[] = [
  { id: 'sanctuary', name: 'Fallen sanctuary', base: 'stream', items: [
    { kit: 'corner', x: 7.2, y: 12.2, size: 9.5, turn: 12 },
    { kit: 'altar', x: 13.8, y: 20.2, size: 7.5, turn: 0 },
    { kit: 'arch', x: 27.6, y: 24.6, size: 8, turn: 200 },
    { kit: 'boulders', x: 25.8, y: 10, size: 5.2, turn: 40 },
    { kit: 'boulders', x: 6.5, y: 25.4, size: 4.2, turn: 190 },
    { kit: 'tree', x: 31, y: 5.2, size: 11, turn: 0 },
  ] },
  { id: 'classic', name: 'Village crossing', base: 'meadow', items: [], terrain: defaultTerrain() },
];

export const MAX_ITEMS = 30;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Checks placements that came from a player. Returns the cleaned list or an error text. */
export function checkPlacements(items: unknown, width = 36, height = 36): Placement[] | string {
  if (!Array.isArray(items)) return 'A map needs a list of elements';
  if (items.length > MAX_ITEMS) return `A map can have at most ${MAX_ITEMS} elements`;
  const out: Placement[] = [];
  for (const raw of items as Partial<Placement>[]) {
    const kit = KITS.find((k) => k.id === raw?.kit);
    if (!kit) return 'Unknown terrain element';
    const { x, y, size, turn } = raw;
    if (![x, y, size, turn].every((n) => typeof n === 'number' && Number.isFinite(n))) return 'An element needs a position, a size and a turn';
    if (x! < 0 || y! < 0 || x! > width || y! > height) return `${kit.name} is off the table`;
    if (size! < kit.size[0] - 0.01 || size! > kit.size[2] + 0.01) return `${kit.name} must be between ${kit.size[0]} and ${kit.size[2]} inches`;
    out.push({ kit: kit.id, x: round2(x!), y: round2(y!), size: round2(size!), turn: round2(((turn! % 360) + 360) % 360) });
  }
  return out;
}

/** The terrain pieces of placed elements. */
export function buildItems(items: Placement[]): TerrainPiece[] {
  const out: TerrainPiece[] = [];
  items.forEach((it, i) => {
    const kit = KITS.find((k) => k.id === it.kit);
    if (!kit) return;
    const a = (it.turn * Math.PI) / 180;
    const place = (p: Pt): Pt => ({ x: round2(it.x + (p.x * Math.cos(a) - p.y * Math.sin(a)) * it.size), y: round2(it.y + (p.x * Math.sin(a) + p.y * Math.cos(a)) * it.size) });
    kit.parts.forEach((part, k) => {
      const piece: TerrainPiece = { id: `m${i + 1}${k ? String.fromCharCode(97 + k) : ''}`, kind: part.kind, env: part.env, name: part.name, shape: part.shape.map(place), height: round2(part.fixed ? part.height : part.height * it.size) };
      if (part.ladder) piece.ladders = [place(part.ladder)];
      if (kit.model) {
        piece.unseen = true;
        if (k === 0) piece.model = { file: kit.model, x: it.x, y: it.y, size: it.size, turn: it.turn };
      }
      out.push(piece);
    });
  });
  return out;
}

export interface BuiltMap {
  terrain: TerrainPiece[];
  ground?: string;
  relief?: number;
  map: string;
}

/** Everything a table needs from a map. */
export function buildMap(map: GameMap): BuiltMap {
  const base = BASES.find((b) => b.id === map.base) ?? BASES[0]!;
  return { terrain: [...base.fixed, ...(map.terrain ?? []), ...buildItems(map.items)], ...(base.ground ? { ground: base.ground } : {}), ...(base.relief ? { relief: base.relief } : {}), map: map.name };
}
