// From WarBracket's data to the game engine's: a saved list becomes a party, a map's rules shapes become
// terrain, a quest code becomes the engine's Quest. Names are matched, so both sides keep their own ids.

import { MOUNTS } from '../frontend/src/lib/eld/mounts.ts';
import type { PartyList } from '../frontend/src/lib/eld/party.ts';
import { PROFILES, type Profile } from '../frontend/src/lib/eld/profiles.ts';
import type { Pt, TerrainPiece } from '../frontend/src/lib/eld/types.ts';
import { UPGRADES, upgradeProblem } from '../frontend/src/lib/eld/upgrades.ts';

const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\bthe\b/g, '')
    .replace(/[^a-z0-9]/g, '');

/** WarBracket faction codes / names -> the engine's faction names. */
const FACTION: Record<string, string> = {
  helianleague: 'Helian League',
  empireofsoga: 'Empire of Soga',
  coalitionofthenion: 'Coalition of Thenion',
  sandkingdoms: 'Sand Kingdoms',
  goblinwartribes: 'Goblin Wartribes',
  oniclans: 'Oni Clans',
  undead: 'Undead',
  adventurersguild: 'Neutral',
  neutral: 'Neutral',
};

export const factionName = (codeOrName: unknown): string => FACTION[norm(codeOrName)] ?? String(codeOrName ?? '');

/** One line of a saved list: the unit's name, whether it leads, and the names of its Upgrades. */
export interface ListUnit {
  name: string;
  leader?: boolean;
  items?: string[];
}

export interface ListInput {
  faction: string;
  units: ListUnit[];
}

/** A saved list as a party of the engine, or a text saying what could not be matched. */
export function partyFrom(list: ListInput): PartyList | string {
  if (!list || !Array.isArray(list.units) || list.units.length === 0) return 'The list has no models';
  const faction = factionName(list.faction);
  const models: Profile[] = [];
  const upgrades: string[][] = [];
  const mounts: boolean[] = [];
  const steeds: string[] = [];
  let leader = -1;
  for (const u of list.units.slice(0, 30)) {
    const key = norm(u?.name);
    const profile = PROFILES.find((p) => !p.summoned && norm(p.name) === key);
    if (!profile) {
      // A Mount is its own line in a WarBracket list; in the game it goes under its Rider.
      const steed = MOUNTS.find((m) => norm(m.name) === key);
      if (!steed) return `${String(u?.name ?? '?')} has no card in the game yet`;
      steeds.push(steed.id);
      continue;
    }
    if (u.leader && leader < 0) leader = models.length;
    const own: string[] = [];
    for (const item of Array.isArray(u.items) ? u.items.slice(0, 6) : []) {
      const named = UPGRADES.filter((x) => norm(x.name) === norm(item));
      if (named.length === 0) return `The Upgrade ${String(item)} has no card in the game yet`;
      const fit = named.find((x) => !own.includes(x.id) && x.faction === faction && !upgradeProblem(x, profile, faction)) ?? named.find((x) => !own.includes(x.id) && !upgradeProblem(x, profile, faction)) ?? named[0]!;
      own.push(fit.id);
    }
    models.push(profile);
    upgrades.push(own);
    mounts.push(false);
  }
  for (const id of steeds) {
    const i = models.findIndex((p, k) => p.mount === id && !mounts[k]);
    if (i < 0) return 'A Mount in the list has no Rider';
    mounts[i] = true;
  }
  if (models.length === 0) return 'The list has no models';
  // A list without a Leader (Roster format): the first model with Stratagems leads.
  if (leader < 0) leader = Math.max(0, models.findIndex((p) => p.stratagems.length > 0));
  return { faction, models: models.map((p) => p.id), leader, upgrades, mounts };
}

/** A rules shape of a WarBracket map (inches): a solid obstacle with a height, or an area with Environments. */
export interface MapShape {
  id?: string;
  kind: 'OBSTACLE' | 'AREA';
  points: Pt[];
  height?: number;
  envs?: string[];
  name?: string;
}

/** Environments the engine has rules for. The others stay on the picture for the players to apply. */
const AREA_ENV: Record<string, { env: TerrainPiece['env']; name: string }> = {
  AQUATIC_SHALLOW: { env: 'water', name: 'Shallow Water' },
  FOREST: { env: 'forest', name: 'Forest' },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function terrainFrom(shapes: unknown): TerrainPiece[] {
  const out: TerrainPiece[] = [];
  if (!Array.isArray(shapes)) return out;
  let n = 0;
  for (const raw of shapes.slice(0, 400) as MapShape[]) {
    const pts = Array.isArray(raw?.points) ? raw.points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 200) : [];
    if (pts.length < 3) continue;
    const shape = pts.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
    const height = Number.isFinite(raw.height) ? Math.max(0, Math.min(40, Number(raw.height))) : 0;
    if (raw.kind === 'OBSTACLE') {
      if (height <= 0.01) continue;
      out.push({ id: `w${++n}`, kind: 'obstacle', env: 'ruin', name: typeof raw.name === 'string' && raw.name ? raw.name.slice(0, 40) : 'Scenery', shape, height: round2(height) });
      continue;
    }
    for (const e of Array.isArray(raw.envs) ? raw.envs : []) {
      const known = AREA_ENV[String(e)];
      if (known) out.push({ id: `w${++n}`, kind: 'area', env: known.env, name: known.name, shape, height: known.env === 'forest' ? 3 : 0 });
    }
  }
  return out;
}

/** WarBracket quest code -> the Quest the engine runs by itself (null: the players score it by hand). */
const QUEST: Record<string, string> = {
  TREASURE_HUNT: 'treasure-hunt',
  OPEN_HOSTILITIES: 'open-hostilities',
  AWAITING_REINFORCEMENTS: 'awaiting-reinforcements',
};

export const questFor = (code: unknown): string | null => QUEST[String(code ?? '')] ?? null;
