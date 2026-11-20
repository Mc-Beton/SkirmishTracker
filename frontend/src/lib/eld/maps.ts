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
/** A curved wall: the part of a ring between two angles (degrees, 0 = to the right, clockwise seen from above). */
function arc(cx: number, cy: number, inner: number, outer: number, from: number, to: number, steps: number): Pt[] {
  const at = (r: number, i: number): Pt => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return { x: Math.round((cx + Math.cos(a) * r) * 100) / 100, y: Math.round((cy + Math.sin(a) * r) * 100) / 100 };
  };
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) out.push(at(outer, i));
  for (let i = steps; i >= 0; i--) out.push(at(inner, i));
  return out;
}

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
  // Sculpted scenery of the second set (19.11.2026): garden, forest and frost pieces. Bridges are a long deck with two
  // short slabs up at each end, so a figure walks over them; daises and terraces have their stairs as a lower slab.
  { id: 'bamboo-thicket-crag', name: 'Bamboo thicket', model: 'bamboo-thicket-crag.glb', size: [6, 8, 11], parts: [{ kind: 'obstacle', env: 'rock', name: 'Bamboo thicket', shape: round(0.03, -0.12, 0.17, 8), height: 0.8 }, { kind: 'obstacle', env: 'rock', name: 'Carved rock', shape: box(-0.24, 0.07, 0.21, 0.14), height: 0.3 }] },
  { id: 'ceremonial-shrine-well', name: 'Shrine well', model: 'ceremonial-shrine-well.glb', size: [7, 9, 12], parts: [{ kind: 'obstacle', env: 'building', name: 'Shrine well', shape: box(0.03, -0.06, 0.52, 0.3), height: 0.85 }] },
  { id: 'cherry-pagoda-pavilion', name: 'Cherry pagoda', model: 'cherry-pagoda-pavilion.glb', size: [8, 10, 14], parts: [{ kind: 'obstacle', env: 'building', name: 'Pagoda', shape: box(-0.03, -0.09, 0.48, 0.48), height: 0.7 }, { kind: 'obstacle', env: 'rock', name: 'Cherry tree', shape: round(-0.36, -0.2, 0.04, 6), height: 0.35 }, { kind: 'obstacle', env: 'rock', name: 'Cherry tree', shape: round(0.36, -0.03, 0.04, 6), height: 0.35 }] },
  { id: 'cherry-stone-lanterns', name: 'Stone lanterns', model: 'cherry-stone-lanterns.glb', size: [5, 7, 10], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Great lantern', shape: round(-0.01, -0.03, 0.09, 8), height: 0.8 }, { kind: 'obstacle', env: 'ruin', name: 'Lantern', shape: round(-0.25, -0.01, 0.06, 6), height: 0.5 }, { kind: 'obstacle', env: 'ruin', name: 'Lantern', shape: round(0.25, 0.1, 0.055, 6), height: 0.45 }] },
  { id: 'crystal-cherry-tree', name: 'Crystal cherry tree', model: 'crystal-cherry-tree.glb', size: [8, 11, 15], parts: [{ kind: 'obstacle', env: 'rock', name: 'Cherry tree', shape: round(-0.01, -0.04, 0.1, 8), height: 0.75 }, { kind: 'obstacle', env: 'rock', name: 'Standing stone', shape: round(0.3, 0.15, 0.04, 6), height: 0.28 }] },
  { id: 'forest-fallen-log', name: 'Fallen log', model: 'forest-fallen-log.glb', size: [5, 7, 10], parts: [{ kind: 'obstacle', env: 'rock', name: 'Fallen log', shape: rect(0.02, -0.03, 0.75, 0.2, 8), height: 0.3 }] },
  { id: 'forest-gazebo-shrine', name: 'Forest shrine', model: 'forest-gazebo-shrine.glb', size: [7, 9, 12], parts: [{ kind: 'obstacle', env: 'building', name: 'Forest shrine', shape: box(0, -0.03, 0.56, 0.4), height: 0.9 }] },
  { id: 'frost-armillary-sphere', name: 'Frost armillary', model: 'frost-armillary-sphere.glb', size: [8, 10, 13], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Armillary dais', shape: round(0, -0.02, 0.36, 12), height: 0.17 }, { kind: 'obstacle', env: 'ruin', name: 'Armillary sphere', shape: round(0, -0.03, 0.09, 8), height: 0.6 }, { kind: 'obstacle', env: 'ruin', name: 'Ring wall', shape: arc(0, -0.02, 0.29, 0.37, 190, 350, 8), height: 0.5 }] },
  { id: 'frost-crystal-shrine', name: 'Frost crystal shrine', model: 'frost-crystal-shrine.glb', size: [6, 8, 11], parts: [{ kind: 'obstacle', env: 'rock', name: 'Ice crystals', shape: round(0.25, -0.21, 0.15, 8), height: 0.65 }, { kind: 'obstacle', env: 'ruin', name: 'Ruined arch', shape: box(-0.2, -0.2, 0.2, 0.14), height: 0.5 }, { kind: 'obstacle', env: 'ruin', name: 'Ruined arch', shape: box(0.07, 0.15, 0.18, 0.08), height: 0.4 }] },
  { id: 'frost-dragon-statue', name: 'Frost dragon statue', model: 'frost-dragon-statue.glb', size: [8, 11, 14], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Dragon statue', shape: ngon(-0.05, 0.03, 0.3, 10, 0, 0.75), height: 0.6 }, { kind: 'obstacle', env: 'ruin', name: 'Pillar', shape: round(0.08, -0.385, 0.035, 6), height: 0.4 }, { kind: 'obstacle', env: 'ruin', name: 'Pillar', shape: round(0.35, -0.24, 0.035, 6), height: 0.4 }, { kind: 'obstacle', env: 'ruin', name: 'Pillar', shape: round(-0.21, -0.34, 0.035, 6), height: 0.3 }] },
  { id: 'frosted-colonnade-ruins', name: 'Frosted colonnade', model: 'frosted-colonnade-ruins.glb', size: [8, 11, 15], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Colonnade', shape: box(-0.12, -0.19, 0.46, 0.07), height: 0.55 }, { kind: 'obstacle', env: 'ruin', name: 'Colonnade', shape: box(-0.37, 0.055, 0.08, 0.33), height: 0.5 }, { kind: 'obstacle', env: 'ruin', name: 'Column', shape: round(0.36, -0.15, 0.04, 6), height: 0.33 }, { kind: 'obstacle', env: 'ruin', name: 'Column', shape: round(0.2, -0.2, 0.035, 6), height: 0.25 }] },
  { id: 'frozen-ice-pond', name: 'Frozen pond', model: 'frozen-ice-pond.glb', size: [7, 10, 14], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Arch stone', shape: box(-0.19, 0.37, 0.07, 0.05), height: 0.25 }] },
  { id: 'frozen-snow-log', name: 'Snowy log', model: 'frozen-snow-log.glb', size: [5, 7, 10], parts: [{ kind: 'obstacle', env: 'rock', name: 'Snowy log', shape: rect(-0.03, -0.07, 0.7, 0.16, -8), height: 0.3 }] },
  { id: 'frozen-stone-bridge', name: 'Frozen bridge', model: 'frozen-stone-bridge.glb', size: [7, 9, 12], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Frozen bridge', shape: box(-0.32, -0.01, 0.09, 0.2), height: 0.09 }, { kind: 'obstacle', env: 'ruin', name: 'Frozen bridge', shape: box(-0.23, -0.01, 0.09, 0.2), height: 0.18 }, { kind: 'obstacle', env: 'ruin', name: 'Frozen bridge', shape: box(0.01, -0.01, 0.39, 0.2), height: 0.27 }, { kind: 'obstacle', env: 'ruin', name: 'Frozen bridge', shape: box(0.25, -0.01, 0.09, 0.2), height: 0.18 }, { kind: 'obstacle', env: 'ruin', name: 'Frozen bridge', shape: box(0.34, -0.01, 0.09, 0.2), height: 0.09 }] },
  { id: 'hollow-fallen-log', name: 'Hollow log', model: 'hollow-fallen-log.glb', size: [6, 8, 11], parts: [{ kind: 'obstacle', env: 'rock', name: 'Hollow log', shape: rect(-0.05, -0.08, 0.74, 0.2, 4), height: 0.4 }] },
  { id: 'ice-arch-ruin', name: 'Ice arch', model: 'ice-arch-ruin.glb', size: [6, 8, 11], parts: [{ kind: 'obstacle', env: 'rock', name: 'Ice arch foot', shape: round(-0.29, 0.01, 0.13, 8), height: 0.45 }, { kind: 'obstacle', env: 'rock', name: 'Ice arch foot', shape: round(0.3, -0.01, 0.13, 8), height: 0.45 }] },
  { id: 'ice-crystal-menhir-dais', name: 'Ice menhir dais', model: 'ice-crystal-menhir-dais.glb', size: [8, 10, 13], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Menhir dais', shape: round(0, -0.02, 0.36, 12), height: 0.25 }, { kind: 'obstacle', env: 'ruin', name: 'Dais stairs', shape: box(0, 0.36, 0.2, 0.16), height: 0.12 }, { kind: 'obstacle', env: 'rock', name: 'Great crystal', shape: round(0, -0.02, 0.08, 6), height: 0.6 }, { kind: 'obstacle', env: 'ruin', name: 'Horn pillar', shape: round(-0.15, -0.31, 0.06, 6), height: 0.65 }, { kind: 'obstacle', env: 'ruin', name: 'Horn pillar', shape: round(0.18, -0.31, 0.06, 6), height: 0.65 }] },
  { id: 'ice-temple-gate', name: 'Ice temple gate', model: 'ice-temple-gate.glb', size: [8, 10, 14], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Gate wall', shape: box(-0.33, -0.02, 0.14, 0.12), height: 0.4 }, { kind: 'obstacle', env: 'ruin', name: 'Gate pier', shape: box(-0.17, -0.03, 0.14, 0.2), height: 0.72 }, { kind: 'obstacle', env: 'ruin', name: 'Gate pier', shape: box(0.155, -0.03, 0.14, 0.2), height: 0.72 }, { kind: 'obstacle', env: 'ruin', name: 'Gate wall', shape: box(0.32, -0.02, 0.14, 0.12), height: 0.4 }] },
  { id: 'kitsune-shrine-statues', name: 'Kitsune shrine', model: 'kitsune-shrine-statues.glb', size: [8, 10, 13], parts: [{ kind: 'obstacle', env: 'building', name: 'Kitsune shrine', shape: box(-0.01, -0.18, 0.36, 0.32), height: 0.55 }, { kind: 'obstacle', env: 'ruin', name: 'Fox statue', shape: round(-0.35, 0.01, 0.07, 6), height: 0.42 }, { kind: 'obstacle', env: 'ruin', name: 'Fox statue', shape: round(0.35, 0.01, 0.07, 6), height: 0.42 }] },
  { id: 'lotus-pond-waterfall', name: 'Lotus pond', model: 'lotus-pond-waterfall.glb', size: [7, 10, 14], parts: [{ kind: 'area', env: 'water', name: 'Lotus pond', shape: ngon(-0.01, 0.04, 0.28, 10, 0, 0.9), height: 0 }, { kind: 'obstacle', env: 'rock', name: 'Waterfall rock', shape: round(-0.01, -0.36, 0.12, 8), height: 0.3 }, { kind: 'obstacle', env: 'ruin', name: 'Lantern', shape: round(-0.2, -0.24, 0.05, 6), height: 0.25 }, { kind: 'obstacle', env: 'ruin', name: 'Moon arch', shape: rect(0.24, -0.18, 0.24, 0.05, 55), height: 0.33 }] },
  { id: 'moon-gate-sakura-arch', name: 'Moon gate', model: 'moon-gate-sakura-arch.glb', size: [8, 10, 13], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Moon gate wall', shape: box(-0.3, -0.08, 0.25, 0.09), height: 0.5 }, { kind: 'obstacle', env: 'ruin', name: 'Moon gate wall', shape: box(0.29, -0.08, 0.24, 0.09), height: 0.5 }] },
  { id: 'moss-boulder-shrine', name: 'Moss boulder shrine', model: 'moss-boulder-shrine.glb', size: [5, 7, 10], parts: [{ kind: 'obstacle', env: 'rock', name: 'Moss boulder', shape: round(0.07, -0.18, 0.19, 8), height: 0.42 }, { kind: 'obstacle', env: 'ruin', name: 'Lantern', shape: round(-0.275, -0.07, 0.045, 6), height: 0.36 }] },
  { id: 'raised-terrace-shrine', name: 'Raised terrace', model: 'raised-terrace-shrine.glb', size: [8, 11, 14], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Terrace', shape: round(0.01, -0.13, 0.33, 12), height: 0.22 }, { kind: 'obstacle', env: 'ruin', name: 'Terrace stairs', shape: box(0.08, 0.27, 0.2, 0.24), height: 0.11 }, { kind: 'obstacle', env: 'ruin', name: 'Terrace arch', shape: box(0.07, -0.43, 0.42, 0.05), height: 0.5 }] },
  { id: 'ruined-gazebo-pavilion', name: 'Ruined gazebo', model: 'ruined-gazebo-pavilion.glb', size: [7, 9, 12], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Gazebo floor', shape: box(0, -0.02, 0.66, 0.6), height: 0.1 }, { kind: 'obstacle', env: 'ruin', name: 'Gazebo pillar', shape: round(-0.3, -0.3, 0.045, 6), height: 0.5 }, { kind: 'obstacle', env: 'ruin', name: 'Gazebo pillar', shape: round(0.3, -0.3, 0.045, 6), height: 0.5 }, { kind: 'obstacle', env: 'ruin', name: 'Gazebo pillar', shape: round(-0.3, 0.26, 0.045, 6), height: 0.5 }, { kind: 'obstacle', env: 'ruin', name: 'Gazebo pillar', shape: round(0.3, 0.26, 0.045, 6), height: 0.5 }] },
  { id: 'runic-dais-platform', name: 'Runic dais', model: 'runic-dais-platform.glb', size: [8, 11, 14], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Runic dais', shape: round(0, -0.01, 0.36, 12), height: 0.13 }, { kind: 'obstacle', env: 'ruin', name: 'Pillar', shape: round(-0.32, 0, 0.05, 6), height: 0.55 }, { kind: 'obstacle', env: 'ruin', name: 'Broken arch', shape: box(-0.03, -0.36, 0.14, 0.1), height: 0.65 }, { kind: 'obstacle', env: 'ruin', name: 'Pillar', shape: round(0.3, -0.13, 0.06, 6), height: 0.55 }, { kind: 'obstacle', env: 'ruin', name: 'Pillar stump', shape: round(-0.24, -0.22, 0.05, 6), height: 0.25 }] },
  { id: 'snow-fortress-tower', name: 'Snow fortress tower', model: 'snow-fortress-tower.glb', size: [8, 11, 15], parts: [{ kind: 'obstacle', env: 'building', name: 'Fortress tower', shape: box(0, -0.19, 0.34, 0.4), height: 0.75 }, { kind: 'obstacle', env: 'ruin', name: 'Tower terrace', shape: box(0.03, 0.21, 0.5, 0.38), height: 0.3 }, { kind: 'obstacle', env: 'ruin', name: 'Tower stairs', shape: box(-0.23, 0.23, 0.14, 0.3), height: 0.15 }] },
  { id: 'snow-spire-crag', name: 'Snow spire crag', model: 'snow-spire-crag.glb', size: [6, 8, 11], parts: [{ kind: 'obstacle', env: 'rock', name: 'Ice spires', shape: round(0.03, -0.13, 0.2, 8), height: 0.75 }, { kind: 'obstacle', env: 'ruin', name: 'Snowy arch', shape: round(-0.31, 0.04, 0.06, 6), height: 0.5 }, { kind: 'obstacle', env: 'ruin', name: 'Snowy arch', shape: round(0.385, -0.02, 0.05, 6), height: 0.25 }] },
  { id: 'snow-wolf-statues', name: 'Snow wolf statues', model: 'snow-wolf-statues.glb', size: [7, 9, 12], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Wolf statue', shape: rect(-0.25, -0.065, 0.26, 0.26, -15), height: 0.7 }, { kind: 'obstacle', env: 'ruin', name: 'Wolf statue', shape: rect(0.22, 0.02, 0.26, 0.24, 15), height: 0.7 }] },
  { id: 'statue-alcove-shrine', name: 'Alcove shrine', model: 'statue-alcove-shrine.glb', size: [7, 9, 12], parts: [{ kind: 'obstacle', env: 'building', name: 'Alcove shrine', shape: box(-0.02, 0, 0.6, 0.46), height: 0.88 }] },
  { id: 'stone-forest-bridge', name: 'Forest bridge', model: 'stone-forest-bridge.glb', size: [7, 9, 12], parts: [{ kind: 'obstacle', env: 'ruin', name: 'Forest bridge', shape: box(-0.31, 0.0, 0.09, 0.33), height: 0.07 }, { kind: 'obstacle', env: 'ruin', name: 'Forest bridge', shape: box(-0.22, 0.0, 0.09, 0.33), height: 0.14 }, { kind: 'obstacle', env: 'ruin', name: 'Forest bridge', shape: box(0.01, 0.0, 0.39, 0.33), height: 0.2 }, { kind: 'obstacle', env: 'ruin', name: 'Forest bridge', shape: box(0.25, 0.0, 0.09, 0.33), height: 0.14 }, { kind: 'obstacle', env: 'ruin', name: 'Forest bridge', shape: box(0.34, 0.0, 0.09, 0.33), height: 0.07 }] },
  { id: 'tiered-waterfall-dais', name: 'Tiered dais', model: 'tiered-waterfall-dais.glb', size: [9, 11, 14], parts: [{ kind: 'obstacle', env: 'rock', name: 'Lower tier', shape: round(0.03, -0.08, 0.34, 12), height: 0.2 }, { kind: 'obstacle', env: 'ruin', name: 'Upper dais', shape: round(0.065, -0.12, 0.2, 12), height: 0.4 }, { kind: 'obstacle', env: 'ruin', name: 'Dais stairs', shape: rect(0.03, 0.3, 0.3, 0.16, -35), height: 0.1 }, { kind: 'obstacle', env: 'ruin', name: 'Dais stairs', shape: box(0.175, 0.12, 0.14, 0.1), height: 0.3 }, { kind: 'obstacle', env: 'ruin', name: 'Dais arch', shape: box(0.065, -0.27, 0.16, 0.05), height: 0.57 }] },
  { id: 'winter-snowy-pines', name: 'Snowy pines', model: 'winter-snowy-pines.glb', size: [7, 10, 14], parts: [{ kind: 'area', env: 'forest', name: 'Snowy pines', shape: round(-0.08, 0, 0.36, 9), height: 0.8 }, { kind: 'obstacle', env: 'rock', name: 'Pine', shape: round(-0.28, -0.08, 0.05, 6), height: 0.8 }, { kind: 'obstacle', env: 'rock', name: 'Pine', shape: round(0.11, 0.08, 0.06, 6), height: 0.8 }, { kind: 'obstacle', env: 'ruin', name: 'Arch pier', shape: round(-0.25, 0.235, 0.03, 6), height: 0.42 }, { kind: 'obstacle', env: 'ruin', name: 'Arch pier', shape: round(-0.06, 0.225, 0.03, 6), height: 0.42 }] },
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

const GARDEN_STREAM: Pt[] = [
  [20.6, -0.5], [20.8, 2], [21.5, 4], [22.9, 5.1], [24.7, 5.8], [26.2, 7.2], [26.8, 9], [27.2, 10.7], [28.3, 11.8], [30.3, 12.2], [32, 13], [32.8, 14.3], [33, 15.7], [33.7, 16.7], [35, 17.2], [36.5, 17.4],
].map(([x, y]) => ({ x: x!, y: y! }));

const FROZEN_STREAM: Pt[] = [
  [14.5, -0.5], [14.2, 2], [14.8, 3.7], [16.7, 4.8], [19.3, 5.3], [22, 5.7], [23.8, 6.7], [24.5, 8.3], [25.3, 10], [27.3, 11.2], [29, 12.2], [29.7, 13.7], [30.7, 15], [32.7, 15.7], [34.7, 16], [36.5, 16.3],
].map(([x, y]) => ({ x: x!, y: y! }));

export const BASES: Base[] = [
  { id: 'meadow', name: 'Open field', fixed: [] },
  { id: 'stream', name: 'Sanctuary meadow with a stream', ground: 'stream.jpg', relief: 0.16, fixed: river('river', STREAM, 1.7) },
  { id: 'garden', name: 'Elven garden with a turquoise stream', ground: 'garden.jpg', relief: 0.1, fixed: river('brook', GARDEN_STREAM, 1.5) },
  { id: 'desert', name: 'Desert plaza with a ceremonial mosaic', ground: 'desert.jpg', relief: 0.06, fixed: [] },
  { id: 'frozen', name: 'Frozen Nordic courtyard with an icy stream', ground: 'frozen.jpg', relief: 0.08, fixed: river('ice', FROZEN_STREAM, 1.8) },
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
  { id: 'garden', name: 'Elven garden', base: 'garden', items: [
    { kit: 'cherry-pagoda-pavilion', x: 4.8, y: 11.5, size: 9, turn: 270 },
    { kit: 'stone-forest-bridge', x: 27, y: 9.9, size: 7, turn: 0 },
    { kit: 'moon-gate-sakura-arch', x: 24, y: 21.2, size: 9, turn: 90 },
    { kit: 'crystal-cherry-tree', x: 19, y: 12.5, size: 10, turn: 0 },
    { kit: 'cherry-stone-lanterns', x: 13.5, y: 17.5, size: 6, turn: 30 },
    { kit: 'lotus-pond-waterfall', x: 29, y: 30, size: 10, turn: 0 },
    { kit: 'ruined-gazebo-pavilion', x: 18.5, y: 28.8, size: 8, turn: 0 },
    { kit: 'moss-boulder-shrine', x: 16, y: 5, size: 7, turn: 200 },
    { kit: 'hollow-fallen-log', x: 33, y: 23.3, size: 7, turn: 20 },
  ] },
  { id: 'desert', name: 'Desert plaza', base: 'desert', items: [
    { kit: 'altar', x: 18, y: 17.3, size: 8, turn: 0 },
    { kit: 'corner', x: 7.5, y: 9, size: 10, turn: 0 },
    { kit: 'corner', x: 28.5, y: 26, size: 10, turn: 180 },
    { kit: 'arch', x: 27.5, y: 9, size: 8, turn: 45 },
    { kit: 'arch', x: 8.5, y: 26, size: 8, turn: 225 },
    { kit: 'boulders', x: 5.5, y: 17.5, size: 5, turn: 0 },
    { kit: 'boulders', x: 30.5, y: 17, size: 5, turn: 90 },
    { kit: 'wall', x: 13, y: 29, size: 7, turn: 15 },
    { kit: 'wall', x: 23, y: 6, size: 7, turn: 195 },
    { kit: 'rock', x: 16.5, y: 26.5, size: 4, turn: 0 },
    { kit: 'rock', x: 19.5, y: 8, size: 4, turn: 180 },
  ] },
  { id: 'frozen', name: 'Frozen courtyard', base: 'frozen', items: [
    { kit: 'ice-crystal-menhir-dais', x: 18, y: 17, size: 10, turn: 0 },
    { kit: 'frozen-stone-bridge', x: 20.6, y: 5.5, size: 7, turn: 90 },
    { kit: 'snow-fortress-tower', x: 6, y: 9.5, size: 11, turn: 0 },
    { kit: 'ice-temple-gate', x: 18, y: 28, size: 10, turn: 0 },
    { kit: 'frost-dragon-statue', x: 30, y: 23.5, size: 10, turn: 200 },
    { kit: 'frosted-colonnade-ruins', x: 6.5, y: 24.5, size: 10, turn: 20 },
    { kit: 'snow-wolf-statues', x: 30.5, y: 5.5, size: 8, turn: 0 },
    { kit: 'winter-snowy-pines', x: 4.5, y: 17.5, size: 9, turn: 0 },
    { kit: 'frozen-snow-log', x: 26.5, y: 16.5, size: 7, turn: 100 },
    { kit: 'frozen-ice-pond', x: 10.5, y: 32.3, size: 7, turn: 0 },
    { kit: 'snow-spire-crag', x: 25.5, y: 32, size: 8, turn: 0 },
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
