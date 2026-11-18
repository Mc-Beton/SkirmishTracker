import type { Pt, MarkerKind } from './types.ts';

// Quests and Schemes. Texts are short summaries in our own words; the rulebook has the full wording.

export interface QuestDef {
  code: string;
  name: string;
  /** How Victory Points are earned, one line each. */
  scoring: string[];
  /** Special rules, one line each. */
  rules: string[];
  /** Objective markers, as fractions of the table (0.5, 0.5 = the centre). */
  markers: { id: string; name: string; at: Pt; radius: number; kind?: MarkerKind }[];
  /** Whether the Broken Morale rule is in effect. */
  brokenMorale: boolean;
}

export const QUESTS: QuestDef[] = [
  {
    code: 'open-hostilities',
    name: 'Open Hostilities',
    scoring: [
      'Taking an enemy out (Incapacitated or Dead) scores by its Recruitment Cost: up to 16 pts – 1 VP, 17–21 – 2 VP, 22–29 – 3 VP, 30 or more – 4 VP.',
      'Taking the enemy Leader out: 1 VP more.',
    ],
    rules: ['Standard deployment, 8" zones.'],
    markers: [],
    brokenMorale: true,
  },
  {
    code: 'awaiting-reinforcements',
    name: 'Awaiting Reinforcements',
    scoring: [
      'At the end of each round, counting models that are still standing within 6" of the Obelisk:',
      '1 VP for having at least one model there.',
      '1 VP for the Stronger Presence (higher total Recruitment Cost there).',
      '1 VP if you have a model there and the opponent has none.',
    ],
    rules: ['Nothing is scored in round 1.', 'Ceasefire: attacking an enemy in round 1 costs 4 VP.', 'Broken Morale does not apply.'],
    markers: [{ id: 'obelisk', name: 'Obelisk', at: { x: 0.5, y: 0.5 }, radius: 6 }],
    brokenMorale: false,
  },
  {
    code: 'treasure-hunt',
    name: 'Treasure Hunt',
    scoring: ['1 VP for unlocking a Cache.', '2 VP for each Treasure one of your models holds at the end of the game.', '3 VP for each Treasure a model carries off the field.'],
    rules: [
      'Two Intrigue tokens lie on the centre line (A on Blue\'s left, B on the right); under each is a Sigil on top of a Cache.',
      'Perceive (INT roll, token within Awareness and in sight) or Base Contact reveals an Intrigue token as a Sigil.',
      'From round 2: a model that comes into Base Contact with a Sigil sets its Spell off (PW 14, Circular L, every model there Dodges or is hit). Then the Cache is free.',
      'From round 2: Interact with a Cache in Base Contact – AG roll, +3 for a Rogue, Ranger or Alchemist – to take the Treasure.',
      'A carrier that is taken out drops the Treasure; Interact picks it up.',
      'From round 4 a carrier may leave the field over its own table edge.',
      'The Quest ends when both Treasures have left the field, or at the end of the turn of a player who began it in Broken Morale.',
    ],
    markers: [
      { id: 'cache-1', name: 'Intrigue token A', at: { x: 1 / 3, y: 0.5 }, radius: 0, kind: 'intrigue' },
      { id: 'cache-2', name: 'Intrigue token B', at: { x: 2 / 3, y: 0.5 }, radius: 0, kind: 'intrigue' },
    ],
    brokenMorale: true,
  },
];

export const questByCode = (code: string | null | undefined): QuestDef | undefined => QUESTS.find((q) => q.code === code);

/** Radius of an objective marker token (25 mm), in inches. */
export const MARKER_RADIUS = 0.49;

/** Open Hostilities: VP for taking out a model of this Recruitment Cost. */
export const bountyFor = (cost: number): number => (cost >= 30 ? 4 : cost >= 22 ? 3 : cost >= 17 ? 2 : 1);

// ---- Schemes ----

export interface Scheme {
  code: string;
  name: string;
  text: string;
  maxVp: number;
}

const s = (code: string, name: string, maxVp: number, text: string): Scheme => ({ code, name, text, maxVp });

export const SCHEMES: Scheme[] = [
  s('opportunistic-manipulation', 'Opportunistic Manipulation', 3, 'Reveal at the start of your Strategic Phase. 1 VP for each: an enemy that is not Dead in the enemy Deployment Zone; an enemy that is not Dead on your half; an Incapacitated ally on the enemy half.'),
  s('assassination-contract', 'Assassination Contract', 3, '3 VP for killing the enemy Leader (Dead).'),
  s('virtuous-commander', 'Virtuous Commander', 3, '1 VP for each of your models still standing at the end of the game (up to 3).'),
  s('martial-valor', 'Martial Valor', 3, 'Reveal when one of your models Incapacitates an enemy that costs more Recruitment Points: 2 VP. 1 VP more if another of your models does the same.'),
  s('no-quarter', 'No Quarter', 3, '1 VP for each Dead enemy model at the end of the game (up to 3).'),
  s('stand-your-ground', 'Stand Your Ground', 3, 'Reveal in your Strategic Phase, discard at the start of your next one. 1 VP for each of your models that did not move this round (up to 3).'),
  s('head-hunt', 'Head Hunt', 3, '1 VP for each Death Blow you perform on an enemy (up to 3).'),
  s('open-aggression', 'Open Aggression', 3, 'Reveal in your Strategic Phase, discard in the End Phase. 1 VP for each Wound you deal to enemies this turn (up to 3).'),
  s('pursuit-of-glory', 'Pursuit of Glory', 3, 'Reveal in your Strategic Phase. In the End Phase of that turn: 1 VP for each of your standing models outside the Awareness of the rest of your party (up to 3).'),
  s('fierce-as-fire', 'Fierce as Fire, Immovable as a Mountain', 3, 'Reveal when one of your models first Wounds an enemy in Reaction. 1 VP for each such Wound (up to 3).'),
  s('engetsu-formation', 'Engetsu Formation', 3, '1 VP for each of your models in your Deployment Zone at the end of the game (up to 3).'),
  s('stalwart-defender', 'Stalwart Defender', 3, '3 VP if there are no enemy models in your Deployment Zone at the end of the game.'),
  s('unmatched-flanking', 'Unmatched Flanking', 3, 'Reveal in your Strategic Phase, discard in the End Phase. 1 VP for each Attack this turn against an enemy that has no line of sight to your model (up to 3).'),
  s('leave-unnoticed', 'Leave Unnoticed', 3, '1 VP for each of your models outside every enemy line of sight at the end of the game (up to 3).'),
  s('cunning-tenacity', 'Cunning Tenacity', 3, '2 VP for each of your models that never lost HP during the game (up to 3).'),
  s('breach-their-defenses', 'Breach Their Defenses', 3, '2 VP for each of your models in the enemy Deployment Zone at the end of the game (up to 3).'),
  s('blood-for-blood', 'Blood for Blood', 3, 'Reveal in your Strategic Phase, discard in the End Phase. Choose one of your models that an enemy has Wounded: 3 VP if you Incapacitate that enemy this turn.'),
  s('decisive-victory', 'Decisive Victory', 3, '3 VP if all your models are still standing at the end of the game.'),
  s('last-warning', 'Last Warning', 3, 'Reveal in your Strategic Phase. 3 VP if none of your models declares an Attack until your next Strategic Phase.'),
  s('relentless-advance', 'Relentless Advance', 3, 'Reveal in your Strategic Phase, discard in the End Phase. 1 VP for each of your models beyond the middle of the field at the end of this turn (up to 3).'),
  s('peacekeeping-paragon', 'Peacekeeping Paragon', 3, '1 VP for each enemy model still standing at the end of the game (up to 3).'),
  s('appear-weak', 'Appear Weak When You Are Strong', 3, '1 VP for each Wound you deal to enemies with Melee Attacks (up to 3).'),
  s('unhindered-expedition', 'Unhindered Expedition', 3, 'Reveal in your Strategic Phase, discard in the End Phase. 2 VP if 3 of your models (not summoned) are outside your Deployment Zone at the end of the turn; 1 VP more if one of them is in the enemy Deployment Zone.'),
  s('strength-in-numbers', 'Strength in Numbers', 3, '2 VP if you have more standing models than the opponent at the end of the game; 1 VP more with at least twice as many.'),
  s('steadfast-expansion', 'Steadfast Expansion', 3, '1 VP for each of your models (not summoned) beyond the middle of the field at the end of the game (up to 3).'),
];

export const schemeByCode = (code: string | null | undefined): Scheme | undefined => SCHEMES.find((x) => x.code === code);

type Row = [from: number, to: number, code: string];
const COMMON: Row[] = [
  [1, 1, 'opportunistic-manipulation'],
  [2, 2, 'assassination-contract'],
  [3, 4, 'virtuous-commander'],
  [5, 6, 'martial-valor'],
  [7, 8, 'no-quarter'],
  [9, 10, 'stand-your-ground'],
];

/** d20 tables from the rulebook. */
const TABLES: Record<string, Row[]> = {
  'Empire of Soga': [...COMMON, [11, 12, 'head-hunt'], [13, 14, 'open-aggression'], [15, 16, 'pursuit-of-glory'], [17, 18, 'fierce-as-fire'], [19, 19, 'engetsu-formation'], [20, 20, 'stalwart-defender']],
  'Coalition of Thenion': [...COMMON, [11, 12, 'unmatched-flanking'], [13, 14, 'leave-unnoticed'], [15, 16, 'cunning-tenacity'], [17, 18, 'breach-their-defenses'], [19, 19, 'assassination-contract'], [20, 20, 'blood-for-blood']],
  'Helian League': [...COMMON, [11, 12, 'decisive-victory'], [13, 14, 'virtuous-commander'], [15, 16, 'last-warning'], [17, 18, 'fierce-as-fire'], [19, 19, 'relentless-advance'], [20, 20, 'peacekeeping-paragon']],
  'Sand Kingdoms': [...COMMON, [11, 12, 'stand-your-ground'], [13, 14, 'appear-weak'], [15, 16, 'unhindered-expedition'], [17, 18, 'strength-in-numbers'], [19, 19, 'steadfast-expansion'], [20, 20, 'stalwart-defender']],
};

/**
 * Monster Factions (Oni Clans, Goblin Wartribes) and Neutral parties may only use the six Neutral Schemes.
 * The rulebook gives no d20 table for that, so this one spreads them evenly – an assumption to confirm.
 */
const NEUTRAL_TABLE: Row[] = [
  [1, 3, 'opportunistic-manipulation'],
  [4, 6, 'assassination-contract'],
  [7, 10, 'virtuous-commander'],
  [11, 14, 'martial-valor'],
  [15, 17, 'no-quarter'],
  [18, 20, 'stand-your-ground'],
];

/** How many Schemes a player draws: by the Leader's Intellect. */
export const schemeDraws = (leaderInt: number): number => (leaderInt >= 16 ? 4 : leaderInt >= 14 ? 3 : 2);

/** Draw `count` different Schemes for a faction; a repeated name is drawn again. */
export function drawSchemes(faction: string, count: number, d20: () => number): string[] {
  const table = TABLES[faction] ?? NEUTRAL_TABLE;
  const distinct = new Set(table.map((r) => r[2])).size;
  const out: string[] = [];
  for (let guard = 0; out.length < Math.min(count, distinct) && guard < 500; guard++) {
    const roll = d20();
    const code = table.find((r) => roll >= r[0] && roll <= r[1])?.[2];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Treasure Hunt: the Spell a Sigil holds, by d20. All are PW 14 and Circular L when a Sigil sets them off. */
export interface SigilSpell {
  name: string;
  /** Hits on each model that fails its Dodge. */
  hits: number;
  traits: string[];
  /** What the card adds, in a few words. */
  text: string;
}
const SIGILS: { upTo: number; spell: SigilSpell }[] = [
  { upTo: 4, spell: { name: 'Inferno', hits: 1, traits: ['Burn 3'], text: 'Burn (3)' } },
  { upTo: 8, spell: { name: 'Glacier Circle', hits: 1, traits: ['Immobilize'], text: 'Immobilized on Hit' } },
  { upTo: 12, spell: { name: 'Claws of Earth', hits: 3, traits: [], text: '3 Hits' } },
  { upTo: 16, spell: { name: 'Thunderstorm', hits: 1, traits: ['Ignore Armor', 'Stun'], text: 'Ignore Armor, Stun' } },
  { upTo: 18, spell: { name: 'Mass Mindbreak', hits: 1, traits: ['Stagger', 'Panic'], text: 'Stagger; Panicked if wounded' } },
  { upTo: 19, spell: { name: 'Corroding Embrace', hits: 1, traits: ['Armor-Piercing', 'Poison II'], text: 'Armor-Piercing, Poison II' } },
  { upTo: 20, spell: { name: 'Smite', hits: 1, traits: ['Armor-Piercing', 'Burn 1'], text: 'Armor-Piercing, Burn (1)' } },
];
export const sigilByRoll = (roll: number): SigilSpell => (SIGILS.find((x) => roll <= x.upTo) ?? SIGILS[0]!).spell;
export const sigilByName = (name: string | undefined): SigilSpell | undefined => SIGILS.find((x) => x.spell.name === name)?.spell;
export const SIGIL_PW = 14;
/** Large circular template: 120 mm across. */
export const SIGIL_RADIUS = 120 / 25.4 / 2;
