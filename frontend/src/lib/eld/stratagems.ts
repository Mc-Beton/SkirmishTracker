// Leader Stratagems: what each one says and what the table applies.
// Source: the faction card files (Nov 2026) and the Raid Leader / Expedition Leader Upgrades.
// A Stratagem is declared in its player's Strategic Phase and, unless it says otherwise, lasts until that
// player's next Strategic Phase. Authority Stratagems affect the Leader's party (only models with the
// Leader's Affiliation, or with the Camaraderie Upgrade); Subterfuge Stratagems affect enemy models.

import type { StatKey } from './stats.ts';

export type StratKind = 'Authority' | 'Subterfuge';

/** What a model gains while a Stratagem lasts. */
export interface Boon {
  stats?: Partial<Record<StatKey, number>>;
  /** Added to its card: Traits, Skills, Classes. */
  traits?: string[];
  skills?: string[];
  classes?: string[];
  /** Its Attacks gain these Traits / its Melee Attacks +PW / its Spell Attacks +PW. */
  attackTraits?: string[];
  meleePw?: number;
  spellPw?: number;
  /** Mastery of Poisons: Poison I, or Poison II when the Attack already has Poison I. */
  poisonUp?: boolean;
  /** +1 ARM for every other friendly model in Base Contact. */
  formation?: boolean;
  /** Earthspeaker: Light Cover against Attacks. */
  lightCover?: boolean;
  /** Sacred Vow: enemy Enchantments cannot be put on the model. */
  warded?: boolean;
  /** Dishearten: 1 AP less at the start of every turn. */
  apDrain?: number;
  /** Vicious Opportunism: its Attacks against Crouched models reroll 1 Attack roll, gain +6 PW and Cleave. */
  viciousVsCrouched?: boolean;
  /** Exploiting Weakness (on the enemy): failed Damage rolls against it may be rerolled once. */
  exposed?: boolean;
  /** Refined Conjuration: Mana Cost of its Conjuration Spells −n. Temporary Bind: Summoning Limit 0. */
  conjure?: number;
  unbound?: boolean;
  /** Shown on the card when the effect is applied by hand. */
  reminder?: string;
}

/** Which models a Stratagem works on. */
export type Who =
  | 'party' // every model of the party it is allowed to affect
  | 'self' // the Leader
  | 'pick' // up to `max` models the player picks
  | 'enemies' // every enemy model
  | 'none'; // nothing on the table (by hand)

export interface Filter {
  classes?: string[];
  traits?: string[];
  faction?: string;
  /** Within the Leader's Awareness when it is declared. */
  aware?: boolean;
  /** Not the Leader itself. */
  others?: boolean;
  /** Only Dead / not Incapacitated models. */
  dead?: boolean;
  standing?: boolean;
  /** A summoned creature (Temporary Bind). */
  summoned?: boolean;
  /** At most this many AP (Mark of Red). */
  maxAp?: number;
}

export interface Stratagem {
  name: string;
  kind: StratKind;
  text: string;
  who: Who;
  /** For 'pick': how many models at most, and whose (allies by default). */
  max?: number;
  enemy?: boolean;
  /** Models of either party (Soul Harvest). */
  anySide?: boolean;
  only?: Filter;
  boon?: Boon;
  /** One-off effects when declared. */
  heal?: number;
  /** Heal: an Incapacitated (or, with `dead`, a Dead non-Undead) target first needs a successful Leader INT roll. */
  rollFor?: 'incapacitated' | 'living';
  raise?: boolean;
  ap?: number;
  fatigue?: boolean;
  cancelState?: boolean;
  /** Up to `max` models enchanted with one of the Leader's Enchantments. */
  enchant?: boolean;
  /** Mind Invasion: INT−3 or Confused until the next Strategic Phase. */
  confuse?: number;
  /** Sacred Vow: enemy Enchantments on the target are removed. */
  purge?: boolean;
  /** Dishearten: the target rolls halved M; on a failure the Stratagem's boon applies to it. */
  halvedMorale?: boolean;
  unshroud?: boolean;
  harvest?: number;
  /** Unconventional Tactics. */
  negate?: boolean;
  /** Authority Stratagems that name their models (Undead, Goblins) regardless of Affiliation. */
  anyAffiliation?: boolean;
  /** Nothing on the table: the players apply it. */
  byHand?: boolean;
}

const A = 'Authority' as const;
const S = 'Subterfuge' as const;
const WARRIORS = ['Warrior'];
const SOLDIERS = ['Soldier'];
const ROGUES = ['Assassin', 'Rogue'];

const LIST: Stratagem[] = [
  // Helian League
  { name: 'Nursing Aura', kind: A, text: 'Select up to 3 models. Each may regain 1 HP. If an Incapacitated model is selected, the Leader must perform a successful INT roll in order for it to regain 1 HP.', who: 'pick', max: 3, heal: 1, rollFor: 'incapacitated' },
  { name: 'Spiritual Paragon', kind: A, text: 'All models gain +4 M.', who: 'party', boon: { stats: { m: 4 } } },
  { name: 'Expeditionary Paragon', kind: A, text: 'Target party member gains Soldier Class.', who: 'pick', max: 1, boon: { classes: ['Soldier'] } },
  { name: 'March!', kind: A, text: 'Soldiers gain +1 SPD.', who: 'party', only: { classes: SOLDIERS }, boon: { stats: { spd: 1 } } },
  { name: 'Rally Troops', kind: A, text: 'Soldiers cannot become Panicked.', who: 'party', only: { classes: SOLDIERS }, boon: { traits: ['Fearless'] } },
  { name: 'Striking Momentum', kind: A, text: 'When a Soldier declares an Attack in Reaction, it may immediately move directly towards the target activated model for a halved SPD.', who: 'party', only: { classes: SOLDIERS }, boon: { reminder: 'Attack in Reaction: may first move half its SPD straight at the activated model (by hand)' } },
  { name: 'Active Support', kind: A, text: 'Up to two models may become enchanted with one of the Enchantment Spells available to the Leader.', who: 'pick', max: 2, enchant: true },
  { name: 'Talented Command', kind: A, text: 'Target model gains Chain Attack.', who: 'pick', max: 1, boon: { skills: ['Chain Attack'] } },
  { name: "Weaver's Aura", kind: A, text: 'Spell Attacks cast by allies gain +2 PW.', who: 'party', boon: { spellPw: 2 } },
  // Empire of Soga
  { name: 'Advance!', kind: A, text: 'All models gain +1 SPD.', who: 'party', boon: { stats: { spd: 1 } } },
  { name: 'Back to Back', kind: A, text: 'All models gain Vigilance.', who: 'party', boon: { traits: ['Vigilance'] } },
  { name: 'Brazen Assault', kind: A, text: 'Warriors gain Dash and Fearless.', who: 'party', only: { classes: WARRIORS }, boon: { skills: ['Dash'], traits: ['Fearless'] } },
  { name: 'Evasion Tactics', kind: A, text: 'All models gain +2 AG.', who: 'party', boon: { stats: { ag: 2 } } },
  { name: 'Break the Offensive', kind: A, text: 'Warriors and Soldiers gain +3 DEF.', who: 'party', only: { classes: [...WARRIORS, ...SOLDIERS] }, boon: { stats: { def: 3 } } },
  { name: 'Close Ranks', kind: A, text: 'Each allied model receives +1 ARM for every other allied model in Base Contact. Warriors and Soldiers gain Vigilance.', who: 'party', boon: { formation: true } },
  { name: 'Overcome Pain', kind: A, text: 'Target Warrior not in the Incapacitated State regains 1 HP.', who: 'pick', max: 1, only: { classes: WARRIORS, standing: true }, heal: 1 },
  { name: 'Hunter Tactics', kind: A, text: 'Target model may perform Walk during its End Phase.', who: 'pick', max: 1, boon: { reminder: 'May Walk in its End Phase (by hand)' } },
  { name: 'Stalwart Defender', kind: A, text: 'Sentinels and Warriors gain +3 DEF and Fearless.', who: 'party', only: { classes: ['Sentinel', ...WARRIORS] }, boon: { stats: { def: 3 }, traits: ['Fearless'] } },
  // Coalition of Thenion
  { name: 'Sacred Vow', kind: A, text: 'Remove all enemy Enchantments from the target. The target cannot be affected by enemy Enchantments until your next Strategic Phase.', who: 'pick', max: 1, purge: true, boon: { warded: true, reminder: 'Enemy Enchantments cannot affect it' } },
  { name: 'Solemn Presence', kind: A, text: 'Soldiers gain Vigilance.', who: 'party', only: { classes: ['Soldier'] }, boon: { traits: ['Vigilance'] } },
  { name: 'Dishearten', kind: S, text: 'Target 1 enemy in LoS, it must perform a halved M roll. On fail, it loses 1 Activation Point every turn, until your next Strategic Phase.', who: 'pick', max: 1, enemy: true, halvedMorale: true, boon: { apDrain: 1, reminder: 'Loses 1 AP at the start of every turn' } },
  { name: 'Vicious Opportunism', kind: A, text: 'Attacks by friendly models against Crouched models may reroll 1 Attack roll, gain +6PW and Cleave.', who: 'party', boon: { viciousVsCrouched: true, reminder: 'Against Crouched models: reroll 1 Attack roll, +6 PW, Cleave' } },
  { name: 'Guerrilla Tactics', kind: A, text: 'Assassins and Rogues gain Hit and Retreat and Backstab.', who: 'party', only: { classes: ROGUES }, boon: { skills: ['Hit and Retreat', 'Backstab'] } },
  { name: 'Mastery of Poisons', kind: A, text: 'Attacks of Assassins and Rogues gain Poison I. Affected models that already have these, receive Poison II instead.', who: 'party', only: { classes: ROGUES }, boon: { poisonUp: true } },
  { name: 'Swift Retreat', kind: A, text: 'During the End Phase when in the Active Role, Assassins and Rogues may perform a Normal Movement.', who: 'party', only: { classes: ROGUES }, boon: { reminder: 'May make a Normal Movement in its End Phase (by hand)' } },
  { name: 'Exploiting Weakness', kind: S, text: 'Unsuccessful Damage Rolls against target model may be re-rolled once.', who: 'pick', max: 1, enemy: true, boon: { exposed: true } },
  { name: 'Unfavorable Terrain', kind: S, text: 'Enemy models suffer -1 SPD.', who: 'enemies', boon: { stats: { spd: -1 } } },
  { name: 'Piercing Perception', kind: S, text: 'Cancel enemy Taunt Skills. Remove Shrouded State of one target.', who: 'pick', max: 1, enemy: true, unshroud: true },
  // Sand Kingdoms
  { name: 'Refined Conjuration', kind: A, text: 'Mana Cost of Conjuration Spells is reduced by 1.', who: 'party', boon: { conjure: 1 } },
  { name: 'Temporary Bind', kind: A, text: 'Summoning Limit of the target summoned creature on the field is reduced to 0.', who: 'pick', max: 1, only: { summoned: true }, boon: { unbound: true }, anyAffiliation: true },
  { name: 'Adrenaline Rush', kind: A, text: 'Target self. In the Active Role, gain 1 additional AP but become Fatigued until your next Strategic Phase.', who: 'self', ap: 1, fatigue: true },
  { name: 'Ironhide', kind: A, text: 'Target self. Gain +3 ARM.', who: 'self', boon: { stats: { arm: 3 } } },
  { name: 'Reinforced Claws', kind: A, text: 'Target self. Gain Bleed. Melee Attacks gain +2 PW.', who: 'self', boon: { attackTraits: ['Bleed'], meleePw: 2 } },
  // Goblin Wartribes
  { name: 'Call of Bravery', kind: A, text: "Other Goblin models in this model's Awareness cannot be Panicked.", who: 'party', only: { faction: 'Goblin Wartribes', aware: true, others: true }, boon: { traits: ['Fearless'] } },
  { name: 'Earthspeaker', kind: A, text: 'Allied models (including self) in Awareness have Light Cover.', who: 'party', only: { aware: true }, boon: { lightCover: true } },
  { name: 'Hexcaller', kind: S, text: '1 enemy model in Awareness can become Enchanted with a Spell available to this model.', who: 'pick', max: 1, enemy: true, only: { aware: true }, enchant: true },
  { name: 'Unwavering Presence', kind: A, text: 'Other party members gain Fearless.', who: 'party', only: { others: true }, boon: { traits: ['Fearless'] } },
  // Oni Clans
  { name: 'Mark of Red', kind: A, text: 'Target Oni with 2 or less AP gains +1 AP.', who: 'pick', max: 1, only: { faction: 'Oni Clans', maxAp: 2, standing: true }, ap: 1 },
  { name: 'Devour the Enemy', kind: A, text: 'The first time an Oni wounds an enemy this turn (excluding models with the Undead, Construct, or Elemental Trait), it regains 1 HP.', who: 'party', only: { faction: 'Oni Clans' }, boon: { reminder: 'First Wound it deals this turn to a living enemy: regains 1 HP (by hand)' } },
  { name: 'Raid Expert', kind: A, text: 'Oni models gain Dash and Leap.', who: 'party', only: { faction: 'Oni Clans' }, boon: { skills: ['Dash', 'Leap'] } },
  { name: 'Recall the Souls', kind: A, text: 'Select up to 2 Dead models. Each regains 1 HP and cancels Dead State. Models without the Undead Trait require the caster to succeed on an INT roll first.', who: 'pick', max: 2, only: { dead: true }, heal: 1, raise: true, rollFor: 'living', anyAffiliation: true },
  { name: 'Painless Death', kind: A, text: 'All Undead gain Berserker Class.', who: 'party', only: { traits: ['Undead'] }, boon: { classes: ['Berserker'] }, anyAffiliation: true },
  { name: 'Mind Invasion', kind: S, text: 'Up to one enemy model within Awareness must perform an INT -3 roll. On failure, they suffer Confused until your next Strategic Phase.', who: 'pick', max: 1, enemy: true, only: { aware: true }, confuse: -3 },
  { name: 'Coordinated Assault', kind: A, text: 'Target ally gains Chain Attack.', who: 'pick', max: 1, boon: { skills: ['Chain Attack'] } },
  { name: 'Eternal Vigil', kind: A, text: 'Target Undead model gains Watchful.', who: 'pick', max: 1, only: { traits: ['Undead'] }, boon: { skills: ['Watchful'], reminder: 'Watchful: double AP in its Reactive Role' }, anyAffiliation: true },
  { name: 'Final Gambit', kind: A, text: 'All Undead gain Unstoppable (may ignore the Size requirement). All Undead become Dead at the end of the turn. When an allied Undead becomes Dead, place AoE: Circular S centered on it. All models within the AoE suffer a hit with PW 12 and Poison II. After resolving the AoE, remove the Undead.', who: 'party', only: { traits: ['Undead'] }, boon: { traits: ['Unstoppable'], reminder: 'Final Gambit: Dead at the end of the turn, then PW 12 Poison II on a small circular template around it (by hand)' }, anyAffiliation: true },
  { name: 'Profane Mend', kind: A, text: 'Select up to 2 models. Each may regain 1HP (including Dead models). If a Dead model regains HP this way, cancel Dead State.', who: 'pick', max: 2, heal: 1, raise: true },
  { name: 'Soul Harvest', kind: S, text: 'Remove up to two Dead models within Awareness. Gain 2 Mana for each removed Dead model.', who: 'pick', max: 2, only: { dead: true, aware: true }, harvest: 2, anySide: true },
  // Neutral
  { name: 'Defensive Formation', kind: A, text: 'Each friendly model receives +1 ARM for every other friendly model in Base Contact.', who: 'party', boon: { formation: true } },
  { name: 'Unconventional Tactics', kind: S, text: 'Negate all enemy Stratagems currently in effect. At the start of the next Strategic Phase, the enemy Leader must perform an INT or M roll (their choice). On a failure, they cannot declare a Stratagem this turn.', who: 'none', negate: true },
  { name: 'Advance!', kind: A, text: 'All models gain +1 SPD.', who: 'party', boon: { stats: { spd: 1 } } },
  { name: 'Formation Spearhead', kind: A, text: 'Target gains Dash.', who: 'pick', max: 1, boon: { skills: ['Dash'] } },
  { name: 'Rallying Command', kind: A, text: 'All models gain Fearless.', who: 'party', boon: { traits: ['Fearless'] } },
  // Not in the card files of this project: the players apply them.
];

/** Leaders whose card prints a Stratagem of the same name with a different effect. */
const VARIANTS: Record<string, Stratagem> = {
  'sog-great-guard:Rally Troops': { name: 'Rally Troops', kind: A, text: 'Models gain Fearless and may cancel up to 1 State affecting them (except Dead, Engaged, or Incapacitated).', who: 'party', boon: { traits: ['Fearless'] }, cancelState: true },
  'the-tharos:Guerrilla Tactics': { name: 'Guerrilla Tactics', kind: A, text: 'Assassins and Rogues gain Hit and Retreat.', who: 'party', only: { classes: ROGUES }, boon: { skills: ['Hit and Retreat'] } },
  'the-tharos:Mastery of Poisons': { name: 'Mastery of Poisons', kind: A, text: 'Attacks made by Assassins and Rogues gain Poison I. If target already has Poison I, it instead gains Poison II.', who: 'party', only: { classes: ROGUES }, boon: { poisonUp: true } },
};
const BY_NAME = new Map<string, Stratagem>();
for (const s of LIST) if (!BY_NAME.has(s.name)) BY_NAME.set(s.name, s);

/** The Stratagem as printed on this Leader's card. */
export const stratagemFor = (leaderProfileId: string | undefined, name: string): Stratagem | undefined =>
  (leaderProfileId && VARIANTS[`${leaderProfileId}:${name}`]) || BY_NAME.get(name);

/** Stratagems that apply nothing on the table: the card text is shown and the players apply it. */
export const isByHand = (s: Stratagem): boolean => !!s.byHand;
