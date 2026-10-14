/**
 * Deployment Zones (same rules as the backend `GameState.Deployment`): STANDARD – belts `depth` deep along the
 * bottom (player 1) and top (player 2) edge; CORNER – quarter circles of `radius` in the bottom-left (player 1)
 * and top-right (player 2) corner.
 */
import type { Vec } from "./geometry.ts";

export type Deployment = "STANDARD" | "CORNER";
export type DeploymentZone = { side: 0 | 1; points: Vec[] };

export const CORNER_RADIUS = 9;
export const STANDARD_DEPTH = 8;

function quarter(corner: Vec, radius: number, fromDeg: number): Vec[] {
  const pts: Vec[] = [corner];
  for (let i = 0; i <= 24; i++) {
    const a = ((fromDeg + (90 * i) / 24) * Math.PI) / 180;
    pts.push({ x: corner.x + radius * Math.cos(a), y: corner.y + radius * Math.sin(a) });
  }
  return pts;
}

export function deploymentZones(width: number, height: number, deployment: Deployment, depth = STANDARD_DEPTH,
  radius = CORNER_RADIUS): DeploymentZone[] {
  if (deployment === "CORNER") {
    // y points down: bottom-left corner opens up-right (−90°…0°), top-right corner opens down-left (90°…180°)
    return [
      { side: 0, points: quarter({ x: 0, y: height }, radius, -90) },
      { side: 1, points: quarter({ x: width, y: 0 }, radius, 90) },
    ];
  }
  return [
    { side: 0, points: [{ x: 0, y: height - depth }, { x: width, y: height - depth }, { x: width, y: height }, { x: 0, y: height }] },
    { side: 1, points: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: depth }, { x: 0, y: depth }] },
  ];
}
