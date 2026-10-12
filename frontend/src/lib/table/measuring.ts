/**
 * Modes of measuring (Core Rules v1.6 p.18), chosen when the table is created. They limit what the browser
 * pre-measures for a player; the judge and observers always see everything. The server never relies on it:
 * a declared move longer than the model can go simply stops at its limit.
 *
 * - Assisted: any distance.
 * - Standard: only within the Awareness of the player's own models, and the activated model's Movement;
 *   while a model is moving only its Movement; templates are not pre-measured (they are placed = declared).
 * - Realism: nothing is pre-measured.
 */
import { awarenessRadius, measure } from "./aoe.ts";
import { dist, type Piece, type Vec } from "./geometry.ts";
import type { MeasureMode, TableRole } from "./api.ts";

export type Point = Piece | Vec;

const isPiece = (p: Point): p is Piece => "id" in p;

/** May this viewer see the distance between a and b right now? */
export function canMeasure(mode: MeasureMode, role: TableRole, mine: Piece[], a: Point, b: Point, moving = false): boolean {
  if (role !== "PLAYER" || mode === "ASSISTED") return true;
  if (mode === "REALISM" || moving) return false;
  return mine.some((p) => !p.states.includes("DEAD") && inAwareness(p, a) && inAwareness(p, b));
}

/** The point (or any part of the model's base) lies within the model's Awareness. */
function inAwareness(p: Piece, q: Point): boolean {
  if (isPiece(q) && q.id === p.id) return true;
  return isPiece(q) ? measure(p, q) <= p.ag + 1e-6 : dist(p.pos, q) <= awarenessRadius(p) + 1e-6;
}

/** The planned route of the activated model shows its length and where it would stop. */
export const showsRouteLength = (mode: MeasureMode, role: TableRole) => role !== "PLAYER" || mode !== "REALISM";

/** The Awareness ring is itself a measurement. */
export const showsAwareness = (mode: MeasureMode, role: TableRole) => role !== "PLAYER" || mode !== "REALISM";

/** The ruler is available at all (Standard checks each measurement with {@link canMeasure}). */
export const rulerAllowed = (mode: MeasureMode, role: TableRole) => role !== "PLAYER" || mode !== "REALISM";
