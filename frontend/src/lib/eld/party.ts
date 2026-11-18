import { PROFILES, profileById, type Profile } from './profiles.ts';
import { upgradeById, upgradeProblem, upgradesCost, upgradeSlots } from './upgrades.ts';
import { mountById } from './mounts.ts';

// Building a party: which models a faction may recruit, and whether a list is valid.

export interface PartyList {
  faction: string;
  /** Profile ids, one entry per model. */
  models: string[];
  /** Index into `models` of the Leader. */
  leader: number;
  /** Upgrade ids per model, in the order of `models`. */
  upgrades?: string[][];
  /** Riders that come with their Mount, in the order of `models`. */
  mounts?: boolean[];
}

export const POINT_LIMITS = [60, 85, 100] as const;
export const MAX_PARTY = 10;

/** Factions a player can build a party for. */
export const PARTY_FACTIONS = ['Helian League', 'Empire of Soga', 'Coalition of Thenion', 'Sand Kingdoms', 'Goblin Wartribes', 'Oni Clans', 'Neutral'];

/** Monster Factions cannot hire Neutral models. */
const MONSTER = ['Goblin Wartribes', 'Oni Clans'];

/** Models with a lower Limit when hired as a Neutral (mercenary) by another faction. */
const MERCENARY_LIMIT: Record<string, number> = { 'the-slayer-dragoon': 1 };

/** Is this model one of the faction's own (as opposed to a hired Neutral or an ally)? */
export const isOwn = (p: Profile, faction: string): boolean => (faction === 'Neutral' ? p.faction === 'Neutral' || p.semiNeutral === true : p.faction === faction);

/** Every profile a party of this faction may contain: its own models first, then the ones it can hire. */
export function recruitPool(faction: string): Profile[] {
  const own = PROFILES.filter((p) => p.faction === faction);
  if (faction === 'Neutral') return [...own, ...PROFILES.filter((p) => p.semiNeutral && p.faction !== 'Neutral')];
  if (faction === 'Oni Clans') return [...own, ...PROFILES.filter((p) => p.faction === 'Undead')]; // the Undead march with the Oni
  if (MONSTER.includes(faction)) return own;
  return [...own, ...PROFILES.filter((p) => p.faction !== faction && (p.faction === 'Neutral' || p.semiNeutral))];
}

/** How many of this profile a party of `faction` may contain; null = no limit. */
export function limitIn(p: Profile, faction: string): number | null {
  if (p.faction !== faction && MERCENARY_LIMIT[p.id] !== undefined) return MERCENARY_LIMIT[p.id]!;
  return p.limit;
}

/** Recruitment Points of the models plus their Upgrades. */
export function partyPoints(models: string[], upgrades?: string[][], mounts?: boolean[]): number {
  return models.reduce((sum, id, i) => {
    const p = profileById(id);
    const steed = mounts?.[i] ? mountById(p?.mount) : undefined;
    return sum + (p ? p.cost + upgradesCost(p, upgradesOf(upgrades, i)) + (steed?.cost ?? 0) : 0);
  }, 0);
}

/** The Upgrades of model `i`, whatever shape the list arrived in. */
export function upgradesOf(upgrades: unknown, i: number): string[] {
  const row = Array.isArray(upgrades) ? upgrades[i] : undefined;
  return Array.isArray(row) ? row.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
}

/** Everything wrong with a list; an empty array means it is legal. */
export function partyProblems(list: PartyList, points: number): string[] {
  const out: string[] = [];
  if (!PARTY_FACTIONS.includes(list.faction)) return ['Unknown faction'];
  if (!Array.isArray(list.models) || list.models.length === 0) return ['The party has no models'];
  if (list.models.length > MAX_PARTY) out.push(`A party may contain up to ${MAX_PARTY} models`);
  const pool = recruitPool(list.faction);
  const counts = new Map<string, number>();
  for (const id of list.models) {
    const p = typeof id === 'string' ? pool.find((x) => x.id === id) : undefined;
    if (!p) {
      out.push(`${profileById(id)?.name ?? 'An unknown model'} cannot be recruited by ${list.faction}`);
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [id, n] of counts) {
    const p = profileById(id)!;
    const limit = limitIn(p, list.faction);
    if (limit !== null && n > limit) out.push(`${p.name}: ${n} recruited, Limit ${limit}`);
  }
  // Mounts: only for a Rider whose card names it; each Mount has its own Limit.
  const steeds = new Map<string, number>();
  list.models.forEach((id, i) => {
    if (!list.mounts?.[i]) return;
    const p = profileById(id);
    const steed = mountById(p?.mount);
    if (!steed) {
      out.push(`${p?.name ?? 'That model'} cannot ride a Mount`);
      return;
    }
    steeds.set(steed.id, (steeds.get(steed.id) ?? 0) + 1);
  });
  for (const [id, n] of steeds) {
    const steed = mountById(id)!;
    if (n > steed.limit) out.push(`${steed.name}: ${n} in the party, Limit ${steed.limit}`);
  }
  // Upgrades: who may carry what, how many, and the Limit of each per party.
  const bought = new Map<string, number>();
  list.models.forEach((id, i) => {
    const p = pool.find((x) => x.id === id);
    const ids = upgradesOf(list.upgrades, i);
    if (!p || ids.length === 0) return;
    const slots = upgradeSlots(p, ids);
    if (ids.length > slots) out.push(slots === 0 ? `${p.name} is a Character and cannot take Upgrades` : `${p.name}: ${ids.length} Upgrades, it may carry ${slots}`);
    const names = new Set<string>();
    for (const uid of ids) {
      const u = upgradeById(uid);
      if (!u) {
        out.push(`${p.name}: unknown Upgrade`);
        continue;
      }
      if (MONSTER.includes(list.faction) && u.faction !== 'Neutral') out.push(`${u.name}: Monster Factions buy Neutral Upgrades only`);
      const problem = upgradeProblem(u, p, list.faction);
      if (problem && slots > 0) out.push(`${u.name} on ${p.name}: ${problem}`);
      if (names.has(u.name)) out.push(`${p.name} has ${u.name} twice`);
      names.add(u.name);
      bought.set(u.name, (bought.get(u.name) ?? 0) + 1);
    }
  });
  for (const [name, n] of bought) {
    const limit = [...list.models.keys()].flatMap((i) => upgradesOf(list.upgrades, i)).map(upgradeById).find((u) => u?.name === name)?.limit ?? null;
    if (limit !== null && n > limit) out.push(`${name}: ${n} bought, Limit ${limit}`);
  }
  const total = partyPoints(list.models, list.upgrades, list.mounts);
  if (total > points) out.push(`${total} points – the limit is ${points}`);
  if (!list.models.some((id) => profileById(id) && isOwn(profileById(id)!, list.faction))) out.push(`At least one model must belong to ${list.faction}`);
  if (!Number.isInteger(list.leader) || list.leader < 0 || list.leader >= list.models.length) out.push('Choose a Leader');
  return out;
}
