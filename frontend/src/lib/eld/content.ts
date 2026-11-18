import { checkPlacement, inDeployZone, ngon, rect, turned } from './geometry.ts';
import { PROFILES, type Profile } from './profiles.ts';
import type { BaseSize, Pt, Side, TableState, TerrainPiece } from './types.ts';

export interface Faction {
  name: string;
  /** Placeholder figure colour (hex). */
  color: number;
  /** Can be picked for a random warband. */
  playable: boolean;
}

export const FACTIONS: Faction[] = [
  { name: 'Helian League', color: 0xd9a441, playable: true },
  { name: 'Empire of Soga', color: 0xb23a48, playable: true },
  { name: 'Coalition of Thenion', color: 0x7b4fa3, playable: true },
  { name: 'Sand Kingdoms', color: 0x2f9e9a, playable: true },
  { name: 'Goblin Wartribes', color: 0x7a9a3a, playable: true },
  { name: 'Oni Clans', color: 0xc0392b, playable: true },
  { name: 'Undead', color: 0x9aa5a8, playable: false },
  { name: 'Neutral', color: 0xa08a70, playable: false },
  { name: 'Summoned', color: 0x6b7280, playable: false },
];

export const factionColor = (name: string): number => FACTIONS.find((f) => f.name === name)?.color ?? 0xa08a70;
export const profilesOf = (faction: string): Profile[] => PROFILES.filter((p) => p.faction === faction);

export const SIDE_COLORS = [0x3b82f6, 0xef4444] as const;
export const SIDE_NAMES = ['Blue', 'Red'] as const;
export const DEFAULT_POINTS = 60;

/** Standard 36" x 36" table with a handful of terrain pieces. Deployment strips (8") stay clear. */
export function defaultTerrain(): TerrainPiece[] {
  return [
    { id: 't1', kind: 'obstacle', env: 'building', name: 'House', shape: rect(9, 14, 6, 4, 12), height: 3, ladders: [turned(9, 14, 3, 0, 12)] },
    { id: 't2', kind: 'obstacle', env: 'building', name: 'Watchtower', shape: rect(27, 21, 3.5, 3.5, -20), height: 5, ladders: [turned(27, 21, 0, 1.75, -20)] },
    { id: 't3', kind: 'obstacle', env: 'ruin', name: 'Ruined wall', shape: rect(18, 12, 7, 0.6, -8), height: 1.6 },
    { id: 't4', kind: 'obstacle', env: 'ruin', name: 'Ruined wall', shape: rect(15.2, 14.6, 0.6, 5, -8), height: 1.2 },
    { id: 't5', kind: 'obstacle', env: 'rock', name: 'Rocks', shape: ngon(20, 23, 2, 7, 10, 0.75), height: 1.4 },
    { id: 't6', kind: 'obstacle', env: 'rock', name: 'Boulder', shape: ngon(30, 12, 1.2, 6, 25), height: 1 },
    { id: 't7', kind: 'area', env: 'forest', name: 'Forest', shape: ngon(8, 23.5, 3.6, 9, 0, 0.8), height: 3 },
    { id: 't8', kind: 'area', env: 'forest', name: 'Forest', shape: ngon(25.5, 13.5, 3, 8, 15, 0.85), height: 3 },
    { id: 't9', kind: 'area', env: 'water', name: 'Pond', shape: ngon(15.5, 21, 2.6, 10, 0, 0.7), height: 0 },
  ];
}

/**
 * A random party for one faction: a Leader with Stratagems first, then models while points and Limits allow.
 * `rnd` returns 0..1. Returns profile ids, the Leader first.
 */
export function randomParty(faction: string, points: number, rnd: () => number): string[] {
  const pool = profilesOf(faction);
  const pick = <T>(list: T[]): T => list[Math.min(list.length - 1, Math.floor(rnd() * list.length))]!;
  const party: Profile[] = [];
  let left = points;
  const leaders = pool.filter((p) => p.stratagems.length > 0 && p.cost <= points);
  if (leaders.length > 0) {
    party.push(pick(leaders));
    left -= party[0]!.cost;
  }
  while (party.length < 6) {
    const can = pool.filter((p) => p.cost <= left && (p.limit === null || party.filter((x) => x.id === p.id).length < p.limit));
    if (can.length === 0) break;
    const next = pick(can);
    party.push(next);
    left -= next.cost;
  }
  return party.map((p) => p.id);
}

/** First free spot for a base of this size in a side's Deployment Zone, starting from the middle of the edge. */
export function deploySpot(state: TableState, side: Side, size: BaseSize): Pt | null {
  if (state.deploy === 'corner') {
    // Rings around the side's corner, nearest first.
    const c = side === 0 ? { x: 0, y: state.height } : { x: state.width, y: 0 };
    for (let ring = 2; ring < state.deployDepth; ring += 1.7) {
      for (let i = 0; i <= 6; i++) {
        const a = ((side === 0 ? -90 : 90) + 7.5 + i * 12.5) * (Math.PI / 180);
        const x = Math.round((c.x + ring * Math.cos(a)) * 100) / 100;
        const y = Math.round((c.y + ring * Math.sin(a)) * 100) / 100;
        if (inDeployZone(state, side, size, y, state.deployDepth, x) && checkPlacement(state, size, x, y) === null) return { x, y };
      }
    }
    return null;
  }
  const rows = [2.6, 5.4];
  for (const row of rows) {
    const y = side === 0 ? state.height - row : row;
    for (let i = 0; i < 12; i++) {
      const x = state.width / 2 + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 3.4 + (row === rows[0] ? 0 : 1.7);
      if (inDeployZone(state, side, size, y) && checkPlacement(state, size, x, y) === null) return { x, y };
    }
  }
  return null;
}
