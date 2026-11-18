// Shared data model: used by the server (authoritative) and the client (previews, rendering).
// Table coordinates are inches, (0,0) = top-left corner of the mat, x to the right, y towards the bottom edge.

export type Side = 0 | 1;
export type BaseSize = 'small' | 'medium' | 'large' | 'huge' | 'gigantic' | 'colossal' | 'epic';
/** Which placeholder figure is drawn. */
export type FigureKind = 'warrior' | 'archer' | 'mage' | 'rogue' | 'beast';
export type TerrainEnv = 'building' | 'ruin' | 'rock' | 'forest' | 'water' | 'magic';

export const STATES = [
  'Bleeding',
  'Blinded',
  'Confused',
  'Crippled',
  'Crouched',
  'Dead',
  'Engaged',
  'Fatigued',
  'Flying',
  'Immobilized',
  'Incapacitated',
  'Panicked',
  'Poisoned',
  'Shrouded',
  'Slowed',
  'Weakened',
  'Defensive Stance',
] as const;
export type StateName = (typeof STATES)[number];

export interface Pt {
  x: number;
  y: number;
}

/** turn: the end of this turn. strategic: the model's own next Strategic Phase. blue / red: that player's next Strategic Phase (a Spell's caster). */
export type Until = 'turn' | 'strategic' | 'blue' | 'red';

export interface Model {
  id: string;
  side: Side;
  name: string;
  faction: string;
  /** Key into shared/profiles.ts; null = generic figure without a profile. */
  profileId: string | null;
  kind: FigureKind;
  size: BaseSize;
  leader: boolean;
  x: number;
  y: number;
  /** Degrees, 0 = facing the top edge (-y), clockwise. */
  facing: number;
  hp: number;
  maxHp: number;
  /** Activation Points left this turn. */
  ap: number;
  states: StateName[];
  /** States that end by themselves: at the end of the turn, or in the model's next Strategic Phase. */
  temp?: Partial<Record<StateName, Until>>;
  /** Mana Counters. */
  mana?: number;
  /** Treasures in its Inventory (Treasure Hunt). */
  treasure?: number;
  /** Upgrade ids (shared/upgrades.ts) bought for this model. */
  upgrades?: string[];
  /** Enchantments on the model. */
  enchants?: Enchant[];
  /** What its own or the enemy Leader's Stratagems give it until that player's next Strategic Phase. */
  boons?: Grant[];
  /** A creature brought by a Conjuration Spell: the id of its caster. */
  summonedBy?: string;
  /** Height of its base above the table (standing on scenery). */
  z?: number;
  /** A Rider's Mount: whether it is ridden, its bonus HP left, and the Rider's HP / Size while mounted. */
  mount?: { id: string; on: boolean; hp: number; riderHp?: number; riderSize: BaseSize };
}

export interface Grant {
  name: string;
  /** Whose Stratagem it is. */
  from: Side;
  fx: import('./stratagems.ts').Boon;
}

/** An Enchantment lasts until its caster's next Strategic Phase ('blue' / 'red': whose). */
export interface Enchant {
  name: string;
  until: 'blue' | 'red';
  caster: string;
}

export interface TerrainPiece {
  id: string;
  /** obstacle = solid, blocks placement; area = ground you can stand in (forest, water). */
  kind: 'obstacle' | 'area';
  env: TerrainEnv;
  name: string;
  /** Footprint polygon in table coordinates. */
  shape: Pt[];
  /** Height in inches (for areas: visual height of trees etc.). */
  height: number;
  /** Ladders up this piece: points on the edge of its footprint. A model walks up or down there without Climb. */
  ladders?: Pt[];
  /** Made by a Spell: affects only this side's models (Blessed Rain: the caster's enemies). */
  only?: Side;
  /** Light Cover for this side's models standing in it. */
  cover?: Side;
  /** Ends in this player's next Strategic Phase. */
  until?: 'blue' | 'red';
  /** The model that cast it. */
  caster?: string;
  /** Sculpted scenery: the model drawn for this piece (and for the pieces after it that are `unseen`). */
  model?: { file: string; x: number; y: number; size: number; turn: number };
  /** Its plain shape is not drawn: a model shows it. */
  unseen?: boolean;
  /** Already painted on the ground picture: only a sheen is drawn. */
  painted?: boolean;
}

export interface DiceResult {
  dice: number[];
  target: number | null;
  successes: number | null;
  crits: number;
  label: string;
}

export interface LogLine {
  seq: number;
  ts: number;
  side: Side | null;
  by: string;
  kind: 'info' | 'move' | 'dice' | 'hp' | 'turn' | 'combat';
  text: string;
  dice?: DiceResult;
}

/** An objective marker of the Quest (e.g. the Obelisk). */
export interface Marker {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Scoring distance in inches, drawn as a ring. */
  radius: number;
  /** Tokens of a Quest. Absent: an objective marker such as the Obelisk. */
  kind?: MarkerKind;
  /** Sigil: the Spell it holds. */
  spell?: string;
}

/**
 * Treasure Hunt: an Intrigue token hides a Sigil on top of a Cache. Revealed it is a Sigil; once the Sigil has
 * gone off the Cache lies open to Interact; an opened Cache stays as a reminder; a dropped Treasure is loot.
 */
export type MarkerKind = 'intrigue' | 'sigil' | 'cache' | 'opened' | 'treasure' | 'token';

/** What everyone may know about a player's Scheme. The cards themselves stay with the server until revealed. */
export interface SchemeSeat {
  drawn: number;
  kept: boolean;
  revealed: string | null;
  /** The Scheme has been counted. */
  scored?: boolean;
  /** When it was revealed during the game. */
  at?: { round: number; active: Side };
  /** Running count for a Scheme that counts something after its reveal (Wounds, Attacks). */
  count?: number;
  /** Own models that moved since the reveal (Stand Your Ground). */
  moved?: string[];
  /** One of the side's models declared an Attack since the reveal (Last Warning). */
  attacked?: boolean;
}

export type Phase = 'setup' | 'playing' | 'finished';
export type MoveMode = 'deploy' | 'walk' | 'run' | 'react' | 'retreat' | 'follow' | 'free' | 'climb' | 'jump';

export type Intent = 'dodge' | 'attack' | 'other';
export type ActionKind = 'attack' | 'dodge' | 'nothing' | 'deathblow' | 'perceive' | 'interact' | 'cast' | 'ritual' | 'mount';

/** Wounds one model dealt to another in an Activation Sequence. `out`: this is what took the victim down. */
export interface Dealt {
  by: string;
  to: string;
  wounds: number;
  melee: boolean;
  reactive: boolean;
  out?: boolean;
}

/** What a side has done so far, for the Schemes that ask. */
export interface Tally {
  /** Wounds dealt to enemies with Melee Attacks. */
  melee: number;
  /** Wounds dealt to enemies in Reaction. */
  reactive: number;
  deathblows: number;
  /** Own models that Incapacitated an enemy costing more Recruitment Points. */
  valor: string[];
}

/** Modifiers the player adds for things the program does not know (Skills, Combat Arts, Shields, Spells...). */
export interface Mods {
  /** Added to the attribute rolled against (OFF / DEF / ACC, or AG for a Dodge). */
  hit: number;
  /** Added to the Strike value. */
  stk: number;
  /** Added to the weapon's Power. */
  pw: number;
  /** Combat Art level used with this attack, e.g. "Fencing III" (empty = none). */
  art?: string;
  /** Snipe: Strike 1 that cannot be modified, ignoring Cover and Ranged Friendly Fire. */
  snipe?: boolean;
  /** Knockback: the spot the attacker pushes the target towards (default: straight away from the attacker). */
  push?: Pt;
}

export interface Reaction {
  /** Inches moved in this reaction (a Dodge allows half Speed). */
  moved: number;
  intent: Intent;
  /** Weapon index for an Attack (see combat.attackOptions). */
  weapon: number;
  mods: Mods;
  /** Attack of Opportunity: the point of the activated model's route where it came into Reach. */
  at?: Pt;
  /** Charm II: it failed its INT roll and Walks towards the charming model at the end of the Sequence. */
  drawn?: boolean;
}

/** The Activation Sequence in progress: one activated model, and the models reacting to it. */
export interface Activation {
  id: string;
  /** Inches of Speed spent in the Movement Step. */
  moved: number;
  reactions: Record<string, Reaction>;
  /** The Action declared in the Action Step; null while the model is still moving. */
  action: ActionKind | null;
  /** Inches moved after a Dodge Action (half Speed allowed). */
  dodged: number;
  /** Inches walked after an Attack with Hit and Retreat. */
  retreated?: number;
  /** Enemies that had line of sight to the activated model at some point of this Activation. */
  seen?: string[];
  /** Enemies whose Awareness the activated model has been in. */
  near?: string[];
  /** Failed Morale roll of a Panicked model: it must Run for the nearest edge, or (Engaged) stay and Dodge. */
  panic?: 'flee' | 'hold';
  /** An Attack has been declared and the Reactive Player may answer with Protector before it is resolved. */
  pending?: { weapon: number; target: string; mods: Mods; protectors: string[] };
  /** Follow-Up: models that may move after an enemy disengaged from them. */
  follow?: Record<string, { target: string; moved: number }>;
  /** The activated model's route this Activation, sampled every half inch (Attacks of Opportunity). */
  path?: Pt[];
  /** Impede: its Movement ended where it was attacked. */
  impeded?: boolean;
  /** Climb or Jump declared as a Special Movement, and the inches of it used. */
  special?: 'climb' | 'jump';
  specialUsed?: number;
  /** Taunt was used in this Activation: the enemies that failed their INT roll and must react. */
  taunted?: string[];
  tauntUsed?: boolean;
  /** The Action is declared and waits for the dice: the sides that still have to press Roll. */
  roll?: { cmd: Command; wait: Side[]; from: Side };
}

export interface TableState {
  id: string;
  name: string;
  width: number;
  height: number;
  deployDepth: number;
  /** WarBracket: 'corner' = quarter circles of `deployDepth` in the bottom-left (Blue) and top-right (Red) corner. */
  deploy?: 'standard' | 'corner';
  terrain: TerrainPiece[];
  /** Ground picture (under /maps/), how much the ground rises and falls (looks only), the map's name. */
  ground?: string;
  relief?: number;
  map?: string;
  models: Model[];
  players: [string | null, string | null];
  log: LogLine[];
  /** Sequence number of the last applied event. */
  seq: number;
  nextModel: [number, number];
  phase: Phase;
  ready: [boolean, boolean];
  /** Who takes the first turn of each round (set by the Initiative Check). */
  first: Side;
  round: number;
  /** The Active Player of the current turn. */
  active: Side;
  activation: Activation | null;
  vp: [number, number];
  winner: Side | 'draw' | null;
  /** Recruitment Points each party may spend. */
  points: number;
  /** The faction each side plays (decides its Scheme table); null until a party is deployed. */
  factions: [string | null, string | null];
  quest: string | null;
  markers: Marker[];
  /** Models already scored for by the Quest (Open Hostilities). */
  scored: string[];
  /** Models per side when the game started (for Broken Morale). */
  partySize: [number, number];
  broken: [boolean, boolean];
  schemes: [SchemeSeat, SchemeSeat];
  tally: [Tally, Tally];
  /** Models that have lost HP at some point. */
  hurt: string[];
  /** A model has been activated this turn (the Strategic Phase is over). */
  acted: boolean;
  /** Treasures carried off the field by each side. */
  escaped: [number, number];
  /** The Quest ends when this turn does. */
  lastTurn: boolean;
  /** Once-per-turn abilities already used this turn: model id -> names. */
  used: Record<string, string[]>;
  /** Stratagems in effect, by the player who declared them (until that player's next Strategic Phase). */
  strats?: { seat: Side; name: string; text: string; on: string[] }[];
  /** Victory Points each side has from the Quest so far (a Quest gives at most 10). */
  questVp?: [number, number];
  /** The last Movement, while it can still be taken back (nothing has happened since: no dice, no Reaction). */
  lastMove?: { id: string; x: number; y: number; z?: number; facing: number; activation: Activation | null; moved?: string[] };
  /** Stratagems declared in this Strategic Phase. */
  stratUsed?: string[];
  /** Unconventional Tactics: this player's Leader rolls at the start of its next Strategic Phase / failed it this turn. */
  stratCheck?: Side;
  stratBlocked?: Side;
}

// ---- Commands (what a player asks for) ----

export type Command =
  | { type: 'ADD_MODEL'; side: Side; profileId: string; x: number; y: number; free?: boolean; /** A Rider comes with its Mount unless this is false. */ mount?: boolean }
  /** Put a whole party on the table in the side's Deployment Zone, replacing what stands there. */
  | { type: 'DEPLOY_PARTY'; side: Side; faction: string; models: string[]; leader: number; upgrades?: string[][]; mounts?: boolean[] }
  | { type: 'MOVE_MODEL'; id: string; x: number; y: number; facing?: number; free?: boolean; /** Climb or Jump instead of Walk / Run. */ how?: 'climb' | 'jump' }
  | { type: 'ROTATE_MODEL'; id: string; facing: number }
  | { type: 'WOUND'; id: string }
  | { type: 'HEAL'; id: string }
  | { type: 'SET_AP'; id: string; ap: number }
  | { type: 'SET_STATE'; id: string; state: StateName; on: boolean }
  | { type: 'SET_LEADER'; id: string }
  | { type: 'REMOVE_MODEL'; id: string }
  | { type: 'ROLL'; count: number; target?: number | null; label?: string }
  | { type: 'READY' }
  | { type: 'ACTIVATE'; id: string }
  | { type: 'REACT'; id: string; intent?: Intent; weapon?: number; mods?: Partial<Mods>; /** The players agree the Reaction is allowed although the table does not think so. */ anyway?: boolean; /** Attack of Opportunity: at the point of the route where the activated model came into Reach. */ opportunity?: boolean }
  | { type: 'ACTION'; /** Wait for the players to press Roll in the dice window before resolving. */ hold?: boolean; action: ActionKind; weapon?: number; target?: string; mods?: Partial<Mods>; /** Perceive and Interact: the token. */ marker?: string; /** A template aimed at a spot on the table instead of a model. */ at?: Pt; /** Cast: the Enchantment or Healing Spell and the models it is cast on. */ spell?: string; targets?: string[]; /** Raise the Undead: the Dead model and the Undead profiles summoned at it. */ dead?: string; picks?: string[]; /** Strikes split off to other targets. */ split?: { id: string; n: number }[] }
  | { type: 'SUMMON'; id: string; spell: string; at: Pt }
  | { type: 'DISMISS'; id: string }
  /** Taunt (Skill, during Movement): nearby enemies roll INT or must react against the activated model. */
  | { type: 'TAUNT' }
  /** Take back the last Movement (not after dice were rolled or anyone reacted). */
  | { type: 'UNDO_MOVE' }
  /** Dice window: press Roll for your side; the declarer may call the Action back while the other side has not rolled. */
  | { type: 'ROLL_DICE' }
  /** The reacting player changes the modifiers of a declared Reaction (until the dice are rolled). */
  | { type: 'REACT_MODS'; id: string; hit?: number; stk?: number }
  | { type: 'CANCEL_ROLL' }
  /** Stealth II: re-enter the Shrouded State in the owner's Strategic Phase, out of every enemy's sight. */
  | { type: 'SHROUD'; id: string }
  | { type: 'MOUNT'; id: string }
  | { type: 'DISMOUNT'; id: string }
  | { type: 'ENCHANT'; id: string; name: string }
  | { type: 'STRATAGEM'; name: string; targets?: string[]; spell?: string; side?: Side }
  | { type: 'DISENCHANT'; id: string; name: string }
  /** Treasure Hunt: the activated model walks off its own table edge with a Treasure. */
  | { type: 'LEAVE_FIELD'; id: string }
  /** A Mage turns Activation Points into Mana Counters. */
  | { type: 'CONVERT_MANA'; id: string; count?: number }
  | { type: 'END_ACTIVATION' }
  /** Answer to a declared Attack: the model with Protector that steps in, or nobody. */
  | { type: 'PROTECT'; id?: string | null }
  | { type: 'END_TURN' }
  // WarBracket: give the game up; tokens of Quests the table does not run itself, placed by the players.
  | { type: 'CONCEDE'; side?: Side }
  | { type: 'ADD_MARKER'; name?: string; x: number; y: number }
  | { type: 'MOVE_MARKER'; id: string; x: number; y: number }
  | { type: 'REMOVE_MARKER'; id: string }
  | { type: 'ADD_VP'; side: Side; delta: number }
  // Schemes: `side` is only read in solo play (one player acting for both sides).
  | { type: 'DRAW_SCHEMES'; side?: Side }
  | { type: 'KEEP_SCHEME'; code: string; side?: Side }
  | { type: 'REVEAL_SCHEME'; code?: string; side?: Side };

// ---- Events (what actually happened; the game is the list of these) ----

export type EventBody =
  | { type: 'TABLE_CREATED'; name: string; width: number; height: number; deployDepth: number; deploy?: 'standard' | 'corner'; terrain: TerrainPiece[]; quest?: string | null; points?: number; /** Ground picture, relief (looks only) and the map's name. */ ground?: string; relief?: number; map?: string }
  | { type: 'PLAYER_JOINED'; seat: Side; name: string }
  | { type: 'MODEL_ADDED'; model: Model }
  | { type: 'MODEL_MOVED'; id: string; from: Pt; to: Pt; facing: number; dist: number; cost?: number; mode?: MoveMode; /** Height it ends at (scenery top), when it changed. */ z?: number; /** Climb / Jump as a Special Movement: only Nothing may follow. */ special?: boolean }
  | { type: 'MODEL_ROTATED'; id: string; facing: number }
  | { type: 'MODEL_HP'; id: string; hp: number; states?: StateName[] }
  | { type: 'MODEL_AP'; id: string; ap: number }
  | { type: 'MODEL_STATE'; id: string; state: StateName; on: boolean }
  | { type: 'LEADER_SET'; id: string }
  | { type: 'MODEL_REMOVED'; id: string; why?: string }
  | { type: 'MOUNTED'; id: string; how?: string }
  | { type: 'ABILITY_USED'; id: string; name: string }
  | { type: 'DISMOUNTED'; id: string; why?: 'knockdown' | 'down' | 'choice' }
  | { type: 'DICE_ROLLED'; result: DiceResult }
  | { type: 'PLAYER_READY'; seat: Side }
  | { type: 'GAME_STARTED'; rolls: [number, number]; morale: [number, number]; first: Side }
  | { type: 'TURN_STARTED'; round: number; active: Side; ap: Record<string, number>; rested: string[] }
  | { type: 'MODEL_ACTIVATED'; id: string; panic?: DiceResult; fled?: 'flee' | 'hold' }
  /** A Panicked model ran off the field: it is lost. */
  | { type: 'MODEL_FLED'; id: string }
  /** Something that hits several models outside an Attack (a Sigil going off). */
  | { type: 'EFFECT'; lines: { text: string; dice?: DiceResult }[]; results: { id: string; hp: number; states: StateName[]; ap?: number; temp?: Partial<Record<StateName, Until>> }[] }
  | { type: 'MARKER_REVEALED'; id: string; spell: string; roll: number; /** The model that revealed it. */ who?: string }
  | { type: 'MARKER_SET'; id: string; kind: MarkerKind }
  /** A model takes a Treasure: from a Cache it unlocked (which stays, opened) or loot lying on the ground. */
  | { type: 'TREASURE_TAKEN'; id: string; marker: string }
  | { type: 'MODEL_LEFT'; id: string }
  | { type: 'MODEL_MANA'; id: string; ap: number; mana: number }
  | { type: 'ENCHANTED'; id: string; name: string; until: 'blue' | 'red'; caster: string }
  | { type: 'STRATAGEM_DECLARED'; seat: Side; name: string; text: string; on: string[]; negate?: boolean; grants: { id: string; fx: import('./stratagems.ts').Boon }[]; lines: { text: string; dice?: DiceResult }[] }
  | { type: 'STRATAGEMS_ENDED'; seat: Side; why: 'ends' | 'negated' }
  | { type: 'STRATAGEM_CHECK'; seat: Side; ok: boolean; text: string; dice: DiceResult }
  | { type: 'DISENCHANTED'; id: string; names: string[]; why?: string }
  | { type: 'ATTACK_DECLARED'; weapon: number; target: string; mods: Mods; protectors: string[] }
  /** Protector: `id` moves into Base Contact with `ward` and takes the Attack. */
  | { type: 'PROTECTED'; id: string; ward: string; from: Pt; to: Pt }
  // `team` (not `side`): every stored event also carries `side` = the player who acted.
  | { type: 'QUEST_SCORED'; team: Side; delta: number; text: string; mark?: string }
  | { type: 'BROKEN_MORALE'; team: Side; ids: string[] }
  | { type: 'PARTY_DEPLOYED'; team: Side; faction: string; points: number }
  | { type: 'SCHEMES_DRAWN'; seat: Side; count: number }
  | { type: 'SCHEME_KEPT'; seat: Side }
  | { type: 'SCHEME_REVEALED'; seat: Side; code: string }
  /** End of the game: what a revealed Scheme is worth. `auto` false = the table cannot check it, score it by hand. */
  | { type: 'SCHEME_SCORED'; seat: Side; code: string; delta: number; text: string; auto: boolean }
  | { type: 'MODEL_REACTED'; id: string; intent?: Intent; weapon?: number; mods?: Mods; panic?: DiceResult; forced?: boolean; at?: Pt; /** Charm: the INT roll to react against the activated model. */ charm?: DiceResult; charmLevel?: number; /** Declared by the table because the model was Taunted. */ taunt?: boolean }
  | { type: 'MOVE_UNDONE'; id: string }
  | { type: 'ROLL_PENDING'; cmd: Command; wait: Side[]; from: Side }
  | { type: 'ROLL_READIED'; seat: Side }
  | { type: 'ROLL_CANCELLED' }
  | { type: 'REACTION_ADJUSTED'; id: string; hit: number; stk: number }
  | { type: 'TERRAIN_ADDED'; piece: TerrainPiece }
  | { type: 'TERRAIN_REMOVED'; ids: string[]; why?: string }
  | { type: 'TAUNTED'; id: string; rolls: { id: string; dice: DiceResult }[] }
  | { type: 'IMPEDED'; id: string; who: string; at: Pt }
  | { type: 'ACTION_RESOLVED'; action: ActionKind; lines: { text: string; dice?: DiceResult }[]; results: { id: string; hp: number; states: StateName[]; ap?: number; temp?: Partial<Record<StateName, Until>>; /** Knockback: where the model was pushed. */ to?: Pt }[]; used?: { id: string; what: string }[]; dealt?: Dealt[]; mana?: { id: string; spent: number }[]; /** The Attack was made against an enemy without line of sight to the attacker. */ flank?: boolean; /** Death Blow: the model that was killed. */ deathblow?: string; /** For the picture on the table: who attacked with what, where, and the models it took effect on. */ fx?: { from: string; name: string; at: Pt; hit: string[] } }
  | { type: 'ENGAGEMENT'; on: string[]; off: string[] }
  | { type: 'STRATEGIC'; lines: { text: string; dice?: DiceResult }[]; results: { id: string; hp: number; states: StateName[] }[] }
  | { type: 'ACTIVATION_ENDED' }
  | { type: 'TURN_ENDED' }
  | { type: 'GAME_FINISHED'; winner: Side | 'draw'; /** WarBracket: the side that gave the game up. */ conceded?: Side }
  | { type: 'MARKER_ADDED'; marker: Marker }
  | { type: 'MARKER_MOVED'; id: string; x: number; y: number }
  | { type: 'MARKER_REMOVED'; id: string }
  | { type: 'VP_CHANGED'; team: Side; vp: number };

export type GameEvent = EventBody & {
  seq: number;
  ts: number;
  side: Side | null;
  by: string;
};

export const BASE_SIZES: BaseSize[] = ['small', 'medium', 'large', 'huge', 'gigantic', 'colossal', 'epic'];
export const MAX_ROUNDS = 5;
