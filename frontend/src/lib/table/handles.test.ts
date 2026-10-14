import { test } from "node:test";
import assert from "node:assert/strict";
import { frameHandles, grabRadius, hitHandle, insideFrame, rotationToward, scaleToward, terrainInfoAt } from "./handles.ts";

const f = { x: 10, y: 10, widthIn: 4, heightIn: 2, rotation: 0 };

test("frame: corners, the rotation knob above the top edge, hits", () => {
  const h = frameHandles(f);
  assert.deepEqual(h.corners[0], { x: 8, y: 9 });
  assert.ok(Math.abs(h.knob.y - (9 - 1.2)) < 1e-9);
  assert.equal(hitHandle({ x: 12.1, y: 11.1 }, f, 0.3), "scale");
  assert.equal(hitHandle({ x: 10, y: 7.8 }, f, 0.3), "rotate");
  assert.equal(hitHandle({ x: 10, y: 10 }, f, 0.3), null);
  assert.ok(insideFrame({ x: 11.9, y: 10.9 }, f));
  // turned 90°: the long side is vertical
  assert.ok(insideFrame({ x: 10.9, y: 11.9 }, { ...f, rotation: 90 }));
  assert.ok(!insideFrame({ x: 11.9, y: 10.9 }, { ...f, rotation: 90 }));
});

test("frame: rotation toward the pointer and scale by the corner distance", () => {
  assert.equal(rotationToward(f, { x: 15, y: 10 }), 90); // pointer to the right = knob to the right
  assert.equal(rotationToward(f, { x: 10, y: 5 }), 0);
  assert.equal(rotationToward(f, { x: 14, y: 6.5 }, 15), 45);
  assert.ok(Math.abs(scaleToward(f, 1, { x: 12, y: 11 }, { x: 14, y: 12 }) - 2) < 1e-9);
});

test("touch-sized handles and the terrain under the pointer", () => {
  assert.ok(Math.abs(grabRadius(10) - 1.6) < 1e-9); // a phone: 16 px at 10 px per inch
  assert.equal(grabRadius(100), 0.35);
  const terrain = [
    { kind: "AREA" as const, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], height: 0, envs: ["FOREST" as const] },
    { kind: "OBSTACLE" as const, points: [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }], height: 3, envs: [] },
  ];
  assert.deepEqual(terrainInfoAt({ x: 3, y: 3 }, terrain), { height: 3, obstacle: true, envs: ["FOREST"] });
  assert.equal(terrainInfoAt({ x: 20, y: 20 }, terrain), null);
});
