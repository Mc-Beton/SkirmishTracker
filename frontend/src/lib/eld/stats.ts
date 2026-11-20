import { GENERIC, profileById, type Profile, type Weapon } from './profiles.ts';
import { enchantFx } from './spells.ts';
import { mounted, mountById } from './mounts.ts';
import type { Grant, Model, StateName } from './types.ts';
import type { Boon } from './stratagems.ts';
import { withUpgrades } from './upgrades.ts';

export const STAT_KEYS = ['sta', 'spd', 'arm', 'off', 'def', 'acc', 'int', 'ag', 't', 'm'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export const STAT_LABEL: Record<StatKey, string> = {
  sta: 'STA',
  spd: 'SPD',
  arm: 'ARM',
  off: 'OFF',
  def: 'DEF',
  acc: 'ACC',
  int: 'INT',
  ag: 'AG',
  t: 'T',
  m: 'M',
};

/** States that halve attributes. Flat modifiers are applied first, then halving / doubling, rounding up. */
const HALVES: Partial<Record<StateName, StatKey[]>> = {
  Crouched: ['spd', 'arm'],
  Confused: ['off', 'def', 'acc', 'int', 'ag', 'm'],
  Crippled: ['spd', 'ag'],
  Slowed: ['spd'],
  Weakened: ['t'],
};
const DOUBLES: Partial<Record<StateName, StatKey[]>> = {
  Flying: ['spd'],
};

/** What each state does, in a few words (shown as a tooltip). */
export const STATE_HINT: Record<StateName, string> = {
  Bleeding: 'Toughness roll each Strategic Phase, a fail causes a Wound',
  Blinded: 'No line of sight; only Assist, Dodge or Nothing',
  Confused: 'OFF, DEF, ACC, INT, AG and M halved',
  Crippled: 'SPD and AG halved',
  Crouched: 'SPD and ARM halved, Strike 1, only Walk or Idle',
  Dead: 'Out of the game',
  Engaged: 'Only Idle or Walk towards the enemy; only Melee Attack, Assist (self) or Dodge',
  Fatigued: 'Gains no AP in the Upkeep Phase',
  Flying: 'SPD doubled, moves over scenery and models',
  Immobilized: 'Cannot move; cancel with a successful Dodge',
  Incapacitated: '0 HP: no Activations or Reactions; another Wound kills',
  Panicked: 'Morale roll at each Activation or Reaction',
  Poisoned: 'Toughness -6 roll each Strategic Phase, a fail causes a Wound',
  Shrouded: 'Represented by a token; can only be targeted by Perceive',
  Slowed: 'SPD halved',
  Weakened: 'T halved, -1 STA',
  'Defensive Stance': 'Warrior: Strike 1 in the Active Role, full Strike in the Reactive Role (chosen in the Strategic Phase)',
};

type Carded = Pick<Model, 'profileId' | 'upgrades' | 'boons' | 'mount' | 'picks'>;
/** The model's card, with its Upgrades and what Stratagems give it (Traits, Skills, Classes) applied. */
export const profileOf = (m: Carded): Profile => {
  const card = withUpgrades(profileById(m.profileId) ?? GENERIC, m.upgrades, m.picks);
  const steed = m.mount?.on ? mountById(m.mount.id) : undefined;
  const p = steed ? mounted(card, steed) : card;
  const grants = (m.boons ?? []).map((b) => b.fx).filter((fx) => fx.traits?.length || fx.skills?.length || fx.classes?.length);
  if (grants.length === 0) return p;
  const more = (have: readonly string[], add: (string[] | undefined)[]) => [...have, ...add.flat().filter((x): x is string => !!x && !have.includes(x))];
  return {
    ...p,
    traits: more(p.traits, grants.map((g) => g.traits ?? [])),
    skills: more(p.skills, grants.map((g) => g.skills ?? [])),
    classes: more(p.classes, grants.map((g) => g.classes ?? [])),
  };
};

export function baseStats(p: Profile): Stats {
  return { sta: p.sta, spd: p.spd, arm: p.arm, off: p.off, def: p.def, acc: p.acc, int: p.int, ag: p.ag, t: p.t, m: p.m };
}

/** A model's attributes after its states are applied. */
export function effectiveStats(p: Profile, states: readonly StateName[], enchants: readonly { name: string }[] = [], boons: readonly Grant[] = []): Stats {
  const s = baseStats(p);
  for (const b of boons) for (const [key, n] of Object.entries(b.fx.stats ?? {})) s[key as StatKey] = Math.max(0, s[key as StatKey] + n);
  if (states.includes('Weakened')) s.sta = Math.max(0, s.sta - 1);
  for (const e of enchants) {
    const fx = enchantFx(e.name);
    for (const [key, n] of Object.entries(fx?.stats ?? {})) s[key as StatKey] = Math.max(0, s[key as StatKey] + n);
    // Arcane Shield: +4 ARM, but never above the cap.
    if (fx?.armCap !== undefined) s.arm = Math.max(s.arm, Math.min(s.arm + 4, fx.armCap));
  }
  for (const key of STAT_KEYS) {
    let halves = 0;
    let doubles = 0;
    for (const st of states) {
      if (HALVES[st]?.includes(key)) halves++;
      if (DOUBLES[st]?.includes(key)) doubles++;
    }
    // A halving and a doubling of the same attribute cancel each other out.
    const cancel = Math.min(halves, doubles);
    for (let i = 0; i < halves - cancel; i++) s[key] = Math.ceil(s[key] / 2);
    for (let i = 0; i < doubles - cancel; i++) s[key] = s[key] * 2;
  }
  return s;
}

export const modelStats = (m: Model): Stats => effectiveStats(profileOf(m), m.states, m.enchants, m.boons);
export const hasBoon = (m: Pick<Model, 'boons'>, test: (fx: Boon) => unknown): Grant | undefined => (m.boons ?? []).find((b) => test(b.fx));
export const hasEnchant = (m: Pick<Model, 'enchants'>, name: string): boolean => (m.enchants ?? []).some((e) => e.name === name);

/** "T+2", "STA-1", "INT", "M", "13": a number that may lean on an attribute. */
function formula(text: string, stats: Stats): number | null {
  const m = /^(T|STA|INT|M)\s*([+-]\s*\d+)?$/.exec(text.trim());
  if (m) return stats[m[1]!.toLowerCase() as StatKey] + (m[2] ? Number(m[2].replace(/\s/g, '')) : 0);
  return /^\d+$/.test(text.trim()) ? Number(text) : null;
}

/** Power and Strike of a weapon for this model right now. `reactive`: Strike is 1 in the Reactive Role. */
export function weaponNumbers(weapon: Weapon, stats: Stats, states: readonly StateName[], reactive: boolean): { pw: number | null; stk: number | null } {
  const pw = formula(weapon.pw, stats);
  let stk = formula(weapon.stk, stats);
  if (stk !== null) {
    stk = Math.max(1, stk);
    const stance = states.includes('Defensive Stance');
    // Reactive Role: Strike 1 (a Warrior in Defensive Stance keeps its Strike there and has 1 when active).
    if ((reactive && !stance) || (!reactive && stance) || states.includes('Crouched')) stk = 1;
  }
  return { pw, stk };
}

const starts = (list: string[], name: string): boolean => list.some((t) => t === name || t.startsWith(name + ' '));
/** Does the model have this Trait / Skill / Class? Levels and brackets are ignored: "Undead" matches "Undead I". */
export const hasTrait = (m: Carded, name: string): boolean => starts(profileOf(m).traits, name);
export const hasSkill = (m: Carded, name: string): boolean => starts(profileOf(m).skills, name);
export const hasClass = (m: Carded, name: string): boolean => profileOf(m).classes.includes(name);

/** Awareness radius in inches (measured from the edge of the base). */
export const awareness = (stats: Stats): number => stats.ag;
