import { baseRadius, checkPlacement, dist, distToSegment, facingTo, inShallowWater, pointInPolygon, surfaceAt, verticalGap } from './geometry.ts';
import { engagers, inFrontArc, sight } from './los.ts';
import type { Weapon } from './profiles.ts';
import { enchantFx, isSpell, spellElementOf, spellNamed, spellWeapons } from './spells.ts';
import { hasBoon, hasClass, hasEnchant, hasSkill, hasTrait, modelStats, profileOf, STAT_LABEL, weaponNumbers, type StatKey } from './stats.ts';
import type { Dealt, DiceResult, Intent, KitUse, Mods, Model, Pt, StateName, TableState, Until } from './types.ts';
import { hasUpgrade } from './upgrades.ts';
import { BASE_SIZES } from './types.ts';

// Attacks: what a model can attack with, whether a target is in Reach and sight, which Traits, Combat Arts,
// Class abilities and Skills change the attack, and how an Activation's Action and the Reactions against it
// are resolved (Confrontation, Dodge, Damage rolls, effects, Wounds).

export const UNARMED_INDEX = 99;
export const UNARMED: Weapon = { name: 'Unarmed', pw: 'T', rch: '0', stk: '1', type: 'Melee', effect: 'Unkeen' };
export const NO_MODS: Mods = { hit: 0, stk: 0, pw: 0, art: '' };

/** Bases this close (1.5 mm) count as touching. */
export const CONTACT = 0.06;

// ---- items that run out, and Throwing ----

/** Index of a Throwing item used for its Ranged Attack: THROWN_INDEX + its index on the card. */
export const THROWN_INDEX = 200;
const HYPERIA = 'hel-hyperias-providence';
/** How many of an item the card gives. */
export const quantityOf = (w: Weapon): number => Number(/Quantity (\d+)/.exec(w.effect ?? '')?.[1] ?? 1);
/** A Throwing item that returns to the Inventory when it is thrown. */
const comesBack = (w: Weapon): boolean => /Thrown, it returns/.test(w.effect ?? '');
/** May be thrown: a Ranged Attack with Reach equal to the user's Toughness. */
export const isThrowing = (w: Weapon): boolean => /\bThrowing\b/.test(w.effect ?? '') || comesBack(w);
/** Items that run out: Consumables, Throwing items, and ranged items with a Quantity. */
export const runsOut = (w: Weapon): boolean => !comesBack(w) && (/Consumable/.test(w.type) || /\bThrowing\b/.test(w.effect ?? '') || (w.type.startsWith('Ranged') && /Quantity \d/.test(w.effect ?? '')));
/** Used up by an Attack made with it (a Throwing item only when it is thrown). */
const usedUp = (w: Weapon): boolean => /Consumable/.test(w.type) || (w.type.startsWith('Ranged') && /Quantity \d/.test(w.effect ?? ''));
/** How many of the item the model still carries. */
export const itemsLeft = (m: Pick<Model, 'items'>, w: Weapon): number => m.items?.[w.thrown ?? w.name] ?? quantityOf(w);
/** Casting Amplifier: +4 Reach when casting Spells. */
export const spellReach = (m: Model): number => (profileOf(m).weapons.some((w) => /\+4 RCH when casting Spells/.test(w.effect ?? '')) ? 4 : 0);

/** Mana a model can pay with: its own and, for a Summoner, that of the other Summoners of its party. */
export function manaPool(state: TableState, m: Model): number {
  const own = m.mana ?? 0;
  if (!hasClass(m, 'Summoner')) return own;
  return own + state.models.filter((o) => o.side === m.side && o.id !== m.id && !o.states.includes('Dead') && !o.states.includes('Incapacitated') && hasClass(o, 'Summoner')).reduce((n, o) => n + (o.mana ?? 0), 0);
}
/** Who pays how much of a Mana Cost: the caster first, then the Summoners it shares its pool with. */
export function manaBill(state: TableState, m: Model, cost: number): { id: string; spent: number }[] {
  const out: { id: string; spent: number }[] = [];
  let left = cost;
  const payers = [m, ...(hasClass(m, 'Summoner') ? state.models.filter((o) => o.side === m.side && o.id !== m.id && !o.states.includes('Dead') && !o.states.includes('Incapacitated') && hasClass(o, 'Summoner')) : [])];
  for (const p of payers) {
    const n = Math.min(left, p.mana ?? 0);
    if (n > 0) out.push({ id: p.id, spent: n });
    left -= n;
  }
  return out;
}

/** The Hazy area a Haze Bomb leaves. */
export const HAZE = 'Haze';
/** Is a Hazy area in play between two models: one of them stands in it, or the line between them crosses it? */
function hazeOn(state: TableState, a: Model, b: Model): 'none' | 'in' | 'through' {
  let through = false;
  for (const t of state.terrain) {
    if (t.name !== HAZE || t.shape.length === 0) continue;
    const c = { x: t.shape.reduce((n, p) => n + p.x, 0) / t.shape.length, y: t.shape.reduce((n, p) => n + p.y, 0) / t.shape.length };
    const r = dist(c, t.shape[0]!);
    if (dist(a, c) <= r + baseRadius(a.size) || dist(b, c) <= r + baseRadius(b.size)) return 'in';
    if (distToSegment(c, a, b) < r) through = true;
  }
  return through ? 'through' : 'none';
}

/** A weapon or Spell that can only be used at range. A "Ranged/Melee" Spell is decided per Attack. */
export const isRanged = (w: Weapon): boolean => w.type.startsWith('Ranged') || (isSpell(w) && w.type.endsWith(', Ranged'));

/** Everything on the card that can make an Attack, plus Unarmed. `index` is what commands refer to. */
export function attackOptions(m: Model): { index: number; weapon: Weapon }[] {
  const cards = profileOf(m)
    .weapons.map((weapon, index) => ({ index, weapon }))
    .filter((o) => o.weapon.pw !== '-' && o.weapon.stk !== '-');
  // An item that has run out is gone.
  const out = cards.filter((o) => !runsOut(o.weapon) || itemsLeft(m, o.weapon) > 0);
  out.push({ index: UNARMED_INDEX, weapon: UNARMED });
  // Attack Spells the model knows.
  for (const s of spellWeapons(profileOf(m))) out.push({ index: s.index, weapon: s.weapon });
  // Throwing: the item as a Ranged Attack with Reach T and one Strike for each of it the model carries.
  for (const o of cards) {
    if (!isThrowing(o.weapon) || isRanged(o.weapon)) continue;
    const left = comesBack(o.weapon) ? 1 : itemsLeft(m, o.weapon);
    if (left > 0) out.push({ index: THROWN_INDEX + o.index, weapon: { ...o.weapon, name: `${o.weapon.name} (thrown)`, rch: 'T', stk: String(left), type: 'Ranged, Thrown', thrown: o.weapon.name } });
  }
  return out;
}

export const weaponAt = (m: Model, index: number): Weapon | undefined => attackOptions(m).find((o) => o.index === index)?.weapon;

// ---- templates ----

/** A template: a circle (radius in inches) or a spray (a cone from the attacker's base, length and width at the far end). */
export type Area = { shape: 'circle'; r: number; label: string } | { shape: 'spray'; length: number; width: number; label: string };

const MM = 1 / 25.4;
/**
 * The template a weapon or Spell uses, from its Reach text. Circular: 70 mm and 120 mm across. Spray: 213 mm
 * and 260 mm long; the rulebook does not print the width, 70 mm and 95 mm at the far end are assumed.
 */
export function areaOf(w: Weapon): Area | null {
  const c = /Circular\s*(S|L)/.exec(w.rch);
  if (c) return { shape: 'circle', r: (c[1] === 'L' ? 120 : 70) * MM * 0.5, label: `Circular ${c[1]}` };
  const s = /Spray\s*(S|L)/.exec(w.rch);
  if (s) return s[1] === 'L' ? { shape: 'spray', length: 260 * MM, width: 95 * MM, label: 'Spray L' } : { shape: 'spray', length: 213 * MM, width: 70 * MM, label: 'Spray S' };
  return null;
}
/** May be aimed at any spot, not only at a model. */
export const isTargetless = (w: Weapon): boolean => /Targetless/.test(w.effect ?? '');
export const manaCost = (w: Weapon): number => Number(/Mana Cost: (\d+)/.exec(w.effect ?? '')?.[1] ?? 0);

export const AOE_POINT = '-point-';
/** A stand-in "target" for an Attack aimed at a spot on the table. */
export function pointTarget(attacker: Model, at: Pt): Model {
  return { id: AOE_POINT, side: attacker.side === 0 ? 1 : 0, name: 'a spot on the table', faction: '', profileId: '', kind: 'warrior', size: 'small', leader: false, x: at.x, y: at.y, facing: facingTo(at, attacker), hp: 1, maxHp: 1, ap: 0, states: [] };
}

/**
 * The models a template touches (their Hitbox is at least partly under it), the attacker excepted.
 * Circular: centred on `at`, and only models the centre has a line of sight to. Spray: from the attacker's
 * base towards `at`, and only models the attacker has a line of sight to.
 */
export function areaVictims(state: TableState, attacker: Model, area: Area, at: Pt): Model[] {
  const alive = state.models.filter((m) => m.id !== attacker.id && !m.states.includes('Dead'));
  if (area.shape === 'circle') {
    // A model standing on the centre is not in the way of the blast.
    const open: TableState = { ...state, models: state.models.filter((o) => dist(o, at) > baseRadius(o.size)) };
    return alive.filter((m) => {
      const d = dist(m, at);
      if (d > area.r + baseRadius(m.size) + 1e-6) return false;
      if (d <= baseRadius(m.size)) return true;
      const eye: Model = { ...pointTarget(attacker, at), side: m.side === 0 ? 1 : 0, facing: facingTo(at, m) };
      return sight(open, eye, m).los;
    });
  }
  const far = dist(attacker, at);
  if (far < 1e-6) return [];
  const ux = (at.x - attacker.x) / far;
  const uy = (at.y - attacker.y) / far;
  const ax = attacker.x + ux * baseRadius(attacker.size);
  const ay = attacker.y + uy * baseRadius(attacker.size);
  return alive.filter((m) => {
    const r = baseRadius(m.size);
    const along = (m.x - ax) * ux + (m.y - ay) * uy;
    const across = Math.abs((m.x - ax) * uy - (m.y - ay) * ux);
    if (along < -r || along > area.length + r) return false;
    const half = (area.width / 2) * (Math.min(area.length, Math.max(0, along)) / area.length);
    return across <= half + r + 1e-6 && sight(state, attacker, m).los;
  });
}

/** Distance between the closest points of two Hitboxes. */
/** Distance between two Hitboxes: across the table and, for models at different heights, up or down. */
export const gap = (a: Model, b: Model): number => Math.hypot(Math.max(0, dist(a, b) - baseRadius(a.size) - baseRadius(b.size)), verticalGap(a, b));

/** Is the target within the weapon's Reach, and which range modifier applies? `extend`: inches added to the first range band. */
export function reachCheck(attacker: Model, target: Model, weapon: Weapon, extend = 0, more = 0): { ok: boolean; mod: number } {
  const d = gap(attacker, target) - CONTACT; // a hair's breadth still counts as Base Contact
  const rch = weapon.rch.trim();
  if (/^\d+$/.test(rch)) return { ok: d <= Number(rch) + (Number(rch) > 0 ? more : 0), mod: 0 };
  const bands = [...rch.matchAll(/(\d+)-(\d+)":\s*([+-]?\d+)/g)];
  if (bands.length > 0) {
    const band = bands.find((b, i) => d <= Number(b[2]) + (i === 0 ? extend : 0));
    return band ? { ok: true, mod: Number(band[3]) } : { ok: false, mod: 0 };
  }
  if (/Spray\s*L/.test(rch)) return { ok: d <= 10.24, mod: 0 };
  if (/Spray\s*S/.test(rch)) return { ok: d <= 8.39, mod: 0 };
  // Casting Aura: the caster's Awareness.
  if (rch.startsWith('Casting Aura')) return { ok: d <= modelStats(attacker).ag, mod: 0 };
  const lead = /^(\d+)\b/.exec(rch);
  if (lead) return { ok: d <= Number(lead[1]) + more, mod: 0 };
  if (rch.startsWith('T')) return { ok: d <= modelStats(attacker).t, mod: 0 };
  return { ok: true, mod: 0 };
}

// ---- Combat Arts ----

interface ArtLevel {
  label: string;
  pw?: number;
  stk?: number;
  traits?: string[];
  /** Assassination IV: in the Active Role every successful Attack roll is a Critical Hit. */
  allCrit?: boolean;
  /** Fencing I / II: the target's Melee Attack suffers this. */
  foeHit?: number;
  foeStk?: number;
  /** Archery I: inches added to the first range band. */
  range?: number;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const ARTS: Record<string, { use: 'melee' | 'ranged' | 'any'; levels: ArtLevel[] }> = {
  Assassination: {
    use: 'any',
    levels: [{ label: '+6 PW', pw: 6 }, { label: 'Poison I', traits: ['Poison I'] }, { label: '+1 Strike', stk: 1 }, { label: 'hits become Critical (Active Role)', allCrit: true }],
  },
  Fencing: {
    use: 'melee',
    levels: [
      { label: "target's Melee Attack −3", foeHit: -3 },
      { label: "target's Melee Attack −1 Strike", foeStk: -1 },
      { label: '+1 Strike', stk: 1 },
      { label: 'Knockdown', traits: ['Knockdown'] },
      { label: 'Ignore Armor', traits: ['Ignore Armor'] },
    ],
  },
  Berserk: {
    use: 'melee',
    levels: [{ label: 'Knockdown', traits: ['Knockdown'] }, { label: 'Sweep I', traits: ['Sweep I'] }, { label: 'Crippling', traits: ['Crippling'] }, { label: 'Cleave', traits: ['Cleave'] }],
  },
  Archery: {
    use: 'ranged',
    levels: [{ label: 'first range band +6"', range: 6 }, { label: 'a hit target is Slowed', traits: ['Slowing'] }, { label: 'Stagger', traits: ['Stagger'] }, { label: '+1 Strike', stk: 1 }],
  },
};

function parseArt(text: string): { name: string; level: number } | null {
  const m = /^(.+) (I|II|III|IV|V)$/.exec(text.trim());
  return m && ARTS[m[1]!] ? { name: m[1]!, level: ROMAN.indexOf(m[2]!) } : null;
}

/** The Combat Art levels this model may add to an attack with this kind of weapon. */
export function artOptions(m: Model, ranged: boolean): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const owned of profileOf(m).arts) {
    const art = parseArt(owned);
    if (!art) continue;
    const def = ARTS[art.name]!;
    if (def.use !== 'any' && (def.use === 'ranged') !== ranged) continue;
    def.levels.slice(0, art.level).forEach((lv, i) => out.push({ id: `${art.name} ${ROMAN[i + 1]}`, label: `${art.name} ${ROMAN[i + 1]}: ${lv.label}` }));
  }
  return out;
}

// ---- planning an attack ----

export interface AttackPlan {
  ok: boolean;
  /** Why the attack cannot be made (empty when ok). */
  reason: string;
  weapon: Weapon | null;
  ranged: boolean;
  /** The attribute rolled against, after all modifiers. */
  attr: number;
  attrName: string;
  stk: number;
  pw: number;
  /** Everything that was applied automatically, e.g. "Cover −2", "Armsmaster +1 Strike". */
  notes: string[];
  /** Effects on a Hit or a Wound: Armor-Piercing, Cleave, Bleed, Knockdown, Stun, Burn 3... */
  traits: string[];
  /** Rolls up to this value are Critical Hits (1; 3 for an Assassin). */
  critMax: number;
  allCrit: boolean;
  /** Strikes that hit without a roll (Backstab). */
  autoHits: number;
  /** No Confrontation against a smaller target. */
  unstoppable: boolean;
  /** Penalties this attack's Combat Art puts on the target's own Melee Attack. */
  foeHit: number;
  foeStk: number;
  /** Ranged Friendly Fire: the shooter's allies in Base Contact with the target (a roll of 17–20 hits one of them). */
  friendly: string[];
}

export interface AttackContext {
  /** The attacker is in its Reactive Role (DEF, Strike 1). */
  reactive: boolean;
  /** The attacker declared Idle in its Movement Step (Marksman). */
  idle?: boolean;
  /** The attacker ran (only possible with Dash: one unmodified Strike). */
  ran?: boolean;
  /** The opponent is a Duelist attacking this model: Combat Arts of level III or lower cannot be used. */
  foeDuelist?: boolean;
  /** The Attack was taken over by a Protector: it goes ahead even out of Reach or sight. */
  redirected?: boolean;
  /** Chain Attack: ignores Ranged Friendly Fire. */
  chain?: boolean;
}

const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
const sizeRank = (m: Model): number => BASE_SIZES.indexOf(m.size);

/** Traits written in a weapon's effect text. */
function weaponTraits(effect: string): string[] {
  const out: string[] = [];
  const has = (re: RegExp) => re.test(effect);
  for (const t of ['Armor-Piercing', 'Ignore Armor', 'Cleave', 'Crippling', 'Knockdown', 'Stagger', 'Stun', 'Weakening', 'Unkeen', 'Unstoppable', 'Two-Handed']) {
    if (has(new RegExp(`\\b${t}\\b`))) out.push(t);
  }
  if (has(/\bBleed\b/)) out.push('Bleed');
  if (has(/\bPoison II\b/)) out.push('Poison II');
  else if (has(/\bPoison I\b/)) out.push('Poison I');
  const burn = /\bBurn \((\d+)\)/.exec(effect);
  if (burn) out.push(`Burn ${burn[1]}`);
  for (const t of ['Slowing', 'Panic', 'Blinding', 'No Damage', 'Immobilize', 'Weaken Hit']) if (has(new RegExp(`\\b${t}\\b`))) out.push(t);
  if (has(/rolls T-3 or becomes Weakened/)) out.push('Acid');
  if (has(/On critical: Knockdown/)) out.push('Critical Knockdown');
  if (has(/\bSweep II\b/)) out.push('Sweep II');
  else if (has(/\bSweep I\b/)) out.push('Sweep I');
  const kb = /\bKnockback \(?(\w+)\)?/.exec(effect);
  if (kb) out.push(`Knockback ${kb[1]}`);
  return out;
}

/** The Shield a model is carrying (not while its main weapon is Two-Handed): modifier 3 or 2, or 0. */
function shieldOf(m: Model): number {
  const weapons = profileOf(m).weapons;
  const shield = weapons.find((w) => w.type === 'Shield');
  if (!shield || /Two-Handed/.test(weapons[0]?.effect ?? '')) return 0;
  return Number(/^-(\d)/.exec(shield.effect ?? '')?.[1] ?? 3);
}

/**
 * Soldier: +1 OFF, DEF, ACC, INT and M for each other Soldier of the party within Awareness that is still standing,
 * up to +3. With Companion of Hairon the model counts itself as well.
 */
export function soldierBonus(state: TableState, m: Model): number {
  if (!hasClass(m, 'Soldier') || m.states.includes('Dead') || m.states.includes('Incapacitated')) return 0;
  const reach = modelStats(m).ag;
  const others = state.models.filter((o) => o.id !== m.id && o.side === m.side && hasClass(o, 'Soldier') && !o.states.includes('Dead') && !o.states.includes('Incapacitated') && gap(m, o) <= reach + CONTACT);
  return Math.min(3, others.length + (hasUpgrade(m, 'hel-companion-of-hairon') ? 1 : 0));
}

/** Intellect for a roll (Perceive, resisting Charm or Taunt...), with the Soldier bonus. */
export const intOf = (state: TableState, m: Model): number => modelStats(m).int + soldierBonus(state, m);

/**
 * Work out an Attack before any dice are rolled. Used by the server to resolve it and by the client to show
 * the player what they are about to roll.
 */
/** The Elements and kinds a weapon counts as, for Resistance: "Spell", "Sorcery", "Fire", the weapon type words, its Traits. */
function attackKinds(weapon: Weapon, traits: string[]): string[] {
  const out = weapon.type.split(',').map((x) => x.trim()).filter(Boolean);
  if (isSpell(weapon)) {
    out.push('Spells');
    const el = spellElementOf(weapon.name);
    if (el) out.push(el);
  } else out.push('non-Spell');
  for (const t of traits) out.push(t, t.replace(/ (I|II|III|\d+)$/, ''));
  return out.map((x) => x.toLowerCase());
}

/** Resistance I (X): PW halved; Resistance II (X): Hits and effects negated – for Attacks of the listed Types or Traits. */
export function resistance(target: Model, weapon: Weapon, traits: string[]): { level: 1 | 2; name: string } | null {
  if (target.id === AOE_POINT) return null;
  const kinds = attackKinds(weapon, traits);
  let best: { level: 1 | 2; name: string } | null = null;
  for (const t of [...profileOf(target).traits, ...enchantTraits(target)]) {
    const m = /^Resistance (I{1,2}) \(([^)]*)\)/.exec(t);
    if (!m) continue;
    const listed = m[2]!.split(',').map((x) => x.trim().toLowerCase());
    if (!listed.some((x) => kinds.includes(x) || kinds.includes(x.replace(/s$/, '')))) continue;
    const level = m[1] === 'II' ? 2 : 1;
    if (!best || level > best.level) best = { level, name: t };
  }
  return best;
}

/** Traits a model has from the Enchantments on it (e.g. Natural Fortitude: Resistance I (Spell)). */
function enchantTraits(m: Model): string[] {
  return (m.enchants ?? []).flatMap((e) => (e.name === 'Natural Fortitude' ? ['Resistance I (Spell)'] : []));
}

/** Fall Damage: an AG roll for every full halved Speed of the fall (none when it is not more than that); a Wound per failure. */
export function fallRolls(model: Model, fall: number): number {
  const half = Math.ceil(modelStats(model).spd / 2);
  return model.states.includes('Flying') || fall <= half + 0.005 ? 0 : Math.floor(fall / half + 0.005);
}

/** Knockback (X) as a number of inches: "Knockback 2", "Knockback (2)", "Knockback I". */
export function knockbackInches(trait: string): number {
  const m = /Knockback \(?([IVX]+|\d+)\)?/.exec(trait);
  if (!m) return 0;
  const roman: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  return roman[m[1]!] ?? Number(m[1]);
}

/**
 * Where a Knockback leaves a model: straight away from the attacker (or along `dir`), up to X inches, stopping
 * before scenery it cannot stand in, other models or the table edge.
 */
export function knockbackTo(state: TableState, attacker: Pt, victim: Model, inches: number, dir?: Pt): Pt {
  let dx = dir ? dir.x : victim.x - attacker.x;
  let dy = dir ? dir.y : victim.y - attacker.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: victim.x, y: victim.y };
  dx /= len;
  dy /= len;
  let at = { x: victim.x, y: victim.y };
  let floor = surfaceAt(state, at);
  const step = 0.1;
  for (let d = step; d <= inches + 1e-9; d += step) {
    const p = { x: victim.x + dx * d, y: victim.y + dy * d };
    // Pushed into a wall or up against something taller: it stops there. It can be pushed off a ledge.
    const z = surfaceAt(state, p);
    if (z > floor + 0.05) break;
    if (z < floor - 0.05) {
      // Over the edge: it lands at the foot of the scenery, on the first spot where its base fits.
      for (let e = d; e <= d + 2 * baseRadius(victim.size) + 0.3; e += 0.1) {
        const q = { x: victim.x + dx * e, y: victim.y + dy * e };
        if (surfaceAt(state, q) <= z + 0.05 && !checkPlacement(state, victim.size, q.x, q.y, victim.id, true)) {
          at = q;
          break;
        }
      }
      break;
    }
    if (checkPlacement(state, victim.size, p.x, p.y, victim.id, true)) break;
    at = p;
  }
  return { x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100 };
}

/** A straight Walk towards another model: up to `inches`, stopping in Base Contact, before scenery it cannot cross or other models. */
export function walkToward(state: TableState, m: Model, target: Model, inches: number): Pt {
  const len = dist(m, target);
  if (len < 1e-6) return { x: m.x, y: m.y };
  const dx = (target.x - m.x) / len;
  const dy = (target.y - m.y) / len;
  const stopAt = Math.max(0, len - baseRadius(m.size) - baseRadius(target.size) - 0.01);
  let at = { x: m.x, y: m.y };
  let floor = surfaceAt(state, at);
  for (let d = 0.1; d <= Math.min(inches, stopAt) + 1e-9; d += 0.1) {
    const p = { x: m.x + dx * d, y: m.y + dy * d };
    const z = surfaceAt(state, p);
    if (Math.abs(z - floor) > 0.05 || checkPlacement(state, m.size, p.x, p.y, m.id, true)) break;
    at = p;
  }
  return { x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100 };
}

export function planAttack(state: TableState, attacker: Model, target: Model, weaponIndex: number, mods: Mods, ctx: AttackContext): AttackPlan {
  const weapon = weaponAt(attacker, weaponIndex) ?? null;
  const spell = weapon !== null && isSpell(weapon);
  const engagedBy = engagers(state, attacker);
  // A Ranged/Melee Spell is cast as a Melee Attack in Base Contact or when the caster is Engaged.
  const either = spell && weapon.type.endsWith('Ranged/Melee');
  const ranged = weapon ? (either ? !(attacker.states.includes('Engaged') || engagedBy.length > 0 || gap(attacker, target) <= CONTACT) : isRanged(weapon)) : false;
  const bad = (reason: string): AttackPlan => ({
    ok: false, reason, weapon, ranged, attr: 0, attrName: '', stk: 0, pw: 0, notes: [], traits: [], critMax: 1, allCrit: false, autoHits: 0, unstoppable: false, foeHit: 0, foeStk: 0, friendly: [],
  });
  if (!weapon) return bad('That is not a weapon this model can attack with');
  if (target.states.includes('Shrouded') && target.id !== AOE_POINT) return bad(`${target.name} is Shrouded: it can only be the target of Perceive`);
  const stats = modelStats(attacker);
  const nums = weaponNumbers(weapon, stats, attacker.states, ctx.reactive);
  if (nums.pw === null || nums.stk === null) return bad(`${weapon.name} cannot be used to attack`);
  // Ethereal Blades: Strike 5, 3 in the Reactive Role.
  if (weapon.name === 'Ethereal Blades' && !attacker.states.includes('Crouched')) nums.stk = ctx.reactive ? 3 : 5;
  const cost = manaCost(weapon);
  if (cost > manaPool(state, attacker)) return bad(`${weapon.name} costs ${cost} Mana – ${attacker.name} has ${manaPool(state, attacker)}`);
  const aura = weapon.rch.startsWith('Casting Aura');
  if (target.side === attacker.side) return bad('The target must be an enemy model');
  if (target.states.includes('Dead')) return bad(`${target.name} is Dead`);
  if (attacker.states.includes('Blinded')) return bad('A Blinded model cannot attack');
  if (ranged && (attacker.states.includes('Engaged') || engagedBy.length > 0)) return bad('An Engaged model can only make Melee Attacks');
  if (!ranged && target.states.includes('Flying') && !attacker.states.includes('Flying')) return bad('A Flying model cannot be targeted by Melee Attacks');
  if (ctx.ran && (ranged || !hasSkill(attacker, 'Dash'))) return bad(`${attacker.name} ran – it can only declare Nothing`);

  // Combat Art.
  let art: ArtLevel | null = null;
  const notes: string[] = [];
  if (mods.art) {
    const chosen = artOptions(attacker, ranged).find((o) => o.id === mods.art);
    const parsed = parseArt(mods.art);
    if (!chosen || !parsed) return bad(`${attacker.name} cannot use ${mods.art} with ${weapon.name}`);
    if (ctx.foeDuelist && parsed.level <= 3) notes.push(`${mods.art} cancelled by Duelist`);
    else {
      art = ARTS[parsed.name]!.levels[parsed.level - 1]!;
      notes.push(mods.art);
    }
  }

  // A spot on the table is seen past whoever stands on it.
  const world: TableState = target.id === AOE_POINT ? { ...state, models: state.models.filter((o) => dist(o, target) > baseRadius(o.size)) } : state;
  const view = sight(world, attacker, target);
  // An Engaged model automatically has line of sight to the enemies engaging it.
  // Casting Aura, Active Role: no line of sight is needed, but the casting attribute is halved.
  const blindCast = !view.los && aura && !ctx.reactive && !attacker.states.includes('Blinded');
  if (!view.los && !engagedBy.some((e) => e.id === target.id) && !ctx.redirected && !blindCast) {
    const why = { blinded: 'the attacker is Blinded', behind: 'the target is behind the attacker', blocked: 'the view is blocked', forest: 'two Forests are in the way', '': '' }[view.reason];
    return bad(`No line of sight to ${target.name}: ${why}`);
  }
  // Enchantments on the attacker.
  const charms: { name: string; fx?: { traits?: string[]; meleeTraits?: string[]; meleePw?: number; meleeReach?: number } }[] = [
    ...(attacker.enchants ?? []).map((e) => ({ name: e.name, fx: enchantFx(e.name) })).filter((e) => e.fx),
    // Stratagems: Traits on its Attacks, +PW on Melee / Spell Attacks.
    ...(attacker.boons ?? [])
      .filter((b) => b.fx.attackTraits?.length || b.fx.meleePw || (spell && b.fx.spellPw))
      .map((b) => ({ name: b.name, fx: { traits: b.fx.attackTraits, meleePw: b.fx.meleePw } })),
  ];
  const longer = ranged ? 0 : charms.reduce((n, e) => n + (e.fx!.meleeReach ?? 0), 0);
  const reach = reachCheck(attacker, target, longer && /^\d+$/.test(weapon.rch.trim()) ? { ...weapon, rch: String(Number(weapon.rch) + longer) } : weapon, art?.range ?? 0, spell ? spellReach(attacker) : 0);
  if (!reach.ok && !ctx.redirected) return bad(`${target.name} is out of ${ranged ? 'range' : 'Reach'} (${gap(attacker, target).toFixed(1)}")`);

  // --- the attribute rolled against ---
  // Spells are cast with Intellect; a Mystic casts with Morale, a Druid with the better of the two.
  const druid = spell && hasClass(attacker, 'Druid');
  const key: StatKey = spell ? (hasClass(attacker, 'Mystic') || (druid && stats.m > stats.int) ? 'm' : 'int') : ranged ? 'acc' : ctx.reactive ? 'def' : 'off';
  if (spell) notes.push(`Spell${either ? (ranged ? ', cast at range' : ', cast in melee') : ''}`);
  let attr = stats[key];
  const add = (n: number, why: string) => {
    if (n === 0) return;
    attr += n;
    notes.push(`${why} ${signed(n)}`);
  };
  if (cost > 0) notes.push(`${cost} Mana`);
  const plus = /\+(\d+) OFF\b/.exec(weapon.effect ?? '');
  if (plus && key === 'off') add(Number(plus[1]), weapon.name);
  const aim = /\+(\d+) ACC when used/.exec(weapon.effect ?? '');
  if (aim && key === 'acc') add(Number(aim[1]), weapon.name);
  if (druid && spellElementOf(weapon.name) === 'Earth') add(4, 'Druid (Earth)');
  if (/\+4 ACC if the target is within half RCH/.test(weapon.effect ?? '') && ranged && gap(attacker, target) <= stats.t / 2 + 0.005) add(4, 'within half Reach');
  if (blindCast) {
    attr = Math.ceil(attr / 2);
    notes.push('no line of sight: halved');
  }
  const snipe = mods.snipe === true;
  if (snipe && (!ranged || !hasSkill(attacker, 'Snipe'))) return bad(`${attacker.name} can only Snipe with a Ranged Attack${hasSkill(attacker, 'Snipe') ? '' : ' (it has no Snipe Skill)'}`);
  add(reach.mod, 'range');
  if (snipe) notes.push('Snipe: Cover ignored');
  else if (ranged && view.los && !aura) {
    add(view.cover, view.cover === -4 ? 'Heavy Cover' : 'Light Cover');
    add(view.forest ? -3 : 0, 'Forest');
    // Earthspeaker: Light Cover where there is none.
    if (view.cover === 0 && hasBoon(target, (fx) => fx.lightCover)) add(-2, 'Light Cover (Earthspeaker)');
    else if (view.cover === 0 && state.terrain.some((t) => t.cover === target.side && pointInPolygon(target, t.shape))) add(-2, 'Light Cover (Blessed Rain)');
  }
  // Ranged Friendly Fire: −4 for every model of the shooter's in Base Contact with the target.
  // Incapacitated and Dead models are ignored for it.
  let friendly: string[] = [];
  if (ranged && !snipe && !ctx.chain && !/AoE/.test(weapon.rch) && target.id !== AOE_POINT) {
    friendly = state.models.filter((o) => o.side === attacker.side && o.id !== attacker.id && !o.states.includes('Dead') && !o.states.includes('Incapacitated') && gap(o, target) <= CONTACT).map((o) => o.id);
    // The shooter says which of them a stray shot hits (otherwise the first).
    if (mods.ally && friendly.includes(mods.ally)) friendly = [mods.ally, ...friendly.filter((id) => id !== mods.ally)];
    add(-4 * friendly.length, 'Friendly Fire');
  }
  add(soldierBonus(state, attacker), 'Soldier');
  if (key === 'acc' && !ctx.reactive && ctx.idle && hasClass(attacker, 'Marksman')) add(4, 'Marksman (Idle)');
  if (hasTrait(attacker, 'Demon') && target.states.includes('Panicked') && !hasTrait(target, 'Demon')) add(4, 'Demon vs Panicked');
  const shield = shieldOf(target);
  const frontal = shield > 0 && inFrontArc(target, attacker);
  if (!ranged && frontal) add(-shield, 'Shield');
  if (ranged && frontal && hasUpgrade(target, HYPERIA)) add(-3, "Hyperia's Providence");
  for (const e of target.enchants ?? []) add(enchantFx(e.name)?.foeHit ?? 0, e.name);
  add(mods.hit, 'modifier');
  // Hazy Environment: no Ranged Attack through it; from within or into it the attribute is halved; Melee beyond Base Contact −3.
  const haze = attacker.states.includes('Flying') ? 'none' : hazeOn(state, attacker, target);
  if (haze === 'through' && ranged) return bad('A Hazy area is in the way: Ranged Attacks cannot target through it');
  if (haze === 'in' && ranged) {
    attr = Math.ceil(attr / 2);
    notes.push('Hazy: halved');
  } else if (haze === 'in' && gap(attacker, target) > CONTACT) add(-3, 'Hazy');
  attr = Math.max(0, attr);

  // --- Strike ---
  const traits = [...weaponTraits(weapon.effect ?? ''), ...(art?.traits ?? [])];
  // Vicious Opportunism: against a Crouched model +6 PW and Cleave (and one Attack roll rerolled).
  const vicious = target.states.includes('Crouched') && hasBoon(attacker, (b) => b.viciousVsCrouched);
  if (vicious && !traits.includes('Cleave')) traits.push('Cleave');
  // An Attack out of the Shrouded State reveals the model but has Surprise Attack.
  if (attacker.states.includes('Shrouded') && !traits.includes('Surprise Attack')) traits.push('Surprise Attack');
  for (const e of charms) {
    const extra = [...(e.fx!.traits ?? []), ...(ranged ? [] : e.fx!.meleeTraits ?? [])].filter((t) => !traits.includes(t));
    if (extra.length === 0 && !(e.fx!.meleePw && !ranged)) continue;
    traits.push(...extra);
    notes.push(e.name);
  }
  // Mounted: no Items with Reach 0 except the Mount's Natural Weapons.
  if (attacker.mount?.on && !spell && weapon.rch.trim() === '0' && !/Natural/.test(weapon.type)) return bad(`Mounted: ${attacker.name} cannot attack with a Reach 0 Item (only the Mount's Natural Weapons)`);
  let stk = nums.stk;
  const more = (n: number, why: string) => {
    if (n === 0) return;
    stk += n;
    notes.push(`${why} ${signed(n)} Strike`);
  };
  const fixedOne = attacker.states.includes('Crouched') || (!ranged && attacker.states.includes('Flying')) || ctx.ran === true;
  if (!fixedOne) {
    if (!ranged && !ctx.reactive && hasClass(attacker, 'Armsmaster')) more(1, 'Armsmaster');
    if (ctx.reactive && hasClass(attacker, 'Sentinel')) more(1, 'Sentinel');
    if (traits.includes('Two-Handed') && hasTrait(attacker, 'Brute')) more(1, 'Brute');
    if (!ctx.reactive && /\+1 STK in the Active Role/.test(weapon.effect ?? '')) more(1, weapon.name);
    if (target.states.includes('Crouched') && /\+1 STK against a Crouched model/.test(weapon.effect ?? '')) more(1, 'Crouched target');
    more(art?.stk ?? 0, 'Combat Art');
    more(mods.stk, 'modifier');
  } else if (ctx.ran) notes.push('Dash: 1 Strike');
  stk = Math.max(1, fixedOne ? 1 : stk);
  if (snipe) {
    stk = 1;
    notes.push('Snipe: Strike 1');
  }
  // Thrown: no more Strikes than the model has of the item.
  if (weapon.thrown) stk = Math.max(1, Math.min(stk, itemsLeft(attacker, weapon)));
  // Mounted: Abilities cannot raise the Strike of Weapons.
  if (attacker.mount?.on && stk > nums.stk && !spell) {
    stk = Math.max(1, nums.stk);
    notes.push('mounted: Strike not raised');
  }

  // --- Power ---
  let pw = nums.pw;
  const power = (n: number, why: string) => {
    if (n === 0) return;
    pw += n;
    notes.push(`${why} ${signed(n)} PW`);
  };
  power(art?.pw ?? 0, 'Combat Art');
  if (vicious) power(6, 'Vicious Opportunism');
  if (!ranged) for (const e of charms) power(e.fx!.meleePw ?? 0, e.name);
  if (spell) for (const b of attacker.boons ?? []) power(b.fx.spellPw ?? 0, b.name);
  // Mastery of Poisons: Poison I, or Poison II when the Attack already has Poison I.
  const venom = hasBoon(attacker, (fx) => fx.poisonUp);
  if (venom && !traits.includes('Poison II')) {
    const i = traits.indexOf('Poison I');
    if (i >= 0) traits[i] = 'Poison II';
    else traits.push('Poison I');
    notes.push(venom.name);
  }
  // Backstab: the target cannot see the attacker.
  const backstab = hasSkill(attacker, 'Backstab') && !sight(state, target, attacker).los;
  if (backstab) power(3, 'Backstab');
  power(mods.pw, 'modifier');
  if (hasTrait(target, 'Incorporeal') && !/Spell/.test(weapon.type) && !traits.some((t) => t.startsWith('Burn'))) {
    pw = Math.ceil(pw / 2);
    notes.push('Incorporeal: PW halved');
  }
  const resist = resistance(target, weapon, traits);
  if (resist?.level === 1) {
    pw = Math.ceil(pw / 2);
    notes.push(`${resist.name}: PW halved`);
  } else if (resist?.level === 2) notes.push(`${resist.name}: its Hits are negated`);
  if (ranged && frontal) notes.push(`Shield +${shield} ARM`);

  const unstoppable = (traits.includes('Unstoppable') || hasTrait(attacker, 'Unstoppable')) && sizeRank(target) < sizeRank(attacker);
  if (unstoppable) notes.push('Unstoppable: no Confrontation');
  const critMax = hasClass(attacker, 'Assassin') ? 3 : 1;
  if (critMax > 1) notes.push('Assassin: Critical on 1–3');
  const allCrit = art?.allCrit === true && !ctx.reactive;
  if (backstab) notes.push('Backstab: 1 automatic Hit');
  const tags = traits.filter((t) => t !== 'Two-Handed');
  if (tags.length) notes.push(tags.join(', '));

  return {
    ok: true, reason: '', weapon, ranged, attr, attrName: STAT_LABEL[key], stk, pw, notes, traits,
    critMax, allCrit, autoHits: backstab ? 1 : 0, unstoppable, foeHit: art?.foeHit ?? 0, foeStk: art?.foeStk ?? 0, friendly,
  };
}

/** One Wound: lose 1 HP; at 0 HP Incapacitated and Crouched (Undead: Dead); a Wound on an Incapacitated model kills it. */
export function woundOnce(hp: number, states: readonly StateName[], undead = false): { hp: number; states: StateName[] } {
  const without = (...gone: StateName[]) => states.filter((s) => !gone.includes(s));
  if (states.includes('Dead')) return { hp, states: [...states] };
  if (hp > 1) return { hp: hp - 1, states: [...states] };
  if (hp === 1 && !undead) return { hp: 0, states: [...new Set<StateName>([...without('Flying'), 'Incapacitated', 'Crouched'])] };
  return { hp: 0, states: [...new Set<StateName>([...without('Incapacitated', 'Flying'), 'Dead'])] };
}

/** States a model cannot enter because of its Traits. */
export function immuneTo(m: Model, state: StateName): boolean {
  if (hasTrait(m, 'Undead') && ['Poisoned', 'Weakened', 'Bleeding', 'Panicked'].includes(state)) return true;
  if (hasTrait(m, 'Construct') && ['Panicked', 'Bleeding', 'Poisoned', 'Weakened', 'Confused'].includes(state)) return true;
  if (hasTrait(m, 'Elemental') && ['Bleeding', 'Poisoned', 'Weakened'].includes(state)) return true;
  return state === 'Panicked' && hasTrait(m, 'Fearless');
}

interface Strike {
  d: number;
  hit: boolean;
  crit: boolean;
}

function rollStrikes(count: number, attr: number, d20: () => number, critMax = 1, allCrit = false): Strike[] {
  const out: Strike[] = [];
  for (let i = 0; i < count; i++) {
    const d = d20();
    const natural = attr > 0 && (d <= critMax || (attr > 20 && d === 20));
    const hit = attr > 0 && (d <= attr || natural);
    out.push({ d, hit, crit: natural || (allCrit && hit) });
  }
  return out;
}

const asDice = (rolls: Strike[], attr: number, label: string): DiceResult => ({
  dice: rolls.map((r) => r.d),
  target: attr,
  successes: rolls.filter((r) => r.hit).length,
  crits: rolls.filter((r) => r.crit).length,
  label,
});

/**
 * Confrontation: each successful roll cancels every enemy roll with an equal or lower result.
 * A Critical Hit beats every enemy roll and cannot be cancelled. Returns the rolls that land for each side.
 */
export function confront(a: Strike[], b: Strike[]): [Strike[], Strike[]] {
  const best = (rolls: Strike[]) => Math.max(0, ...rolls.filter((r) => r.hit && !r.crit).map((r) => r.d));
  const anyCrit = (rolls: Strike[]) => rolls.some((r) => r.crit);
  const survive = (mine: Strike[], theirs: Strike[]) => mine.filter((r) => r.hit && (r.crit || (!anyCrit(theirs) && r.d > best(theirs))));
  return [survive(a, b), survive(b, a)];
}

export interface CombatLine {
  text: string;
  dice?: DiceResult;
}

export interface CombatOutcome {
  lines: CombatLine[];
  /** Final HP, states and AP of every model the fight changed. */
  results: { id: string; hp: number; states: StateName[]; ap?: number; temp?: Partial<Record<StateName, Until>>; to?: Pt }[];
  /** Once-per-turn abilities that were spent. */
  used: { id: string; what: string }[];
  /** Who wounded whom, in order. */
  dealt: Dealt[];
  /** Mana Counters spent on Spells. */
  mana: { id: string; spent: number }[];
  /** Items and Luck counters used up. */
  kit: KitUse[];
  /** A template was placed. */
  placed: boolean;
}

export interface ReactionInfo {
  intent: Intent;
  weapon: number;
  mods: Mods;
  /** Attack of Opportunity: where the activated model was on its route when it came into Reach. */
  at?: Pt;
}

interface Harm {
  wounds: number;
  states: Set<StateName>;
  /** When a state given in this sequence ends by itself; absent = it stays. */
  until: Map<StateName, Until>;
  /** States the model already had for a while that now stay. */
  lasting: Set<StateName>;
  apLoss: number;
  apAll: boolean;
  /** Knockback: where the model ends up. */
  push?: Pt;
}

/**
 * Resolution Step of an Activation Sequence.
 * - The activated model attacks `target`, dodges, or does nothing.
 * - Every reacting model that declared an Attack attacks the activated model; if the activated model attacks
 *   that same model the two are in a Confrontation.
 * - A Dodge (1 die against AG, halved without line of sight) negates all non-critical Hits of one attacker.
 * - Each Hit is a Damage roll against PW − ARM; each success is a Wound. Traits, Combat Arts, Class abilities
 *   and Skills listed in the attack plan are applied.
 * All Wounds and effects take hold together at the end.
 */
export function resolveAction(
  state: TableState,
  active: Model,
  action: 'attack' | 'dodge' | 'nothing',
  weaponIndex: number,
  target: Model | null,
  mods: Mods,
  reactions: Record<string, ReactionInfo>,
  d20: () => number,
  moved = 0,
  opts: {
    /** Reacting models that had line of sight to the activated model at some point of its Activation. */
    seen?: ReadonlySet<string> | undefined;
    /** The target is a Protector that stepped in. */
    redirected?: boolean;
    /** The Attack uses a template: everybody under it is hit, not only the target. */
    area?: { label: string; victims: string[] } | undefined;
    /** Strikes given to other targets (the main target keeps the rest). */
    split?: { id: string; n: number }[] | undefined;
    /** Knockback pushes away from this point (a Circular template's centre) instead of the attacker. */
    kbFrom?: Pt | undefined;
    /** Knockback: the attacker's chosen direction per pushed model (a vector). */
    kbDir?: Record<string, Pt> | undefined;
  } = {},
): CombatOutcome {
  const seen = opts.seen;
  const blows: Dealt[] = [];
  const mana: { id: string; spent: number }[] = [];
  const lines: CombatLine[] = [];
  const used: CombatOutcome['used'] = [];
  const harm = new Map<string, Harm>();
  const harmOf = (m: Model): Harm => {
    let hm = harm.get(m.id);
    if (!hm) harm.set(m.id, (hm = { wounds: 0, states: new Set(), until: new Map(), lasting: new Set(), apLoss: 0, apAll: false }));
    return hm;
  };
  const kit: KitUse[] = [];
  let placed = false;
  const luckSpent = new Map<string, number>();
  /** Lucky Charm: the model asked for it with its Action or Reaction and has a Luck counter left. */
  const lucky = (m: Model): boolean => (m.id === active.id ? mods.luck : reactions[m.id]?.mods.luck) === true && (m.luck ?? 0) - (luckSpent.get(m.id) ?? 0) > 0;
  const spendLuck = (m: Model): void => {
    luckSpent.set(m.id, (luckSpent.get(m.id) ?? 0) + 1);
    kit.push({ id: m.id, luck: 1 });
  };
  /** Rogues that have made their AG roll for Knockdown in this Activation; allies already tested for Friendly Fire. */
  const rogued = new Set<string>();
  const shaken = new Set<string>();
  const hitsWord = (n: number) => `${n} Hit${n === 1 ? '' : 's'}`;
  const woundsWord = (n: number) => `${n} Wound${n === 1 ? '' : 's'}`;

  /** One die against an attribute; pushes a line and returns success. */
  const test = (who: Model, value: number, what: string, onSuccess: string, onFail: string): boolean => {
    const roll = rollStrikes(1, Math.max(0, value), d20);
    const ok = roll[0]!.hit;
    lines.push({ text: `${who.name}: ${what} ${Math.max(0, value)} – ${ok ? onSuccess : onFail}`, dice: asDice(roll, Math.max(0, value), what) });
    return ok;
  };
  const UNTIL_TEXT: Record<Until, string> = { turn: ' until the end of the turn', strategic: ' until its next Strategic Phase', blue: " until Blue's next Strategic Phase", red: " until Red's next Strategic Phase" };
  const give = (victim: Model, st: StateName, note = '', until?: Until): void => {
    if (immuneTo(victim, st)) return;
    const hm = harmOf(victim);
    if (victim.states.includes(st) || hm.states.has(st)) {
      // Already in the state for a while: a lasting cause makes it stay.
      if (!until && (victim.temp?.[st] || hm.until.has(st))) {
        hm.until.delete(st);
        if (victim.temp?.[st]) hm.lasting.add(st);
        lines.push({ text: `${victim.name} stays ${st}${note}` });
      }
      return;
    }
    hm.states.add(st);
    if (until) hm.until.set(st, until);
    lines.push({ text: `${victim.name} is ${st}${note}${until ? UNTIL_TEXT[until] : ''}` });
  };
  const tooBig = (attacker: Model, victim: Model): boolean => sizeRank(victim) - sizeRank(attacker) >= 2;
  /** Hyperia's Providence on the target of a Melee Attack: the attacker rolls AG or has one Strike less. */
  const warded = (attacker: Model, target: Model, p: AttackPlan): AttackPlan => {
    if (!p.ok || p.ranged || p.stk <= 1 || target.id === AOE_POINT || !hasUpgrade(target, HYPERIA)) return p;
    return test(attacker, modelStats(attacker).ag, "Hyperia's Providence, AG", 'keeps its Strikes', '−1 Strike') ? p : { ...p, stk: p.stk - 1, notes: [...p.notes, "Hyperia's Providence −1 Strike"] };
  };

  const dodge = (dodger: Model, from: Model, extra: number): boolean => {
    const stats = modelStats(dodger);
    // A reacting model that never saw the activated model during its Movement dodges on halved Agility.
    const unseen = seen && from.id === active.id ? !seen.has(dodger.id) : !sight(state, dodger, from).los;
    const blind = unseen && !hasTrait(dodger, 'Acute Senses');
    const caught = surprised.has(dodger.id);
    // Shallow Aquatic Environment: AG halved (not with Survival (Aquatic)).
    const wet = inShallowWater(state, dodger) && !profileOf(dodger).traits.some((t) => /^Survival \([^)]*Aquatic/.test(t));
    const ag = Math.max(0, Math.ceil(Math.ceil((blind ? Math.ceil(stats.ag / 2) : stats.ag) / (caught ? 2 : 1)) / (wet ? 2 : 1)) + extra);
    const roll = rollStrikes(1, ag, d20);
    let ok = roll[0]!.hit;
    lines.push({
      text: `${dodger.name} dodges ${from.name}: 1d20 vs AG ${ag}${blind ? ' (halved, no line of sight)' : ''}${caught ? ' (halved, Surprise Attack)' : ''}${wet ? ' (halved, Shallow Aquatic)' : ''} – ${ok ? 'success' : 'failed'}`,
      dice: asDice(roll, ag, 'Dodge'),
    });
    if (!ok && lucky(dodger)) {
      spendLuck(dodger);
      const again = rollStrikes(1, ag, d20);
      ok = again[0]!.hit;
      lines.push({ text: `${dodger.name}: Lucky Charm – the Dodge is rerolled, ${ok ? 'success' : 'failed'}`, dice: asDice(again, ag, 'Dodge reroll') });
    }
    return ok;
  };

  /** Damage rolls and every effect of the Hits that landed. Returns the Wounds caused. */
  const damage = (attacker: Model, victim: Model, landed: Strike[], plan: AttackPlan): number => {
    if (landed.length === 0) return 0;
    const weapon = plan.weapon!;
    // Ethereal Blades grows with the number of successful Attack rolls, whatever the Confrontation did to them.
    const blades = weapon.name === 'Ethereal Blades' ? (combo.get(attacker.id) ?? landed.length) : 0;
    if (blades >= 2) {
      plan = { ...plan, pw: plan.pw + 6, traits: [...plan.traits, ...(blades >= 3 ? ['Armor-Piercing'] : []), ...(blades >= 4 ? ['Stagger'] : [])] };
      lines.push({ text: `Ethereal Blades, ${blades} successful rolls: PW +6${blades >= 3 ? ', Armor-Piercing' : ''}${blades >= 4 ? ', Stagger' : ''}` });
    }
    const has = (t: string) => plan.traits.includes(t);
    const shrug = resistance(victim, weapon, plan.traits);
    if (shrug?.level === 2) {
      lines.push({ text: `${victim.name}: ${shrug.name} – ${hitsWord(landed.length)} and their effects negated` });
      return 0;
    }
    // Friendly Fire: an ally hit by an Attack that could wound it rolls Morale, or is Panicked until its next Strategic Phase.
    if (victim.side === attacker.side && victim.id !== attacker.id && plan.pw > 0 && !has('No Damage') && !shaken.has(victim.id) && !victim.states.includes('Dead') && !victim.states.includes('Incapacitated') && !victim.states.includes('Panicked') && !immuneTo(victim, 'Panicked')) {
      shaken.add(victim.id);
      const mor = moraleOf(state, victim);
      if (!test(victim, mor.m, `Friendly Fire, M${mor.notes.length ? ` (${mor.notes.join(', ')})` : ''}`, 'holds firm', 'Panicked')) give(victim, 'Panicked', '', 'strategic');
    }
    if (has('Critical Knockdown') && landed.some((r) => r.crit) && !tooBig(attacker, victim)) give(victim, 'Crouched', ' (Critical Hit, Knockdown)');

    // Effects of a Hit.
    if (has('Knockdown') && !tooBig(attacker, victim)) give(victim, 'Crouched', ' (Knockdown)');
    else if (hasClass(attacker, 'Rogue') && !rogued.has(attacker.id) && victim.side !== attacker.side && !tooBig(attacker, victim) && !victim.states.includes('Crouched')) {
      // Once per Activation.
      rogued.add(attacker.id);
      if (test(attacker, modelStats(attacker).ag, 'Rogue, AG', 'the Hit gains Knockdown', 'no Knockdown')) give(victim, 'Crouched', ' (Knockdown)');
    }
    if (has('Stagger') && !tooBig(attacker, victim)) {
      if (hasTrait(victim, 'Construct') || hasTrait(victim, 'Elemental')) lines.push({ text: `${victim.name} is unaffected by Stagger` });
      else {
        harmOf(victim).apLoss += 1;
        lines.push({ text: `${victim.name} loses 1 AP (Stagger)` });
      }
    }
    // Water Tentacle: a hit enemy is pulled closer.
    const pull = /pull the enemy (\d+)" closer/.exec(weapon.effect ?? '');
    if (pull && victim.id !== AOE_POINT && victim.side !== attacker.side && !harmOf(victim).push) {
      const to = knockbackTo(state, attacker, victim, Number(pull[1]), { x: attacker.x - victim.x, y: attacker.y - victim.y });
      const moved = Math.hypot(to.x - victim.x, to.y - victim.y);
      if (moved > 0.05) {
        harmOf(victim).push = to;
        lines.push({ text: `${weapon.name}: ${victim.name} is pulled ${moved.toFixed(1)}" towards ${attacker.name}` });
      }
    }
    // From a Spell the state lasts until the caster's next Strategic Phase.
    if (has('Slowing')) give(victim, 'Slowed', '', isSpell(weapon) ? (attacker.side === 0 ? 'blue' : 'red') : 'turn');
    const casterTag: Until = attacker.side === 0 ? 'blue' : 'red';
    if (has('Blinding')) give(victim, 'Blinded', '', 'turn');
    if (has('Immobilize')) give(victim, 'Immobilized', '', casterTag);
    if (has('Weaken Hit')) give(victim, 'Weakened', '', 'turn');
    if (has('Acid') && !test(victim, modelStats(victim).t - 3, 'Acid, T −3', 'resisted', 'Weakened')) give(victim, 'Weakened');
    if (has('No Damage')) return 0;
    const kb = plan.traits.find((t) => t.startsWith('Knockback'));
    if (kb && !tooBig(attacker, victim) && victim.id !== AOE_POINT && !harmOf(victim).push) {
      const inches = knockbackInches(kb);
      const from = opts.kbFrom ?? attacker;
      const to = knockbackTo(state, from, victim, inches, opts.kbDir?.[victim.id]);
      const moved = Math.hypot(to.x - victim.x, to.y - victim.y);
      harmOf(victim).push = to;
      const drop = (victim.z ?? 0) - surfaceAt(state, to);
      lines.push({ text: `${kb}: ${victim.name} is pushed ${moved.toFixed(1)}" ${opts.kbDir?.[victim.id] ? 'in the chosen direction' : `away from ${attacker.name}`}${moved < inches - 0.05 && drop <= 0.05 ? ' (stopped by an obstacle)' : ''}${drop > 0.05 ? ` and falls ${drop.toFixed(1)}"` : ''}` });
      // Pushed off a ledge: Fall Damage.
      for (let i = fallRolls(victim, drop); i > 0; i--) if (!test(victim, modelStats(victim).ag, 'Fall Damage, AG', 'lands safely', '1 Wound')) harmOf(victim).wounds += 1;
    } else if (kb && tooBig(attacker, victim)) lines.push({ text: `${kb}: ${victim.name} is too big to be pushed` });

    // Damage rolls.
    const base = modelStats(victim).arm + (plan.ranged && inFrontArc(victim, attacker) ? shieldOf(victim) : 0) + formationArm(state, victim);
    const arm = has('Ignore Armor') ? 0 : has('Armor-Piercing') ? Math.ceil(base / 2) : base;
    let caused = 0;
    for (const crit of [false, true]) {
      const n = landed.filter((r) => r.crit === crit).length;
      if (n === 0) continue;
      // Arcane Shield: Critical Hits do not ignore ARM.
      const critArm = hasEnchant(victim, 'Arcane Shield') ? arm : 0;
      const need = Math.max(0, plan.pw - (crit ? critArm : arm));
      const rolls: number[] = [];
      for (let i = 0; i < n; i++) rolls.push(d20());
      let ok = rolls.filter((d) => d <= need).length;
      caused += ok;
      lines.push({
        text: `Damage on ${victim.name} (${weapon.name}${crit ? ', Critical Hit' : ''}): ${n}d20 vs PW ${plan.pw} − ARM ${crit ? critArm : arm} = ${need} – ${woundsWord(ok)}`,
        dice: { dice: rolls, target: need, successes: ok, crits: 0, label: 'Damage' },
      });
      // Lucky Charm of the model that was hit: the attacker rerolls one Damage roll that wounded.
      if (ok > 0 && lucky(victim)) {
        spendLuck(victim);
        const d = d20();
        const still = d <= need;
        if (!still) {
          ok -= 1;
          caused -= 1;
        }
        lines.push({ text: `${victim.name}: Lucky Charm – one Damage roll is rerolled, ${still ? 'it still wounds' : 'no Wound'}`, dice: { dice: [d], target: need, successes: still ? 1 : 0, crits: 0, label: 'Damage reroll' } });
      }
      // Exploiting Weakness: the failed Damage rolls against it are rolled once more.
      const weak = hasBoon(victim, (fx) => fx.exposed);
      if (weak && weak.from === attacker.side && ok < n) {
        const again: number[] = [];
        for (let i = 0; i < n - ok; i++) again.push(d20());
        const more = again.filter((d) => d <= need).length;
        caused += more;
        ok += more;
        lines.push({ text: `${weak.name}: ${again.length} failed Damage roll${again.length === 1 ? '' : 's'} rerolled – ${woundsWord(more)}`, dice: { dice: again, target: need, successes: more, crits: 0, label: 'Damage reroll' } });
      }
    }
    // Ways to shrug a Wound off.
    const resist = (why: string): void => {
      const t = modelStats(victim).t;
      const rolls = rollStrikes(caused, t, d20);
      const saved = rolls.filter((r) => r.hit).length;
      caused -= saved;
      lines.push({ text: `${victim.name}: ${why}, ${rolls.length}d20 vs T ${t} – ${woundsWord(saved)} negated`, dice: asDice(rolls, t, why) });
    };
    if (caused > 0 && has('Unkeen')) resist('Unkeen');
    // Once per turn, but for every Wound it would suffer at that moment: all the attackers of one Sequence (FAQ).
    if (caused > 0 && hasClass(victim, 'Berserker') && !(state.used[victim.id] ?? []).includes('Berserker')) {
      if (!used.some((u) => u.id === victim.id && u.what === 'Berserker')) used.push({ id: victim.id, what: 'Berserker' });
      resist('Berserker (once per turn)');
    }
    if (caused === 0) return 0;
    // Gargoyle's Claws: the first Wound it deals each turn gives it an AP and takes one from the wounded model.
    if (/gains an AP and the wounded model loses an AP/.test(weapon.effect ?? '') && !(state.used[attacker.id] ?? []).includes('AP steal') && !used.some((u) => u.id === attacker.id && u.what === 'AP steal')) {
      used.push({ id: attacker.id, what: 'AP steal' });
      harmOf(attacker).apLoss -= 1;
      if (victim.ap > 0) harmOf(victim).apLoss += 1;
      lines.push({ text: `${weapon.name}: ${attacker.name} gains 1 AP${victim.ap > 0 ? `, ${victim.name} loses 1 AP` : ''}` });
    }

    // Effects of a Wound.
    if (has('Cleave')) {
      caused += 1;
      lines.push({ text: `Cleave: 1 additional Wound on ${victim.name}` });
    }
    const burn = plan.traits.find((t) => t.startsWith('Burn'));
    if (burn && hasTrait(victim, 'Construct')) lines.push({ text: `${victim.name} is unaffected by Burn` });
    else if (burn) {
      const x = Number(burn.split(' ')[1]);
      const rolls: number[] = [];
      for (let i = 0; i < x; i++) rolls.push(d20());
      const ok = rolls.filter((d) => d <= plan.pw).length;
      caused += ok;
      lines.push({ text: `Burn (${x}) on ${victim.name}: ${x}d20 vs PW ${plan.pw} – ${woundsWord(ok)}`, dice: { dice: rolls, target: plan.pw, successes: ok, crits: 0, label: 'Burn' } });
    }
    if (has('Bleed')) give(victim, 'Bleeding');
    if (has('Poison II') || has('Weakening')) give(victim, 'Weakened');
    else if (has('Poison I')) give(victim, 'Weakened', ' (Poison I)', 'strategic');
    if (has('Poison II')) give(victim, 'Poisoned');
    const t = modelStats(victim).t;
    if (has('Crippling') && !victim.states.includes('Crippled') && !test(victim, t, 'Crippling, T', 'resisted', 'Crippled')) give(victim, 'Crippled');
    if (has('Stun') && !test(victim, t, 'Stun, T', 'resisted', 'loses all AP')) harmOf(victim).apAll = true;
    if (has('Panic')) give(victim, 'Panicked', '', 'turn');
    if (hasTrait(attacker, 'Demon') && !hasTrait(victim, 'Demon') && !immuneTo(victim, 'Panicked') && !victim.states.includes('Panicked')) {
      if (landed.some((r) => r.crit)) give(victim, 'Panicked', ' (Demon, Critical Hit)', 'turn');
      else {
        const mor = moraleOf(state, victim);
        if (!test(victim, mor.m, `Demon, M${mor.notes.length ? ` (${mor.notes.join(', ')})` : ''}`, 'holds firm', 'Panicked')) give(victim, 'Panicked', '', 'turn');
      }
    }
    harmOf(victim).wounds += caused;
    if (victim.side !== attacker.side) blows.push({ by: attacker.id, to: victim.id, wounds: caused, melee: !plan.ranged, reactive: attacker.id in reactions });
    return caused;
  };

  /** Finishing Strike: after wounding, one more unmodified Strike against the same target. */
  const finish = (attacker: Model, victim: Model, plan: AttackPlan, caused: number): void => {
    if (caused === 0 || !hasSkill(attacker, 'Finishing Strike')) return;
    const rolls = rollStrikes(1, plan.attr, d20, plan.critMax);
    lines.push({ text: `${attacker.name}: Finishing Strike on ${victim.name}, 1d20 vs ${plan.attrName} ${plan.attr}`, dice: asDice(rolls, plan.attr, 'Finishing Strike') });
    damage(attacker, victim, rolls.filter((r) => r.hit), plan);
  };

  const announce = (who: Model, whom: Model, plan: AttackPlan, rolls: Strike[], verb: string): void => {
    const notes = plan.notes.length ? ` (${plan.notes.join('; ')})` : '';
    lines.push({
      text: `${who.name} ${verb} ${whom.name} with ${plan.weapon!.name}: ${rolls.length}d20 vs ${plan.attrName} ${plan.attr}${notes}`,
      dice: asDice(rolls, plan.attr, 'Attack'),
    });
    const cost = manaCost(plan.weapon!);
    if (cost > 0) mana.push(...manaBill(state, who, cost));
    // Thrown items leave the Inventory, one for each Strike; a Consumable is used up once per Attack.
    const item = plan.weapon!;
    if (item.thrown) {
      if (!comesBack(item)) kit.push({ id: who.id, item: item.thrown, n: plan.stk, at: whom.id });
    } else if (usedUp(item) && !kit.some((k) => k.id === who.id && k.item === item.name)) kit.push({ id: who.id, item: item.name, n: 1 });
  };
  /** Rolls the plan's Strikes; Backstab turns one of them into a Hit that needs no roll and cannot be cancelled. */
  const strikes = (plan: AttackPlan): { rolls: Strike[]; auto: Strike[] } => {
    const auto: Strike[] = [];
    for (let i = 0; i < Math.min(plan.autoHits, plan.stk); i++) auto.push({ d: 0, hit: true, crit: false });
    return { rolls: rollStrikes(plan.stk - auto.length, plan.attr, d20, plan.critMax, plan.allCrit), auto };
  };

  // ---- rerolls ----
  // Advantage (X): once per Activation Sequence, any number of dice of an Attack against an X target.
  // Dual Wield: one Melee Attack roll. A weapon that says so: one Attack roll.
  // The table rerolls missed Attack rolls only, each die at most once.
  const SIZE_WORDS: Record<string, string> = { s: 'small', small: 'small', m: 'medium', medium: 'medium', l: 'large', large: 'large', h: 'huge', huge: 'huge', gigantic: 'gigantic', colossal: 'colossal', epic: 'epic' };
  const advantageOver = (who: Model, plan: AttackPlan, foe: Model): string | null => {
    const texts = [...profileOf(who).traits, plan.weapon?.effect ?? ''];
    for (const text of texts) {
      for (const m of text.matchAll(/Advantage \(([^)]*)\)/g)) {
        const kinds = m[1]!.replace(/^Size:/i, '').split(',').map((x) => x.trim()).filter(Boolean);
        const hit = kinds.some((k) => (SIZE_WORDS[k.toLowerCase()] ? SIZE_WORDS[k.toLowerCase()] === foe.size : hasTrait(foe, k) || hasClass(foe, k)));
        if (hit) return `Advantage (${m[1]})`;
      }
    }
    return null;
  };
  const advantaged = new Set<string>();
  /** Ethereal Blades: successful Attack rolls per caster. */
  const combo = new Map<string, number>();
  const rerolls = (who: Model, foe: Model, plan: AttackPlan, rolls: Strike[]): void => {
    const done = new Set<Strike>();
    const again = (picked: Strike[], why: string): void => {
      if (picked.length === 0) return;
      const fresh = rollStrikes(picked.length, plan.attr, d20, plan.critMax, plan.allCrit);
      picked.forEach((r, i) => {
        Object.assign(r, fresh[i]!);
        done.add(r);
      });
      const n = fresh.filter((r) => r.hit).length;
      lines.push({ text: `${who.name}: ${why} – rerolls ${picked.length} missed Attack roll${picked.length === 1 ? '' : 's'}, ${n} now hit${n === 1 ? 's' : ''}`, dice: asDice(fresh, plan.attr, 'Reroll') });
    };
    const missed = () => rolls.filter((r) => !r.hit && !done.has(r));
    const adv = advantaged.has(who.id) ? null : advantageOver(who, plan, foe);
    if (adv && missed().length > 0) {
      advantaged.add(who.id);
      again(missed(), adv);
    }
    if (!plan.ranged && hasSkill(who, 'Dual Wield')) again(missed().slice(0, 1), 'Dual Wield');
    if (/reroll (one|the) Attack roll/i.test(plan.weapon?.effect ?? '')) again(missed().slice(0, 1), plan.weapon!.name);
    if (foe.states.includes('Crouched') && hasBoon(who, (b) => b.viciousVsCrouched)) again(missed().slice(0, 1), 'Vicious Opportunism');
    // Casters: Sorcerer (Sorcery, Active Role), Wizard (Elder Spells), and the staffs and scepters that say so.
    if (plan.weapon && isSpell(plan.weapon)) {
      const mine = who.id === active.id;
      const spell = spellNamed(profileOf(who), plan.weapon.name);
      const sorcery = plan.weapon.type.includes('Sorcery');
      if (mine && sorcery && hasClass(who, 'Sorcerer')) again(missed().slice(0, 1), 'Sorcerer');
      if (spell?.element === 'Elder' && hasClass(who, 'Wizard')) again(missed().slice(0, 1), 'Wizard');
      for (const item of profileOf(who).weapons) {
        const e = item.effect ?? '';
        const ok =
          (mine && sorcery && /casting Sorceries in the Active Role/.test(e)) ||
          (mine && /attacking with a Spell in the Active Role/.test(e)) ||
          (mine && spell?.element === 'Divine' && /casting a Divine Spell in the Active Role/.test(e)) ||
          (spell?.element === 'Profane' && /reroll a failed Profane Spell roll/.test(e));
        if (item.type === 'Accessory' && ok) again(missed().slice(0, 1), item.name);
      }
      // Mage: an unspent Activation Point for the failed dice of the Spell.
      const asked = (who.id === active.id ? mods.mage : reactions[who.id]?.mods.mage) === true;
      const failed = rolls.filter((r) => !r.hit);
      if (asked && hasClass(who, 'Mage') && failed.length > 0 && who.ap - harmOf(who).apLoss >= 1) {
        harmOf(who).apLoss += 1;
        again(failed, 'Mage (1 AP spent)');
      }
      if (plan.weapon.name === 'Ethereal Blades') combo.set(who.id, rolls.filter((r) => r.hit).length);
    }
    if (missed().length > 0 && lucky(who)) {
      spendLuck(who);
      again(missed().slice(0, 1), 'Lucky Charm');
    }
  };

  /** Ranged Friendly Fire: a roll of 17–20 hits an ally of the shooter in Base Contact with the target instead. */
  const stray = (attacker: Model, plan: AttackPlan, rolls: Strike[]): void => {
    const ally = plan.friendly.map((id) => state.models.find((m) => m.id === id)).find((m): m is Model => m !== undefined);
    if (!ally) return;
    for (const r of rolls) {
      if (r.d < 17) continue;
      r.hit = false;
      r.crit = false;
      lines.push({ text: `Friendly Fire: the roll of ${r.d} hits ${ally.name}` });
      damage(attacker, ally, [{ d: r.d, hit: true, crit: false }], plan);
    }
  };

  /**
   * Chain Attack: once per Activation Sequence, when an ally scores a Hit on an enemy this model can see,
   * it makes one unmodified Strike against that enemy, before the Damage rolls.
   */
  const chained = new Set<string>();
  const chain = (attacker: Model, victim: Model): void => {
    for (const c of state.models) {
      if (c.side !== attacker.side || c.id === attacker.id || chained.has(c.id) || !hasSkill(c, 'Chain Attack')) continue;
      if (c.hp <= 0 || c.states.includes('Dead') || c.states.includes('Incapacitated')) continue;
      const ctx: AttackContext = { reactive: c.side !== active.side, chain: true };
      const options = attackOptions(c).filter((o) => !o.weapon.thrown && !runsOut(o.weapon));
      const plan = [...options.filter((o) => o.index !== UNARMED_INDEX), ...options.filter((o) => o.index === UNARMED_INDEX)]
        .map((o) => planAttack(state, c, victim, o.index, NO_MODS, ctx))
        .find((p) => p.ok);
      if (!plan) continue;
      chained.add(c.id);
      const rolls = rollStrikes(1, plan.attr, d20, plan.critMax);
      lines.push({ text: `${c.name}: Chain Attack on ${victim.name} with ${plan.weapon!.name}, 1d20 vs ${plan.attrName} ${plan.attr}`, dice: asDice(rolls, plan.attr, 'Chain Attack') });
      finish(c, victim, plan, damage(c, victim, rolls.filter((r) => r.hit), plan));
    }
  };
  /** Hits that landed: allies with Chain Attack join in, then the Damage rolls. */
  const strike = (attacker: Model, victim: Model, landed: Strike[], plan: AttackPlan): void => {
    if (landed.length > 0) chain(attacker, victim);
    finish(attacker, victim, plan, damage(attacker, victim, landed, plan));
    if (landed.length > 0) sweep(attacker, victim, plan);
  };
  /**
   * Sweep I: on a successful Attack roll every other model in the attacker's line of sight and Melee Reach suffers a Hit.
   * Sweep II: the same all around it (its Front Arc becomes 360°). Once per attacker in a Sequence; a declared Dodge may avoid it.
   */
  const swept = new Set<string>();
  const sweep = (attacker: Model, victim: Model, plan: AttackPlan): void => {
    const level = plan.traits.includes('Sweep II') ? 2 : plan.traits.includes('Sweep I') ? 1 : 0;
    if (level === 0 || plan.ranged || swept.has(attacker.id)) return;
    swept.add(attacker.id);
    const others = state.models.filter((o) => {
      if (o.id === attacker.id || o.id === victim.id || o.id === AOE_POINT || o.states.includes('Dead')) return false;
      if (!reachCheck(attacker, o, plan.weapon!, 0).ok) return false;
      const eye = level === 2 ? { ...attacker, facing: facingTo(attacker, o) } : attacker;
      return sight(state, eye, o).los;
    });
    if (others.length === 0) return;
    lines.push({ text: `Sweep ${level === 2 ? 'II' : 'I'}: ${others.map((o) => o.name).join(', ')} ${others.length === 1 ? 'suffers' : 'suffer'} a Hit` });
    for (const o of others) {
      const r = reactions[o.id];
      if (r?.intent === 'dodge' && o.id !== active.id && dodge(o, attacker, r.mods.hit)) continue;
      damage(attacker, o, [{ d: 0, hit: true, crit: false }], plan);
    }
  };

  const reactors = Object.entries(reactions)
    .map(([id, r]) => ({ model: state.models.find((m) => m.id === id), r }))
    .filter((x): x is { model: Model; r: ReactionInfo } => x.model !== undefined);
  const spd = modelStats(active).spd;
  const ran = moved > spd + 0.005;

  // 1) The activated model's own Attack – on one target, or with its Strikes split between several.
  const confronted = new Set<string>();
  /** Surprise Attack: OFF, DEF, ACC, AG and INT halved until the end of the Sequence. */
  const surprised = new Set<string>();
  /** The activated model as a reacting model saw it: where it came into Reach for an Attack of Opportunity. */
  const seenAt = (r: ReactionInfo | undefined): Model => (r?.at ? { ...active, x: r.at.x, y: r.at.y } : active);
  const assault = (target: Model, take?: (full: number) => number): void => {
    const reaction = reactions[target.id];
    const answering = reaction?.intent === 'attack';
    // Duelist: the model it attacks cannot use Combat Arts of level III or lower.
    const mine: AttackContext = { reactive: false, idle: moved === 0, ran, foeDuelist: answering && hasTrait(target, 'Duelist'), ...(opts.redirected ? { redirected: true } : {}) };
    let plan = planAttack(state, active, target, weaponIndex, mods, mine);
    if (take) plan = { ...plan, stk: Math.max(1, take(plan.stk)) };
    let back = answering ? planAttack(state, target, seenAt(reaction), reaction.weapon, reaction.mods, { reactive: true, foeDuelist: hasTrait(active, 'Duelist') }) : null;
    if (back && !back.ok) back = null;
    plan = warded(active, target, plan);
    if (back) back = warded(target, active, back);
    if (plan.ok && plan.traits.includes('Surprise Attack') && target.id !== AOE_POINT) {
      if (hasTrait(target, 'Vigilance') || hasTrait(target, 'Construct')) lines.push({ text: `Surprise Attack: ${target.name} is ${hasTrait(target, 'Vigilance') ? 'Vigilant' : 'a Construct'} – no effect` });
      else {
        surprised.add(target.id);
        lines.push({ text: `Surprise Attack: ${target.name}'s OFF, DEF, ACC, AG and INT are halved for this Sequence` });
        if (back) back = { ...back, attr: Math.ceil(back.attr / 2), notes: [...back.notes, 'Surprise Attack: halved'] };
      }
    }
    if (back) {
      // Fencing I / II weigh on the opponent's Melee Attack.
      const press = (p: AttackPlan, by: AttackPlan): AttackPlan =>
        p.ranged || (by.foeHit === 0 && by.foeStk === 0)
          ? p
          : { ...p, attr: Math.max(0, p.attr + by.foeHit), stk: Math.max(1, p.stk + by.foeStk), notes: [...p.notes, `opponent's Fencing ${by.foeHit ? signed(by.foeHit) : `${signed(by.foeStk)} Strike`}`] };
      [plan, back] = [press(plan, back), press(back, plan)];
    }
    const mineRolls = strikes(plan);
    announce(active, target, plan, mineRolls.rolls, 'attacks');
    let landed: Strike[] = [];
    if (back) {
      confronted.add(target.id);
      const theirRolls = strikes(back);
      announce(target, active, back, theirRolls.rolls, 'strikes back at');
      // The Reactive Player rerolls first, then the Active Player.
      rerolls(target, active, back, theirRolls.rolls);
      rerolls(active, target, plan, mineRolls.rolls);
      stray(target, back, theirRolls.rolls);
      stray(active, plan, mineRolls.rolls);
      landed = mineRolls.rolls.filter((r) => r.hit);
      let theirs = theirRolls.rolls.filter((r) => r.hit);
      if (plan.unstoppable || back.unstoppable) lines.push({ text: 'Unstoppable: no Confrontation, successful rolls do not block each other' });
      else {
        [landed, theirs] = confront(mineRolls.rolls, theirRolls.rolls);
        lines.push({ text: `Confrontation: ${active.name} lands ${hitsWord(landed.length)}, ${target.name} lands ${hitsWord(theirs.length)}` });
      }
      theirs = [...theirs, ...theirRolls.auto];
      strike(target, active, theirs, back);
    } else {
      rerolls(active, target, plan, mineRolls.rolls);
      stray(active, plan, mineRolls.rolls);
      landed = mineRolls.rolls.filter((r) => r.hit);
      if (!opts.area && reaction?.intent === 'dodge' && landed.length + mineRolls.auto.length > 0 && dodge(target, active, reaction.mods.hit)) {
        landed = landed.filter((r) => r.crit);
        mineRolls.auto.length = 0;
      }
    }
    landed = [...landed, ...mineRolls.auto];
    if (!opts.area) strike(active, target, landed, plan);
    else {
      // A template: the Hits that are left land on everyone under it. Each model that declared a Dodge rolls it.
      const under = opts.area.victims.map((id) => state.models.find((m) => m.id === id)).filter((m): m is Model => m !== undefined);
      lines.push({ text: landed.length === 0 ? `${opts.area.label}: the template is not placed` : `${opts.area.label} template: ${under.length ? under.map((m) => m.name).join(', ') : 'nobody'} under it` });
      if (landed.length > 0) {
        placed = true;
        for (const v of under) {
          const r = reactions[v.id];
          const hits = r?.intent === 'dodge' && dodge(v, active, r.mods.hit) ? landed.filter((x) => x.crit) : landed;
          strike(active, v, hits, plan);
        }
      }
    }
  };
  if (action === 'attack' && target) {
    const extra = (opts.split ?? []).map((x) => ({ m: state.models.find((o) => o.id === x.id), n: x.n })).filter((x): x is { m: Model; n: number } => !!x.m && x.m.id !== target.id);
    const rest = extra.reduce((n, x) => n + x.n, 0);
    if (extra.length > 0) lines.push({ text: `${active.name} splits its Strikes: ${extra.map((x) => `${x.m.name} ×${x.n}`).join(', ')}, the rest at ${target.name}` });
    assault(target, extra.length > 0 ? (full) => full - rest : undefined);
    for (const x of extra) assault(x.m, () => x.n);
  }

  // 2) Attacks by reacting models that are not in a Confrontation.
  for (const { model, r } of reactors) {
    if (r.intent !== 'attack' || confronted.has(model.id)) continue;
    if (r.at) lines.push({ text: `${model.name}: Attack of Opportunity where ${active.name} came into Reach` });
    let plan = planAttack(state, model, seenAt(r), r.weapon, r.mods, { reactive: true });
    if (!plan.ok) {
      lines.push({ text: `${model.name}'s Attack fails – ${plan.reason}` });
      continue;
    }
    plan = warded(model, active, plan);
    const st = strikes(plan);
    announce(model, active, plan, st.rolls, 'attacks');
    rerolls(model, active, plan, st.rolls);
    stray(model, plan, st.rolls);
    let landed = [...st.rolls.filter((x) => x.hit), ...st.auto];
    if (action === 'dodge' && landed.length > 0 && dodge(active, model, mods.hit)) landed = landed.filter((x) => x.crit);
    strike(model, active, landed, plan);
  }

  if (action === 'dodge' && !reactors.some((x) => x.r.intent === 'attack')) lines.push({ text: `${active.name} dodges` });

  // 3) Wounds and effects take hold together.
  const results: CombatOutcome['results'] = [];
  const dealt: Dealt[] = [];
  for (const [id, hm] of harm) {
    const m = state.models.find((x) => x.id === id);
    if (!m) continue;
    let now = { hp: m.hp, states: [...m.states] };
    // A model cannot suffer more Wounds than it has HP: one attack sequence never takes it past Incapacitated.
    const taken = hm.wounds === 0 ? 0 : m.hp > 0 ? Math.min(hm.wounds, m.hp) : 1;
    for (let i = 0; i < taken; i++) now = woundOnce(now.hp, now.states, hasTrait(m, 'Undead'));
    if (!now.states.includes('Dead')) {
      for (const st of hm.states) if (!now.states.includes(st)) now.states.push(st);
      if (hm.states.has('Crouched')) now.states = now.states.filter((x) => x !== 'Flying');
    }
    const ap = hm.apAll ? 0 : Math.max(0, m.ap - hm.apLoss);
    const temp: Partial<Record<StateName, Until>> = { ...m.temp };
    for (const st of hm.lasting) delete temp[st];
    for (const [st, until] of hm.until) temp[st] = until;
    for (const st of Object.keys(temp) as StateName[]) if (!now.states.includes(st)) delete temp[st];
    const noted = Object.keys(temp).length > 0 || m.temp !== undefined;
    results.push({ id, ...now, ...(ap !== m.ap ? { ap } : {}), ...(noted ? { temp } : {}), ...(hm.push ? { to: hm.push } : {}) });
    // Who dealt the Wounds that counted, and whose blow took the model down.
    const wasUp = m.hp > 0 && !m.states.includes('Incapacitated') && !m.states.includes('Dead');
    const down = wasUp && (now.states.includes('Incapacitated') || now.states.includes('Dead'));
    let left = taken;
    for (const b of blows) {
      if (b.to !== id || left === 0) continue;
      const n = Math.min(b.wounds, left);
      left -= n;
      dealt.push({ ...b, wounds: n, ...(down && left === 0 ? { out: true } : {}) });
    }
    if (taken > 0) {
      const fate = now.states.includes('Dead') ? ' and is Dead' : now.states.includes('Incapacitated') ? ' and is Incapacitated' : '';
      lines.push({ text: `${m.name} suffers ${woundsWord(taken)}${fate} (HP ${now.hp}/${m.maxHp})` });
    }
  }
  // Thrown items can be taken back from a model they took down.
  for (const k of kit) {
    if (!k.at) continue;
    const before = state.models.find((m) => m.id === k.at);
    const now = results.find((r) => r.id === k.at);
    const fell = before && now && ((now.states.includes('Dead') && !before.states.includes('Dead')) || (now.states.includes('Incapacitated') && !before.states.includes('Incapacitated')));
    if (!fell) delete k.at;
  }
  return { lines, results: results.filter((r) => r.id !== AOE_POINT), used, dealt, mana, kit, placed };
}

/**
 * Morale with the auras around it: Menacing (X) −2 per level for a model with line of sight to a Menacing enemy
 * (the strongest one counts), Inspiring I +6 near an ally of the same Affiliation that has it.
 */
export function moraleOf(state: TableState, m: Model): { m: number; notes: string[] } {
  let value = modelStats(m).m;
  const notes: string[] = [];
  const soldiers = soldierBonus(state, m);
  if (soldiers) {
    value += soldiers;
    notes.push(`Soldier +${soldiers}`);
  }
  let worst = 0;
  let who = '';
  for (const o of state.models) {
    if (o.side === m.side || o.states.includes('Dead') || o.states.includes('Incapacitated')) continue;
    const t = profileOf(o).traits.find((x) => /^Menacing/.test(x));
    if (!t) continue;
    const lvl = /\b(III|II|I|\d+)\b/.exec(t.slice(8))?.[1] ?? 'I';
    const n = ({ I: 1, II: 2, III: 3 } as Record<string, number>)[lvl] ?? Number(lvl);
    if (n > worst && sight(state, m, o).los) {
      worst = n;
      who = o.name;
    }
  }
  // Spirit Drum: allies within its bearer's Awareness do not suffer Morale penalties.
  const drum = worst > 0 && state.models.find((o) => o.side === m.side && !isOutOfAction(o) && profileOf(o).weapons.some((w) => w.name === 'Spirit Drum') && (o.id === m.id || gap(o, m) <= modelStats(o).ag + 0.005));
  if (drum) notes.push(`Menacing ignored (Spirit Drum)`);
  else if (worst > 0) {
    value -= 2 * worst;
    notes.push(`Menacing ${who} −${2 * worst}`);
  }
  // Intimidating: a Panicked model that sees one is at −6.
  const scary = m.states.includes('Panicked') && state.models.find((o) => o.side !== m.side && !isOutOfAction(o) && hasTrait(o, 'Intimidating') && sight(state, m, o).los);
  if (scary) {
    value -= 6;
    notes.push(`Intimidating ${scary.name} −6`);
  }
  const muse = state.models.find(
    (o) => o.side === m.side && o.id !== m.id && o.faction === m.faction && !isOutOfAction(o) && hasTrait(o, 'Inspiring I') && gap(o, m) <= modelStats(o).ag + 0.005,
  );
  if (muse) {
    value += 6;
    notes.push(`Inspiring (${muse.name}) +6`);
  }
  return { m: Math.max(0, value), notes };
}
const isOutOfAction = (m: Model): boolean => m.states.includes('Dead') || m.states.includes('Incapacitated');

/** Defensive Formation / Close Ranks: +1 ARM for every other friendly model in Base Contact. */
export function formationArm(state: TableState, m: Model): number {
  if (!hasBoon(m, (fx) => fx.formation)) return 0;
  return state.models.filter((o) => o.side === m.side && o.id !== m.id && !o.states.includes('Dead') && gap(o, m) <= CONTACT).length;
}
