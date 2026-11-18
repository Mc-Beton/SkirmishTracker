import type { Profile, Weapon } from './profiles.ts';
import { SPELLS } from './spells.ts';
import type { BaseSize } from './types.ts';

// Upgrades: bought with Recruitment Points when a party is built and assigned to one model.
// The ones that change numbers, Traits, Skills, Classes, Arts or weapons are applied to the model's card
// (and so to everything that reads it); the rest are shown as text for the players to carry out.

type UpgradeStat = 'spd' | 'arm' | 'off' | 'def' | 'int' | 'ag' | 't';

export interface Upgrade {
  id: string;
  /** Two Upgrades with the same name cannot sit on one model, and the Limit counts per name. */
  name: string;
  /** 'Neutral' or the faction whose parties may buy it. */
  faction: string;
  cost: number;
  /** Per party; null = no limit. */
  limit: number | null;
  /** What the Upgrade does, in a few words. */
  text: string;
  /** Applied to the card automatically. Without it the Upgrade is a reminder only. */
  auto?: boolean;

  // ---- who may take it ----
  needClass?: string;
  notTrait?: string;
  maxSize?: BaseSize;
  /** Only a Neutral or semi-neutral model hired by another faction. */
  hiredOnly?: boolean;

  // ---- what it changes ----
  stats?: Partial<Record<UpgradeStat, number>>;
  traits?: string[];
  skills?: string[];
  classes?: string[];
  stratagems?: string[];
  /** Gain rank I of this Combat Art, or the next rank if the model already has it. */
  art?: string;
  /** An extra item. */
  weapon?: Weapon;
  /** The item replaces the Primary Weapon (the first one on the card). */
  replacePrimary?: boolean;
  /** Costs `cost` if the Primary Weapon has this name. */
  cheaperWith?: { weapon: string; cost: number };
  /** Extra Upgrades the model may then receive. */
  slots?: number;
  /** Anything else. `base` is the card before any Upgrade. */
  apply?: (p: Profile, base: Profile) => void;
}

const SIZE_ORDER: BaseSize[] = ['small', 'medium', 'large', 'huge', 'gigantic', 'colossal', 'epic'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const SOGA = 'Empire of Soga';
const THENION = 'Coalition of Thenion';
const HELIAN = 'Helian League';
const SAND = 'Sand Kingdoms';
const NEUTRAL = 'Neutral';

/** Named models: they bring their own gear and cannot take Upgrades (FAQ 2026). */
const CHARACTERS = ['Seigen', 'Tharos', 'Anari', "Na'ra", 'Na’ra', 'Chanra', 'Kogetsu', 'Chiyohime', 'Tomoe'];
export const isCharacter = (p: Profile): boolean => CHARACTERS.some((n) => p.name === n || p.name.startsWith(n + ','));

/** Rank I of a tiered Art / Trait, or the next rank if it is already in the list. */
function nextRank(list: string[], name: string): string[] {
  const i = list.findIndex((x) => x.startsWith(name + ' '));
  if (i < 0) return [...list, `${name} I`];
  const rank = ROMAN.indexOf(list[i]!.slice(name.length + 1));
  const out = [...list];
  if (rank > 0 && rank < ROMAN.length - 1) out[i] = `${name} ${ROMAN[rank + 1]}`;
  return out;
}

/** One more Strike: "STA-1" -> "STA", "STA" -> "STA+1", "2" -> "3". */
function moreStrike(stk: string): string {
  const m = /^STA\s*([+-]\s*\d+)?$/.exec(stk.trim());
  if (m) {
    const n = (m[1] ? Number(m[1].replace(/\s/g, '')) : 0) + 1;
    return n === 0 ? 'STA' : n > 0 ? `STA+${n}` : `STA${n}`;
  }
  return /^\d+$/.test(stk.trim()) ? String(Number(stk) + 1) : stk;
}

/**
 * Adept Shaper, Arcane Tome: the next level of one Spellcraft. The first Spellcraft on the card that still has a
 * higher level in the Spellbook is raised (the rulebook lets the player choose; cards with two are rare).
 */
function nextSpellcraft(p: Profile): void {
  for (let i = 0; i < p.arts.length; i++) {
    const m = /^(.+) (I|II|III|IV|V)$/.exec(p.arts[i]!.trim());
    if (!m) continue;
    const level = ROMAN.indexOf(m[2]!);
    if (!SPELLS.some((sp) => sp.school === m[1] && sp.level > level)) continue;
    p.arts[i] = `${m[1]} ${ROMAN[level + 1]}`;
    return;
  }
}

const isAttack = (w: Weapon): boolean => w.pw !== '-' && !w.type.startsWith('Shield');

/** Poison I on every weapon, Poison II where the weapon already has Poison I. */
function poison(p: Profile): void {
  p.weapons = p.weapons.map((w) => {
    if (!isAttack(w)) return w;
    const e = w.effect ?? '';
    if (/\bPoison II\b/.test(e)) return w;
    if (/\bPoison I\b/.test(e)) return { ...w, effect: e.replace(/\bPoison I\b/, 'Poison II') };
    return { ...w, effect: e ? `${e}, Poison I` : 'Poison I' };
  });
  p.traits = nextRank(p.traits, 'Poison');
}

const wp = (name: string, pw: string, rch: string, stk: string, type: string, effect?: string): Weapon => ({ name, pw, rch, stk, type, ...(effect ? { effect } : {}) });

export const UPGRADES: Upgrade[] = [
  // ---- Neutral ----
  { id: 'neu-pouch', name: 'Pouch', faction: NEUTRAL, cost: 1, limit: null, text: 'Inventory +2. The model may receive another Upgrade.', auto: true, slots: 1 },
  { id: 'neu-additional-protection', name: 'Additional Protection', faction: NEUTRAL, cost: 1, limit: null, text: '+2 ARM, -2 AG.', auto: true, stats: { arm: 2, ag: -2 } },
  { id: 'neu-utility-tool', name: 'Utility Tool', faction: NEUTRAL, cost: 1, limit: null, text: 'The model receives a Dagger.', auto: true, weapon: wp('Dagger', 'T-3', '0', 'STA', 'Melee', 'Throwing. +1 STK against a Crouched model') },
  { id: 'neu-first-aid', name: 'First Aid', faction: NEUTRAL, cost: 2, limit: 2, text: 'Discard when a model within Awareness makes a Recovery Check: it succeeds. Or discard in the Strategic Phase to remove the States of a model within Awareness (not Engaged, Crouched, Flying, Shrouded, Incapacitated, Dead).' },
  { id: 'neu-imported-casting-amplifier', name: 'Imported Casting Amplifier', faction: NEUTRAL, cost: 4, limit: 1, text: '+4 RCH when casting Spells.' },
  { id: 'neu-imported-crossbow', name: 'Imported Crossbow', faction: NEUTRAL, cost: 5, limit: 1, text: 'The model receives a Crossbow (PW 13, Strike 1).', auto: true, weapon: wp('Crossbow', '13', '0-24": +3 · 25-48": -3', '1', 'Ranged', 'Two-Handed') },
  { id: 'neu-camaraderie', name: 'Camaraderie', faction: NEUTRAL, cost: 5, limit: 3, text: "A Neutral or semi-neutral model benefits from its Leader's Authority Stratagems.", hiredOnly: true },
  { id: 'neu-king-of-the-battlefield', name: 'King of the Battlefield', faction: NEUTRAL, cost: 2, limit: null, text: 'The model receives a Spear (PW T, RCH 2, Throwing).', auto: true, weapon: wp('Spear', 'T', '2', 'STA', 'Melee', 'Throwing') },
  { id: 'neu-smokescreen', name: 'Smokescreen', faction: NEUTRAL, cost: 2, limit: 2, text: 'Haze Bomb (consumable, Targetless, Circular L): the area is a Hazy Environment until your next Strategic Phase.' },
  { id: 'neu-expedition-leader', name: 'Expedition Leader', faction: NEUTRAL, cost: 5, limit: null, text: 'Stratagems: Advance! (all models +1 SPD), Back to Back (all models gain Vigilance).', auto: true, stratagems: ['Advance!', 'Back to Back'] },
  { id: 'neu-raid-leader', name: 'Raid Leader', faction: NEUTRAL, cost: 4, limit: null, text: 'Stratagems: Formation Spearhead (target gains Dash), Rallying Command (all models gain Fearless).', auto: true, stratagems: ['Formation Spearhead', 'Rallying Command'] },

  // ---- Empire of Soga ----
  { id: 'sog-bujutsu-expertise', name: 'Bujutsu Expertise', faction: SOGA, cost: 3, limit: 2, text: 'Armsmaster Class and Fencing I, or the next rank of Fencing.', auto: true, classes: ['Armsmaster'], art: 'Fencing' },
  { id: 'sog-kyujutsu-expertise', name: 'Kyujutsu Expertise', faction: SOGA, cost: 3, limit: 2, text: 'Marksman Class and Archery I, or the next rank of Archery.', auto: true, classes: ['Marksman'], art: 'Archery' },
  { id: 'sog-lucky-charm', name: 'Lucky Charm', faction: SOGA, cost: 3, limit: 1, text: '1 Luck counter each Strategic Phase (max 3). Spend one to reroll a die in an Activation Sequence, or to make an attacker reroll one Damage roll.' },
  { id: 'sog-yari-tsukai', name: 'Kassen Buki: Yari-tsukai', faction: SOGA, cost: 2, limit: null, text: 'Warrior only. The Primary Weapon becomes a Lance (PW T+2, RCH 2). 1 pt if it was a Spear.', auto: true, needClass: 'Warrior', replacePrimary: true, cheaperWith: { weapon: 'Spear', cost: 1 }, weapon: wp('Lance', 'T+2', '2', 'STA', 'Melee', 'Two-Handed, Throwing') },
  { id: 'sog-nagamaki-tsukai', name: 'Kassen Buki: Nagamaki-tsukai', faction: SOGA, cost: 2, limit: null, text: 'Warrior only. The Primary Weapon becomes a Longhilted Sword (PW T+2, RCH 1, Sweep I, Bleed).', auto: true, needClass: 'Warrior', replacePrimary: true, weapon: wp('Longhilted Sword', 'T+2', '1', 'STA', 'Melee', 'Bleed, Sweep I, Two-Handed') },
  { id: 'sog-daikyuu-tsukai', name: 'Kassen Buki: Daikyuu-tsukai', faction: SOGA, cost: 3, limit: null, text: 'Warrior only. The Primary Weapon becomes a War Bow (PW T+4, Stun). 2 pts if it was a Short Bow.', auto: true, needClass: 'Warrior', replacePrimary: true, cheaperWith: { weapon: 'Short Bow', cost: 2 }, weapon: wp('War Bow', 'T+4', '0-24": 0 · 25-48": -6', 'STA-1', 'Ranged', 'Stun, Two-Handed') },
  { id: 'sog-kanabou-tsukai', name: 'Kassen Buki: Kanabou-tsukai', faction: SOGA, cost: 3, limit: null, text: 'Warrior only. The Primary Weapon becomes a Heavy Bludgeon (PW T+4, RCH 1, Armor-Piercing, Stagger, Stun).', auto: true, needClass: 'Warrior', replacePrimary: true, weapon: wp('Heavy Bludgeon', 'T+4', '1', 'STA-1', 'Melee', 'Armor-Piercing, Stagger, Stun, Two-Handed') },
  { id: 'sog-traveling-duelist', name: 'Traveling Duelist', faction: SOGA, cost: 3, limit: 2, text: 'Warrior only. The model gains Duelist.', auto: true, needClass: 'Warrior', traits: ['Duelist'] },
  { id: 'sog-seasoned-combatant', name: 'Seasoned Combatant', faction: SOGA, cost: 2, limit: null, text: 'The model gains Fearless.', auto: true, traits: ['Fearless'] },

  // ---- Coalition of Thenion ----
  { id: 'the-poisoned-weapons', name: 'Poisoned Weapons', faction: THENION, cost: 2, limit: null, text: 'Poison I, or the next level of Poison.', auto: true, apply: poison },
  { id: 'the-muffled-movement', name: 'Muffled Movement', faction: THENION, cost: 2, limit: null, text: 'The model gains Stealth I.', auto: true, apply: (p) => void (p.skills.some((s) => s.startsWith('Stealth')) || p.skills.push('Stealth I')) },
  { id: 'the-climbing-expertise', name: 'Climbing Expertise', faction: THENION, cost: 2, limit: null, text: 'The model gains Climbing.', auto: true, skills: ['Climbing'] },
  { id: 'the-fangs-of-tiamat', name: 'Fangs of Tiamat', faction: THENION, cost: 2, limit: null, text: 'War Darts (consumable): PW 8, RCH T, Circular L, Targetless, Bleeding, +3 ACC when used.' },
  { id: 'the-concealed-approach', name: 'Concealed Approach', faction: THENION, cost: 3, limit: null, text: 'The model may begin the game Shrouded.' },
  { id: 'the-devotion-tiamat', name: 'Devotion: Tiamat', faction: THENION, cost: 1, limit: null, text: '+1 T; a Warrior or Rogue also +1 OFF. Not for Demons.', auto: true, notTrait: 'Demon', apply: (p) => { p.t += 1; if (p.classes.includes('Warrior') || p.classes.includes('Rogue')) p.off += 1; } },
  { id: 'the-devotion-anras', name: 'Devotion: Anras', faction: THENION, cost: 1, limit: null, text: '+1 DEF, +2 for a Duelist. Not for Demons.', auto: true, notTrait: 'Demon', apply: (p) => void (p.def += p.traits.includes('Duelist') ? 2 : 1) },
  { id: 'the-devotion-paimon', name: 'Devotion: Paimon', faction: THENION, cost: 2, limit: null, text: "+1 INT. The model's other Upgrades cost 1 less (at least 1). Not for Demons.", auto: true, notTrait: 'Demon', stats: { int: 1 } },

  // ---- Helian League ----
  { id: 'hel-tactical-expertise', name: 'Tactical Expertise', faction: HELIAN, cost: 3, limit: 1, text: 'The model gains Tactician.', auto: true, traits: ['Tactician'] },
  { id: 'hel-seasoned-combatant', name: 'Seasoned Combatant', faction: HELIAN, cost: 2, limit: null, text: 'The model gains Fearless.', auto: true, traits: ['Fearless'] },
  { id: 'hel-companion-of-hairon', name: 'Companion of Hairon', faction: HELIAN, cost: 2, limit: 2, text: 'Soldier only. The model counts itself for its Soldier bonus.', needClass: 'Soldier' },
  { id: 'hel-gift-of-longevity', name: 'Gift of Longevity', faction: HELIAN, cost: 1, limit: 2, text: '+1 INT.', auto: true, stats: { int: 1 } },
  { id: 'hel-adept-shaper', name: 'Adept Shaper', faction: HELIAN, cost: 3, limit: 2, text: 'The next level of one of the model\'s Spellcrafts.', auto: true, apply: nextSpellcraft },
  { id: 'hel-reduce-weight-item', name: 'Glyphscribe: Reduce Weight', faction: HELIAN, cost: 3, limit: null, text: 'Inscribed Item: the Primary Weapon weighs 1 less and has +1 Strike.', auto: true, apply: (p) => { const i = p.weapons.findIndex(isAttack); if (i >= 0) p.weapons[i] = { ...p.weapons[i]!, stk: moreStrike(p.weapons[i]!.stk) }; } },
  { id: 'hel-reduce-weight-armor', name: 'Glyphscribe: Reduce Weight', faction: HELIAN, cost: 3, limit: null, text: 'Inscribed Armor: +1 AG, +1 SPD, Inventory +1.', auto: true, stats: { ag: 1, spd: 1 } },
  { id: 'hel-hyperias-providence', name: "Glyphscribe: Hyperia's Providence", faction: HELIAN, cost: 3, limit: null, text: 'A Melee attacker rolls AG or has -1 Strike (at least 1). With a Shield: -3 to Ranged Attacks from the Front.' },
  { id: 'hel-double-time', name: 'Expeditionary Tactics: Double Time', faction: HELIAN, cost: 3, limit: 1, text: 'Discard at the Initiative Check for +6 to the result.' },
  { id: 'hel-surge-order', name: 'Expeditionary Tactics: Surge Order', faction: HELIAN, cost: 3, limit: 1, text: 'Discard in the Strategic Phase: up to 3 Helian League models Walk, Climb or Jump without provoking Reactions.' },

  // ---- Sand Kingdoms ----
  { id: 'san-mana-catalyst', name: 'Mana Catalyst', faction: SAND, cost: 1, limit: null, text: "Change one of the model's Affinities to Fire, Water, Earth or Air." },
  { id: 'san-elemental-lineage', name: 'Elemental Lineage', faction: SAND, cost: 4, limit: 2, text: 'The model gains Affinity (Fire), (Water), (Earth) or (Air).' },
  { id: 'san-arcane-tome', name: 'Arcane Tome', faction: SAND, cost: 4, limit: null, text: "The next level of one of the model's Spellcrafts.", auto: true, apply: nextSpellcraft },
  { id: 'san-flying-carpet', name: 'Flying Carpet', faction: SAND, cost: 4, limit: 1, text: 'Medium or smaller. The model may use the Flight Skill.', auto: true, maxSize: 'medium', skills: ['Flight'] },
  { id: 'san-conjured-retinue', name: 'Conjured Retinue', faction: SAND, cost: 3, limit: 1, text: 'Tier I and II creatures the model summons gain the Soldier Class.' },
  { id: 'san-personal-guard', name: 'Personal Guard', faction: SAND, cost: 3, limit: null, text: "Given to a summoned creature at deployment: it gains Sentinel but may not fully leave the model's Awareness." },
  { id: 'san-casting-amplifier', name: 'Casting Amplifier', faction: SAND, cost: 2, limit: null, text: '+4 RCH when casting Spells.' },
];

const BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
export const upgradeById = (id: unknown): Upgrade | undefined => (typeof id === 'string' ? BY_ID.get(id) : undefined);

/** Monster Factions and Neutral parties buy Neutral Upgrades only. */
export function upgradesFor(faction: string): Upgrade[] {
  return UPGRADES.filter((u) => u.faction === NEUTRAL || u.faction === faction);
}

/** Resourceful I / II as written on the card. */
function resourceful(p: Profile): number {
  const all = [...p.traits, ...p.skills];
  return all.includes('Resourceful II') ? 2 : all.includes('Resourceful I') ? 1 : 0;
}

/** How many Upgrades this model may carry, given the ones it has. */
export function upgradeSlots(p: Profile, ids: readonly string[]): number {
  if (isCharacter(p)) return 0;
  return 1 + resourceful(p) + ids.reduce((sum, id) => sum + (upgradeById(id)?.slots ?? 0), 0);
}

/** Why this model cannot take the Upgrade, or null. `faction` is the party's. */
export function upgradeProblem(u: Upgrade, p: Profile, faction: string): string | null {
  if (isCharacter(p)) return 'Characters cannot take Upgrades';
  if (u.faction !== NEUTRAL && u.faction !== faction) return `Only ${u.faction} parties can buy this`;
  if (u.needClass && !p.classes.includes(u.needClass)) return `Only a ${u.needClass}`;
  if (u.notTrait && p.traits.includes(u.notTrait)) return `Not for a ${u.notTrait}`;
  if (u.maxSize && SIZE_ORDER.indexOf(p.size) > SIZE_ORDER.indexOf(u.maxSize)) return `Only size ${u.maxSize} or smaller`;
  if (u.hiredOnly && !(p.faction === NEUTRAL || p.semiNeutral === true)) return 'Only a Neutral or semi-neutral model';
  return null;
}

/** What one Upgrade costs on this model, next to the others it carries. */
export function upgradeCost(u: Upgrade, p: Profile, ids: readonly string[]): number {
  let cost = u.cheaperWith && p.weapons[0]?.name === u.cheaperWith.weapon ? u.cheaperWith.cost : u.cost;
  if (u.id !== 'the-devotion-paimon' && ids.includes('the-devotion-paimon')) cost = Math.max(1, cost - 1);
  return cost;
}

export const upgradesCost = (p: Profile, ids: readonly string[]): number => ids.reduce((sum, id) => sum + (upgradeById(id) ? upgradeCost(upgradeById(id)!, p, ids) : 0), 0);

const cache = new Map<string, Profile>();

/** The model's card with its Upgrades applied. The Recruitment Cost stays the card's own. */
export function withUpgrades(base: Profile, ids: readonly string[] | undefined): Profile {
  if (!ids || ids.length === 0) return base;
  const key = base.id + '|' + ids.join(',');
  const hit = cache.get(key);
  if (hit) return hit;
  const p: Profile = { ...base, classes: [...base.classes], traits: [...base.traits], skills: [...base.skills], arts: [...base.arts], weapons: [...base.weapons], stratagems: [...base.stratagems] };
  for (const id of ids) {
    const u = upgradeById(id);
    if (!u) continue;
    for (const [k, v] of Object.entries(u.stats ?? {})) p[k as UpgradeStat] = Math.max(0, p[k as UpgradeStat] + v);
    for (const t of u.traits ?? []) if (!p.traits.includes(t)) p.traits.push(t);
    for (const s of u.skills ?? []) if (!p.skills.includes(s)) p.skills.push(s);
    for (const c of u.classes ?? []) if (!p.classes.includes(c)) p.classes.push(c);
    for (const s of u.stratagems ?? []) if (!p.stratagems.includes(s)) p.stratagems.push(s);
    if (u.art) p.arts = nextRank(p.arts, u.art);
    if (u.weapon) {
      if (u.replacePrimary && p.weapons.length > 0) p.weapons[0] = u.weapon;
      else p.weapons.push(u.weapon);
    }
    u.apply?.(p, base);
  }
  cache.set(key, p);
  return p;
}
