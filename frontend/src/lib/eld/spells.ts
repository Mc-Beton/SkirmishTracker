import type { Profile, Weapon } from './profiles.ts';

// The Spellbook (February 2026 errata). A model knows the Spells of its Spellcrafts up to the level on its
// card, in the Elements it has an Affinity for. Spells that are an Attack on one target are turned into
// "weapons" the table can resolve; the others are listed on the card until their kind of casting is built.

export type SpellKind = 'Sorcery' | 'Enchantment' | 'Healing' | 'Transmutation' | 'Conjuration';

export interface Spell {
  /** The Spellcraft as written on the cards ("Art of Sorcery", "Wizardry"...). */
  school: string;
  /** Fire, Water, Earth, Air, Elder, Divine, Profane, or Any. */
  element: string;
  /** I = 1 ... V = 5. */
  level: number;
  name: string;
  kind: SpellKind;
  /** What it does, in a few words. */
  text: string;
  mana?: number;
  /** Present when the table can resolve the Spell as an Attack on one target. */
  attack?: { pw: string; rch: string; stk: string; mode: 'Ranged' | 'Melee' | 'Ranged/Melee'; effect?: string };
  /** Present when the table can cast it on models with the Cast Action (Enchantments, Healing). */
  cast?: Cast;
}

/** Reach ("16", "0", "Casting Aura"), how many targets ("1", "2", "STA") and what the table applies itself. */
export interface Cast {
  rch: string;
  stk: string;
  fx?: SpellFx;
}

export interface SpellFx {
  /** While enchanted: attribute changes. */
  stats?: Partial<Record<'spd' | 'arm' | 'off' | 'def' | 't', number>>;
  /** Arcane Shield: +4 ARM, but not above this; Critical Hits do not ignore ARM. */
  armCap?: number;
  /** While enchanted: Traits on all its Attacks / on its Melee Attacks only. */
  traits?: string[];
  meleeTraits?: string[];
  meleePw?: number;
  meleeReach?: number;
  /** While enchanted: modifier on Attacks against it. */
  foeHit?: number;
  /** On casting: HP regained ('full' or a number), States removed, Enchantments removed, AP regained, a State given. */
  heal?: number | 'full';
  cure?: string[];
  /** Heals 1 HP if the target is wounded, otherwise removes the `cure` States. */
  healOrCure?: boolean;
  dispel?: boolean;
  ap?: number;
  give?: string;
}

const sp = (school: string, element: string, level: number, name: string, kind: SpellKind, text: string, how?: Spell['attack'] | Cast, mana?: number): Spell => ({
  school, element, level, name, kind, text, ...(how && 'pw' in how ? { attack: how } : how ? { cast: how } : {}), ...(mana ? { mana } : {}),
});
const on = (rch: string, stk = '1', fx?: SpellFx): Cast => ({ rch, stk, ...(fx ? { fx } : {}) });
const AILMENTS = ['Weakened', 'Bleeding', 'Crippled', 'Poisoned'];
const atk = (pw: string, rch: string, stk: string, mode: 'Ranged' | 'Melee' | 'Ranged/Melee', effect?: string): NonNullable<Spell['attack']> => ({ pw, rch, stk, mode, ...(effect ? { effect } : {}) });

export const SPELLS: Spell[] = [
  // ---- Armamancy ----
  sp('Armamancy', 'Elder', 1, 'Ethereal Blades', 'Sorcery', 'PW INT−3, Strike 5 (3 in the Reactive Role). By successful Attack rolls: 2 – PW +6; 3 – Armor-Piercing; 4 – Stagger.', atk('INT-3', '0', '5', 'Melee', 'Strike 3 in the Reactive Role. Combo by successful rolls')),
  sp('Armamancy', 'Elder', 2, 'Void Lance', 'Sorcery', 'PW INT+2, Reach 6. Armor-Piercing. (Models in the line are not hit automatically.)', atk('INT+2', '6', '1', 'Melee', 'Armor-Piercing')),
  sp('Armamancy', 'Elder', 3, 'Spectral Greatsword', 'Sorcery', 'PW INT+2, Reach 2. Armor-Piercing, Stagger. (Sweep I by hand.)', atk('INT+2', '2', '1', 'Melee', 'Armor-Piercing, Stagger')),

  // ---- Art of Conjuration ----
  sp('Art of Conjuration', 'Earth', 1, 'Summon Gargoyle', 'Conjuration', 'Ritual. Summons a Gargoyle.', undefined, 1),
  sp('Art of Conjuration', 'Earth', 2, 'Summon Golem', 'Conjuration', 'Ritual. Summons a Golem.', undefined, 2),
  sp('Art of Conjuration', 'Earth', 3, 'Summon Earth Elemental', 'Conjuration', 'Ritual. Summons an Earth Elemental.', undefined, 3),
  sp('Art of Conjuration', 'Earth', 4, 'Summon Colossus', 'Conjuration', 'Ritual. Summons a Colossus.', undefined, 4),
  sp('Art of Conjuration', 'Elder', 1, 'Summon Imp', 'Conjuration', 'Ritual. Summons an Imp.', undefined, 1),
  sp('Art of Conjuration', 'Water', 3, 'Summon Water Elemental', 'Conjuration', 'Ritual. Summons a Water Elemental.', undefined, 3),

  // ---- Cryomancy ----
  sp('Cryomancy', 'Water', 1, 'Cure', 'Healing', 'Reach 16. Removes Bleeding, Crippled, Poisoned and Weakened.', on('16', '1', { cure: AILMENTS })),
  sp('Cryomancy', 'Water', 1, 'Ice Spikes', 'Sorcery', "PW 11, Reach 16, Strike 3. Slowed on Hit until the caster's next Strategic Phase.", atk('11', '16', '3', 'Ranged', 'Slowing')),
  sp('Cryomancy', 'Water', 2, 'Frost', 'Sorcery', "PW 11, Spray S. Immobilized on Hit until the caster's next Strategic Phase.", atk('11', 'AoE: Spray S', '1', 'Ranged', 'Immobilize')),
  sp('Cryomancy', 'Water', 2, 'Water Lash', 'Sorcery', 'PW 8, Reach 16, Strike STA. Knockback (2).', atk('8', '16', 'STA', 'Ranged/Melee', 'Knockback (2)')),
  sp('Cryomancy', 'Water', 3, 'Deep Freeze', 'Enchantment', 'Reach 10. The model has −3 ARM and may only Idle and declare Nothing; Attacks against it have Advantage. T roll to end it.', on('10', '1', { stats: { arm: -3 } }), 1),
  sp('Cryomancy', 'Water', 3, 'Glacier Circle', 'Sorcery', 'PW 13, Casting Aura, Circular L, Targetless. Slowed on Hit. (The area becoming Difficult and Dangerous: by hand.)', atk('13', 'Casting Aura, AoE: Circular L', '1', 'Ranged', 'Slowing, Targetless')),

  // ---- Electromancy ----
  sp('Electromancy', 'Air', 1, 'Electrification', 'Sorcery', 'PW INT, Reach 0. Ignore Armor, Stun. (Ricochet (4) by hand.)', atk('INT', '0', '1', 'Ranged/Melee', 'Ignore Armor, Stun')),

  // ---- Art of Enchanting ----
  sp('Art of Enchanting', 'Fire', 1, 'Burning Touch', 'Enchantment', 'Reach 16. Target gains Burn (1), Sweep I.', on('16', '1', { traits: ['Burn 1'] })),
  sp('Art of Enchanting', 'Fire', 2, 'Melting Touch', 'Enchantment', 'Reach 16. Target gains Burn, Ignore Armor.', on('16', '1', { traits: ['Burn 1', 'Ignore Armor'] })),
  sp('Art of Enchanting', 'Fire', 3, 'Flameskin', 'Enchantment', 'Reach 16. An attacker within 1" suffers a PW 10 Hit with Burn (1).', on('16')),
  sp('Art of Enchanting', 'Water', 1, 'Cutting Chill', 'Enchantment', 'Reach 16. Melee Attacks +2 PW and Immobilize on Hit.', on('16', '1', { meleePw: 2, meleeTraits: ['Immobilize'] })),
  sp('Art of Enchanting', 'Water', 2, 'Mirror Bubble', 'Enchantment', 'Reach 10. A Melee attacker that hits rolls AG or suffers a Hit with its own PW.', on('10')),
  sp('Art of Enchanting', 'Water', 3, 'Ice Shield', 'Enchantment', 'Reach 16. Damage rolls must first beat ARM 5, then roll at PW −3.', on('16')),
  sp('Art of Enchanting', 'Elder', 1, 'Arcane Shield', 'Enchantment', 'Reach 16. +4 ARM (up to 6); Critical Hits do not ignore ARM.', on('16', '1', { armCap: 6 })),
  sp('Art of Enchanting', 'Elder', 2, 'Spectral Blade', 'Enchantment', 'Reach 16. Target gains Ignore Armor and Stagger.', on('16', '1', { traits: ['Ignore Armor', 'Stagger'] })),
  sp('Art of Enchanting', 'Elder', 3, 'Hasten', 'Enchantment', 'Reach 16. In your Strategic Phase the model may make a Normal Movement.', on('16')),
  sp('Art of Enchanting', 'Air', 1, 'Formless Edge', 'Enchantment', 'Reach 16. Melee Attacks gain +2 Reach and Knockback (2).', on('16', '1', { meleeReach: 2, meleeTraits: ['Knockback 2'] })),
  sp('Art of Enchanting', 'Air', 2, 'Featherlight', 'Enchantment', 'Reach 16. +2 SPD.', on('16', '1', { stats: { spd: 2 } })),
  sp('Art of Enchanting', 'Air', 3, 'Protective Currents', 'Enchantment', 'Casting Aura. Attacks at the model suffer −4; when hit, enemies within 3" are knocked back.', on('Casting Aura', 'STA', { foeHit: -4 })),

  // ---- Everlasting Rain Invocations ----
  sp('Everlasting Rain Invocations', 'Air', 1, 'Electrification', 'Sorcery', 'PW INT, Reach 0, Strike 2. Ignore Armor, Stun. (Ricochet (4) by hand.)', atk('INT', '0', '2', 'Ranged/Melee', 'Ignore Armor, Stun')),
  sp('Everlasting Rain Invocations', 'Air', 2, 'Lightning Bolt', 'Sorcery', 'PW INT, Reach 16, Strike 2. Ignore Armor, Stun.', atk('INT', '16', '2', 'Ranged', 'Ignore Armor, Stun')),
  sp('Everlasting Rain Invocations', 'Air', 3, 'Chain Lightning', 'Sorcery', 'PW INT, Reach 16. Ignore Armor, Stun. (Ricochet (4) by hand.)', atk('INT', '16', '1', 'Ranged', 'Ignore Armor, Stun')),
  sp('Everlasting Rain Invocations', 'Air', 4, 'Thunderstorm', 'Sorcery', 'PW INT, Reach 16, Circular L, Strike 2. Cleave, Ignore Armor, Stagger, Stun.', atk('INT', '16, AoE: Circular L', '2', 'Ranged', 'Mana Cost: 2. Cleave, Ignore Armor, Stagger, Stun'), 2),
  sp('Everlasting Rain Invocations', 'Water', 1, 'Blessed Rain', 'Transmutation', 'Circular L around the caster: Shallow Aquatic for enemies, Light Cover for allies.'),
  sp('Everlasting Rain Invocations', 'Water', 2, 'Protective Bubble', 'Enchantment', 'Reach 16. Negates 1 Hit, then ends.', on('16')),
  sp('Everlasting Rain Invocations', 'Water', 3, 'Downpour', 'Transmutation', 'Reach 16, Circular L. The area becomes Shallow Aquatic.', undefined, 1),
  sp('Everlasting Rain Invocations', 'Water', 4, 'Flash Flood', 'Sorcery', 'PW 10, Spray L, Strike 3. Knockback (1), Knockdown.', atk('10', 'AoE: Spray L', '3', 'Ranged', 'Knockback (1), Knockdown')),

  // ---- Hieromancy ----
  sp('Hieromancy', 'Divine', 1, 'Purgation', 'Healing', 'Reach 16. Removes Weakened, Poisoned and Enchantments. Wounds Undead and Profane models.', on('16', '1', { cure: ['Weakened', 'Poisoned'], dispel: true })),
  sp('Hieromancy', 'Divine', 1, 'Curative Touch', 'Healing', 'Reach 0. The target regains all HP; removes Weakened, Bleeding, Crippled, Poisoned.', on('0', 'STA', { heal: 'full', cure: AILMENTS })),
  sp('Hieromancy', 'Divine', 2, 'Protective Barrier', 'Enchantment', 'Reach 16. Negates 1 Hit, then ends.', on('16', 'STA')),
  sp('Hieromancy', 'Divine', 2, 'Blinding Light', 'Sorcery', 'Reach 16, Circular S, Targetless, Strike STA. Blinded on Hit until the end of the turn.', atk('0', '16, AoE: Circular S', 'STA', 'Ranged', 'Blinding, No Damage, Targetless')),
  sp('Hieromancy', 'Divine', 3, 'Warding Barrier', 'Enchantment', 'Ritual, Casting Aura. Ranged Spell Attacks into the aura are negated.'),
  sp('Hieromancy', 'Divine', 3, 'Smite', 'Sorcery', 'PW M, Casting Aura, Circular L, Targetless. Armor-Piercing, Burn (1).', atk('M', 'Casting Aura, AoE: Circular L', '1', 'Ranged', 'Armor-Piercing, Burn (1), Targetless')),
  sp('Hieromancy', 'Divine', 4, 'Curative Miracle', 'Healing', 'Reach 16. The target regains all HP; removes Weakened, Bleeding, Crippled, Poisoned.', on('16', '1', { heal: 'full', cure: AILMENTS })),
  sp('Hieromancy', 'Divine', 4, 'Anointment', 'Enchantment', 'Reach 16. The model cannot be targeted by enemy Enchantments.', on('16')),

  // ---- Shamanism (Incantation) ----
  sp('Shamanism', 'Any', 1, 'Primal Claw', 'Sorcery', 'PW 13, Reach 1, Strike 3.', atk('13', '1', '3', 'Melee')),
  sp('Shamanism', 'Fire', 1, 'Fire Breath', 'Sorcery', 'PW 12, Spray S, Strike 2. Burn (1).', atk('12', 'AoE: Spray S', '2', 'Ranged', 'Burn (1)')),
  sp('Shamanism', 'Earth', 2, 'Fortified Recovery', 'Healing', 'Reach 16. Remove 1 State, or the target regains 1 HP, or another model regains 1 AP.', on('16', '1', { healOrCure: true, cure: ['Weakened', 'Bleeding', 'Crippled', 'Poisoned', 'Slowed', 'Blinded', 'Immobilized', 'Confused', 'Panicked', 'Fatigued'] })),
  sp('Shamanism', 'Divine', 2, 'Misfortune', 'Enchantment', 'Reach 16. The model must reroll any successful roll once.', on('16')),
  sp('Shamanism', 'Fire', 3, 'Searing Blood', 'Enchantment', 'Reach 16. M roll when activated; on a failure it loses 1 HP and 1 AP.', on('16')),

  // ---- Invocation ----
  sp('Invocation', 'Earth', 1, 'Overgrowth', 'Enchantment', 'Reach 16, Strike 2. +3 T.', on('16', '2', { stats: { t: 3 } })),
  sp('Invocation', 'Earth', 1, 'Regrowth', 'Enchantment', 'Reach 10. Regeneration I until it heals 1 HP.', on('10')),
  sp('Invocation', 'Earth', 2, 'Stoneskin', 'Enchantment', 'Reach 16. +3 ARM.', on('16', '1', { stats: { arm: 3 } })),
  sp('Invocation', 'Earth', 2, 'Natural Fortitude', 'Enchantment', 'Reach 16. Resistance I (Spell).', on('16')),
  sp('Invocation', 'Earth', 3, 'Greater Cure', 'Healing', 'Reach 16, Circular L. Removes Bleeding, Blinded, Confused, Crippled, Poisoned, Slowed and Weakened from allies in the area.'),
  sp('Invocation', 'Earth', 3, 'Primordial Word', 'Transmutation', 'Circular L around the caster. Summoned, Undead, Profane and Divine models in it suffer 1 Wound and are driven out; it lasts while the caster stays inside.'),

  // ---- Kitsune no Mai ----
  sp('Kitsune no Mai', 'Fire', 1, 'Burning Resolve', 'Healing', 'Reach 10. A model with 0 AP regains 1 AP.', on('10', '1', { ap: 1 })),
  sp('Kitsune no Mai', 'Fire', 1, 'Flare', 'Sorcery', 'PW INT, Reach 3. Burn (2). (Sweep II by hand.)', atk('INT', '3', '1', 'Ranged/Melee', 'Burn (2)')),

  // ---- Necromancy ----
  sp('Necromancy', 'Profane', 1, 'Command the Undead', 'Sorcery', 'Casting Aura. INT roll to take control of a Tier I Undead (Tier II: 1 Mana).'),
  sp('Necromancy', 'Profane', 1, 'Spectral Sight', 'Enchantment', 'Reach 16. Advantage (Undead).', on('16')),
  sp('Necromancy', 'Profane', 1, 'Curse of Decay', 'Enchantment', 'Reach 16. The target is Poisoned, again and again.', on('16', '1', { give: 'Poisoned' })),
  sp('Necromancy', 'Profane', 2, 'Necrotic Wound', 'Enchantment', 'Reach 16. Target gains Cleave and Poison II.', on('16', '1', { traits: ['Cleave', 'Poison II'] })),
  sp('Necromancy', 'Profane', 2, 'Soul Leech', 'Enchantment', 'Reach 10. The caster gains 1 Mana whenever the model deals a Wound.', on('10')),
  sp('Necromancy', 'Profane', 3, 'A Second Chance', 'Healing', 'Reach 16, Strike 2. The target regains 1 HP (and 1 AP if it was Incapacitated).', on('16', '2', { heal: 1 })),
  sp('Necromancy', 'Profane', 3, 'Life Leech', 'Enchantment', 'Reach 10. The model gains 1 HP for each Wound it deals.', on('10')),
  sp('Necromancy', 'Profane', 4, 'Corroding Embrace', 'Sorcery', 'PW 14, Reach 3. Armor-Piercing, Poison II. (Sweep II by hand.)', atk('14', '3', '1', 'Ranged/Melee', 'Armor-Piercing, Poison II')),
  sp('Necromancy', 'Profane', 4, 'Leeching Bolt', 'Sorcery', 'PW INT, Reach 16. (The caster regains 1 HP per Wound dealt – by hand.)', atk('INT', '16', '1', 'Ranged')),
  sp('Necromancy', 'Profane', 5, 'Raise the Undead', 'Conjuration', 'Casting Aura. Summons 2 Tier I or 1 Tier II Undead at a Dead model.', undefined, 2),
  sp('Necromancy', 'Profane', 5, 'Reanimation', 'Healing', 'Casting Aura. Each Undead in reach regains full HP and may stop being Dead.', undefined, 1),

  // ---- Purification Rites ----
  sp('Purification Rites', 'Fire', 1, 'Purification', 'Healing', 'Reach 16. Removes Enchantments and Weakened, Poisoned, Petrified, Confused, Blinded. Wounds Undead.', on('16', '1', { dispel: true, cure: ['Weakened', 'Poisoned', 'Petrified', 'Confused', 'Blinded'] })),

  // ---- Art of Sorcery ----
  sp('Art of Sorcery', 'Fire', 1, 'Ignite', 'Sorcery', 'PW INT, Reach 16, Strike STA. Burn (1).', atk('INT', '16', 'STA', 'Ranged', 'Burn (1)')),
  sp('Art of Sorcery', 'Fire', 2, 'Flare', 'Sorcery', 'PW INT, Reach 3. Burn (2). (Sweep II by hand.)', atk('INT', '3', '1', 'Ranged/Melee', 'Burn (2)')),
  sp('Art of Sorcery', 'Fire', 3, 'Fireball', 'Sorcery', 'PW INT, Reach 16, Circular L, Targetless. Burn (1).', atk('INT', '16, AoE: Circular L', '1', 'Ranged', 'Burn (1), Targetless')),
  sp('Art of Sorcery', 'Water', 1, 'Water Lash', 'Sorcery', 'PW 8, Reach 16, Strike STA. Knockback (2).', atk('8', '16', 'STA', 'Ranged/Melee', 'Knockback (2)')),
  sp('Art of Sorcery', 'Water', 2, 'Piercing Stream', 'Sorcery', 'PW INT, Reach 16, Strike 2. Armor-Piercing.', atk('INT', '16', '2', 'Ranged', 'Armor-Piercing')),
  sp('Art of Sorcery', 'Water', 3, 'Drown', 'Sorcery', 'PW INT, Reach 16, Circular L. Weakened on Hit until the end of the turn.', atk('INT', '16, AoE: Circular L', '1', 'Ranged', 'Weaken Hit')),
  sp('Art of Sorcery', 'Elder', 1, 'Arcane Bolt', 'Sorcery', 'PW INT, Reach 16, Strike STA. On a Critical Hit: Knockdown.', atk('INT', '16', 'STA', 'Ranged', 'On critical: Knockdown')),
  sp('Art of Sorcery', 'Elder', 2, 'Telekinetic Circular', 'Sorcery', 'PW INT−3, Spray L. Knockback (3), Knockdown.', atk('INT-3', 'AoE: Spray L', '1', 'Ranged', 'Knockback (3), Knockdown')),
  sp('Art of Sorcery', 'Elder', 3, 'Soul Crush', 'Sorcery', 'PW INT, Reach 16. Ignore Armor, Stun. Panicked if wounded.', atk('INT', '16', '1', 'Ranged', 'Ignore Armor, Stun, Panic')),

  // ---- Succubi Magic ----
  sp('Succubi Magic', 'Fire', 1, 'Fiery Fervor', 'Enchantment', 'Reach 16. Removes most States; +2 OFF and DEF.', on('16', '1', { stats: { off: 2, def: 2 }, cure: ['Weakened', 'Bleeding', 'Poisoned', 'Confused', 'Crippled', 'Blinded', 'Immobilized', 'Panicked', 'Petrified', 'Fatigued'] })),
  sp('Succubi Magic', 'Fire', 1, 'Unrelenting Zeal', 'Enchantment', 'Reach 16, Strike 2. M roll to negate a Wound, then it ends.', on('16', '2')),
  sp('Succubi Magic', 'Profane', 1, 'Draining Impulse', 'Enchantment', 'Reach 10. +2 AP in both Roles; Fatigued afterwards.', on('10'), 2),
  sp('Succubi Magic', 'Profane', 1, 'Agony', 'Enchantment', 'Casting Aura. INT roll at each Activation or Reaction; on a failure it loses 1 HP and the Activation ends.', on('Casting Aura')),

  // ---- Wizardry ----
  sp('Wizardry', 'Elder', 1, 'Mana Burst', 'Sorcery', 'PW INT, Reach 16. Stagger.', atk('INT', '16', '1', 'Ranged', 'Stagger')),
  sp('Wizardry', 'Elder', 1, 'Dispel Magic', 'Healing', 'Reach 16, Circular L. Removes a Spell or a summoned creature, or cancels Shrouded.'),
  sp('Wizardry', 'Elder', 2, 'Confuse Target', 'Sorcery', "Reach 16. The target is Confused until the caster's next Strategic Phase. 1 Mana: +2 Strike."),
  sp('Wizardry', 'Elder', 2, 'Ward', 'Sorcery', 'Reach 16. Non-Critical damage of an incoming Attack on the target is ignored.'),
  sp('Wizardry', 'Elder', 3, 'Redirect Damage', 'Sorcery', "Reach 16. The target's non-Critical Hits are negated and it suffers as many itself."),
  sp('Wizardry', 'Elder', 3, 'Hastened Recovery', 'Healing', 'Reach 16, Strike STA. Removes Crippled, Bleeding, Weakened, Poisoned, or the target regains 1 HP.', on('16', 'STA', { healOrCure: true, cure: AILMENTS })),
];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const roman = (n: number): string => ROMAN[n] ?? String(n);

/** The Elements written in the Affinity Traits. "Any" opens every Element. */
export function affinities(p: Profile): string[] {
  const out: string[] = [];
  for (const t of p.traits) {
    const m = /^Affinity \(([^)]*)\)/.exec(t);
    if (m) out.push(...m[1]!.split(',').map((x) => x.trim()).filter(Boolean));
  }
  return out;
}

/** The Spells a card gives: each Spellcraft up to its level, in the Elements of the model's Affinities. */
export function spellsOf(p: Profile): Spell[] {
  const mine = affinities(p);
  const any = mine.includes('Any');
  const out: Spell[] = [];
  for (const art of p.arts) {
    const m = /^(.+) (I|II|III|IV|V)$/.exec(art.trim());
    if (!m) continue;
    const level = ROMAN.indexOf(m[2]!);
    for (const s of SPELLS) {
      if (s.school !== m[1] || s.level > level) continue;
      if (any || s.element === 'Any' || mine.includes(s.element)) out.push(s);
    }
  }
  return out;
}

export const SPELL_INDEX = 100;
export const isSpell = (w: Weapon): boolean => w.type.startsWith('Spell');

/**
 * The model's attack Spells as weapons, in the order of `spellsOf`. A Mystic casts with Morale, so "INT"
 * in a Spell's Power reads "M" for it.
 */
export function spellWeapons(p: Profile): { index: number; weapon: Weapon; spell: Spell }[] {
  const mystic = p.classes.includes('Mystic');
  return spellsOf(p).flatMap((spell, i) => {
    if (!spell.attack) return [];
    const a = spell.attack;
    const weapon: Weapon = { name: spell.name, pw: mystic ? a.pw.replace(/^INT/, 'M') : a.pw, rch: a.rch, stk: a.stk, type: `Spell, ${spell.kind}, ${a.mode}`, ...(a.effect ? { effect: a.effect } : {}) };
    return [{ index: SPELL_INDEX + i, weapon, spell }];
  });
}

export const spellNamed = (p: Profile, name: string): Spell | undefined => spellsOf(p).find((s) => s.name === name);

/** What an Enchantment of this name does while it lasts (the same whatever Spellcraft it came from). */
export const enchantFx = (name: string): SpellFx | undefined => SPELLS.find((x) => x.name === name && x.kind === 'Enchantment' && x.cast?.fx)?.cast?.fx;
/** The Element of the Spell a weapon was made from ("Fire", "Profane"...). */
export const spellElementOf = (name: string): string | undefined => SPELLS.find((x) => x.name === name && x.attack)?.element;
export const spellText = (name: string): string => SPELLS.find((x) => x.name === name)?.text ?? '';
