import { test } from "node:test";
import assert from "node:assert/strict";
import { canMeasure, rulerAllowed, showsRouteLength } from "./measuring.ts";
import type { Piece } from "./geometry.ts";

const piece = (id: string, x: number, y: number, ag = 6): Piece => ({
  id, side: "A", pos: { x, y }, facing: 0, size: "MEDIUM", spd: 5, ag, faction: "", keywords: [], states: [],
});

const me = piece("a1", 10, 10);
const far = piece("b1", 30, 10);
const near = piece("b2", 14, 10);

test("assisted measures anything, realism nothing", () => {
  assert.equal(canMeasure("ASSISTED", "PLAYER", [me], me, far), true);
  assert.equal(canMeasure("REALISM", "PLAYER", [me], me, near), false);
  assert.equal(rulerAllowed("REALISM", "PLAYER"), false);
  assert.equal(showsRouteLength("REALISM", "PLAYER"), false);
  assert.equal(showsRouteLength("STANDARD", "PLAYER"), true);
});

test("standard measures only inside the Awareness of an own model", () => {
  assert.equal(canMeasure("STANDARD", "PLAYER", [me], me, near), true);
  assert.equal(canMeasure("STANDARD", "PLAYER", [me], me, far), false);
  assert.equal(canMeasure("STANDARD", "PLAYER", [me], { x: 12, y: 12 }, { x: 8, y: 9 }), true);
  assert.equal(canMeasure("STANDARD", "PLAYER", [me], { x: 12, y: 12 }, { x: 25, y: 9 }), false);
  // not while a model is moving
  assert.equal(canMeasure("STANDARD", "PLAYER", [me], me, near, true), false);
});

test("the judge and observers always see distances", () => {
  assert.equal(canMeasure("REALISM", "JUDGE", [], me, far), true);
  assert.equal(canMeasure("STANDARD", "OBSERVER", [], me, far), true);
  assert.equal(rulerAllowed("REALISM", "OBSERVER"), true);
});
