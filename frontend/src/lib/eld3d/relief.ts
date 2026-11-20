// Ported from the game Eldfall Table (client/src/scene/relief.ts). Kept close to the original so that changes there can be
// carried over; WarBracket differences are marked `WarBracket`.
import { pointInPolygon } from '@/lib/eld/geometry.ts';
import type { Pt, TableState } from '@/lib/eld/types.ts';
import { noise3 } from './materials';

// Gentle rises and hollows in the ground, and the bed of a painted stream. Looks only: the rules treat the table
// as flat, so nothing here may be tall enough to mislead (a few tenths of an inch).

function edgeDistance(p: Pt, shape: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i]!;
    const b = shape[(i + 1) % shape.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
  }
  return best;
}

/** Height of the ground at a point of the table, in inches (0 on a flat table). */
export function reliefAt(state: Pick<TableState, 'relief' | 'terrain' | 'width' | 'height'>, x: number, y: number): number {
  const amp = state.relief ?? 0;
  if (!amp) return 0;
  // Flat along the edges, where the board's frame and the shelves meet the field.
  const rim = Math.min(1, Math.min(x, y, state.width - x, state.height - y) / 2.5);
  let h = (noise3(x * 0.11, y * 0.11, 3.7, 5) * 0.7 + noise3(x * 0.31, y * 0.31, 9.1, 8) * 0.3) * amp * Math.max(0, rim);
  for (const t of state.terrain) {
    if (!t.painted || t.env !== 'water' || !pointInPolygon({ x, y }, t.shape)) continue;
    h = Math.min(h, 0) - Math.min(0.22, edgeDistance({ x, y }, t.shape) * 0.45);
  }
  return h;
}
