import { PROFILES, type Profile } from './profiles.ts';
import { UPGRADES } from './upgrades.ts';

// Seasons: every season the points, Limits and skill sets of some models change. A season is a list of changes
// on top of the cards built into the game, kept as data on the server and edited by the server owner.

export const PROFILE_NUMBERS = ['cost', 'sta', 'spd', 'arm', 'hp', 'off', 'def', 'acc', 'int', 'ag', 't', 'm', 'tier'] as const;
export const PROFILE_LISTS = ['classes', 'traits', 'skills', 'arts', 'stratagems'] as const;

export type ProfileChange = Partial<Record<(typeof PROFILE_NUMBERS)[number], number>> & Partial<Record<(typeof PROFILE_LISTS)[number], string[]>> & { limit?: number | null };
export interface UpgradeChange {
  cost?: number;
  limit?: number | null;
}
export interface Season {
  id: string;
  name: string;
  created: number;
  profiles: Record<string, ProfileChange>;
  upgrades: Record<string, UpgradeChange>;
}

export const BASE_SEASON: Season = { id: 'base', name: 'As printed on the cards', created: 0, profiles: {}, upgrades: {} };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** The cards as built in, before any season. */
const PRINTED = new Map(PROFILES.map((p) => [p.id, clone(p)]));
const PRINTED_UPGRADES = new Map(UPGRADES.map((u) => [u.id, { cost: u.cost, limit: u.limit }]));

export const printedProfile = (id: string): Profile | undefined => PRINTED.get(id);
let active: Season = BASE_SEASON;
export const activeSeason = (): Season => active;

const limitOk = (v: unknown): v is number | null => v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 20);

/** Checks a season and returns it cleaned (unknown ids and fields dropped), or a list of what is wrong. */
export function checkSeason(v: unknown): { ok: true; season: Omit<Season, 'id' | 'created'> } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 60) : '';
  if (!name) problems.push('A season needs a name');
  const profiles: Season['profiles'] = {};
  for (const [id, raw] of Object.entries((o.profiles ?? {}) as Record<string, unknown>)) {
    const base = PRINTED.get(id);
    if (!base || typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const out: ProfileChange = {};
    for (const k of PROFILE_NUMBERS) {
      if (r[k] === undefined) continue;
      const n = r[k];
      if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 99) problems.push(`${base.name}: ${k} must be a whole number from 0 to 99`);
      else if (n !== base[k]) out[k] = n as number;
    }
    if (r.limit !== undefined) {
      if (!limitOk(r.limit)) problems.push(`${base.name}: the Limit is a number from 1 to 20, or none`);
      else if (r.limit !== base.limit) out.limit = r.limit;
    }
    for (const k of PROFILE_LISTS) {
      if (r[k] === undefined) continue;
      const list = Array.isArray(r[k]) ? (r[k] as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 60)).filter(Boolean).slice(0, 20) : null;
      if (!list) problems.push(`${base.name}: ${k} is a list of names`);
      else if (JSON.stringify(list) !== JSON.stringify(base[k])) out[k] = list;
    }
    if (Object.keys(out).length > 0) profiles[id] = out;
  }
  const upgrades: Season['upgrades'] = {};
  for (const [id, raw] of Object.entries((o.upgrades ?? {}) as Record<string, unknown>)) {
    const base = PRINTED_UPGRADES.get(id);
    if (!base || typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const out: UpgradeChange = {};
    if (r.cost !== undefined) {
      if (!Number.isInteger(r.cost) || (r.cost as number) < 0 || (r.cost as number) > 99) problems.push(`Upgrade ${id}: the cost must be a whole number from 0 to 99`);
      else if (r.cost !== base.cost) out.cost = r.cost as number;
    }
    if (r.limit !== undefined) {
      if (!limitOk(r.limit)) problems.push(`Upgrade ${id}: the Limit is a number from 1 to 20, or none`);
      else if (r.limit !== base.limit) out.limit = r.limit;
    }
    if (Object.keys(out).length > 0) upgrades[id] = out;
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, season: { name, profiles, upgrades } };
}

/** Puts the cards back as printed and lays the season's changes over them. The same objects stay in use everywhere. */
export function applySeason(season: Season): void {
  for (const p of PROFILES) {
    const base = PRINTED.get(p.id);
    if (!base) continue;
    Object.assign(p, clone(base), clone(season.profiles[p.id] ?? {}));
  }
  for (const u of UPGRADES) {
    const base = PRINTED_UPGRADES.get(u.id);
    if (base) Object.assign(u, base, season.upgrades[u.id] ?? {});
  }
  active = season;
}

/** Names the rules engine has seen on the printed cards: a new name on a card is shown but has no effect. */
export function knownNames(kind: (typeof PROFILE_LISTS)[number]): Set<string> {
  const out = new Set<string>();
  for (const p of PRINTED.values()) for (const n of p[kind]) out.add(n);
  return out;
}
