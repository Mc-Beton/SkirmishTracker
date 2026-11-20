import type { BaseSize, FigureKind } from './types.ts';

// Model profiles transcribed from the faction card files (numbers and names only).
// STK "STA" = equal to the model's Stamina. PW "T" = the model's Toughness.

export interface Weapon {
  name: string;
  /** Power: a number, "T", "T+3", "T-2" or "-" (no attack). */
  pw: string;
  /** Reach in inches, a range table for ranged weapons, or "-". */
  rch: string;
  /** Strike: a number, "STA", "STA-1", "STA+1" or "-". */
  stk: string;
  type: string;
  effect?: string;
  /** A Throwing item used for its Ranged Attack: the name of the item on the card. */
  thrown?: string;
}

export interface Profile {
  id: string;
  name: string;
  faction: string;
  /** Can also be recruited by other factions as a neutral model. */
  semiNeutral?: boolean;
  tier: number;
  classes: string[];
  size: BaseSize;
  sta: number;
  spd: number;
  arm: number;
  hp: number;
  off: number;
  def: number;
  acc: number;
  int: number;
  ag: number;
  t: number;
  m: number;
  /** Recruitment Points. */
  cost: number;
  /** How many of this profile one party may contain; null = no limit. */
  limit: number | null;
  traits: string[];
  skills: string[];
  /** Combat Arts and Spellcraft. */
  arts: string[];
  weapons: Weapon[];
  /** Only models with Stratagems make good Leaders. */
  stratagems: string[];
  /** Rider: the Mount its card names (shared/mounts.ts). */
  mount?: string;
  /** A creature brought to the field by a Conjuration Spell, never recruited. */
  summoned?: boolean;
}

type Stats = [sta: number, spd: number, arm: number, hp: number, off: number, def: number, acc: number, int: number, ag: number, t: number, m: number];

const w = (name: string, pw: string, rch: string, stk: string, type: string, effect?: string): Weapon => ({
  name,
  pw,
  rch,
  stk,
  type,
  ...(effect ? { effect } : {}),
});

// Items that appear on many cards.
const DAGGER = w('Dagger', 'T-3', '0', 'STA', 'Melee', 'Throwing. +1 STK against a Crouched model');
const SWORD = w('Sword', 'T', '1', 'STA', 'Melee');
const SHORT_SWORD = w('Short Sword', 'T', '0', 'STA', 'Melee');
const SHORT_BOW = w('Short Bow', 'T', '0-20": 0 · 21-40": -6', 'STA', 'Ranged', 'Two-Handed');
const SHIELD = w('Shield', '-', '0', '-', 'Shield', '-3 to incoming Melee Attacks to the Front, +3 ARM against Ranged Attacks to the Front');
const PIERCING_DAGGER = w('Piercing Dagger', 'T-2', '0', 'STA', 'Melee', 'Armor-Piercing. +1 STK against a Crouched model');
const BITE = w('Bite', 'T', '0', '1', 'Melee, Natural');

function p(
  id: string,
  name: string,
  faction: string,
  tier: number,
  classes: string[],
  size: BaseSize,
  s: Stats,
  cost: number,
  limit: number | null,
  rest: Partial<Pick<Profile, 'traits' | 'skills' | 'arts' | 'weapons' | 'stratagems' | 'semiNeutral' | 'mount' | 'summoned'>> = {},
): Profile {
  const [sta, spd, arm, hp, off, def, acc, int, ag, t, m] = s;
  return {
    id,
    name,
    faction,
    tier,
    classes,
    size,
    sta,
    spd,
    arm,
    hp,
    off,
    def,
    acc,
    int,
    ag,
    t,
    m,
    cost,
    limit,
    traits: [],
    skills: [],
    arts: [],
    weapons: [],
    stratagems: [],
    ...rest,
  };
}

const HELIAN = 'Helian League';
const SOGA = 'Empire of Soga';
const THENION = 'Coalition of Thenion';
const SAND = 'Sand Kingdoms';
const GOBLIN = 'Goblin Wartribes';
const ONI = 'Oni Clans';
const UNDEAD = 'Undead';
const NEUTRAL = 'Neutral';
const SUMMONED = 'Summoned';

export const PROFILES: Profile[] = [
  // ---- Helian League ----
  p('hel-hierophant', 'Expeditionary Hierophant', HELIAN, 3, ['Mage', 'Vitalist'], 'medium', [2, 5, 4, 1, 8, 8, 8, 15, 11, 8, 12], 23, 1, {
    traits: ['Affinity (Divine)'],
    skills: ['Clairvoyance'],
    arts: ['Hieromancy IV'],
    weapons: [w('Staff of Light', '-', '-', '-', 'Accessory', 'When casting a Divine Spell in the Active Role, reroll 1 die')],
    stratagems: ['Nursing Aura', 'Spiritual Paragon'],
  }),
  p('hel-citadel-guard', 'Citadel Guard', HELIAN, 2, ['Sentinel', 'Soldier'], 'medium', [2, 4, 6, 2, 12, 16, 8, 12, 10, 12, 14], 18, 2, {
    traits: ['Resistance II (Enchantment, Sorcery)', 'Vigilance'],
    skills: ['Protector', 'Follow-Up'],
    arts: ['Fencing I'],
    weapons: [w('Small Bludgeon', 'T+3', '0', 'STA-1', 'Melee', 'Armor-Piercing, Stun'), SHORT_SWORD, SHIELD],
  }),
  p('hel-flameshaper', 'Flameshaper', HELIAN, 1, ['Soldier', 'Sorcerer'], 'medium', [2, 6, 1, 1, 8, 8, 8, 12, 12, 8, 12], 15, 3, {
    traits: ['Affinity (Fire)'],
    skills: ['Chain Attack'],
    arts: ['Art of Sorcery II'],
  }),
  p('hel-helrin-expatriate', 'Helrin Expatriate', HELIAN, 1, ['Artificer', 'Ranger'], 'medium', [2, 5, 6, 2, 13, 13, 8, 10, 10, 12, 16], 16, 3, {
    semiNeutral: true,
    traits: ['Affinity (Fire)', 'Resourceful II', 'Survival (Difficult, Forest)'],
    skills: ['Chain Attack', 'Impede'],
    arts: ['Art of Enchanting II'],
    weapons: [SWORD, DAGGER],
  }),
  p('hel-flameweaver-errant', 'Flameweaver Errant', HELIAN, 2, ['Artificer', 'Soldier'], 'medium', [2, 5, 3, 2, 14, 14, 8, 13, 12, 12, 16], 21, 2, {
    traits: ['Affinity (Fire)', 'Resourceful I', 'Tactician'],
    arts: ['Art of Enchanting III', 'Art of Sorcery I', 'Fencing I'],
    weapons: [w('Mastercrafted Helrin Sword', 'T', '1', 'STA', 'Melee', '+1 STK in the Active Role'), DAGGER],
    stratagems: ['Expeditionary Paragon', 'March!', 'Rally Troops', 'Striking Momentum'],
  }),
  p('hel-flameweaver-noble', 'Flameweaver Noble', HELIAN, 2, ['Enchanter', 'Mage'], 'medium', [2, 5, 3, 2, 8, 10, 8, 14, 12, 8, 12], 21, 2, {
    traits: ['Affinity (Fire)'],
    arts: ['Art of Enchanting III', 'Art of Sorcery III'],
    weapons: [SWORD, DAGGER, w('Scepter of Sorceries', '-', '-', '-', 'Accessory', 'When casting Sorceries in the Active Role, reroll 1 die')],
  }),
  p('hel-paladin', 'Paladin of the Order', HELIAN, 3, ['Mystic', 'Soldier'], 'medium', [2, 5, 6, 2, 14, 14, 10, 12, 10, 12, 15], 22, 1, {
    traits: ['Affinity (Divine)', 'Fearless'],
    arts: ['Fencing II', 'Hieromancy I'],
    weapons: [
      w('Banner Lance', 'T+2', '2', 'STA', 'Melee', 'Two-Handed'),
      SWORD,
      w('Empyrean Standard', '-', '-', '-', 'Accessory', 'Models within Awareness gain Fearless and ignore Confused and Weakened'),
    ],
    stratagems: ['Sacred Vow', 'Solemn Presence'],
  }),
  p('hel-eonian-runner', 'Eonian Runner', HELIAN, 2, ['Ranger'], 'medium', [2, 6, 3, 2, 12, 10, 14, 8, 12, 13, 12], 17, 3, {
    semiNeutral: true,
    traits: ['Tracking'],
    skills: ['Leap', 'Hit and Retreat'],
    weapons: [
      SHORT_SWORD,
      w('Javelin', 'T+2', 'T', '2', 'Ranged, Consumable', 'Stun. Quantity 4'),
      w('Light Shield', '-', '0', '-', 'Shield', '-2 to incoming Melee Attacks to the Front, +2 ARM against Ranged Attacks to the Front'),
    ],
  }),
  p('hel-anari', 'Anari, Erudite Prodigy', HELIAN, 3, ['Enchanter', 'Mage'], 'medium', [2, 5, 3, 2, 9, 9, 8, 16, 12, 8, 12], 28, 1, {
    traits: ['Affinity (Water, Fire)', 'Strategist'],
    skills: ['Foresight'],
    arts: ['Art of Enchanting III', 'Cryomancy III'],
    stratagems: ['Active Support', 'Talented Command', "Weaver's Aura"],
  }),

  // ---- Empire of Soga ----
  p('sog-clan-champion', 'Clan Champion', SOGA, 3, ['Armsmaster', 'Warrior'], 'medium', [2, 5, 5, 3, 16, 12, 12, 13, 10, 13, 17], 23, 1, {
    traits: ['Resourceful I', 'Vigilance'],
    skills: ['Dash'],
    arts: ['Fencing IV'],
    weapons: [w('Spear', 'T', '2', 'STA', 'Melee', 'Throwing'), SWORD, PIERCING_DAGGER],
    stratagems: ['Advance!', 'Back to Back', 'Brazen Assault', 'Evasion Tactics'],
  }),
  p('sog-bushi-attendant', 'Bushi Attendant', SOGA, 1, ['Warrior'], 'medium', [2, 5, 4, 2, 12, 10, 12, 10, 10, 13, 16], 13, 4, {
    weapons: [SHORT_BOW, SHORT_SWORD, DAGGER],
  }),
  p('sog-onitaoshi', 'Onitaoshi', SOGA, 2, ['Armsmaster', 'Warrior'], 'medium', [2, 6, 6, 3, 16, 10, 8, 10, 10, 13, 17], 21, 2, {
    semiNeutral: true,
    traits: ['Advantage (Size: L, H)', 'Fearless'],
    skills: ['Finishing Strike', 'Taunt'],
    arts: ['Fencing III'],
    weapons: [w('Greatsword', 'T+2', '2', 'STA-1', 'Melee', 'Bleed, Sweep I, Two-Handed'), SHORT_SWORD],
  }),
  p('sog-kitsune-spellmaiden', 'Kitsune Spellmaiden', SOGA, 1, ['Mystic'], 'medium', [2, 6, 1, 1, 8, 8, 8, 14, 14, 8, 15], 16, 1, {
    traits: ['Acute Senses', 'Affinity (Fire)', 'Vigilance'],
    skills: ['Charm I'],
    arts: ['Kitsune no Mai I', 'Purification Rites I'],
    weapons: [w('Spirit Drum', '-', '-', '-', 'Accessory', 'Allies within Awareness do not suffer Morale penalties')],
  }),
  p('sog-musha-bowmaster', 'Musha Bowmaster', SOGA, 2, ['Marksman', 'Warrior'], 'medium', [2, 5, 2, 2, 12, 12, 14, 10, 11, 13, 17], 19, 2, {
    traits: ['Duelist', 'Resourceful I'],
    arts: ['Archery III', 'Fencing I'],
    weapons: [w('Bow', 'T+3', '0-24": 0 · 25-48": -6', 'STA-1', 'Ranged', 'Two-Handed'), SWORD, DAGGER],
  }),
  p('sog-musha-blademaster', 'Musha Blademaster', SOGA, 2, ['Berserker', 'Warrior'], 'medium', [2, 5, 2, 2, 14, 12, 12, 10, 11, 13, 17], 17, 2, {
    semiNeutral: true,
    traits: ['Duelist', 'Resourceful I'],
    arts: ['Archery I', 'Fencing III'],
    weapons: [SWORD, w('Bow', 'T+3', '0-24": 0 · 25-48": -6', 'STA-1', 'Ranged', 'Two-Handed'), DAGGER],
  }),
  p('sog-scholar', 'Scholar of the True Word', SOGA, 2, ['Artificer', 'Mystic'], 'medium', [2, 5, 1, 2, 12, 12, 8, 13, 10, 13, 16], 19, 1, {
    semiNeutral: true,
    traits: ['Affinity (Earth)'],
    arts: ['Invocation III'],
    weapons: [w("Monk's Staff", 'T-2', '1', 'STA', 'Melee'), SHORT_SWORD],
  }),
  p('sog-great-guard', 'Great Guard', SOGA, 3, ['Sentinel', 'Warrior'], 'medium', [2, 4, 7, 3, 12, 16, 10, 10, 8, 13, 17], 23, 1, {
    traits: ['Vigilance', 'Watchful'],
    skills: ['Impede'],
    arts: ['Fencing IV'],
    weapons: [w('Polearm', 'T+3', '2', 'STA-1', 'Melee', 'Sweep I, Two-Handed'), SWORD, PIERCING_DAGGER],
    stratagems: ['Break the Offensive', 'Close Ranks', 'Overcome Pain', 'Rally Troops'],
  }),
  p('sog-seigen', 'Seigen, of the Keshōbarai', SOGA, 3, ['Ranger', 'Sentinel'], 'medium', [2, 5, 6, 3, 14, 16, 12, 13, 11, 13, 17], 28, 1, {
    traits: ['Fearless', 'Resistance I (Spells, Profane)', 'Vigilance'],
    skills: ['Finishing Strike', 'Impede', 'Protector'],
    arts: ['Fencing IV'],
    weapons: [
      w('Stonesplitter', 'T+2', '2', 'STA', 'Melee', 'Bleed, Sweep I, Two-Handed'),
      w('Sealing Javelins', 'T', 'T', '2', 'Ranged', 'Quantity 2. A hit model with Incorporeal or Undead suffers 2 Wounds without a Damage roll'),
    ],
    stratagems: ['Hunter Tactics', 'Stalwart Defender', 'Overcome Pain'],
  }),

  // ---- Coalition of Thenion ----
  p('the-nightshade', 'Nightshade', THENION, 3, ['Assassin', 'Rogue'], 'medium', [2, 6, 1, 1, 17, 8, 10, 13, 16, 10, 8], 22, 1, {
    skills: ['Dual Wield', 'Flicker', 'Infiltration II', 'Stealth II'],
    arts: ['Assassination IV'],
    weapons: [w('Mastercrafted Piercing Dagger', 'T-2', '0', 'STA+1', 'Melee', 'Armor-Piercing. +1 STK against a Crouched model. Quantity 2')],
    stratagems: ['Guerrilla Tactics', 'Mastery of Poisons', 'Swift Retreat', 'Exploiting Weakness', 'Unfavorable Terrain'],
  }),
  p('the-rangers-guild-hunter', 'Rangers-Guild Hunter', THENION, 2, ['Assassin', 'Ranger'], 'medium', [2, 6, 2, 1, 13, 8, 14, 10, 13, 10, 10], 19, 2, {
    traits: ['Advantage (Beast)', 'Survival (Forest, Difficult)'],
    skills: ['Climbing', 'Infiltration I', 'Stealth II', 'Tracking'],
    arts: ['Assassination I'],
    weapons: [SHORT_BOW, SHORT_SWORD, DAGGER],
  }),
  p('the-swashbuckler', 'Thenrin Swashbuckler', THENION, 1, ['Rogue', 'Warrior'], 'medium', [2, 6, 3, 2, 15, 10, 10, 11, 13, 12, 10], 16, 2, {
    semiNeutral: true,
    traits: ['Duelist'],
    skills: ['Dash', 'Dual Wield'],
    arts: ['Fencing II'],
    weapons: [w('Short Sword', 'T', '0', 'STA', 'Melee', 'Quantity 2')],
  }),
  p('the-night-temple-priestess', 'Night-Temple Priestess', THENION, 3, ['Enchanter', 'Mage'], 'large', [2, 5, 2, 1, 13, 8, 8, 14, 14, 12, 8], 21, 1, {
    traits: ['Affinity (Fire, Profane)', 'Demon', 'Inspiring I'],
    skills: ['Charm II', 'Flight', 'Foresight', 'Leap'],
    arts: ['Succubi Magic I'],
    weapons: [w('Spear', 'T', '2', 'STA', 'Melee', 'Throwing'), w('Succumbing Embrace', 'T', '0', 'STA', 'Melee, Natural', 'Spellbound (Life Leech)')],
  }),
  p('the-slayer-dragoon', 'Slayer Dragoon', THENION, 2, ['Assassin', 'Rider'], 'medium', [2, 6, 5, 2, 17, 8, 8, 10, 12, 12, 15], 17, 2, {
    semiNeutral: true,
    mount: 'lupus-rex',
    traits: ['Advantage (Large, Huge, Colossal)'],
    skills: ['Dash', 'Follow-Up'],
    arts: ['Assassination I'],
    weapons: [w("Slayer's Lance", 'T+3', '2', '1', 'Melee', 'Cleave, Knockback I, Two-Handed, Unwieldy'), SHORT_SWORD],
  }),
  p('the-bladebrethren-elite', 'Bladebrethren Elite', THENION, 3, ['Rogue', 'Warrior'], 'medium', [2, 6, 3, 2, 16, 13, 11, 11, 14, 12, 12], 23, 1, {
    traits: ['Duelist', 'Resourceful I'],
    skills: ['Dash', 'Dual Wield', 'Follow-Up', 'Stealth I'],
    arts: ['Fencing III'],
    weapons: [
      w('Mastercrafted Sword', 'T', '1', 'STA', 'Melee', 'Once per Activation or Reaction, reroll one Attack roll'),
      w('Parrying Dagger', 'T-2', '0', 'STA', 'Melee', "Target's Melee Attacks suffer -2. +1 STK against a Crouched model"),
    ],
    stratagems: ['Dishearten', 'Guerrilla Tactics', 'Vicious Opportunism'],
  }),
  p('the-hired-blade', 'Hired Blade', THENION, 1, ['Assassin', 'Rogue'], 'medium', [2, 6, 1, 1, 15, 8, 10, 10, 14, 10, 8], 17, 2, {
    semiNeutral: true,
    skills: ['Dual Wield', 'Infiltration II', 'Stealth II'],
    arts: ['Assassination I'],
    weapons: [SHORT_SWORD, w('Dagger', 'T-3', '0', 'STA', 'Melee', 'Throwing. +1 STK against a Crouched model. Quantity 2')],
  }),
  p('the-tharos', 'Tharos, One-Eyed Wolf', THENION, 3, ['Alchemist', 'Rogue'], 'medium', [2, 6, 3, 2, 13, 10, 14, 13, 13, 12, 12], 28, 1, {
    traits: ['Clairvoyance', 'Survival (Difficult, Hazy)'],
    skills: ['Climbing', 'Snipe', 'Stealth II', 'Tactician'],
    arts: ['Assassination III'],
    weapons: [
      w('Crossbow', '13', '0-24": +3 · 25-48": -3', '1', 'Ranged', 'Two-Handed'),
      SHORT_SWORD,
      w('Grapeshot', '13', 'T, AoE Circular S', '1', 'Ranged, Consumable', 'Targetless'),
      w('Firecracker', '0', 'T, AoE Circular S', '1', 'Ranged, Consumable', 'Stagger, Targetless'),
    ],
    stratagems: ['Mastery of Poisons', 'Guerrilla Tactics', 'Piercing Perception'],
  }),

  // ---- Sand Kingdoms ----
  p('san-vizier', 'Vizier of Conjurations', SAND, 3, ['Mage', 'Summoner'], 'medium', [2, 5, 0, 1, 8, 8, 8, 16, 10, 8, 8], 22, 1, {
    traits: ['Affinity (Elder, Earth)', 'Resourceful II'],
    arts: ['Art of Conjuration IV', 'Wizardry I'],
    weapons: [w('Staff of Conjuration', '-', '-', '-', 'Accessory', 'Summoned creatures can be placed anywhere within Awareness')],
    stratagems: ['Refined Conjuration', 'Temporary Bind'],
  }),
  p('san-academy-expeditioner', 'Academy Expeditioner', SAND, 2, ['Mage', 'Sorcerer'], 'medium', [2, 5, 4, 2, 10, 8, 8, 14, 10, 10, 12], 18, 2, {
    traits: ['Affinity (Elder)', 'Survival (Scorching)'],
    arts: ['Art of Sorcery III'],
    weapons: [DAGGER],
  }),
  p('san-taskmage-explorer', 'Taskmage Explorer', SAND, 2, ['Mage', 'Wizard'], 'medium', [2, 5, 0, 1, 8, 8, 8, 14, 12, 10, 12], 19, 2, {
    semiNeutral: true,
    traits: ['Affinity (Elder)', 'Survival (Scorching)'],
    skills: ['Resourceful I', 'Stealth I', 'Tracking'],
    arts: ['Wizardry III'],
    weapons: [DAGGER],
  }),
  p('san-faris-outrider', 'Faris Outrider', SAND, 2, ['Artificer', 'Rogue'], 'medium', [2, 5, 1, 2, 14, 11, 8, 13, 12, 13, 12], 18, 2, {
    traits: ['Affinity (Elder)', 'Survival (Scorching)'],
    skills: ['Follow-Up', 'Stealth I', 'Taunt'],
    arts: ['Art of Enchanting III'],
    weapons: [SWORD, w('Arcane Lantern', '-', '-', '-', 'Accessory', 'Wearer gains Vigilance. Shrouded and Intrigues within Awareness are canceled'), DAGGER],
  }),
  p('san-spelldancer-voidcaster', 'Spelldancer Voidcaster', SAND, 2, ['Artificer', 'Wizard'], 'medium', [2, 6, 0, 1, 8, 8, 8, 12, 14, 8, 12], 17, 2, {
    traits: ['Affinity (Elder)', 'Survival (Scorching)'],
    skills: ['Hit and Retreat'],
    arts: ['Armamancy III', 'Art of Enchanting I'],
  }),
  p('san-spelldancer-aeroturge', 'Spelldancer Aeroturge', SAND, 2, ['Enchanter', 'Mage'], 'medium', [2, 6, 0, 1, 8, 8, 8, 12, 14, 8, 12], 15, 2, {
    traits: ['Affinity (Elder, Air)', 'Survival (Scorching)'],
    skills: ['Charm I'],
    arts: ['Art of Enchanting III', 'Electromancy I'],
  }),
  p('san-nara', "Na'ra, Veil Watcher", SAND, 3, ['Artificer'], 'medium', [2, 7, 0, 2, 15, 12, 8, 13, 13, 12, 14], 28, 1, {
    traits: ['Acute Senses', 'Affinity (Profane)', 'Survival (Scorching, Dark)'],
    skills: ['Climbing', 'Dash', 'Hit and Retreat', 'Leap', 'Stealth I'],
    arts: ['Necromancy III'],
    weapons: [w('Chimera Claws', 'T', '0', 'STA', 'Melee, Natural', '+1 STK when attacking a target without AP')],
    stratagems: ['Adrenaline Rush', 'Ironhide', 'Reinforced Claws'],
  }),

  // ---- Goblin Wartribes ----
  p('gob-chanra', 'Chanra, Goblin Shaman', GOBLIN, 3, ['Mystic', 'Ranger'], 'medium', [2, 5, 0, 3, 12, 10, 10, 13, 12, 12, 15], 28, 1, {
    traits: ['Affinity (Any)', 'Inspiring I', 'Survival (Difficult)'],
    skills: ['Hit and Retreat', 'Infiltration I'],
    arts: ['Shamanism III'],
    weapons: [w('Staff of Chaos', '-', '1', '-', 'Accessory', 'Reroll 1 die when attacking with a Spell in the Active Role. Enemies within its Reach can become Engaged')],
    stratagems: ['Call of Bravery', 'Earthspeaker', 'Hexcaller'],
  }),
  p('gob-shaman', 'Goblin Shaman', GOBLIN, 3, ['Mystic', 'Ranger'], 'medium', [2, 5, 0, 2, 12, 10, 10, 12, 12, 12, 14], 24, 1, {
    traits: ['Affinity (Any)', 'Inspiring I', 'Survival (Difficult)'],
    skills: ['Hit and Retreat', 'Infiltration I'],
    arts: ['Shamanism II'],
    weapons: [w('Staff of Chaos', '-', '1', '-', 'Accessory', 'Reroll 1 die when attacking with a Spell in the Active Role. Enemies within its Reach can become Engaged')],
    stratagems: ['Earthspeaker', 'Hexcaller', 'Unwavering Presence'],
  }),
  p('gob-brawlers', 'Goblin Brawlers', GOBLIN, 1, ['Soldier'], 'small', [2, 5, 3, 1, 10, 10, 8, 6, 10, 12, 8], 8, null, {
    traits: ['Survival (Difficult)'],
    skills: ['Climbing', 'Infiltration I'],
    weapons: [w('Looted Weapons', 'T', '0', 'STA', 'Melee'), BITE],
  }),
  p('gob-skirmishers', 'Goblin Skirmishers', GOBLIN, 1, ['Soldier'], 'small', [2, 5, 1, 1, 8, 8, 10, 6, 10, 10, 8], 9, null, {
    traits: ['Survival (Difficult)'],
    skills: ['Climbing', 'Infiltration I'],
    weapons: [w('Missile Weapons', 'T', '0-20": 0', 'STA', 'Ranged'), BITE],
  }),
  p('gob-warchief', 'Goblin Warchief', GOBLIN, 2, ['Soldier'], 'large', [2, 5, 3, 5, 14, 10, 8, 8, 8, 14, 12], 22, 2, {
    traits: ['Advantage (Medium)', 'Fearless', 'Survival (Difficult)'],
    skills: ['Finishing Strike', 'Infiltration I'],
    weapons: [w('Great Axe', 'T+3', '1', 'STA-1', 'Melee', 'Cleave, Sweep I, Two-Handed'), BITE],
  }),
  p('gob-troll-prowler', 'Troll Prowler', GOBLIN, 3, ['Creature'], 'huge', [2, 5, 3, 6, 16, 8, 10, 6, 8, 15, 10], 24, 2, {
    traits: ['Survival (Aquatic, Difficult, Toxic)', 'Resistance II (Poison)'],
    skills: ['Infiltration I', 'Regeneration I'],
    weapons: [
      w('Rending Claws', 'T', '1', '2', 'Melee, Natural', 'Cleave'),
      w('Acid Vomit', '0', 'AoE Spray L', '1', 'Ranged, Natural', 'Unstoppable. On hit the target rolls T-3 or becomes Weakened'),
      w('Venomous Bite', 'T', '0', '1', 'Melee, Natural', 'Poison II'),
    ],
  }),

  // ---- Oni Clans ----
  p('oni-marauder', 'Oni Marauder', ONI, 3, ['Creature'], 'huge', [2, 5, 3, 4, 14, 10, 8, 8, 8, 15, 14], 25, 2, {
    traits: ['Affinity (Profane)', 'Demon', 'Menacing I', 'Survival (Difficult)'],
    skills: ['Leap'],
    weapons: [w('War Club', 'T+4', '2', '2', 'Melee', 'Armor-Piercing, Stagger, Sweep I')],
  }),
  p('oni-red-rasetsu', 'Red Rasetsu', ONI, 4, ['Berserker'], 'medium', [3, 6, 3, 6, 16, 13, 13, 10, 13, 15, 16], 35, 1, {
    traits: ['Affinity (Profane)', 'Demon', 'Duelist', 'Fearless', 'Menacing I', 'Survival (Difficult)'],
    skills: ['Dash', 'Leap'],
    arts: ['Berserk III'],
    weapons: [w('Desecrated Relic Blade', 'T+4', '2', 'STA', 'Melee', 'Cleave, Sweep I, Two-Handed')],
    stratagems: ['Mark of Red', 'Devour the Enemy', 'Raid Expert'],
  }),
  p('oni-blue-rasetsu', 'Blue Rasetsu', ONI, 4, ['Sentinel'], 'medium', [3, 6, 3, 4, 13, 16, 13, 15, 13, 15, 16], 37, 1, {
    traits: ['Affinity (Profane)', 'Demon', 'Menacing I', 'Survival (Difficult)', 'Vigilance'],
    skills: ['Charm II'],
    arts: ['Berserk II'],
    weapons: [
      w('War Club', 'T+4', '2', '2', 'Melee', 'Armor-Piercing, Stagger'),
      w('Cursed Grab', 'T', '0', '1', 'Melee, Natural', 'Advantage (Medium), Armor-Piercing, Burn (3)'),
    ],
    stratagems: ['Recall the Souls', 'Painless Death', 'Mind Invasion', 'Coordinated Assault'],
  }),
  p('oni-red-yaksha', 'Red Yaksha', ONI, 3, ['Creature'], 'large', [3, 5, 3, 5, 16, 12, 8, 12, 13, 15, 14], 30, 2, {
    traits: ['Affinity (Profane)', 'Demon', 'Menacing I', 'Survival (Difficult)'],
    skills: ['Backstab', 'Dash', 'Hit and Retreat', 'Leap', 'Stealth I'],
    arts: ['Berserk II'],
    weapons: [w('War Club', 'T+4', '2', '2', 'Melee', 'Armor-Piercing, Stagger')],
  }),
  p('oni-blue-yaksha', 'Blue Yaksha', ONI, 3, ['Creature'], 'large', [3, 5, 3, 4, 15, 13, 10, 12, 14, 15, 14], 30, 2, {
    traits: ['Affinity (Profane)', 'Demon', 'Menacing I', 'Survival (Difficult)'],
    skills: ['Flicker', 'Hit and Retreat', 'Stealth I'],
    weapons: [w('Bisento', 'T+3', '2', '3', 'Melee', 'Bleed, Sweep I')],
  }),
  p('oni-chiyohime', 'Chiyohime', ONI, 4, ['Mage', 'Sorcerer'], 'medium', [3, 5, 3, 4, 12, 12, 10, 17, 13, 15, 16], 45, 1, {
    traits: ['Affinity (Profane)', 'Demon', 'Menacing I', 'Resistance I (Spell)', 'Survival (Difficult)'],
    skills: ['Chain Attack', 'Charm I'],
    arts: ['Necromancy V'],
    weapons: [w('Deathweaving Fan', '-', '-', '-', 'Accessory', 'Once per Activation, reroll a failed Profane Spell roll')],
    stratagems: ['Eternal Vigil', 'Final Gambit', 'Profane Mend', 'Soul Harvest'],
  }),
  p('oni-pariah', 'Oni Pariah', ONI, 4, ['Creature', 'Berserker'], 'gigantic', [3, 5, 4, 8, 16, 10, 8, 8, 8, 17, 18], 40, 1, {
    traits: ['Affinity (Profane)', 'Beast', 'Demon', 'Survival (Difficult)', 'Unstoppable'],
    skills: ['Regeneration II'],
    weapons: [
      w('Smash & Thrash', 'T', '2', '2', 'Melee', 'Sweep I, Advantage (Medium, Large)'),
      w('Crushing Maw', 'T', '0', '1', 'Melee, Natural', 'Cleave, Crippling'),
      w('Quaking Smash', 'T', '2', '1', 'Melee, Natural', 'Knockback I, Knockdown, Sweep II'),
    ],
  }),

  // ---- Undead (allies of the Oni Clans) ----
  p('und-vengeful-spirit', 'Vengeful Spirit', UNDEAD, 1, ['Creature'], 'medium', [2, 5, 0, 1, 10, 8, 8, 6, 8, 10, 20], 10, null, {
    traits: ['Elemental Essence (Profane)', 'Incorporeal', 'Undead I'],
    skills: ['Infiltration I', 'Stealth I'],
    weapons: [w('Spectral Weapon', 'T', '0', '1', 'Melee', 'Ignore Armor')],
  }),
  p('und-bonewalker', 'Bonewalker', UNDEAD, 1, ['Creature'], 'medium', [2, 5, 2, 1, 10, 10, 8, 6, 8, 10, 20], 10, null, {
    traits: ['Elemental Essence (Profane)', 'Undead I'],
    weapons: [w('Corroded Weapon', '10', '0', '2', 'Melee', 'Poison I'), SHIELD],
  }),
  p('und-forgotten-hero', 'Forgotten Hero', UNDEAD, 2, ['Warrior', 'Marksman'], 'medium', [2, 5, 6, 2, 14, 14, 14, 8, 8, 13, 20], 20, 2, {
    traits: ['Elemental Essence (Profane)', 'Undead I', 'Vigilance'],
    arts: ['Archery I', 'Fencing I'],
    weapons: [
      w('Corroded War Bow', 'T', '0-20": 0 · 21-40": -6', '1', 'Ranged', 'Stun, Two-Handed, Poison I'),
      w('Corroded Sword', 'T-2', '0', '2', 'Melee', 'Poison I'),
      w('Corroded Piercing Dagger', 'T-2', '0', '2', 'Melee', 'Armor-Piercing, Poison I. +1 STK against a Crouched model'),
    ],
  }),

  // ---- Summoned creatures (Conjuration Spells; Creatures card file) ----
  p('sum-gargoyle', 'Gargoyle', SUMMONED, 1, ['Creature'], 'small', [2, 5, 5, 1, 12, 8, 8, 8, 8, 12, 20], 0, null, {
    summoned: true,
    traits: ['Construct', 'Survival (Scorching)'],
    skills: ['Climbing', 'Leap'],
    weapons: [w("Gargoyle's Claws", 'T', '0', 'STA', 'Melee, Natural', 'First time each turn this model deals a Wound, it gains an AP and the wounded model loses an AP, if it has any')],
  }),
  p('sum-golem', 'Golem', SUMMONED, 2, ['Creature'], 'huge', [2, 3, 8, 3, 10, 13, 8, 8, 6, 15, 20], 0, null, {
    summoned: true,
    traits: ['Construct', 'Survival (Scorching)'],
    skills: ['Protector'],
    weapons: [w('Fists of Stone', 'T', '0', 'STA', 'Melee, Natural', 'Stagger')],
  }),
  p('sum-earth-elemental', 'Earth Elemental', SUMMONED, 3, ['Creature'], 'gigantic', [2, 4, 10, 4, 12, 14, 10, 8, 6, 16, 20], 0, null, {
    summoned: true,
    traits: ['Affinity (Earth)', 'Elemental', 'Elemental Essence (Earth)', 'Survival (Forest, Scorching, Swamp)', 'Watchful'],
    skills: ['Regeneration I'],
    arts: ['Rooting Embrace'],
    weapons: [
      w('Earthen Fists', 'T', '1', '2', 'Melee, Natural', 'Knockdown, Stagger'),
      w('Hurl', 'T', 'T, AoE: Circular S', '1', 'Ranged, Natural', 'Stagger. +4 ACC if the target is within half RCH'),
    ],
  }),
  p('sum-colossus', 'Colossus', SUMMONED, 4, ['Creature'], 'colossal', [3, 4, 10, 6, 14, 14, 8, 8, 6, 17, 20], 0, null, {
    summoned: true,
    traits: ['Construct', 'Intimidating', 'Survival (Scorching)', 'Trample', 'Unstoppable'],
    skills: ['Taunt'],
    weapons: [w('Hack & Thrash', 'T', '1', '2', 'Melee, Natural', 'Cleave, Knockdown, Sweep I')],
  }),
  p('sum-water-elemental', 'Water Elemental', SUMMONED, 3, ['Creature'], 'gigantic', [2, 4, 2, 5, 14, 14, 14, 8, 8, 14, 20], 0, null, {
    summoned: true,
    traits: ['Affinity (Water)', 'Elemental', 'Elemental Essence (Water)', 'Everflowing', 'Resistance I (non-Spell)', 'Resistance II (Burn)', 'Survival (Aquatic)', 'Vigilance'],
    skills: ['Regeneration I'],
    arts: ['Wellspring'],
    weapons: [
      w('Water Tentacle', '10', 'AoE: Spray S', '2', 'Ranged, Natural', 'On hit, pull the enemy 3" closer'),
      w('Ice Pick', '18', '1', '1', 'Melee, Natural', '+3 OFF, Stagger. Once per Attack, reroll the Attack roll'),
      w('Tidal Wave', '10', 'AoE: Spray L', '1', 'Ranged, Natural', 'Knockdown'),
    ],
  }),

  // ---- Neutral ----
  p('neu-amazon-gladiatrix', 'Amazon Gladiatrix', NEUTRAL, 4, ['Berserker'], 'medium', [3, 5, 2, 3, 16, 12, 8, 8, 12, 14, 16], 32, 2, {
    traits: ['Brute', 'Duelist', 'Fearless', 'Survival (Scorching)'],
    skills: ['Finishing Strike'],
    arts: ['Berserk III'],
    weapons: [w('Heavy Polearm', 'T+3', '2', '1', 'Melee', 'Cleave, Two-Handed')],
  }),
  p('neu-tomoe', 'Tomoe, Endless Rain', NEUTRAL, 3, ['Mage', 'Mystic', 'Sorcerer'], 'medium', [2, 6, 1, 2, 10, 10, 12, 10, 12, 10, 14], 28, 1, {
    traits: ['Affinity (Water, Air)'],
    arts: ['Everlasting Rain Invocations III'],
  }),
  p('neu-renegade-rasetsu', 'Renegade Rasetsu', NEUTRAL, 4, ['Berserker'], 'medium', [2, 6, 3, 4, 16, 13, 8, 10, 13, 15, 16], 27, 1, {
    traits: ['Affinity (Profane)', 'Demon', 'Duelist', 'Fearless', 'Survival (Difficult)'],
    skills: ['Dash', 'Leap'],
    arts: ['Berserk III'],
    weapons: [w('Relic Weapon', 'T+4', '2', 'STA', 'Melee', 'Cleave, Two-Handed')],
  }),
  p('neu-kogetsu', 'Kogetsu, Cursed Monk', NEUTRAL, 3, ['Warrior', 'Sentinel'], 'large', [2, 5, 3, 3, 14, 16, 10, 10, 10, 13, 14], 30, 1, {
    traits: ['Advantage (Demon)', 'Vigilance'],
    skills: ['Impede', 'Leap'],
    arts: ['Fencing II'],
    weapons: [
      w('Naginata', 'T+3', '2', 'STA-1', 'Melee', 'Bleed, Sweep I'),
      w('Tengu Screech', '8', '4', '1', 'Melee, Natural', 'Ignore Armor, Mindgame, Stagger, Sweep II. Cannot cause Engaged'),
    ],
  }),
  p('neu-guildsworn-knight', 'Guildsworn Knight', NEUTRAL, 3, ['Warrior', 'Armsmaster'], 'medium', [2, 5, 7, 4, 15, 15, 12, 13, 8, 14, 17], 30, 1, {
    traits: ['Fearless', 'Resistance I (Bleed, Knockback)'],
    skills: ['Finishing Strike', 'Follow-Up', 'Protector'],
    arts: ['Fencing IV'],
    weapons: [
      w('Poleaxe', 'T+3', '1', '1', 'Melee', 'Armor-Piercing, Cleave, Two-Handed'),
      SWORD,
      w('Glyphscribe Dagger', 'T-3', '0', 'STA', 'Melee', '+1 STK against a Crouched model. Thrown, it returns to the Inventory'),
      SHIELD,
    ],
    stratagems: ['Defensive Formation', 'Unconventional Tactics'],
  }),
];

const BY_ID = new Map(PROFILES.map((x) => [x.id, x]));
export const profileById = (id: string | null | undefined): Profile | undefined => (id ? BY_ID.get(id) : undefined);

/** Stand-in profile for figures that have none (tables made before profiles existed). */
export const GENERIC: Profile = p('generic', 'Figure', NEUTRAL, 1, [], 'medium', [2, 5, 0, 2, 10, 10, 10, 10, 10, 10, 10], 0, null);

const CASTERS = ['Mage', 'Sorcerer', 'Mystic', 'Enchanter', 'Wizard', 'Summoner', 'Vitalist', 'Druid'];

/** Which placeholder figure stands in for a profile. */
export function figureKind(profile: Profile): FigureKind {
  if (profile.classes.includes('Creature')) return 'beast';
  if (profile.classes.some((c) => CASTERS.includes(c))) return 'mage';
  if (profile.weapons[0]?.type.startsWith('Ranged')) return 'archer';
  if (profile.classes.some((c) => c === 'Rogue' || c === 'Assassin')) return 'rogue';
  return 'warrior';
}
