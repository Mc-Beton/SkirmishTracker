import { baseHeight, checkPath, checkPlacement, circleHitsPolygon, dist, distToSegment, facingTo, heightProfile, inDeployZone, ladderAt, moveCost, ngon, normDeg, onShelf, pointInPolygon, round2, SHELF, shelfPlacement, shelfSpot, surfaceAt } from './geometry.ts';
import { areaOf, areaVictims, attackOptions, CONTACT, fallRolls, walkToward, gap, HAZE, intOf, manaBill, manaPool, moraleOf, immuneTo, isTargetless, NO_MODS, planAttack, pointTarget, quantityOf, resolveAction, soldierBonus, spellReach, weaponAt, woundOnce } from './combat.ts';
import { GUARD, hasUpgrade, RETINUE, upgradeChoices } from './upgrades.ts';
import { spellsOf, type Spell } from './spells.ts';
import { engagers, sight } from './los.ts';
import { DEFAULT_POINTS, deploySpot } from './content.ts';
import { partyPoints, partyProblems, upgradesOf } from './party.ts';
import { figureKind, profileById, type Profile } from './profiles.ts';
import { bountyFor, MARKER_RADIUS, questByCode, schemeByCode, SIGIL_PW, SIGIL_RADIUS, sigilByName, sigilByRoll } from './quests.ts';
import { baseRadius } from './geometry.ts';
import { awareness, hasBoon, hasClass, hasEnchant, hasSkill, hasTrait, modelStats, profileOf } from './stats.ts';
import { stratagemFor, type Boon, type Stratagem } from './stratagems.ts';
import { mountById } from './mounts.ts';
import { PROFILES } from './profiles.ts';
import type { Activation, Command, DiceResult, EventBody, GameEvent, Intent, KitUse, LogLine, PendingRoll, Marker, Model, Mods, MoveMode, Pt, ScoreKind, Side, StateName, TableState, Until , TerrainPiece } from './types.ts';
import { MAX_ROUNDS, STATES } from './types.ts';

export const LIMITS = {
  models: 60,
  dice: 20,
  log: 300,
  nameLength: 40,
};

export const SIDE_NAME = ['Blue', 'Red'] as const;

export class RuleError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Who is asking. `solo`: the other seat is empty, so this player may act for both sides. */
export interface Actor {
  side: Side;
  solo: boolean;
}

export interface DecideContext extends Actor {
  /** Returns a whole number from 1 to 20. Only the server provides this. */
  d20: () => number;
}

export function emptyState(id: string): TableState {
  return {
    id,
    name: '',
    width: 36,
    height: 36,
    deployDepth: 8,
    terrain: [],
    models: [],
    players: [null, null],
    log: [],
    seq: 0,
    nextModel: [1, 1],
    phase: 'setup',
    ready: [false, false],
    first: 0,
    round: 0,
    active: 0,
    activation: null,
    vp: [0, 0],
    winner: null,
    used: {},
    points: DEFAULT_POINTS,
    factions: [null, null],
    quest: null,
    markers: [],
    scored: [],
    partySize: [0, 0],
    broken: [false, false],
    schemes: [
      { drawn: 0, kept: false, revealed: null },
      { drawn: 0, kept: false, revealed: null },
    ],
    tally: [
      { melee: 0, reactive: 0, deathblows: 0, valor: [] },
      { melee: 0, reactive: 0, deathblows: 0, valor: [] },
    ],
    hurt: [],
    acted: false,
    escaped: [0, 0],
    lastTurn: false,
  };
}

const fail = (code: string, message: string): never => {
  throw new RuleError(code, message);
};

function num(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail('BAD_VALUE', `${what} must be between ${min} and ${max}`);
  return v as number;
}

function int(v: unknown, min: number, max: number, what: string): number {
  const n = num(v, min, max, what);
  if (!Number.isInteger(n)) fail('BAD_VALUE', `${what} must be a whole number`);
  return n;
}

function text(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
}

function findModel(state: TableState, id: unknown): Model {
  const m = state.models.find((x) => x.id === id);
  return m ?? fail('NO_MODEL', 'That model is not on the table');
}

const side01 = (v: unknown): Side => (v === 0 || v === 1 ? v : fail('BAD_VALUE', 'Unknown side'));
const may = (actor: Actor, side: Side): boolean => actor.solo || actor.side === side;
const isOut = (m: Model): boolean => m.states.includes('Dead') || m.states.includes('Incapacitated');
const other = (s: Side): Side => (s === 0 ? 1 : 0);

const PROBLEM_TEXT = {
  OFF_TABLE: 'The base must stay on the table',
  MODEL: 'Another model is standing there',
  TERRAIN: 'That spot is inside terrain',
  PATH_TERRAIN: 'Scenery taller than the model is in the way',
  PATH_ENEMY: 'An enemy model is in the way',
} as const;

/** Roll `count` d20. With a target: success = result <= target; 1 is a critical (20 too when target > 20); target 0 always fails. */
export function rollDice(count: number, target: number | null, label: string, d20: () => number): DiceResult {
  const dice: number[] = [];
  for (let i = 0; i < count; i++) dice.push(d20());
  // An attribute reduced to 0 fails automatically, so it cannot score a critical either.
  const isCrit = (d: number) => target !== 0 && (d === 1 || (target !== null && target > 20 && d === 20));
  return {
    dice,
    target,
    successes: target === null ? null : dice.filter((d) => d <= target || isCrit(d)).length,
    crits: dice.filter(isCrit).length,
    label,
  };
}

// ---- movement: one check shared by the server (decide) and the client (drag preview) ----

export type MoveCheck =
  | { ok: true; mode: MoveMode; cost: number; spent: number; walk: number; limit: number; /** Height it ends at. */ z?: number; /** Inches it falls at the end (a Jump that falls short). */ fall?: number; special?: boolean }
  | { ok: false; code: string; message: string };

const no = (code: string, message: string): MoveCheck => ({ ok: false, code, message });

/**
 * May `model` move to `to` right now?
 * - free: a correction, push or placement outside the normal rules; only the spot itself is checked.
 * - setup: inside the model's own Deployment Zone.
 * - playing: only the activated model (Walk up to SPD, Run up to 2x SPD, counted over the whole Activation)
 *   and models that declared a Reaction (up to half SPD, as after a Dodge).
 */
export function checkMove(state: TableState, actor: Actor, model: Model, to: Pt, free: boolean, how?: 'climb' | 'jump'): MoveCheck {
  // The shelf beyond a player's edge: figures stand there until they are deployed.
  const shelf = onShelf(state, to);
  if (shelf !== null) {
    if (!free && state.phase !== 'setup') return no('ZONE', 'Figures go back on the shelf only before the game starts (or with Free move)');
    if (!free && !may(actor, model.side)) return no('NOT_YOURS', 'That model belongs to the other player');
    if (shelf !== model.side) return no('ZONE', "That is the other player's shelf");
    const bad = shelfPlacement(state, model.size, to.x, to.y, shelf, model.id);
    if (bad) return no(bad, bad === 'MODEL' ? PROBLEM_TEXT.MODEL : 'That spot is off the shelf');
    return { ok: true, mode: free ? 'free' : 'deploy', cost: round2(dist(model, to)), spent: 0, walk: 0, limit: 0, z: 0 };
  }
  // Deployment is on the table; in the game (and for free moves) a model may stand on top of scenery.
  const spot = checkPlacement(state, model.size, to.x, to.y, model.id, free || state.phase === 'playing');
  if (spot) return no(spot, PROBLEM_TEXT[spot]);
  const straight = round2(dist(model, to));
  const zTo = round2(surfaceAt(state, to));
  const flying = model.states.includes('Flying');
  if (free) return { ok: true, mode: 'free', cost: straight, spent: 0, walk: 0, limit: 0, z: zTo };
  if (state.phase === 'finished') return no('GAME_OVER', 'The game is over');
  if (!may(actor, model.side)) return no('NOT_YOURS', 'That model belongs to the other player');

  if (state.phase === 'setup') {
    if (!inDeployZone(state, model.side, model.size, to.y, deployDepthFor(state, model), to.x)) return no('ZONE', 'Deploy inside your Deployment Zone');
    return { ok: true, mode: 'deploy', cost: straight, spent: 0, walk: 0, limit: 0, z: zTo };
  }

  if (isOut(model)) return no('CANNOT_MOVE', `${model.name} is out of action`);
  if (model.states.includes('Immobilized')) return no('CANNOT_MOVE', `${model.name} is Immobilized`);
  // Outside an Activation: a Ranger's Movement in the End Phase, or one made on Surge Order.
  const bonus = state.activation ? null : bonusMove(state, model);
  const a: Activation | null = state.activation ?? (bonus ? { id: model.id, moved: state.bonus?.[model.id] ?? 0, reactions: {}, action: null, dodged: 0, specialUsed: state.bonus?.[model.id] ?? 0 } : null);
  const reaction = a !== null && a.id !== model.id ? a.reactions[model.id] : undefined;
  // Follow-Up: an enemy disengaged from this model, it may go after it for half its SPD.
  const follow = a?.follow?.[model.id];
  const prey = follow ? state.models.find((x) => x.id === follow.target) : undefined;
  if (a && follow && prey && !(a.id === model.id && a.action === null) && !(reaction && reaction.intent === 'dodge')) {
    const blockedWay = checkPath(state, model, to);
    if (blockedWay) return no(blockedWay, PROBLEM_TEXT[blockedWay]);
    const cost = moveCost(state, model, to);
    const limit = modelStats(model).spd / 2;
    if (follow.moved + cost > limit + 0.005) return no('TOO_FAR', `Follow-Up: ${Math.max(0, round2(limit - follow.moved)).toFixed(1)}" left`);
    if (dist(to, prey) > dist(model, prey) - straight / 2) return no('FOLLOW', `Follow-Up moves towards ${prey.name}`);
    return { ok: true, mode: 'follow', cost, spent: follow.moved, walk: limit, limit };
  }
  if (!a || (a.id !== model.id && !reaction)) return no('NOT_ACTIVATED', 'Activate this model first, or switch on Free move');
  if (a.id === model.id && a.action === null && a.panic === 'hold') return no('PANICKED', `${model.name} failed its Morale roll while Engaged: Idle and Dodge`);
  if (a.id === model.id && a.action === null && a.impeded) return no('IMPEDED', `${model.name} was stopped by Impede: its Movement has ended`);
  if (a.id === model.id && a.action === null && a.panic === 'flee') {
    const here = nearestEdge(state, model, model);
    if (nearestEdge(state, model, to).room > here.room - straight * 0.7) return no('PANICKED', `${model.name} failed its Morale roll: it Runs towards the nearest edge`);
  }
  if (reaction && reaction.intent !== 'dodge') return no('NO_DODGE', 'Only a Dodge lets a reacting model move (or switch on Free move)');
  // Hit and Retreat: after its Attack the model may Walk once more, unless an enemy has it Engaged.
  const retreat = !reaction && a.action === 'attack' && hasSkill(model, 'Hit and Retreat');
  if (retreat && engagers(state, model).length > 0) return no('ACTION_DONE', `${model.name} is Engaged – no Walk after the Attack`);
  if (!reaction && a.action !== null && a.action !== 'dodge' && !retreat) return no('ACTION_DONE', `${model.name} has already acted – end the activation`);

  const spd = modelStats(model).spd;
  // After a Dodge (as a Reaction or as the Action) a model may move half its Speed, rounded up.
  const reacting = reaction !== undefined || a.action === 'dodge';
  // Climb and Jump: Special Movements of their own (Climbing / Leap make them Normal Movement at full Speed).
  if (how) {
    if (reacting || retreat || a.id !== model.id || a.action !== null) return no('NOT_NOW', `${how === 'climb' ? 'Climb' : 'Jump'} is declared in the Movement Step of the activated model`);
    if (flying) return no('NOT_NOW', `${model.name} is Flying: it moves over scenery anyway`);
    const skilled = how === 'climb' ? hasSkill(model, 'Climbing') : hasSkill(model, 'Leap');
    if (bonus === 'ranger' && !skilled) return no('NOT_NOW', 'In the End Phase a Ranger makes a Normal Movement');
    if (!skilled && a.special !== how && a.moved > 0.005) return no('SPECIAL_FIRST', `${how === 'climb' ? 'Climb' : 'Jump'} is a Movement of its own – declare it before the model walks`);
    if (a.special && a.special !== how) return no('SPECIAL_FIRST', `${model.name} has declared ${a.special === 'climb' ? 'Climb' : 'Jump'} this Activation`);
    const limit = skilled ? spd : Math.ceil(spd / 2);
    const spent = skilled ? a.moved : (a.specialUsed ?? 0);
    const left = Math.max(0, limit - spent);
    const zFrom = model.z ?? 0;
    if (!pathFreeOfEnemies(state, model, to)) return no('PATH_ENEMY', PROBLEM_TEXT.PATH_ENEMY);
    if (how === 'climb') {
      // Up and down every face on the way, plus the distance across.
      const profile = [zFrom, ...heightProfile(state, model, to)];
      let vertical = 0;
      for (let i = 1; i < profile.length; i++) vertical += Math.abs(profile[i]! - profile[i - 1]!);
      const cost = round2(moveCost(state, model, to) + vertical);
      if (cost > left + 0.005) return no('TOO_FAR', `Climbing there costs ${cost.toFixed(1)}" (${vertical.toFixed(1)}" up and down) – ${left.toFixed(1)}" left`);
      return { ok: true, mode: 'climb', cost, spent, walk: limit, limit, z: zTo, special: !skilled };
    }
    // Jump: the straight distance through the air, start to landing.
    const air = Math.hypot(straight, zTo - zFrom);
    if (air <= left + 0.005) return { ok: true, mode: 'jump', cost: round2(air), spent, walk: limit, limit, z: zTo, special: !skilled };
    // Too far, but the top of its Hitbox reaches the higher surface: it pulls itself up onto the edge.
    if (zTo > zFrom && straight <= left + 0.005 && zFrom + baseHeight(model.size) >= zTo - 0.005) return { ok: true, mode: 'jump', cost: round2(left), spent, walk: limit, limit, z: zTo, special: !skilled };
    // Jumping down further than it can: it falls the rest of the way.
    if (zTo < zFrom && straight <= left + 0.005) {
      const fall = round2(zFrom - zTo - Math.sqrt(Math.max(0, left * left - straight * straight)));
      return { ok: true, mode: 'jump', cost: round2(left), spent, walk: limit, limit, z: zTo, fall, special: !skilled };
    }
    return no('TOO_FAR', `The Jump is ${air.toFixed(1)}" – ${model.name} can jump ${left.toFixed(1)}"`);
  }
  if (a.special && a.id === model.id && !reacting) return no('SPECIAL_FIRST', `${model.name} declared ${a.special === 'climb' ? 'Climb' : 'Jump'}: no other Movement this Activation`);
  // On the same level, or stepping up / down no more than its own Hitbox; higher faces need Climb or Jump.
  const zFrom = model.z ?? 0;
  const profile = [zFrom, ...heightProfile(state, model, to)];
  let ladder = 0;
  if (!flying && profile.some((z) => z > 0.005)) {
    const step = baseHeight(model.size);
    const n = profile.length - 2;
    for (let i = 1; i < profile.length; i++) {
      const dz = profile[i]! - profile[i - 1]!;
      // A Ladder: up or down without Climb. Going up costs double.
      if (Math.abs(dz) > step + 0.005) {
        const f = n > 0 ? Math.max(0, i - 1.5) / n : 0;
        const at = { x: model.x + (to.x - model.x) * f, y: model.y + (to.y - model.y) * f };
        if (ladderAt(state, at, Math.max(profile[i]!, profile[i - 1]!))) {
          ladder += dz > 0 ? 2 * dz : -dz;
          continue;
        }
      }
      if (Math.abs(dz) > step + 0.005) return no('NEED_CLIMB', `Too high to step ${profile[i]! > profile[i - 1]! ? 'up' : 'down'} (${Math.abs(profile[i]! - profile[i - 1]!).toFixed(1)}") – Climb, Jump or use a Ladder`);
    }
    if (!pathFreeOfEnemies(state, model, to)) return no('PATH_ENEMY', PROBLEM_TEXT.PATH_ENEMY);
  } else {
    const blocked = checkPath(state, model, to, hasTrait(model, 'Trample'));
    if (blocked) return no(blocked, PROBLEM_TEXT[blocked]);
  }
  const leash = guardLeash(state, model, to);
  if (leash) return no('LEASH', leash);
  const cost = round2(moveCost(state, model, to) + ladder);
  const spent = reaction ? reaction.moved : retreat ? (a.retreated ?? 0) : a.action === 'dodge' ? a.dodged : a.moved;
  // Crouched or Engaged models may only Walk. Hit and Retreat cancels Engaged in the Movement Step.
  const walkOnly = bonus !== null || model.states.includes('Crouched') || (model.states.includes('Engaged') && !hasSkill(model, 'Hit and Retreat'));
  const limit = reacting ? Math.ceil(spd / 2) : walkOnly || retreat ? spd : spd * 2;
  if (spent + cost > limit + 0.005) {
    const left = Math.max(0, round2(limit - spent));
    return no('TOO_FAR', `That costs ${cost.toFixed(1)}" of movement – ${left.toFixed(1)}" left`);
  }
  const mode: MoveMode = reacting ? 'react' : retreat ? 'retreat' : spent + cost > spd + 0.005 ? 'run' : 'walk';
  return { ok: true, mode, cost, spent, walk: spd, limit, z: flying ? (model.z ?? 0) : zTo };
}

/**
 * A Movement outside an Activation: a Ranger's Normal Movement in the End Phase of its Active turn (once the last
 * Activation is ended), or one of up to 3 Helian League models on Surge Order in the Strategic Phase.
 */
export function bonusMove(state: TableState, model: Model): 'ranger' | 'surge' | null {
  if (state.phase !== 'playing' || state.activation || state.pendingTurn || model.side !== state.active || isOut(model)) return null;
  if (!state.acted) {
    const s = state.surge;
    return s && s.side === model.side && profileOf(model).faction === 'Helian League' && (s.ids.includes(model.id) || s.ids.length < 3) ? 'surge' : null;
  }
  return hasClass(model, 'Ranger') ? 'ranger' : null;
}

/** Personal Guard: the creature may not fully leave its summoner's Awareness. */
function guardLeash(state: TableState, model: Model, to: Pt): string | null {
  if (!model.summonedBy || !(model.upgrades ?? []).includes(GUARD)) return null;
  const lord = state.models.find((m) => m.id === model.summonedBy);
  if (!lord || isOut(lord)) return null;
  return gap({ ...model, x: to.x, y: to.y }, lord) > awareness(modelStats(lord)) + CONTACT ? `Personal Guard: ${model.name} may not fully leave ${lord.name}'s Awareness` : null;
}

/** Enemy models block the way (allies let a model pass); models at another height do not. */
function pathFreeOfEnemies(state: TableState, model: Model, to: Pt): boolean {
  const r = baseRadius(model.size);
  const trample = hasTrait(model, 'Trample');
  return !state.models.some((m) => m.side !== model.side && !m.states.includes('Dead') && !(trample && baseRadius(m.size) < r) && Math.abs((m.z ?? 0) - (model.z ?? 0)) < baseHeight(m.size) && distToSegment(m, model, to) < r + baseRadius(m.size) - 0.02);
}

/**
 * How deep this model's Deployment Zone is, from its own table edge.
 * Tactician in the party: 5" more. Infiltration I: up to the middle line of the party's half.
 * Infiltration II: anywhere outside the opponent's Deployment Zone.
 */
export function deployDepthFor(state: TableState, model: Pick<Model, 'side' | 'profileId' | 'upgrades'>): number {
  const has = (m: Pick<Model, 'profileId' | 'upgrades'>, name: string) => hasSkill(m, name) || hasTrait(m, name);
  const zone = (side: Side) => state.deployDepth + (state.models.some((m) => m.side === side && has(m, 'Tactician')) || (side === model.side && has(model, 'Tactician')) ? 5 : 0);
  const own = Math.min(zone(model.side), state.height / 2);
  if (hasSkill(model, 'Infiltration II')) return Math.max(own, state.height - Math.min(zone(other(model.side)), state.height / 2));
  if (hasSkill(model, 'Infiltration I')) return Math.max(own, state.height / 4);
  return own;
}

// ---- the Action Step ----

/** Models that may step in for `ward` with Protector: an ally within half their SPD, with an AP to spend. */
function protectorsFor(state: TableState, ward: Model): Model[] {
  return state.models.filter(
    (p) => p.side === ward.side && p.id !== ward.id && p.side !== state.active && !isOut(p) && p.ap >= 1 && hasSkill(p, 'Protector') && !p.states.includes('Immobilized') && gap(p, ward) <= modelStats(p).spd / 2 + CONTACT,
  );
}

/** Where the Protector ends up: in Base Contact with its ally, as close to where it stood as there is room. */
function protectSpot(state: TableState, p: Model, ward: Model): Pt | null {
  const r = baseRadius(p.size) + baseRadius(ward.size) + 0.01;
  const base = Math.atan2(p.y - ward.y, p.x - ward.x);
  for (let i = 0; i < 24; i++) {
    const angle = base + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12);
    const to = { x: round2(ward.x + Math.cos(angle) * r), y: round2(ward.y + Math.sin(angle) * r) };
    if (checkPlacement(state, p.size, to.x, to.y, p.id) === null && dist(p, to) <= modelStats(p).spd / 2 + 2 * baseRadius(p.size) + 0.5) return to;
  }
  return null;
}

/** Resolution Step for the activated model's Action, with everything that hangs on it. */
function resolveEvents(state: TableState, ctx: DecideContext, action: 'attack' | 'dodge' | 'nothing', weapon: number, target: Model | null, m: Mods, redirected: boolean, area?: { label: string; victims: string[] }, split?: { id: string; n: number }[]): EventBody[] {
  const a = state.activation!;
  const active = findModel(state, a.id);
  // Knockback: the attacker's chosen direction, or away from a Circular template's centre.
  const kbDir = m.push && target ? { [target.id]: { x: m.push.x - target.x, y: m.push.y - target.y } } : undefined;
  const kbFrom = area && target && /Circular/.test(area.label) ? { x: target.x, y: target.y } : undefined;
  const res = resolveAction(state, active, action, weapon, target, m, a.reactions, ctx.d20, a.moved, { seen: a.seen ? new Set(a.seen) : undefined, redirected, area, split, kbDir, kbFrom });
  const flank = target !== null && !area && !sight(state, target, active).los;
  // What the table shows: the weapon or Spell, and whom it took effect on (wounded, or newly in a State).
  const item = action === 'attack' ? weaponAt(active, weapon) : null;
  const struck = new Set(res.dealt.filter((d) => d.by === active.id && d.wounds > 0).map((d) => d.to));
  for (const r of res.results) {
    const before = state.models.find((x) => x.id === r.id);
    if (before && before.id !== active.id && before.side !== active.side && r.states.some((st) => !before.states.includes(st))) struck.add(r.id);
  }
  const fx = item && target ? { fx: { from: active.id, name: item.name, at: { x: target.x, y: target.y }, hit: [...struck] } } : {};
  const out: EventBody[] = [{ type: 'ACTION_RESOLVED', action, lines: res.lines, results: res.results, used: res.used, dealt: res.dealt, ...(res.mana.length ? { mana: res.mana } : {}), ...kitOf(res), ...(flank ? { flank } : {}), ...fx }];
  // Haze Bomb: where its template lands the area is a Hazy Environment until the user's next Strategic Phase.
  if (item?.name === 'Haze Bomb' && res.placed && target) {
    const tpl = areaOf(item);
    out.push({ type: 'TERRAIN_ADDED', piece: { id: `h${state.round}${state.active}-${active.id}-${state.terrain.length}-${state.log.length}`, kind: 'area', env: 'magic', name: HAZE, shape: ngon(target.x, target.y, tpl && tpl.shape === 'circle' ? tpl.r : ZONE_RADIUS, 24), height: 0, caster: active.id, until: active.side === 0 ? 'blue' : 'red' } });
  }
  // Awaiting Reinforcements: attacking in round 1 breaks the ceasefire.
  if (state.quest === 'awaiting-reinforcements' && state.round === 1) {
    if (action === 'attack') out.push({ type: 'QUEST_SCORED', team: active.side, delta: -4, text: 'Ceasefire broken in round 1' });
    if (Object.values(a.reactions).some((r) => r.intent === 'attack')) out.push({ type: 'QUEST_SCORED', team: other(active.side), delta: -4, text: 'Ceasefire broken in round 1' });
  }
  return out;
}

// ---- summoned creatures (Conjuration) ----

/** Conjuration Spell -> the creature card it brings. */
export const SUMMONS: Record<string, string> = {
  'Summon Gargoyle': 'sum-gargoyle',
  'Summon Golem': 'sum-golem',
  'Summon Earth Elemental': 'sum-earth-elemental',
  'Summon Colossus': 'sum-colossus',
  'Summon Water Elemental': 'sum-water-elemental',
};

export const isSummoned = (m: Model): boolean => !!m.summonedBy || !!profileById(m.profileId)?.summoned;

/** Combined Summoning Limit (Tiers) of the creatures this caster has on the field. */
export function summonLoad(state: TableState, caster: Model): number {
  return state.models
    .filter((m) => m.summonedBy === caster.id && !m.states.includes('Dead') && !m.boons?.some((b) => b.fx.unbound))
    .reduce((n, m) => n + (profileById(m.profileId)?.tier ?? 1), 0);
}

/** Mana a Conjuration Spell costs this caster (Refined Conjuration takes 1 off). */
export const conjureCost = (caster: Model, spell: Spell): number => Math.max(0, (spell.mana ?? 0) - (caster.boons ?? []).reduce((n, b) => n + (b.fx.conjure ?? 0), 0));

/** Where a summoned creature may appear: in Base Contact with its caster, anywhere in Awareness with a Staff of Conjuration. */
export function summonSpotProblem(state: TableState, caster: Model, profile: Profile, at: Pt, start = false): string {
  const r = baseRadius(profile.size);
  const gapTo = dist(caster, at) - baseRadius(caster.size) - r;
  const staff = start || profileOf(caster).weapons.some((w) => w.name === 'Staff of Conjuration');
  const aware = awareness(modelStats(caster));
  if (staff ? gapTo > aware + 0.05 : gapTo > CONTACT + 0.05) return staff ? `Place it within ${caster.name}'s Awareness (${aware}")` : `Place it in Base Contact with ${caster.name}`;
  const spot = checkPlacement(state, profile.size, at.x, at.y);
  return spot ? PROBLEM_TEXT[spot] : '';
}

/** Spots in Base Contact around a model, for creatures that appear there. */
function spotsAround(state: TableState, centre: Model, size: Profile['size'], n: number): Pt[] {
  const out: Pt[] = [];
  let world = state;
  const r = baseRadius(centre.size) + baseRadius(size) + 0.03;
  for (let deg = 0; deg < 360 && out.length < n; deg += 20) {
    const p = { x: round2(centre.x + Math.sin((deg * Math.PI) / 180) * r), y: round2(centre.y - Math.cos((deg * Math.PI) / 180) * r) };
    if (checkPlacement(world, size, p.x, p.y, centre.id)) continue;
    out.push(p);
    world = after(world, [{ type: 'MODEL_ADDED', model: { ...centre, id: `-spot-${out.length}`, size, x: p.x, y: p.y, states: [] } }]);
  }
  return out;
}

function summoned(state: TableState, caster: Model, profile: Profile, at: Pt, ap: number): EventBody {
  // Conjured Retinue: its Tier I and II creatures are Soldiers. Personal Guard: one of its creatures at a time is a Sentinel.
  const ups: string[] = [];
  if (profile.tier <= 2 && hasUpgrade(caster, 'san-conjured-retinue')) ups.push(RETINUE);
  if (hasUpgrade(caster, 'san-personal-guard') && !state.models.some((o) => o.summonedBy === caster.id && !o.states.includes('Dead') && (o.upgrades ?? []).includes(GUARD))) ups.push(GUARD);
  const m = newModel(state, caster.side, profile, round2(at.x), round2(at.y), false, ups);
  return { type: 'MODEL_ADDED', model: { ...m, ap, summonedBy: caster.id, facing: caster.facing } };
}

/** Ritual: a Conjuration Spell, cast without a roll in the Active Role. */
function ritualEvents(state: TableState, ctx: DecideContext, caster: Model, cmd: Extract<Command, { type: 'ACTION' }>): EventBody[] {
  const a = state.activation!;
  if (a.moved > modelStats(caster).spd + 0.005) fail('RAN', `${caster.name} ran – it can only declare Nothing`);
  const spell = spellsOf(profileOf(caster)).find((x) => x.name === cmd.spell && x.kind === 'Conjuration') ?? fail('BAD_VALUE', `${caster.name} knows no such Conjuration Spell`);
  const cost = conjureCost(caster, spell);
  if (cost > manaPool(state, caster)) fail('NO_MANA', `${spell.name} costs ${cost} Mana – ${caster.name} has ${manaPool(state, caster)}`);
  const sta = modelStats(caster).sta;
  const load = summonLoad(state, caster);
  if (load >= sta) fail('LIMIT', `${caster.name}'s Summoning Limit is full (${load} of STA ${sta})`);
  const out: EventBody[] = [];
  const lines: { text: string; dice?: DiceResult }[] = [];
  if (spell.name === 'Raise the Undead') {
    const dead = findModel(state, typeof cmd.dead === 'string' ? cmd.dead : '');
    if (!dead.states.includes('Dead')) fail('BAD_TARGET', `${dead.name} is not Dead`);
    if (gap(caster, dead) > awareness(modelStats(caster)) + 0.005) fail('BAD_TARGET', `${dead.name} is outside ${caster.name}'s Casting Aura`);
    const picks = (Array.isArray(cmd.picks) ? cmd.picks : []).map((id) => PROFILES.find((p) => p.id === id && p.faction === 'Undead') ?? fail('BAD_VALUE', 'Choose Undead to raise'));
    const ok = (picks.length === 1 && picks[0]!.tier <= 2) || (picks.length === 2 && picks.every((p) => p.tier === 1));
    if (!ok) fail('BAD_VALUE', 'Raise up to 2 Tier I Undead or 1 Tier II Undead');
    let world = state;
    for (const p of picks) {
      const spot = spotsAround(world, dead, p.size, 1)[0] ?? fail('NO_ROOM', `No room for a ${p.name} around ${dead.name}`);
      const ev = summoned(world, caster, p, spot, p.sta);
      out.push(ev);
      world = after(world, [ev]);
    }
    out.push({ type: 'MODEL_REMOVED', id: dead.id, why: `its body raised by ${caster.name}` });
    lines.push({ text: `${caster.name} performs a Ritual: ${spell.name} – ${picks.map((p) => p.name).join(' and ')} rise from ${dead.name}` });
  } else {
    const pid = SUMMONS[spell.name];
    const profile = pid ? profileById(pid) : undefined;
    if (!profile) return fail('NO_CARD', `${spell.name}: the creature's card is not in the project files – add the model by hand`);
    const at = cmd.at && typeof cmd.at === 'object' ? { x: num(cmd.at.x, 0, state.width, 'x'), y: num(cmd.at.y, 0, state.height, 'y') } : fail('BAD_VALUE', 'Choose where the creature appears');
    const why = summonSpotProblem(state, caster, profile, at);
    if (why) fail('NO_ROOM', why);
    out.push(summoned(state, caster, profile, at, profile.sta));
    lines.push({ text: `${caster.name} performs a Ritual: ${spell.name}${cost ? ` (${cost} Mana)` : ''} – the ${profile.name} appears with ${profile.sta} AP` });
  }
  const world = after(state, out);
  const res = resolveAction(world, world.models.find((x) => x.id === caster.id) ?? caster, 'nothing', 0, null, NO_MODS, a.reactions, ctx.d20, a.moved, { seen: a.seen ? new Set(a.seen) : undefined });
  const mana = [...manaBill(state, caster, cost), ...res.mana];
  return [{ type: 'EFFECT', lines, results: [] }, ...out, { type: 'ACTION_RESOLVED', action: 'ritual', lines: res.lines, results: res.results, used: res.used, dealt: res.dealt, ...(mana.length ? { mana } : {}), ...kitOf(res) }];
}

/** Summoner: during deployment it may bring one Tier II or lower creature into its Awareness, free. */
function summonAtStart(state: TableState, ctx: DecideContext, cmd: Extract<Command, { type: 'SUMMON' }>): EventBody[] {
  const caster = findModel(state, cmd.id);
  if (!may(ctx, caster.side)) fail('NOT_YOURS', 'That model belongs to the other player');
  if (state.phase !== 'setup') fail('NOT_NOW', 'A Summoner brings its creature during deployment; in the game, summon with a Ritual Action');
  if (!hasClass(caster, 'Summoner')) fail('CANNOT_ACT', `${caster.name} is not a Summoner`);
  if (state.models.some((m) => m.summonedBy === caster.id)) fail('USED', `${caster.name} already has its creature`);
  const spell = spellsOf(profileOf(caster)).find((x) => x.name === cmd.spell && x.kind === 'Conjuration') ?? fail('BAD_VALUE', `${caster.name} knows no such Conjuration Spell`);
  const profile = profileById(SUMMONS[spell.name] ?? '') ?? fail('NO_CARD', `${spell.name}: the creature's card is not in the project files`);
  if (profile.tier > 2) fail('BAD_VALUE', 'A Summoner starts with a Tier II or lower creature');
  const at = cmd.at && typeof cmd.at === 'object' ? { x: num(cmd.at.x, 0, state.width, 'x'), y: num(cmd.at.y, 0, state.height, 'y') } : fail('BAD_VALUE', 'Choose where the creature stands');
  const why = summonSpotProblem(state, caster, profile, at, true);
  if (why) fail('NO_ROOM', why);
  return [summoned(state, caster, profile, at, 0)];
}

/** Creatures whose caster is down leave the field; a Construct or Elemental at 0 HP is removed. */
function summonCleanup(state: TableState): EventBody[] {
  const out: EventBody[] = [];
  for (const m of state.models) {
    const caster = m.summonedBy ? state.models.find((c) => c.id === m.summonedBy) : undefined;
    if (m.summonedBy && (!caster || isOut(caster))) out.push({ type: 'MODEL_REMOVED', id: m.id, why: `${caster?.name ?? 'its caster'} is down` });
    else if (m.hp === 0 && (hasTrait(m, 'Construct') || hasTrait(m, 'Elemental'))) out.push({ type: 'MODEL_REMOVED', id: m.id, why: 'HP 0' });
  }
  return out;
}

// ---- Mounts ----

const strategicWindow = (state: TableState, side: Side): boolean => state.phase === 'playing' && state.active === side && !state.activation && !state.acted && !state.pendingTurn;

function mountProblem(state: TableState, m: Model): void {
  const def = mountById(m.mount?.id) ?? fail('NO_MOUNT', `${m.name} has no Mount`);
  if (m.mount!.on) fail('MOUNTED', `${m.name} is already mounted`);
  if (isOut(m)) fail('CANNOT_ACT', `${m.name} cannot mount now`);
  if (m.states.includes('Engaged') || engagers(state, m).length > 0) fail('ENGAGED', `${m.name} is Engaged: it cannot mount`);
  if (checkPlacement(state, def.size, m.x, m.y, m.id)) fail('NO_ROOM', `There is no room for the ${def.name} here`);
}

/** Assist targeting itself in the Active Role: the Rider mounts. */
function mountAction(state: TableState, ctx: DecideContext, m: Model): EventBody[] {
  const a = state.activation!;
  if (a.moved > modelStats(m).spd + 0.005) fail('RAN', `${m.name} ran – it can only declare Nothing`);
  mountProblem(state, m);
  const up: EventBody[] = [{ type: 'MOUNTED', id: m.id, how: 'Assist' }];
  const world = after(state, up);
  const res = resolveAction(world, world.models.find((x) => x.id === m.id) ?? m, 'nothing', 0, null, NO_MODS, a.reactions, ctx.d20, a.moved, { seen: a.seen ? new Set(a.seen) : undefined });
  return [...up, { type: 'ACTION_RESOLVED', action: 'mount', lines: res.lines, results: res.results, used: res.used, dealt: res.dealt, ...(res.mana.length ? { mana: res.mana } : {}), ...kitOf(res) }];
}

/** A mounted Rider hit by Knockdown, or taken out, comes off its Mount. */
function mountChecks(state: TableState): EventBody[] {
  return state.models
    .filter((m) => m.mount?.on && (m.states.includes('Crouched') || isOut(m)))
    .map((m) => ({ type: 'DISMOUNTED', id: m.id, why: isOut(m) ? 'down' : 'knockdown' }));
}

// ---- Stratagems ----

/** The party Leader that may declare Stratagems for this side now, or why not. */
export function stratagemLeader(state: TableState, side: Side): { leader?: Model; why?: string } {
  const leader = state.models.find((m) => m.side === side && m.leader);
  if (!leader) return { why: 'This party has no Leader' };
  if (isOut(leader) && !hasTrait(leader, 'Undead II')) return { leader, why: `${leader.name} (Leader) is ${leader.states.includes('Dead') ? 'Dead' : 'Incapacitated'}: no more Stratagems` };
  if (state.phase !== 'playing' || state.active !== side || state.activation || state.acted) return { leader, why: 'Stratagems are declared in your Strategic Phase: at the start of your turn, before a model is activated' };
  if (state.stratBlocked === side) return { leader, why: 'Unconventional Tactics: your Leader failed its roll – no Stratagem this turn' };
  const used = state.stratUsed ?? [];
  const max = hasTrait(leader, 'Strategist') ? 2 : 1;
  if (used.length >= max) return { leader, why: max === 2 ? 'Two Stratagems already declared this turn' : 'A Stratagem has already been declared this turn' };
  return { leader };
}

/** Whether a Stratagem may affect this model (before the player's pick). */
export function stratagemFits(state: TableState, leader: Model, st: Stratagem, m: Model): boolean {
  const enemy = st.enemy || st.who === 'enemies';
  if (!st.anySide && (enemy ? m.side === leader.side : m.side !== leader.side)) return false;
  const o = st.only ?? {};
  const dead = m.states.includes('Dead');
  if (o.dead ? !dead : dead && !st.raise) return false;
  if (o.standing && isOut(m)) return false;
  if (st.kind === 'Authority' && !st.anyAffiliation && !enemy && !st.anySide) {
    const own = profileOf(m).faction === profileOf(leader).faction || (m.upgrades ?? []).includes('neu-camaraderie');
    if (!own) return false;
  }
  if (o.classes && !o.classes.some((c) => hasClass(m, c))) return false;
  if (o.traits && !o.traits.some((t) => hasTrait(m, t))) return false;
  if (o.faction && profileOf(m).faction !== o.faction) return false;
  if (o.others && m.id === leader.id) return false;
  if (o.maxAp !== undefined && m.ap > o.maxAp) return false;
  if (o.summoned && !m.summonedBy) return false;
  if (o.aware && m.id !== leader.id && gap(leader, m) > awareness(modelStats(leader)) + 0.005) return false;
  return true;
}

const CANCELLABLE: StateName[] = ['Panicked', 'Bleeding', 'Poisoned', 'Weakened', 'Crippled', 'Confused', 'Blinded', 'Immobilized', 'Slowed', 'Fatigued'];

/** The models whose States the First Aid of `m` could remove right now: Alive, of its party, within its Awareness. */
export function firstAidTargets(state: TableState, m: Model): Model[] {
  return state.models.filter((t) => t.side === m.side && !isOut(t) && (t.id === m.id || gap(m, t) <= awareness(modelStats(m)) + CONTACT) && t.states.some((x) => CANCELLABLE.includes(x)));
}

function stratagemEvents(state: TableState, ctx: DecideContext, cmd: Extract<Command, { type: 'STRATAGEM' }>): EventBody[] {
  const side: Side = ctx.solo ? (cmd.side !== undefined ? side01(cmd.side) : state.active) : ctx.side;
  if (!may(ctx, side)) fail('NOT_YOURS', 'Only the player of that party declares its Stratagems');
  const { leader, why } = stratagemLeader(state, side);
  if (!leader || why) return fail('NOT_NOW', why ?? 'No Leader');
  const name = text(cmd.name, 60);
  if (!profileOf(leader).stratagems.includes(name)) fail('BAD_VALUE', `${leader.name} has no Stratagem called ${name}`);
  if ((state.stratUsed ?? []).includes(name)) fail('USED', `${name} has already been declared this turn`);
  const st = stratagemFor(leader.profileId ?? undefined, name) ?? fail('BAD_VALUE', `Unknown Stratagem ${name}`);
  const tag: 'blue' | 'red' = side === 0 ? 'blue' : 'red';
  const lines: { text: string; dice?: DiceResult }[] = [];
  const pool = state.models.filter((m) => stratagemFits(state, leader, st, m));
  let on: Model[] = [];
  if (st.who === 'self') on = [leader];
  else if (st.who === 'party' || st.who === 'enemies') on = pool;
  else if (st.who === 'pick') {
    const ids = Array.isArray(cmd.targets) ? [...new Set(cmd.targets.filter((x): x is string => typeof x === 'string'))] : [];
    if (ids.length === 0) fail('BAD_VALUE', `Choose ${st.max === 1 ? 'the model' : `up to ${st.max} models`} for ${name}`);
    if (ids.length > (st.max ?? 1)) fail('BAD_VALUE', `${name} affects up to ${st.max} model${st.max === 1 ? '' : 's'}`);
    on = ids.map((id) => findModel(state, id));
    for (const m of on) if (!pool.includes(m)) fail('BAD_TARGET', `${name} cannot be used on ${m.name}`);
  }
  const out: EventBody[] = [];
  const results: EffectResult[] = [];
  const grants: { id: string; fx: Boon }[] = [];
  const int = modelStats(leader).int;
  const leaderRoll = (label: string): boolean => {
    const r = rollDice(1, int, label, ctx.d20);
    lines.push({ text: `${leader.name} (Leader): ${label}, 1d20 vs INT ${int} – ${r.successes ? 'success' : 'failed'}`, dice: r });
    return r.successes === 1;
  };
  // Active Support / Hexcaller: one of the Leader's Enchantments.
  const charm = st.enchant ? spellsOf(profileOf(leader)).find((x) => x.name === cmd.spell && x.kind === 'Enchantment') ?? fail('BAD_VALUE', `Choose one of ${leader.name}'s Enchantments`) : undefined;
  let mana = 0;
  for (const m of on) {
    let hp = m.hp;
    let ap = m.ap;
    let states = [...m.states];
    const temp: Partial<Record<StateName, Until>> = { ...m.temp };
    const said: string[] = [];
    if (st.heal) {
      const needs = st.rollFor === 'incapacitated' ? m.states.includes('Incapacitated') : st.rollFor === 'living' ? !hasTrait(m, 'Undead') : false;
      if (!needs || leaderRoll(`${name} on ${m.name}`)) {
        const was = hp;
        if (st.raise && states.includes('Dead')) states = states.filter((x) => x !== 'Dead' && x !== 'Incapacitated');
        hp = Math.min(m.maxHp, hp + st.heal);
        if (hp > 0) states = states.filter((x) => x !== 'Incapacitated');
        if (hp !== was || states.length !== m.states.length) said.push(`HP ${was} → ${hp}${m.states.includes('Dead') && !states.includes('Dead') ? ', no longer Dead' : ''}`);
      }
    }
    if (st.ap) {
      ap += st.ap;
      said.push(`+${st.ap} AP`);
    }
    if (st.fatigue && !states.includes('Fatigued')) {
      states.push('Fatigued');
      temp.Fatigued = tag;
      said.push('Fatigued until its next Strategic Phase');
    }
    if (st.cancelState) {
      const gone = CANCELLABLE.find((x) => states.includes(x));
      if (gone) {
        states = states.filter((x) => x !== gone);
        delete temp[gone];
        said.push(`no longer ${gone}`);
      }
    }
    if (st.unshroud && states.includes('Shrouded')) {
      states = states.filter((x) => x !== 'Shrouded');
      said.push('no longer Shrouded');
    }
    // Sacred Vow: the Enchantments enemies put on the target go.
    if (st.purge) {
      const foul = (m.enchants ?? []).filter((e) => state.models.some((c) => c.id === e.caster && c.side !== m.side)).map((e) => e.name);
      if (foul.length) out.push({ type: 'DISENCHANTED', id: m.id, names: foul });
      said.push(foul.length ? `enemy Enchantments removed: ${foul.join(', ')}` : 'no enemy Enchantment on it');
    }
    // Dishearten: a halved M roll; only a failure lets the Stratagem take hold.
    let spared = false;
    if (st.halvedMorale) {
      if (!sight(state, leader, m).los) fail('NO_ATTACK', `${leader.name} has no line of sight to ${m.name}`);
      const target = Math.ceil(moraleOf(state, m).m / 2);
      const r = rollDice(1, target, `${name}, halved M`, ctx.d20);
      spared = (r.successes ?? 0) > 0;
      lines.push({ text: `${m.name}: ${name}, 1d20 vs halved M ${target} – ${spared ? 'holds firm' : 'loses 1 AP every turn'}`, dice: r });
    }
    if (st.confuse !== undefined) {
      const target = Math.max(0, intOf(state, m) + st.confuse);
      const r = rollDice(1, target, `${name}, INT ${st.confuse}`, ctx.d20);
      lines.push({ text: `${m.name}: ${name}, 1d20 vs INT ${st.confuse} = ${target} – ${r.successes ? 'resists' : 'Confused'}`, dice: r });
      if (!r.successes && !states.includes('Confused') && !immuneTo(m, 'Confused')) {
        states.push('Confused');
        temp.Confused = tag;
      }
    }
    if (charm) {
      if (m.side !== side && hasEnchant(m, 'Anointment')) lines.push({ text: `${m.name} is Anointed: ${charm.name} has no effect` });
      else out.push({ type: 'ENCHANTED', id: m.id, name: charm.name, until: tag, caster: leader.id });
    }
    if (st.harvest) mana += st.harvest;
    if (st.boon && !spared) {
      const fx: Boon = { ...st.boon };
      // Close Ranks: Warriors and Soldiers also gain Vigilance.
      if (name === 'Close Ranks' && (hasClass(m, 'Warrior') || hasClass(m, 'Soldier'))) fx.traits = ['Vigilance'];
      grants.push({ id: m.id, fx });
    }
    if (said.length) lines.push({ text: `${m.name}: ${said.join(', ')}` });
    if (hp !== m.hp || ap !== m.ap || states.length !== m.states.length || states.some((x) => !m.states.includes(x))) results.push({ id: m.id, hp, states, ap, temp });
  }
  if (st.byHand) lines.push({ text: `${name}: ${st.text} (apply by hand)` });
  const declared: EventBody = { type: 'STRATAGEM_DECLARED', seat: side, name, text: st.text, on: on.map((m) => m.id), grants, lines, ...(st.negate ? { negate: true } : {}) };
  const tail: EventBody[] = [];
  if (results.length) tail.push({ type: 'EFFECT', lines: [], results });
  tail.push(...out);
  if (st.harvest) {
    for (const m of on) tail.push({ type: 'MODEL_REMOVED', id: m.id });
    if (mana) tail.push({ type: 'MODEL_MANA', id: leader.id, ap: leader.ap, mana: (leader.mana ?? 0) + mana });
  }
  const other: Side = side === 0 ? 1 : 0;
  if (st.negate && ((state.strats ?? []).some((x) => x.seat === other) || state.models.some((m) => m.boons?.some((b) => b.from === other)))) tail.unshift({ type: 'STRATAGEMS_ENDED', seat: other, why: 'negated' });
  return [declared, ...tail];
}

// ---- casting on models (Enchantments, Healing) ----

/** What the caster rolls against for this Spell: INT; M for a Mystic; the better of both and +4 on Earth for a Druid. */
export function castAttr(state: TableState, caster: Model, spell: Spell): { attr: number; name: string; notes: string[] } {
  const stats = modelStats(caster);
  const notes: string[] = [];
  const druid = hasClass(caster, 'Druid');
  const useM = hasClass(caster, 'Mystic') || (druid && stats.m > stats.int);
  let attr = useM ? stats.m : stats.int;
  if (druid && spell.element === 'Earth') {
    attr += 4;
    notes.push('Druid +4');
  }
  const soldiers = soldierBonus(state, caster);
  if (soldiers) {
    attr += soldiers;
    notes.push(`Soldier +${soldiers}`);
  }
  return { attr, name: useM ? 'M' : 'INT', notes };
}

/** How many models the Spell may be cast on at once. */
export const castTargets = (caster: Model, spell: Spell): number => Math.max(1, spell.cast?.stk === 'STA' ? modelStats(caster).sta : Number(spell.cast?.stk ?? 1) || 1);

/** Why this model cannot be a target of the Spell right now ('' when it can). */
export function castProblem(state: TableState, caster: Model, spell: Spell, target: Model): string {
  const c = spell.cast;
  if (!c) return `${spell.name} is not cast on a model`;
  if (target.states.includes('Dead')) return `${target.name} is Dead`;
  if (target.id === caster.id) return '';
  if (caster.states.includes('Engaged') || engagers(state, caster).length > 0) return `${caster.name} is Engaged: it can only cast on itself`;
  if (spell.kind === 'Enchantment' && target.side !== caster.side && hasEnchant(target, 'Anointment')) return `${target.name} is Anointed: enemy Enchantments cannot target it`;
  const d = gap(caster, target) - CONTACT;
  const aura = c.rch === 'Casting Aura';
  const reach = aura ? modelStats(caster).ag : Number(c.rch) + (Number(c.rch) > 0 ? spellReach(caster) : 0);
  if (d > reach) return reach === 0 ? `${caster.name} must be in Base Contact with ${target.name}` : `${target.name} is out of Reach (${gap(caster, target).toFixed(1)}", Reach ${reach}")`;
  if (!aura && !sight(state, caster, target).los) return `No line of sight to ${target.name}`;
  return '';
}

function castEvents(state: TableState, ctx: DecideContext, caster: Model, name: unknown, ids: unknown, opts: Mods): EventBody[] {
  const a = state.activation!;
  if (a.moved > modelStats(caster).spd + 0.005) fail('RAN', `${caster.name} ran – it can only declare Nothing`);
  const spell = spellsOf(profileOf(caster)).find((x) => x.name === name && x.cast) ?? fail('BAD_VALUE', `${caster.name} cannot cast that Spell on a model`);
  const c = spell.cast!;
  const cost = spell.mana ?? 0;
  if (cost > manaPool(state, caster)) fail('NO_MANA', `${spell.name} costs ${cost} Mana – ${caster.name} has ${manaPool(state, caster)}`);
  const list = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === 'string'))] : [];
  if (list.length === 0) fail('BAD_VALUE', 'Choose a model to cast the Spell on');
  const max = castTargets(caster, spell);
  if (list.length > max) fail('BAD_VALUE', `${spell.name} can be cast on ${max} model${max === 1 ? '' : 's'}`);
  const targets = list.map((id) => findModel(state, id));
  for (const t of targets) {
    const why = castProblem(state, caster, spell, t);
    if (why) fail('NO_ATTACK', why);
  }
  const base = castAttr(state, caster, spell);
  const lines: { text: string; dice?: DiceResult }[] = [];
  const results: EffectResult[] = [];
  const charms: EventBody[] = [];
  const fx = c.fx ?? {};
  let reroll = hasClass(caster, 'Wizard') && spell.element === 'Elder';
  // Sorcerer: one failed roll of a Sorcery (cast in the Active Role). Mage: an unspent Activation Point for the failed dice.
  let sorcerer = hasClass(caster, 'Sorcerer') && spell.kind === 'Sorcery';
  const mage = opts.mage === true && hasClass(caster, 'Mage') && caster.ap >= 1;
  let magePaid = false;
  for (const t of targets) {
    const ally = t.side === caster.side;
    const free = ally && ((spell.kind === 'Enchantment' && hasClass(caster, 'Enchanter')) || (spell.kind === 'Healing' && hasClass(caster, 'Vitalist') && !t.states.includes('Incapacitated')));
    const on = t.id === caster.id ? 'itself' : t.name;
    if (free) lines.push({ text: `${caster.name} casts ${spell.name} on ${on} – no roll (${spell.kind === 'Healing' ? 'Vitalist' : 'Enchanter'})` });
    else {
      // Casting Aura without line of sight: the casting attribute is halved.
      const blind = c.rch === 'Casting Aura' && t.id !== caster.id && !sight(state, caster, t).los;
      const attr = blind ? Math.ceil(base.attr / 2) : base.attr;
      const why = [...base.notes, ...(blind ? ['no line of sight: halved'] : [])];
      let roll = rollDice(1, attr, `${spell.name}, ${base.name}`, ctx.d20);
      lines.push({ text: `${caster.name} casts ${spell.name} on ${on}: 1d20 vs ${base.name} ${attr}${why.length ? ` (${why.join(', ')})` : ''} – ${roll.successes ? 'success' : 'failed'}`, dice: roll });
      if (!roll.successes && reroll) {
        reroll = false;
        roll = rollDice(1, attr, `${spell.name}, reroll`, ctx.d20);
        lines.push({ text: `Wizard: rerolled – ${roll.successes ? 'success' : 'failed'}`, dice: roll });
      } else if (!roll.successes && sorcerer) {
        sorcerer = false;
        roll = rollDice(1, attr, `${spell.name}, reroll`, ctx.d20);
        lines.push({ text: `Sorcerer: rerolled – ${roll.successes ? 'success' : 'failed'}`, dice: roll });
      } else if (!roll.successes && mage) {
        roll = rollDice(1, attr, `${spell.name}, reroll`, ctx.d20);
        lines.push({ text: `Mage${magePaid ? '' : ' (1 AP spent)'}: rerolled – ${roll.successes ? 'success' : 'failed'}`, dice: roll });
        magePaid = true;
      }
      if (!roll.successes) continue;
    }
    let hp = t.hp;
    let ap = t.ap;
    let states = [...t.states];
    const temp: Partial<Record<StateName, Until>> = { ...t.temp };
    const said: string[] = [];
    const drop = (names: string[]) => {
      const gone = states.filter((x) => names.includes(x) && !(x === 'Poisoned' && hasEnchant(t, 'Curse of Decay')));
      states = states.filter((x) => !gone.includes(x));
      for (const g of gone) delete temp[g];
      if (gone.length) said.push(`no longer ${gone.join(', ')}`);
    };
    const mend = (n: number) => {
      const to = Math.min(t.maxHp, hp + n);
      if (to === hp) return;
      said.push(`HP ${hp} → ${to}`);
      // Back on its feet: no longer Incapacitated (A Second Chance also returns 1 AP).
      if (hp === 0 && states.includes('Incapacitated')) {
        states = states.filter((x) => x !== 'Incapacitated');
        if (spell.name === 'A Second Chance') {
          ap += 1;
          said.push('+1 AP');
        }
      }
      hp = to;
    };
    if (fx.healOrCure) {
      if (hp < t.maxHp) mend(1);
      else drop(fx.cure ?? []);
    } else {
      if (fx.heal !== undefined) mend(fx.heal === 'full' ? t.maxHp : fx.heal);
      if (fx.cure) drop(fx.cure);
    }
    if (fx.ap && ap === 0) {
      ap += fx.ap;
      said.push(`+${fx.ap} AP`);
    } else if (fx.ap) said.push('it still has Activation Points: no effect');
    if (fx.give && !states.includes(fx.give as StateName) && !immuneTo(t, fx.give as StateName)) {
      states.push(fx.give as StateName);
      said.push(`is ${fx.give}`);
    }
    if (fx.dispel && t.enchants?.length) charms.push({ type: 'DISENCHANTED', id: t.id, names: t.enchants.map((e) => e.name) });
    if (spell.kind === 'Enchantment') {
      if (t.side !== caster.side && hasBoon(t, (b) => b.warded)) said.unshift(`${spell.name} has no effect (Sacred Vow)`);
      else {
        charms.push({ type: 'ENCHANTED', id: t.id, name: spell.name, until: caster.side === 0 ? 'blue' : 'red', caster: caster.id });
        said.unshift(`enchanted: ${spell.name}`);
      }
    }
    if (said.length) lines.push({ text: `${t.name}: ${said.join(', ')}` });
    if (hp !== t.hp || ap !== t.ap || states.length !== t.states.length) results.push({ id: t.id, hp, states, ap, temp });
  }
  // The Spell takes effect, then the Reactions against the caster are resolved as with any other Action.
  const cast: EventBody[] = [...(magePaid ? [{ type: 'MODEL_AP', id: caster.id, ap: caster.ap - 1 } as EventBody] : []), { type: 'EFFECT', lines, results }, ...charms];
  const world = after(state, cast);
  const res = resolveAction(world, world.models.find((x) => x.id === caster.id) ?? caster, 'nothing', 0, null, NO_MODS, a.reactions, ctx.d20, a.moved, { seen: a.seen ? new Set(a.seen) : undefined });
  const mana = [...manaBill(state, caster, cost), ...res.mana];
  return [...cast, { type: 'ACTION_RESOLVED', action: 'cast', lines: res.lines, results: res.results, used: res.used, dealt: res.dealt, ...(mana.length ? { mana } : {}), ...kitOf(res) }];
}

// ---- Transmutation: Spells that change the ground ----

export const QUEST_VP_LIMIT = 10;

/** Circular L. */
const ZONE_RADIUS = 120 / 25.4 / 2;
export const ZONES: Record<string, { reach: number; water: boolean; rain?: boolean; word?: boolean; cure?: StateName[] }> = {
  'Greater Cure': { reach: 16, water: false, cure: ['Bleeding', 'Blinded', 'Confused', 'Crippled', 'Poisoned', 'Slowed', 'Weakened'] },
  'Blessed Rain': { reach: 0, water: true, rain: true },
  Downpour: { reach: 16, water: true },
  'Primordial Word': { reach: 0, water: false, word: true },
};

/** Models Primordial Word wounds and pushes out: Summoned, Undead, and those with the Profane or Divine Element. */
const banished = (m: Model): boolean => isSummoned(m) || hasTrait(m, 'Undead') || profileOf(m).traits.some((t) => /^Affinity \([^)]*(Profane|Divine)/.test(t));

function zoneEvents(state: TableState, ctx: DecideContext, caster: Model, name: string, at: unknown, opts: Mods): EventBody[] {
  const a = state.activation!;
  const z = ZONES[name]!;
  if (a.moved > modelStats(caster).spd + 0.005) fail('RAN', `${caster.name} ran – it can only declare Nothing`);
  const spell = spellsOf(profileOf(caster)).find((x) => x.name === name) ?? fail('BAD_VALUE', `${caster.name} cannot cast that Spell`);
  const cost = spell.mana ?? 0;
  if (cost > manaPool(state, caster)) fail('NO_MANA', `${spell.name} costs ${cost} Mana – ${caster.name} has ${manaPool(state, caster)}`);
  let centre: Pt = { x: caster.x, y: caster.y };
  if (z.reach > 0) {
    if (!isPt(at)) return fail('BAD_VALUE', 'Choose the spot the Spell is cast on');
    centre = { x: round2(Number(at.x)), y: round2(Number(at.y)) };
    const reach = z.reach + spellReach(caster);
    if (dist(caster, centre) - baseRadius(caster.size) > reach + 0.005) fail('NO_ATTACK', `That spot is out of range (${reach}")`);
    const ghost: Model = { ...caster, id: '-spot-', side: other(caster.side), x: centre.x, y: centre.y, size: 'small', states: [] };
    delete ghost.z;
    if (!sight(state, caster, ghost).los) fail('NO_ATTACK', `${caster.name} has no line of sight to that spot`);
  }
  const base = castAttr(state, caster, spell);
  let roll = rollDice(1, base.attr, `${spell.name}, ${base.name}`, ctx.d20);
  const lines: { text: string; dice?: DiceResult }[] = [{ text: `${caster.name} casts ${spell.name}: 1d20 vs ${base.name} ${base.attr}${base.notes.length ? ` (${base.notes.join(', ')})` : ''} – ${roll.successes ? 'success' : 'failed'}`, dice: roll }];
  // Alchemist: one failed Transmutation roll rerolled.
  if (!roll.successes && hasClass(caster, 'Alchemist')) {
    roll = rollDice(1, base.attr, `${spell.name}, reroll`, ctx.d20);
    lines.push({ text: `Alchemist: rerolled – ${roll.successes ? 'success' : 'failed'}`, dice: roll });
  }
  // Mage: an unspent Activation Point for the failed roll.
  let magePaid = false;
  if (!roll.successes && opts.mage === true && hasClass(caster, 'Mage') && caster.ap >= 1) {
    magePaid = true;
    roll = rollDice(1, base.attr, `${spell.name}, reroll`, ctx.d20);
    lines.push({ text: `Mage (1 AP spent): rerolled – ${roll.successes ? 'success' : 'failed'}`, dice: roll });
  }
  const made: EventBody[] = [];
  const results: EffectResult[] = [];
  if (roll.successes && z.cure) {
    // Greater Cure: the listed States leave every allied model the template touches.
    for (const m of state.models) {
      if (m.side !== caster.side || m.states.includes('Dead') || dist(m, centre) > ZONE_RADIUS + baseRadius(m.size)) continue;
      const gone = m.states.filter((x) => z.cure!.includes(x));
      if (gone.length === 0) continue;
      const temp = { ...m.temp };
      for (const g of gone) delete temp[g];
      results.push({ id: m.id, hp: m.hp, states: m.states.filter((x) => !gone.includes(x)), temp });
      lines.push({ text: `${m.name} is no longer ${gone.join(', ')}` });
    }
    if (results.length === 0) lines.push({ text: 'No allied model in the area had a State it removes' });
  } else if (roll.successes) {
    const tag = caster.side === 0 ? 'blue' : 'red';
    const old = z.rain || z.word ? state.terrain.filter((t) => t.caster === caster.id && t.name === spell.name).map((t) => t.id) : [];
    if (old.length) made.push({ type: 'TERRAIN_REMOVED', ids: old });
    const piece: TerrainPiece = {
      id: `z${state.round}${state.active}-${caster.id}-${state.terrain.length}-${state.log.length}`,
      kind: 'area',
      env: z.water ? 'water' : 'magic',
      name: spell.name,
      shape: ngon(centre.x, centre.y, ZONE_RADIUS, 24),
      height: 0,
      caster: caster.id,
      ...(z.rain ? { only: other(caster.side), cover: caster.side, until: tag } : {}),
    };
    made.push({ type: 'TERRAIN_ADDED', piece });
    lines.push({ text: z.rain ? 'Until its next Strategic Phase the area is Shallow Aquatic for its enemies and Light Cover for its allies' : z.water ? 'The area becomes a Shallow Aquatic Environment' : 'The area is hallowed while the caster stays inside it' });
    if (z.word) {
      // Wounded and moved to the outer edge, straight out from the caster.
      for (const m of state.models) {
        if (m.id === caster.id || m.states.includes('Dead') || !banished(m) || dist(m, centre) > ZONE_RADIUS + baseRadius(m.size)) continue;
        const now = woundOnce(m.hp, [...m.states], hasTrait(m, 'Undead'));
        const d = dist(m, centre);
        const out = ZONE_RADIUS + baseRadius(m.size) + 0.02;
        const dir = d < 1e-6 ? { x: 0, y: m.side === 0 ? 1 : -1 } : { x: (m.x - centre.x) / d, y: (m.y - centre.y) / d };
        let to: Pt | undefined;
        for (let e = out; e <= out + 3 && !to; e += 0.1) {
          const q = { x: round2(centre.x + dir.x * e), y: round2(centre.y + dir.y * e) };
          if (!checkPlacement(state, m.size, q.x, q.y, m.id, true)) to = q;
        }
        lines.push({ text: `${m.name} suffers 1 Wound${to ? ' and is driven out of the area' : ''}` });
        results.push({ id: m.id, ...now });
        if (to) made.push({ type: 'MODEL_MOVED', id: m.id, from: { x: m.x, y: m.y }, to, facing: m.facing, dist: round2(dist(m, to)), cost: 0, mode: 'free' });
      }
    }
  }
  const cast: EventBody[] = [...(magePaid ? [{ type: 'MODEL_AP', id: caster.id, ap: caster.ap - 1 } as EventBody] : []), { type: 'EFFECT', lines, results }, ...made];
  const world = after(state, cast);
  const res = resolveAction(world, world.models.find((x) => x.id === caster.id) ?? caster, 'nothing', 0, null, NO_MODS, a.reactions, ctx.d20, a.moved, { seen: a.seen ? new Set(a.seen) : undefined });
  const mana = [...manaBill(state, caster, cost), ...res.mana];
  return [...cast, { type: 'ACTION_RESOLVED', action: 'cast', lines: res.lines, results: res.results, used: res.used, dealt: res.dealt, ...(mana.length ? { mana } : {}), ...kitOf(res) }];
}

// ---- tokens (Treasure Hunt) ----

/** " A" or " B": which of the Quest's tokens this is, from its id. */
const tokenTag = (k: Marker): string => (/-(\d)$/.test(k.id) ? ` ${'ABCDEF'[Number(k.id.slice(-1)) - 1] ?? ''}` : '');

/** A base at `p` touches the token (a little slack, tokens are fiddly to hit exactly). */
export const touchesToken = (m: Pick<Model, 'size'>, p: Pt, k: Marker): boolean => dist(p, k) <= baseRadius(m.size) + MARKER_RADIUS + 0.15;

type EffectResult = { id: string; hp: number; states: StateName[]; ap?: number; temp?: Partial<Record<StateName, Until>> };

/**
 * A Sigil goes off: its Spell counts as cast, PW 14, Circular L around the token. Every model whose base the
 * template touches Dodges (one AG roll) or is hit.
 */
function sigilBlast(state: TableState, k: Marker, d20: () => number): EventBody[] {
  const spell = sigilByName(k.spell) ?? sigilByRoll(1);
  const lines: { text: string; dice?: DiceResult }[] = [{ text: `The Sigil goes off: ${spell.name} (PW ${SIGIL_PW}, ${spell.text})` }];
  const results: EffectResult[] = [];
  const has = (t: string) => spell.traits.includes(t);
  const burn = Number(spell.traits.find((t) => t.startsWith('Burn'))?.split(' ')[1] ?? 0);
  for (const m of state.models) {
    if (m.states.includes('Dead') || dist(m, k) > SIGIL_RADIUS + baseRadius(m.size) + 1e-6) continue;
    const stats = modelStats(m);
    if (!isOut(m)) {
      const dodge = rollDice(1, stats.ag, 'Dodge', d20);
      lines.push({ text: `${m.name} dodges ${spell.name}: 1d20 vs AG ${stats.ag} – ${dodge.successes ? 'success' : 'failed'}`, dice: dodge });
      if (dodge.successes) continue;
    }
    const states = [...m.states];
    const temp: Partial<Record<StateName, Until>> = { ...m.temp };
    let ap = m.ap;
    const give = (st: StateName, until?: Until) => {
      if (immuneTo(m, st) || states.includes(st)) return;
      states.push(st);
      if (until) temp[st] = until;
      lines.push({ text: `${m.name} is ${st}${until === 'turn' ? ' until the end of the turn' : ''}` });
    };
    if (has('Immobilize')) give('Immobilized');
    if (has('Stagger')) {
      ap = Math.max(0, ap - 1);
      lines.push({ text: `${m.name} loses 1 AP (Stagger)` });
    }
    const arm = has('Ignore Armor') ? 0 : has('Armor-Piercing') ? Math.ceil(stats.arm / 2) : stats.arm;
    const need = Math.max(0, SIGIL_PW - arm);
    const dmg = rollDice(spell.hits, need, 'Damage', d20);
    let wounds = dmg.successes ?? 0;
    lines.push({ text: `Damage on ${m.name} (${spell.name}): ${spell.hits}d20 vs PW ${SIGIL_PW} − ARM ${arm} = ${need} – ${wounds} Wound${wounds === 1 ? '' : 's'}`, dice: dmg });
    if (wounds > 0) {
      if (burn > 0) {
        const more = rollDice(burn, SIGIL_PW, 'Burn', d20);
        wounds += more.successes ?? 0;
        lines.push({ text: `Burn (${burn}) on ${m.name}: ${burn}d20 vs PW ${SIGIL_PW} – ${more.successes ?? 0} Wound${more.successes === 1 ? '' : 's'}`, dice: more });
      }
      if (has('Poison II')) {
        give('Weakened');
        give('Poisoned');
      }
      if (has('Panic')) give('Panicked', 'turn');
      if (has('Stun')) {
        const t = rollDice(1, stats.t, 'Stun, T', d20);
        lines.push({ text: `${m.name}: Stun, T ${stats.t} – ${t.successes ? 'resisted' : 'loses all AP'}`, dice: t });
        if (!t.successes) ap = 0;
      }
    }
    // A model cannot suffer more Wounds than it has HP.
    let now = { hp: m.hp, states };
    const taken = wounds === 0 ? 0 : m.hp > 0 ? Math.min(wounds, m.hp) : 1;
    for (let i = 0; i < taken; i++) now = woundOnce(now.hp, now.states, hasTrait(m, 'Undead'));
    if (taken > 0) lines.push({ text: `${m.name} suffers ${taken} Wound${taken === 1 ? '' : 's'}${now.states.includes('Dead') ? ' and is Dead' : now.states.includes('Incapacitated') ? ' and is Incapacitated' : ''} (HP ${now.hp}/${m.maxHp})` });
    for (const st of Object.keys(temp) as StateName[]) if (!now.states.includes(st)) delete temp[st];
    results.push({ id: m.id, hp: now.hp, states: now.states, ...(ap !== m.ap ? { ap } : {}), ...(Object.keys(temp).length > 0 || m.temp ? { temp } : {}) });
  }
  return [
    { type: 'EFFECT', lines, results },
    { type: 'MARKER_SET', id: k.id, kind: 'cache' },
  ];
}

/** The models a Trample runs over on the way a→b: smaller ones it moves through or touches. */
function trampled(state: TableState, m: Model, to: Pt): Model[] {
  return state.models.filter(
    (o) =>
      o.id !== m.id && !o.states.includes('Dead') && baseRadius(o.size) < baseRadius(m.size) && Math.abs((o.z ?? 0) - (m.z ?? 0)) < baseHeight(o.size) &&
      distToSegment(o, m, to) <= baseRadius(m.size) + baseRadius(o.size) + 0.02,
  );
}

/** Dice a Movement sets off (besides Fall Damage), for the dice window to ask for before the move is made. */
export interface MoveRoll {
  kind: 'trample' | 'intrigue' | 'sigil';
  /** The token or the first model concerned. */
  name: string;
  dice: number;
  target: number;
  attr: string;
  notes: string[];
}

export function moveRolls(state: TableState, m: Model, to: Pt, mode: MoveMode): MoveRoll | null {
  if (state.phase !== 'playing' || mode === 'free' || mode === 'deploy') return null;
  if (mode === 'run' && hasTrait(m, 'Trample')) {
    const hit = trampled(state, m, to);
    const up = hit.filter((o) => !isOut(o));
    if (up.length > 0) return { kind: 'trample', name: up[0]!.name, dice: up.length, target: modelStats(up[0]!).ag, attr: 'AG', notes: up.map((o) => `${o.name}: Dodge, AG ${modelStats(o).ag}`) };
    if (hit.length > 0) {
      const pw = modelStats(m).t;
      return { kind: 'trample', name: hit[0]!.name, dice: hit.length, target: Math.max(0, pw - modelStats(hit[0]!).arm), attr: 'PW − ARM', notes: hit.map((o) => `${o.name}: Damage, PW ${pw} − ARM ${modelStats(o).arm}`) };
    }
  }
  for (const k of state.markers) {
    if (!touchesToken(m, to, k)) continue;
    const blast = (): MoveRoll | null => {
      const near = state.models.filter((o) => !isOut(o) && dist(o.id === m.id ? to : o, k) <= SIGIL_RADIUS + baseRadius(o.size) + 1e-6);
      return near.length ? { kind: 'sigil', name: k.name, dice: near.length, target: modelStats(near[0]!).ag, attr: 'AG', notes: near.map((o) => `${o.name}: Dodge, AG ${modelStats(o).ag}`) } : null;
    };
    if (k.kind === 'intrigue') return { kind: 'intrigue', name: k.name, dice: 1, target: 20, attr: 'd20', notes: ['1–4 Inferno · 5–8 Glacier Circle · 9–12 Claws of Earth · 13–16 Thunderstorm · 17–18 Mass Mindbreak · 19 Corroding Embrace · 20 Smite'] };
    if (k.kind === 'sigil' && state.round >= 2) {
      const r = blast();
      if (r) return r;
    }
  }
  return null;
}

/** What the tokens do when a model has just moved to where it stands: Intrigue is revealed, a Sigil goes off. */
function tokenContact(state: TableState, modelId: string, d20: () => number): EventBody[] {
  const out: EventBody[] = [];
  for (const k0 of state.markers) {
    const now = after(state, out);
    const m = now.models.find((x) => x.id === modelId);
    const k = now.markers.find((x) => x.id === k0.id);
    if (!m || !k || isOut(m) || !touchesToken(m, m, k)) continue;
    if (k.kind === 'intrigue') {
      const roll = d20();
      out.push({ type: 'MARKER_REVEALED', id: k.id, spell: sigilByRoll(roll).name, roll, who: m.id });
      if (state.round >= 2) out.push(...sigilBlast(after(state, out), { ...k, kind: 'sigil', spell: sigilByRoll(roll).name }, d20));
    } else if (k.kind === 'sigil' && state.round >= 2) out.push(...sigilBlast(now, k, d20));
  }
  return out;
}

/** Victory Points a Quest hands out when the game ends. */
function questEnd(state: TableState): EventBody[] {
  if (state.quest !== 'treasure-hunt') return [];
  return state.models
    .filter((m) => standing(m) && (m.treasure ?? 0) > 0)
    .map((m): EventBody => ({ type: 'QUEST_SCORED', team: m.side, delta: 2 * m.treasure!, text: `${m.name} holds ${m.treasure === 1 ? 'a Treasure' : `${m.treasure} Treasures`}` }));
}

/** The game ends now: last Quest points, then the result. */
function finishEvents(state: TableState): EventBody[] {
  const last = questEnd(state);
  const vp = after(state, last).vp;
  return [...last, { type: 'GAME_FINISHED', winner: vp[0] === vp[1] ? 'draw' : vp[0] > vp[1] ? 0 : 1 }];
}

// ---- Panicked ----

/** Distance from the edge of a base at `p` to the nearest table edge, and the way there. */
function nearestEdge(state: TableState, m: Model, p: Pt): { room: number; dx: number; dy: number } {
  const options = [
    { d: p.x, dx: -1, dy: 0 },
    { d: state.width - p.x, dx: 1, dy: 0 },
    { d: p.y, dx: 0, dy: -1 },
    { d: state.height - p.y, dx: 0, dy: 1 },
  ].sort((a, b) => a.d - b.d);
  const best = options[0]!;
  return { room: Math.max(0, best.d - baseRadius(m.size)), dx: best.dx, dy: best.dy };
}

/**
 * A Panicked model failed its Morale roll on activating: Engaged, it stays (Idle and Dodge); otherwise the table
 * makes its Run towards the nearest edge. From a roof it first comes down (a Climb: the height counts double
 * against the Run). When the straight way is blocked it goes round, up to 60° to either side, as far as it can
 * get. If the Run would take it past the edge it is lost.
 */
function flight(state: TableState, m: Model): { fled: 'flee' | 'hold'; events: EventBody[] } {
  if (m.states.includes('Engaged') || engagers(state, m).length > 0 || m.states.includes('Immobilized')) return { fled: 'hold', events: [] };
  const spd = modelStats(m).spd;
  let limit = m.states.includes('Crouched') ? spd : spd * 2;
  const events: EventBody[] = [];
  const r = baseRadius(m.size);
  let at: Model = m;
  // Down from the scenery it stands on: the nearest spot on the ground where its base fits, edge-ward first.
  if ((m.z ?? 0) > 0.05) {
    const first = nearestEdge(state, m, m);
    const ways = [first, { dx: -first.dy, dy: first.dx }, { dx: first.dy, dy: -first.dx }, { dx: -first.dx, dy: -first.dy }];
    let best: { to: Pt; d: number } | null = null;
    for (const w of ways)
      for (let d = 0.25; d <= limit + 4 && (!best || d < best.d); d += 0.25) {
        const q = { x: round2(m.x + w.dx * d), y: round2(m.y + w.dy * d) };
        if (q.x < r || q.y < r || q.x > state.width - r || q.y > state.height - r) break;
        if (surfaceAt(state, q) > 0.05 || checkPlacement(state, m.size, q.x, q.y, m.id, true) !== null) continue;
        best = { to: q, d };
        break;
      }
    if (!best) return { fled: 'flee', events: [] };
    const cost = round2(Math.min(limit, best.d + (m.z ?? 0) * 2));
    events.push({ type: 'MODEL_MOVED', id: m.id, from: { x: m.x, y: m.y }, to: best.to, facing: facingTo(m, best.to), dist: round2(best.d), cost, mode: 'run', z: 0 });
    limit = round2(limit - cost);
    at = { ...m, x: best.to.x, y: best.to.y, z: 0 };
  }
  // The Run over the ground: straight for the edge if it can, otherwise round what is in the way.
  const edge = nearestEdge(state, at, at);
  const straight = Math.atan2(edge.dy, edge.dx);
  let run: { to: Pt; d: number; room: number; turn: number } | null = null;
  for (const turn of [0, 20, -20, 40, -40, 60, -60]) {
    const a = straight + (turn * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const whole = Math.min(limit, edge.room / Math.max(0.2, Math.cos((turn * Math.PI) / 180)) - 0.01);
    let open = false;
    for (let d = whole; d > 0.2; d -= 0.25) {
      const to = { x: round2(at.x + dx * d), y: round2(at.y + dy * d) };
      if (to.x < r || to.y < r || to.x > state.width - r || to.y > state.height - r) continue;
      if (checkPlacement(state, m.size, to.x, to.y, m.id) !== null || checkPath(state, at, to) !== null || moveCost(state, at, to) > limit + 0.005) continue;
      const room = nearestEdge(state, at, to).room;
      if (!run || room < run.room - 0.2) run = { to, d, room, turn };
      open = d === whole;
      break;
    }
    if (turn === 0 && open) break; // the straight way is open all the way
  }
  if (run) events.push({ type: 'MODEL_MOVED', id: m.id, from: { x: at.x, y: at.y }, to: run.to, facing: facingTo(at, run.to), dist: round2(run.d), cost: moveCost(state, at, run.to), mode: run.d > spd + 0.005 ? 'run' : 'walk' });
  // Past the edge: it had more Run left than room.
  const reached = run ? run.room : edge.room;
  if (reached < 0.05 && limit - (run ? moveCost(state, at, run.to) : 0) > 0.05) events.push({ type: 'MODEL_FLED', id: m.id }, { type: 'ACTIVATION_ENDED' });
  return { fled: 'flee', events };
}

// ---- who may react ----

/**
 * Note which enemies can see the activated model, and whose Awareness it is in, at its current spot
 * and along the way from `from` (sampled every half inch).
 */
function notice(state: TableState, a: Activation, active: Model, from: Pt): void {
  const seen = (a.seen ??= []);
  const near = (a.near ??= []);
  const steps = Math.max(1, Math.ceil(dist(from, active) / 0.5));
  for (const e of state.models) {
    if (e.side === active.side || isOut(e)) continue;
    const aware = modelStats(e).ag;
    for (let i = 0; i <= steps && !(seen.includes(e.id) && near.includes(e.id)); i++) {
      const ghost: Model = { ...active, x: from.x + ((active.x - from.x) * i) / steps, y: from.y + ((active.y - from.y) * i) / steps };
      if (!seen.includes(e.id) && sight(state, e, ghost).los) seen.push(e.id);
      if (!near.includes(e.id) && gap(e, ghost) <= aware + CONTACT) near.push(e.id);
    }
  }
}

export type ReactCheck = { ok: true; dodgeOnly: boolean; note: string } | { ok: false; reason: string };

/**
 * May `m` react to the activated model?
 * Line of sight at any point of the Movement: any Reaction. Only within Awareness: a Dodge.
 * Stealth: no Reaction without line of sight. A model Engaged by the activated model sees it.
 */
export function reactCheck(state: TableState, m: Model): ReactCheck {
  const a = state.activation;
  const active = a ? state.models.find((x) => x.id === a.id) : undefined;
  if (!a || !active) return { ok: false, reason: 'There is no Activation to react to' };
  // Tables saved before sightings were recorded: no check.
  if (!a.seen || !a.near) return { ok: true, dodgeOnly: false, note: '' };
  if (a.seen.includes(m.id) || sight(state, m, active).los || engagers(state, m).some((e) => e.id === active.id)) return { ok: true, dodgeOnly: false, note: '' };
  const stealth = profileOf(active).skills.some((x) => x.startsWith('Stealth'));
  if (a.near.includes(m.id)) {
    if (stealth) return { ok: false, reason: `${active.name} has Stealth: no Reaction without line of sight` };
    return { ok: true, dodgeOnly: true, note: `${m.name} has not seen ${active.name}, which is within its Awareness: only a Dodge, on halved AG` };
  }
  return { ok: false, reason: `${m.name} has had no line of sight to ${active.name} and it has not come within its Awareness` };
}

// ---- Schemes ----

/** Revealed in the owner's Strategic Phase: at the start of their turn, before a model is activated. */
const STRATEGIC_REVEAL = ['opportunistic-manipulation', 'stand-your-ground', 'open-aggression', 'pursuit-of-glory', 'unmatched-flanking', 'blood-for-blood', 'last-warning', 'relentless-advance', 'unhindered-expedition'];
type SchemeMoment = 'reveal' | 'end-phase' | 'next-strategic' | 'game-end';
const SCHEME_MOMENT: Record<string, SchemeMoment> = {
  'opportunistic-manipulation': 'reveal',
  'open-aggression': 'end-phase',
  'pursuit-of-glory': 'end-phase',
  'relentless-advance': 'end-phase',
  'unhindered-expedition': 'end-phase',
  'unmatched-flanking': 'end-phase',
  'stand-your-ground': 'next-strategic',
  'last-warning': 'next-strategic',
};

/** What the Scheme is worth right now, and why. null: the table cannot tell (Blood for Blood). */
function schemeValue(state: TableState, seat: Side, code: string): [number, string] | null {
  const sc = state.schemes[seat];
  const foe = other(seat);
  const mine = state.models.filter((m) => m.side === seat);
  const theirs = state.models.filter((m) => m.side === foe);
  const up = mine.filter(standing);
  const foes = theirs.filter(standing);
  const tally = state.tally[seat];
  const zone = (m: Model, side: Side) => inDeployZone(state, side, m.size, m.y, state.deployDepth, m.x);
  const cornerOf = (side: Side) => (side === 0 ? { x: 0, y: state.height } : { x: state.width, y: 0 });
  /** The whole base is outside the side's Deployment Zone. */
  const outside = (m: Model, side: Side) =>
    state.deploy === 'corner'
      ? dist(m, cornerOf(side)) - baseRadius(m.size) >= state.deployDepth - 1e-6
      : side === 0 ? m.y + baseRadius(m.size) <= state.height - state.deployDepth + 1e-6 : m.y - baseRadius(m.size) >= state.deployDepth - 1e-6;
  const beyond = (m: Model, side: Side) => (side === 0 ? m.y < state.height / 2 : m.y > state.height / 2);
  const count = (n: number, what: string, each = 1): [number, string] => [Math.min(3, n * each), `${n} ${what}`];
  switch (code) {
    case 'virtuous-commander':
      return count(up.length, 'of its models still standing');
    case 'no-quarter':
      return count(theirs.filter((m) => m.states.includes('Dead')).length, 'Dead enemy models');
    case 'peacekeeping-paragon':
      return count(foes.length, 'enemy models still standing');
    case 'engetsu-formation':
      return count(up.filter((m) => zone(m, seat)).length, 'of its models in its Deployment Zone');
    case 'breach-their-defenses':
      return count(up.filter((m) => zone(m, foe)).length, 'of its models in the enemy Deployment Zone', 2);
    case 'steadfast-expansion':
    case 'relentless-advance':
      return count(up.filter((m) => beyond(m, seat)).length, 'of its models beyond the middle of the field');
    case 'leave-unnoticed':
      return count(up.filter((m) => !foes.some((e) => sight(state, e, m).los)).length, 'of its models out of every enemy line of sight');
    case 'stalwart-defender': {
      const n = foes.filter((m) => zone(m, seat)).length;
      return [n === 0 ? 3 : 0, n === 0 ? 'no enemy in its Deployment Zone' : `${n} enemy model${n === 1 ? '' : 's'} in its Deployment Zone`];
    }
    case 'decisive-victory': {
      const all = mine.length > 0 && up.length === mine.length;
      return [all ? 3 : 0, all ? 'all its models are still standing' : `${mine.length - up.length} of its models are down`];
    }
    case 'assassination-contract': {
      const dead = theirs.some((m) => m.leader && m.states.includes('Dead'));
      return [dead ? 3 : 0, dead ? 'the enemy Leader is Dead' : 'the enemy Leader is not Dead'];
    }
    case 'strength-in-numbers':
      return [up.length > foes.length ? (up.length >= 2 * foes.length ? 3 : 2) : 0, `${up.length} standing against ${foes.length}`];
    case 'appear-weak':
      return count(tally.melee, 'Wounds dealt with Melee Attacks');
    case 'fierce-as-fire':
      return count(tally.reactive, 'Wounds dealt in Reaction');
    case 'head-hunt':
      return count(tally.deathblows, 'Death Blows');
    case 'martial-valor': {
      const n = tally.valor.length;
      return [n === 0 ? 0 : n === 1 ? 2 : 3, `${n} of its models Incapacitated a costlier enemy`];
    }
    case 'cunning-tenacity':
      return count(mine.filter((m) => !state.hurt.includes(m.id)).length, 'of its models never lost HP', 2);
    case 'open-aggression':
      return count(sc.count ?? 0, 'Wounds dealt this turn');
    case 'unmatched-flanking':
      return count(sc.count ?? 0, 'Attacks this turn against an enemy without line of sight');
    case 'pursuit-of-glory':
      return count(up.filter((m) => !up.some((o) => o.id !== m.id && gap(o, m) <= modelStats(o).ag + CONTACT)).length, 'of its models outside the Awareness of the rest of the party');
    case 'unhindered-expedition': {
      const out = up.filter((m) => outside(m, seat));
      const deep = out.some((m) => zone(m, foe));
      return [out.length >= 3 ? (deep ? 3 : 2) : 0, `${out.length} of its models outside its Deployment Zone${out.length >= 3 && deep ? ', one in the enemy zone' : ''}`];
    }
    case 'stand-your-ground':
      return count(up.filter((m) => !(sc.moved ?? []).includes(m.id)).length, 'of its models did not move');
    case 'last-warning':
      return [sc.attacked ? 0 : 3, sc.attacked ? 'one of its models declared an Attack' : 'none of its models declared an Attack'];
    case 'opportunistic-manipulation': {
      const got = [
        theirs.some((m) => !m.states.includes('Dead') && zone(m, foe)) && 'an enemy in the enemy Deployment Zone',
        theirs.some((m) => !m.states.includes('Dead') && !beyond(m, seat) && m.y !== state.height / 2) && 'an enemy on its half',
        mine.some((m) => m.states.includes('Incapacitated') && !m.states.includes('Dead') && beyond(m, seat)) && 'an Incapacitated ally on the enemy half',
      ].filter((x): x is string => typeof x === 'string');
      return [got.length, got.length ? got.join('; ') : 'none of the three conditions'];
    }
    default:
      return null;
  }
}

/**
 * The Schemes that are due at this moment.
 * - reveal: right after `seat` revealed one. end-phase: End Phase of `seat`'s turn. next-strategic: `seat`'s Strategic Phase.
 * - game-end (no seat): everything revealed and not counted yet.
 */
function schemesDue(state: TableState, moment: SchemeMoment, seat?: Side): EventBody[] {
  const out: EventBody[] = [];
  for (const s of [0, 1] as const) {
    const sc = state.schemes[s];
    if (!sc.revealed || sc.scored || (seat !== undefined && seat !== s)) continue;
    const when = SCHEME_MOMENT[sc.revealed] ?? 'game-end';
    const sameTurn = sc.at !== undefined && sc.at.round === state.round && sc.at.active === state.active;
    if (moment !== 'game-end') {
      if (when !== moment || !sc.at) continue;
      if (moment === 'end-phase' && !sameTurn) continue;
      if (moment === 'next-strategic' && sameTurn) continue;
    }
    const timed = when !== 'game-end';
    // A Scheme with its own moment that was only turned over when the game ended is worth nothing.
    const late = moment === 'game-end' && timed && (!sc.at || when !== 'next-strategic');
    const value = late ? ([0, 'it was not revealed in time'] as [number, string]) : schemeValue(state, s, sc.revealed);
    // Scheme points are written on the score sheet by the players; the table only says what it makes of the Scheme.
    out.push({ type: 'SCHEME_SCORED', seat: s, code: sc.revealed, delta: 0, text: value?.[1] ?? '', auto: value !== null, ...(value ? { worth: value[0] } : {}) });
  }
  return out;
}

// ---- turns ----

/** Upkeep: every model that can receives AP equal to its Stamina. The Active Player's Fatigued models recover first. */
function turnStart(state: TableState, round: number, active: Side): EventBody {
  const ap: Record<string, number> = {};
  const rested: string[] = [];
  for (const m of state.models) {
    let states = m.states;
    if (m.side === active && states.includes('Fatigued')) {
      rested.push(m.id);
      states = states.filter((s) => s !== 'Fatigued');
    }
    ap[m.id] = isOut(m) || states.includes('Fatigued') ? 0 : modelStats({ ...m, states }).sta;
    // Watchful: double AP in its Reactive Role.
    if (m.side !== active && (hasTrait(m, 'Watchful') || hasSkill(m, 'Watchful'))) ap[m.id]! *= 2;
    // Dishearten: 1 AP less every turn.
    const drain = (m.boons ?? []).reduce((n, b) => n + (b.fx.apDrain ?? 0), 0);
    if (drain) ap[m.id] = Math.max(0, ap[m.id]! - drain);
  }
  return { type: 'TURN_STARTED', round, active, ap, rested };
}

const isPt = (v: unknown): v is Pt => typeof v === 'object' && v !== null && Number.isFinite((v as Pt).x) && Number.isFinite((v as Pt).y);

function mods(v: unknown): Mods {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const one = (x: unknown, what: string) => (x === undefined || x === null ? 0 : int(x, -20, 20, what));
  return { hit: one(o.hit, 'Modifier'), stk: one(o.stk, 'Strike modifier'), pw: one(o.pw, 'Power modifier'), art: text(o.art, 40), ...(o.snipe === true ? { snipe: true } : {}), ...(o.luck === true ? { luck: true } : {}), ...(typeof o.ally === 'string' && o.ally.length <= 64 ? { ally: o.ally } : {}), ...(o.mage === true ? { mage: true } : {}), ...(isPt(o.push) ? { push: { x: Number(o.push.x), y: Number(o.push.y) } } : {}) };
}

/** The state as it will be once these events are applied (used to chain decisions inside one command). */
function after(state: TableState, bodies: EventBody[]): TableState {
  if (bodies.length === 0) return state;
  const copy = structuredClone(state);
  for (const b of bodies) apply(copy, { ...b, seq: copy.seq + 1, ts: 0, side: null, by: '' } as GameEvent);
  return copy;
}

/** Who becomes or stops being Engaged, given where everyone stands now. */
function engagement(state: TableState): EventBody[] {
  const on: string[] = [];
  const off: string[] = [];
  for (const m of state.models) {
    const is = engagers(state, m).length > 0;
    if (is !== m.states.includes('Engaged')) (is ? on : off).push(m.id);
  }
  return on.length + off.length > 0 ? [{ type: 'ENGAGEMENT', on, off }] : [];
}

/**
 * Close the Activation Sequence: Reactions that were declared but never answered are resolved,
 * Engaged is updated for the new positions, and the Activation ends.
 */
/** Taunted models that have not reacted yet: an Attack with the first weapon that can reach, otherwise a Dodge. */
function tauntReactions(state: TableState): EventBody[] {
  const a = state.activation;
  const active = a ? state.models.find((m) => m.id === a.id) : undefined;
  if (!a || !active) return [];
  const out: EventBody[] = [];
  for (const id of a.taunted ?? []) {
    const m = state.models.find((x) => x.id === id);
    if (!m || isOut(m) || m.ap < 1 || id in a.reactions) continue;
    const check = reactCheck(state, m);
    if (!check.ok) continue;
    const arm = check.dodgeOnly || m.states.includes('Blinded') ? undefined : attackOptions(m).find((o) => planAttack(state, m, active, o.index, NO_MODS, { reactive: true }).ok);
    out.push({ type: 'MODEL_REACTED', id, intent: arm ? 'attack' : 'dodge', weapon: arm ? arm.index : 0, mods: { ...NO_MODS }, taunt: true });
  }
  return out;
}

function closeActivation(state: TableState, ctx: DecideContext): EventBody[] {
  const a = state.activation;
  if (!a) return [];
  const out: EventBody[] = [];
  const active = state.models.find((m) => m.id === a.id);
  if (a.action === null && active && Object.values(a.reactions).some((r) => r.intent === 'attack')) {
    const res = resolveAction(state, active, 'nothing', 0, null, NO_MODS, a.reactions, ctx.d20, a.moved, { seen: a.seen ? new Set(a.seen) : undefined });
    out.push({ type: 'ACTION_RESOLVED', action: 'nothing', lines: res.lines, results: res.results, used: res.used, dealt: res.dealt, ...(res.mana.length ? { mana: res.mana } : {}), ...kitOf(res) });
  }
  // Charm II: the charmed models Walk their full SPD towards the charming model.
  for (const [id, r] of Object.entries(a.reactions)) {
    if (!r.drawn) continue;
    const now = after(state, out);
    const m = now.models.find((x) => x.id === id);
    const lure = now.models.find((x) => x.id === a.id);
    if (!m || !lure || isOut(m) || isOut(lure) || m.states.includes('Immobilized') || m.states.includes('Engaged')) continue;
    const to = walkToward(now, m, lure, modelStats(m).spd);
    const d = round2(dist(m, to));
    if (d < 0.05) continue;
    out.push({ type: 'EFFECT', lines: [{ text: `Charm II: ${m.name} walks towards ${lure.name}` }], results: [] }, { type: 'MODEL_MOVED', id: m.id, from: { x: m.x, y: m.y }, to, facing: facingTo(m, to), dist: d, cost: d, mode: 'free' });
  }
  out.push(...summonCleanup(after(state, out)));
  out.push(...engagement(after(state, out)), { type: 'ACTIVATION_ENDED' });
  return out;
}

/**
 * Strategic Phase of the Active Player, the rolls that need no decision:
 * Regeneration, Bleeding (T roll or a Wound), Poisoned (T −6 roll or a Wound), Recovery Check for Incapacitated
 * models (T roll: regain 1 HP and become Weakened).
 */
function strategic(state: TableState, side: Side, d20: () => number): EventBody[] {
  const tag = side === 0 ? 'blue' : 'red';
  // This player's Stratagems end; Unconventional Tactics: its Leader rolls to be allowed a new one.
  const head: EventBody[] = [];
  if ((state.strats ?? []).some((x) => x.seat === side) || state.models.some((m) => m.boons?.some((b) => b.from === side))) head.push({ type: 'STRATAGEMS_ENDED', seat: side, why: 'ends' });
  if (state.stratCheck === side) {
    const leader = state.models.find((m) => m.side === side && m.leader && !isOut(m));
    if (leader) {
      // The Soldier bonus counts for both.
      const st = { m: modelStats(leader).m + soldierBonus(state, leader), int: intOf(state, leader) };
      const use = st.m > st.int ? 'M' : 'INT';
      const roll = rollDice(1, Math.max(st.m, st.int), 'Unconventional Tactics', d20);
      head.push({ type: 'STRATAGEM_CHECK', seat: side, ok: roll.successes === 1, text: `${leader.name} (Leader): Unconventional Tactics, 1d20 vs ${use} ${Math.max(st.m, st.int)} – ${roll.successes ? 'it may declare a Stratagem' : 'no Stratagem this turn'}`, dice: roll });
    } else head.push({ type: 'STRATAGEM_CHECK', seat: side, ok: true, text: 'Unconventional Tactics: no Leader standing to roll', dice: { dice: [], target: 0, successes: 0, crits: 0, label: '' } });
  }
  if (head.length) state = after(state, head);
  // Enchantments last until their caster's next Strategic Phase.
  const ended: EventBody[] = state.models
    .filter((m) => m.enchants?.some((e) => e.until === tag))
    .map((m) => ({ type: 'DISENCHANTED', id: m.id, names: m.enchants!.filter((e) => e.until === tag).map((e) => e.name), why: 'ends' }));
  if (ended.length) state = after(state, ended);
  // Blessed Rain ends with its caster's next Strategic Phase.
  const dried = state.terrain.filter((t) => t.until === tag).map((t) => t.id);
  if (dried.length) {
    ended.push({ type: 'TERRAIN_REMOVED', ids: dried, why: 'ends' });
    state = after(state, [ended[ended.length - 1]!]);
  }
  const lines: { text: string; dice?: DiceResult }[] = [];
  const results: { id: string; hp: number; states: StateName[] }[] = [];
  const kits: EventBody[] = [];
  /** Models whose First Aid went on a Recovery Check in this phase. */
  const aided: string[] = [];
  for (const m of state.models) {
    if (m.states.includes('Dead')) continue;
    let now = { hp: m.hp, states: [...m.states] };
    // States that last "until its next Strategic Phase" end here, before any roll – and on either side the
    // ones a Spell of this player put there "until the caster's next Strategic Phase".
    const over = now.states.filter((x) => m.temp?.[x] === tag || (m.side === side && m.temp?.[x] === 'strategic'));
    if (over.length) {
      now.states = now.states.filter((x) => !over.includes(x));
      lines.push({ text: `${m.name} is no longer ${over.join(', ')}` });
    }
    if (m.side !== side) {
      if (over.length) results.push({ id: m.id, ...now });
      continue;
    }
    // A Defensive Stance lasts until the Warrior's next Strategic Phase (it may shift to it again right away).
    if (now.states.includes('Defensive Stance')) {
      now.states = now.states.filter((x) => x !== 'Defensive Stance');
      lines.push({ text: `${m.name} leaves its Defensive Stance` });
    }
    const t = modelStats({ ...m, states: now.states }).t;
    const roll = (target: number, label: string): boolean => {
      const r = rollDice(1, Math.max(0, target), label, d20);
      lines.push({ text: `${m.name}: ${label}, 1d20 vs ${Math.max(0, target)} – ${r.successes ? 'success' : 'failed'}`, dice: r });
      return r.successes === 1;
    };
    const regen = profileOf(m).skills.find((x) => x.startsWith('Regeneration'));
    if (regen && !now.states.includes('Incapacitated')) {
      const x = regen.endsWith('II') ? 2 : 1;
      const hp = Math.min(m.maxHp, now.hp + x);
      const cured = now.states.filter((x2) => ['Bleeding', 'Weakened', 'Crippled'].includes(x2));
      if (hp !== now.hp || cured.length) {
        lines.push({ text: `${m.name} regenerates${hp !== now.hp ? `: HP ${now.hp} → ${hp}` : ''}${cured.length ? `, no longer ${cured.join(', ')}` : ''}` });
        now = { hp, states: now.states.filter((x2) => !cured.includes(x2)) };
      }
    }
    const undead = hasTrait(m, 'Undead');
    if (now.states.includes('Bleeding') && now.hp > 0 && !roll(t, 'Bleeding, T')) now = woundOnce(now.hp, now.states, undead);
    if (now.states.includes('Poisoned') && now.hp > 0 && !roll(t - 6, 'Poisoned, T −6')) now = woundOnce(now.hp, now.states, undead);
    // Recovery Check, rolled again once when an ally stands in Base Contact and neither model is Engaged.
    const helped = () => !m.states.includes('Engaged') && state.models.some((o) => o.side === m.side && o.id !== m.id && !isOut(o) && !o.states.includes('Engaged') && gap(o, m) <= CONTACT);
    // First Aid of a model it is within the Awareness of (or its own): discarded, the Recovery Check succeeds.
    const down = m.states.includes('Incapacitated') && now.hp === 0 && !now.states.includes('Dead');
    const medic = down ? state.models.find((o) => o.side === m.side && hasUpgrade(o, 'neu-first-aid') && !aided.includes(o.id) && (o.id === m.id || (!isOut(o) && gap(o, m) <= awareness(modelStats(o)) + CONTACT))) : undefined;
    if (medic) {
      aided.push(medic.id);
      lines.push({ text: `${medic.name} discards First Aid: ${m.name}'s Recovery Check succeeds` });
      kits.push({ type: 'MODEL_KIT', id: medic.id, spent: [...(medic.spent ?? []), 'neu-first-aid'] });
    }
    if (down && (medic !== undefined || roll(t, 'Recovery Check, T') || (helped() && roll(t, 'Recovery Check again (ally in Base Contact), T')))) {
      now = { hp: 1, states: now.states.filter((x) => x !== 'Incapacitated') };
      if (!immuneTo(m, 'Weakened') && !now.states.includes('Weakened')) now.states.push('Weakened');
      lines.push({ text: `${m.name} recovers: 1 HP, Weakened` });
    }
    const changed = now.hp !== m.hp || now.states.length !== m.states.length || now.states.some((x) => !m.states.includes(x));
    if (!changed) continue;
    results.push({ id: m.id, ...now });
    if (now.hp < m.hp) lines.push({ text: `${m.name} suffers a Wound${now.states.includes('Dead') ? ' and is Dead' : now.states.includes('Incapacitated') ? ' and is Incapacitated' : ''} (HP ${now.hp}/${m.maxHp})` });
  }
  for (const m of state.models) {
    if (m.side !== side || isOut(m)) continue;
    // Lucky Charm: a Luck counter in each of its Strategic Phases, up to 3.
    if (hasUpgrade(m, 'sog-lucky-charm') && (m.luck ?? 0) < 3) kits.push(luckEvent(m));
    // Alchemist: its Consumables are back.
    if (hasClass(m, 'Alchemist') && m.items) {
      const full: Record<string, number> = {};
      for (const w of profileOf(m).weapons) if (/Consumable/.test(w.type) && m.items[w.name] !== undefined && m.items[w.name]! < quantityOf(w)) full[w.name] = quantityOf(w);
      if (Object.keys(full).length) kits.push({ type: 'MODEL_KIT', id: m.id, items: full, text: `${m.name} (Alchemist) replenishes its Consumables: ${Object.keys(full).join(', ')}` });
    }
  }
  return [...head, ...ended, ...(lines.length > 0 ? [{ type: 'STRATEGIC', lines, results } as EventBody] : []), ...kits];
}

/**
 * The dice the Strategic Phase of `side` will roll, for the window that waits for its player: Unconventional
 * Tactics, Bleeding, Poisoned and Recovery Checks (not the ones First Aid settles).
 */
export function strategicRolls(state: TableState, side: Side): PendingRoll[] {
  const out: PendingRoll[] = [];
  const tag = side === 0 ? 'blue' : 'red';
  if (state.stratCheck === side) {
    const leader = state.models.find((m) => m.side === side && m.leader && !isOut(m));
    if (leader) out.push({ id: leader.id, who: leader.name, what: 'Unconventional Tactics', target: Math.max(modelStats(leader).m + soldierBonus(state, leader), intOf(state, leader)) });
  }
  for (const m of state.models) {
    if (m.side !== side || m.states.includes('Dead')) continue;
    // States that end in this Strategic Phase are gone before anything is rolled.
    const states = m.states.filter((x) => !(m.temp?.[x] === tag || m.temp?.[x] === 'strategic'));
    const t = modelStats({ ...m, states }).t;
    if (states.includes('Bleeding') && m.hp > 0) out.push({ id: m.id, who: m.name, what: 'Bleeding, T', target: Math.max(0, t) });
    if (states.includes('Poisoned') && m.hp > 0) out.push({ id: m.id, who: m.name, what: 'Poisoned, T −6', target: Math.max(0, t - 6) });
    const medic = state.models.some((o) => o.side === m.side && hasUpgrade(o, 'neu-first-aid') && (o.id === m.id || (!isOut(o) && gap(o, m) <= awareness(modelStats(o)) + CONTACT)));
    if (states.includes('Incapacitated') && m.hp === 0 && !medic) out.push({ id: m.id, who: m.name, what: 'Recovery Check, T', target: Math.max(0, t) });
  }
  return out;
}

/** The Strategic Phase of `next` and the start of its turn, once the turn before it has ended (`state`: after that). */
function beginTurn(state: TableState, next: Side, round: number, d20: () => number): EventBody[] {
  const out: EventBody[] = [...strategic(state, next, d20)];
  out.push(...consequences(state, out));
  const then = after(state, out);
  // The Quest ends when a player starts their turn with nobody left standing.
  if (!then.models.some((m) => m.side === next && standing(m))) return [...out, ...finishEvents(then)];
  return [...out, turnStart(then, round, next)];
}

/** Lucky Charm: one more Luck counter. */
const luckEvent = (m: Model): EventBody => ({ type: 'MODEL_KIT', id: m.id, luck: (m.luck ?? 0) + 1, text: `${m.name}: Lucky Charm – ${(m.luck ?? 0) + 1} Luck counter${(m.luck ?? 0) + 1 === 1 ? '' : 's'}` });

/** What an Action used up, for its event. */
const kitOf = (res: { kit: KitUse[] }): { kit?: KitUse[] } => (res.kit.length ? { kit: res.kit } : {});

export function leaderMorale(state: TableState, side: Side): number {
  const mine = state.models.filter((m) => m.side === side);
  const leader = mine.find((m) => m.leader);
  if (leader) return moraleOf(state, leader).m;
  return mine.reduce((best, m) => Math.max(best, moraleOf(state, m).m), 0);
}

const standing = (m: Model): boolean => !isOut(m);

/** Open Hostilities: Victory Points for every enemy that has just been taken out. */
function bounties(state: TableState): EventBody[] {
  if (state.quest !== 'open-hostilities' || state.phase !== 'playing') return [];
  const out: EventBody[] = [];
  for (const m of state.models) {
    if (standing(m) || state.scored.includes(m.id) || isSummoned(m)) continue;
    const cost = profileById(m.profileId)?.cost ?? 0;
    const delta = bountyFor(cost) + (m.leader ? 1 : 0);
    out.push({ type: 'QUEST_SCORED', team: other(m.side), delta, mark: m.id, text: `${m.name} is out (${cost} pts${m.leader ? ', Leader' : ''})` });
  }
  return out;
}

/** Broken Morale: when fewer than half of a party is still standing, the rest become Panicked. */
function morale(state: TableState): EventBody[] {
  if (state.phase !== 'playing' || questByCode(state.quest)?.brokenMorale === false) return [];
  const out: EventBody[] = [];
  for (const side of [0, 1] as const) {
    const mine = state.models.filter((m) => m.side === side && !isSummoned(m));
    // Models that left the field with a Treasure still count as present.
    if (state.broken[side] || state.partySize[side] === 0 || (mine.filter(standing).length + state.escaped[side]) * 2 >= state.partySize[side]) continue;
    out.push({ type: 'BROKEN_MORALE', team: side, ids: mine.filter((m) => standing(m) && !m.states.includes('Panicked') && !immuneTo(m, 'Panicked')).map((m) => m.id) });
  }
  return out;
}

/** What follows from the events of a command without anyone deciding it: Quest scoring and Broken Morale. */
function consequences(state: TableState, bodies: EventBody[]): EventBody[] {
  if (bodies.length === 0) return [];
  let then = after(state, bodies);
  // Knockback moved someone: who is Engaged changes at once.
  const pushed = bodies.some((b) => b.type === 'ACTION_RESOLVED' && b.results.some((r) => r.to));
  const held = pushed ? engagement(then) : [];
  if (held.length) {
    bodies = [...bodies, ...held];
    then = after(then, held);
  }
  // Arcane Lantern: Shrouded is cancelled within its wearer's Awareness.
  const lit: EventBody[] = then.models
    .filter((m) => m.states.includes('Shrouded') && then.models.some((o) => o.side !== m.side && !isOut(o) && profileOf(o).weapons.some((w) => w.name === 'Arcane Lantern') && gap(o, m) <= awareness(modelStats(o)) + 0.005))
    .map((m) => ({ type: 'MODEL_STATE', id: m.id, state: 'Shrouded', on: false }) as EventBody);
  if (lit.length) {
    held.push(...lit);
    then = after(then, lit);
  }
  // Primordial Word is removed when its caster leaves the area (or goes down).
  const faded = then.terrain.filter((t) => t.env === 'magic' && t.name !== HAZE && t.caster && !then.models.some((m) => m.id === t.caster && !isOut(m) && pointInPolygon(m, t.shape))).map((t) => t.id);
  if (faded.length) {
    const gone: EventBody = { type: 'TERRAIN_REMOVED', ids: faded, why: 'its caster left the area' };
    held.push(gone);
    then = after(then, [gone]);
  }
  const riders = mountChecks(then);
  const tidy = then.activation ? [] : summonCleanup(after(then, riders));
  const now = after(then, [...riders, ...tidy]);
  const scored = bounties(now);
  return [...held, ...riders, ...tidy, ...scored, ...morale(after(now, scored))];
}

/** The score sheet: Victory Points for the Quest and for Schemes, by side and round (index 0 = round 1). */
export function tallyOf(state: Pick<TableState, 'sheet'>): Record<ScoreKind, [number[], number[]]> {
  const row = (list?: number[]): number[] => Array.from({ length: MAX_ROUNDS }, (_, i) => list?.[i] ?? 0);
  return { quest: [row(state.sheet?.quest[0]), row(state.sheet?.quest[1])], scheme: [row(state.sheet?.scheme[0]), row(state.sheet?.scheme[1])] };
}

/** Victory Points go on the score sheet, in the given round (default: the current one). */
function tallied(state: TableState, kind: ScoreKind, side: Side, delta: number, round?: number): void {
  if (!delta) return;
  const at = Math.max(1, Math.min(MAX_ROUNDS, round ?? state.round)) - 1;
  const sheet = tallyOf(state);
  sheet[kind][side][at]! += delta;
  state.sheet = sheet;
}

/**
 * Where a Quest token goes: its own spot, or – when scenery stands there – the nearest open ground.
 * It slides along the centre line first, so that both players stay equally far from it.
 */
export function tokenSpot(terrain: TerrainPiece[], width: number, height: number, at: Pt): Pt {
  const room = MARKER_RADIUS + 0.1;
  const open = (p: Pt): boolean =>
    p.x >= room && p.y >= room && p.x <= width - room && p.y <= height - room && !terrain.some((t) => t.kind === 'obstacle' && circleHitsPolygon(p, room, t.shape));
  if (open(at)) return at;
  for (let d = 0.25; d <= 9; d += 0.25) {
    for (const s of [-1, 1]) {
      const p = { x: round2(at.x + s * d), y: at.y };
      if (open(p)) return p;
    }
  }
  for (let d = 0.25; d <= 9; d += 0.25) {
    for (let i = 0; i < 16; i++) {
      const p = { x: round2(at.x + Math.cos((i * Math.PI) / 8) * d), y: round2(at.y + Math.sin((i * Math.PI) / 8) * d) };
      if (open(p)) return p;
    }
  }
  return at;
}

/** Awaiting Reinforcements: who holds the Obelisk at the end of the round. */
function roundScoring(state: TableState): EventBody[] {
  const obelisk = state.markers.find((k) => k.id === 'obelisk');
  if (state.quest !== 'awaiting-reinforcements' || !obelisk || state.round < 2) return [];
  const near = ([0, 1] as const).map((side) => state.models.filter((m) => m.side === side && standing(m) && dist(m, obelisk) - baseRadius(m.size) - MARKER_RADIUS <= obelisk.radius + 0.06));
  const presence = near.map((list) => list.reduce((sum, m) => sum + (profileById(m.profileId)?.cost ?? 0), 0));
  const out: EventBody[] = [];
  for (const side of [0, 1] as const) {
    const foe = other(side);
    if (near[side]!.length === 0) continue;
    const why = ['a model within 6"'];
    if (presence[side]! > presence[foe]!) why.push(`Stronger Presence ${presence[side]} vs ${presence[foe]} pts`);
    if (near[foe]!.length === 0) why.push('the opponent has none there');
    out.push({ type: 'QUEST_SCORED', team: side, delta: why.length, text: `Obelisk, round ${state.round}: ${why.join('; ')}` });
  }
  return out;
}

/** A Panicked model rolls Morale whenever it activates or reacts; what a failure means is up to the players to carry out. */
function panicRoll(state: TableState, m: Model, d20: () => number): DiceResult | undefined {
  return m.states.includes('Panicked') ? rollDice(1, moraleOf(state, m).m, 'Panicked, Morale', d20) : undefined;
}

function newModel(state: TableState, side: Side, profile: Profile, x: number, y: number, leader: boolean, upgrades: string[] = [], withMount = false): Model {
  const steed = withMount ? mountById(profile.mount) : undefined;
  const same = state.models.filter((m) => m.side === side && m.profileId === profile.id).length;
  return {
    id: (side === 0 ? 'a' : 'b') + state.nextModel[side],
    side,
    name: same === 0 ? profile.name : `${profile.name} ${same + 1}`,
    faction: profile.faction,
    profileId: profile.id,
    kind: figureKind(profile),
    size: profile.size,
    leader,
    x,
    y,
    facing: side === 0 ? 0 : 180,
    hp: profile.hp,
    maxHp: profile.hp,
    ap: 0,
    // Stealth II (and Concealed Approach): deployed Shrouded.
    states: state.phase === 'setup' && (profile.skills.includes('Stealth II') || upgrades.includes('the-concealed-approach')) ? ['Shrouded'] : [],
    ...(upgrades.length > 0 ? { upgrades } : {}),
    ...(steed ? { mount: { id: steed.id, on: false, hp: steed.hp, riderSize: profile.size } } : {}),
  };
}

/** Validate a command against the current state and turn it into events. Throws RuleError. */
export function decide(state: TableState, cmd: Command, ctx: DecideContext): EventBody[] {
  const bodies = decideCore(state, cmd, ctx);
  return [...bodies, ...consequences(state, bodies)];
}

function decideCore(state: TableState, cmd: Command, ctx: DecideContext): EventBody[] {
  if (state.activation?.pending && cmd.type !== 'PROTECT' && cmd.type !== 'ROLL') fail('PENDING', 'An Attack has been declared: the Reactive Player decides about Protector first');
  if (state.phase === 'finished' && cmd.type !== 'ROLL' && cmd.type !== 'REVEAL_SCHEME' && cmd.type !== 'ADD_VP') fail('GAME_OVER', 'The game is over');
  // Dice window: a declared Action waits until every side that rolls has pressed Roll.
  const waiting = state.activation?.roll;
  if (waiting) {
    if (cmd.type === 'ROLL_DICE') {
      const seats = (ctx.solo ? waiting.wait : waiting.wait.filter((x) => x === ctx.side)).map((seat) => ({ type: 'ROLL_READIED', seat }) as EventBody);
      if (seats.length === 0) fail('NOT_YOURS', 'Your dice are not needed for this roll');
      const then = after(state, seats);
      return then.activation?.roll ? seats : [...seats, ...decideCore(then, { ...waiting.cmd, hold: false } as Command, { ...ctx, side: waiting.from })];
    }
    if (cmd.type === 'CANCEL_ROLL') {
      if (!may(ctx, waiting.from)) fail('NOT_YOURS', 'Only the player who declared the Action can call it back');
      return [{ type: 'ROLL_CANCELLED' }];
    }
    if (cmd.type !== 'ROLL' && cmd.type !== 'REACT_MODS') fail('ROLLING', 'An Action is declared: roll the dice first');
  } else if (cmd.type === 'ROLL_DICE' || cmd.type === 'CANCEL_ROLL') fail('NO_ROLL', 'No roll is waiting');
  if (cmd.type === 'ACTION' && cmd.hold === true) {
    const a = state.activation;
    const plain = { ...cmd, hold: false } as Command;
    // Checked (and rolled) as usual; the result is only kept when nobody else has dice to roll.
    const result = decideCore(state, plain, ctx);
    const foe = other(state.active);
    const theirs = !ctx.solo && a !== null && Object.entries(a.reactions).some(([id, r]) => r.intent !== 'other' && state.models.some((m) => m.id === id && m.side === foe && !isOut(m)));
    const pendingTaunt = !ctx.solo && a !== null && tauntReactions(state).length > 0;
    if (!theirs && !pendingTaunt) return result;
    const made = tauntReactions(state);
    return [...made, { type: 'ROLL_PENDING', cmd: plain, wait: [foe], from: state.active }];
  }
  if (cmd.type === 'REACT_MODS') {
    const a = state.activation ?? fail('NO_ACTIVATION', 'There is no Activation');
    const m = findModel(state, cmd.id);
    const r = a.reactions[m.id] ?? fail('NO_REACTION', `${m.name} has not reacted`);
    if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
    if (a.action !== null) fail('TOO_LATE', 'The dice have been rolled');
    return [{ type: 'REACTION_ADJUSTED', id: m.id, hit: int(cmd.hit ?? r.mods.hit, -20, 20, 'Modifier'), stk: int(cmd.stk ?? r.mods.stk, -10, 10, 'Modifier') }];
  }
  if (cmd.type === 'UNDO_MOVE') {
    const last = state.lastMove ?? fail('NO_UNDO', 'There is no Movement to take back (dice were rolled, someone reacted, or nothing was moved)');
    const m = findModel(state, last.id);
    if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
    return [{ type: 'MOVE_UNDONE', id: m.id }];
  }
  // Taunt: the models that failed their INT roll react before the Action or the end of the Activation.
  if ((cmd.type === 'ACTION' || cmd.type === 'END_ACTIVATION') && state.activation?.action === null && state.activation.taunted?.length) {
    const made = tauntReactions(state);
    if (made.length) return [...made, ...decideCore(after(state, made), cmd, ctx)];
  }

  // Waiting for dice: the Initiative Check before the game, the next player's Strategic Phase between two turns.
  const kind: string = cmd.type;
  if (state.initiative && !['ROLL_INITIATIVE', 'CONCEDE', 'ROLL', 'ROTATE_MODEL'].includes(kind)) fail('ROLL_FIRST', 'Both players are ready: roll for the Initiative first');
  if (state.pendingTurn && ['STRATAGEM', 'ENCHANT', 'SHROUD', 'MOUNT', 'DISMOUNT', 'CONVERT_MANA', 'USE_UPGRADE', 'REACT', 'ACTION', 'TAUNT'].includes(kind)) fail('ROLL_FIRST', `The turn has ended: ${SIDE_NAME[state.pendingTurn.side]} rolls the dice of its Strategic Phase`);

  switch (cmd.type) {
    case 'ADD_MODEL': {
      const side = side01(cmd.side);
      const profile = profileById(cmd.profileId) ?? fail('BAD_VALUE', 'Unknown model profile');
      if (state.models.length >= LIMITS.models) fail('TOO_MANY', `A table holds at most ${LIMITS.models} models`);
      const x = round2(num(cmd.x, 0, state.width, 'x'));
      const y = round2(num(cmd.y, 0, state.height, 'y'));
      const problem = checkPlacement(state, profile.size, x, y);
      if (problem) fail(problem, PROBLEM_TEXT[problem]);
      if (state.phase === 'setup' && cmd.free !== true) {
        if (!may(ctx, side)) fail('NOT_YOURS', 'You can only add figures to your own side');
        if (!inDeployZone(state, side, profile.size, y, deployDepthFor(state, { side, profileId: profile.id }), x)) fail('ZONE', 'Deploy inside your Deployment Zone');
      }
      const mine = state.models.filter((m) => m.side === side);
      return [{ type: 'MODEL_ADDED', model: newModel(state, side, profile, x, y, profile.stratagems.length > 0 && !mine.some((m) => m.leader), [], cmd.mount !== false) }];
    }
    case 'DEPLOY_PARTY': {
      const side = side01(cmd.side);
      if (state.phase !== 'setup') fail('STARTED', 'Parties are deployed before the game starts');
      if (!may(ctx, side)) fail('NOT_YOURS', 'You can only deploy your own party');
      if (state.schemes[side].drawn > 0) fail('SCHEME_DRAWN', 'Schemes have been drawn for this party – it can no longer be replaced');
      const models: string[] = Array.isArray(cmd.models) ? cmd.models.slice(0, 20) : [];
      const list = { faction: text(cmd.faction, 40), models, leader: cmd.leader, upgrades: models.map((_, i) => upgradesOf(cmd.upgrades, i)), mounts: models.map((_, i) => Array.isArray(cmd.mounts) && cmd.mounts[i] === true) };
      const problems = partyProblems(list, state.points);
      if (problems.length > 0) fail('BAD_PARTY', problems.join('. '));
      // The old party leaves the table, the new one lines up in the Deployment Zone.
      const out: EventBody[] = state.models.filter((m) => m.side === side).map((m) => ({ type: 'MODEL_REMOVED', id: m.id }));
      list.models.forEach((id, i) => {
        const now = after(state, out);
        const profile = profileById(id)!;
        // The party lines up on its shelf; the player moves it into the Deployment Zone from there.
        const spot = shelfSpot(now, side, profile.size) ?? deploySpot(now, side, profile.size) ?? fail('NO_ROOM', `There is no room to deploy ${profile.name}`);
        out.push({ type: 'MODEL_ADDED', model: newModel(now, side, profile, round2(spot.x), round2(spot.y), i === list.leader, list.upgrades[i], list.mounts[i] === true) });
      });
      out.push({ type: 'PARTY_DEPLOYED', team: side, faction: list.faction, points: partyPoints(list.models, list.upgrades, list.mounts) });
      return out;
    }
    case 'MOVE_MODEL': {
      const m = findModel(state, cmd.id);
      const to = { x: round2(num(cmd.x, 0, state.width, 'x')), y: round2(num(cmd.y, -SHELF.gap - SHELF.depth, state.height + SHELF.gap + SHELF.depth, 'y')) };
      const how = cmd.how === 'climb' || cmd.how === 'jump' ? cmd.how : undefined;
      const check = checkMove(state, ctx, m, to, cmd.free === true, how);
      if (!check.ok) return fail(check.code, check.message);
      const d = round2(dist(m, to));
      const facing =
        // A normal move turns the model the way it travels; a free move (push, correction) leaves its facing alone.
        cmd.facing !== undefined ? normDeg(num(cmd.facing, -720, 720, 'facing')) : d > 0.05 && check.mode !== 'free' ? facingTo(m, to) : m.facing;
      const z = check.z ?? m.z ?? 0;
      const bonus = check.mode !== 'free' && check.mode !== 'deploy' && !state.activation ? bonusMove(state, m) : null;
      const moved: EventBody = { type: 'MODEL_MOVED', id: m.id, from: { x: m.x, y: m.y }, to, facing, dist: d, cost: check.cost, mode: check.mode, ...(z !== (m.z ?? 0) ? { z } : {}), ...(check.special ? { special: true } : {}), ...(bonus ? { bonus } : {}) };
      const out: EventBody[] = [moved];
      // A Jump that falls short: Fall Damage.
      if (check.fall && check.fall > 0) {
        const n = fallRolls(m, check.fall);
        const ag = modelStats(m).ag;
        const roll = rollDice(n, ag, 'Fall Damage, AG', ctx.d20);
        const hurt = n - (roll.successes ?? 0);
        const lines = [{ text: `${m.name} falls ${check.fall.toFixed(1)}"${n ? `: ${n}d20 vs AG ${ag} – ${hurt} Wound${hurt === 1 ? '' : 's'}` : ' – no damage'}`, ...(n ? { dice: roll } : {}) }];
        let now = { hp: m.hp, states: [...m.states] };
        for (let i = 0; i < hurt && now.hp > 0; i++) now = woundOnce(now.hp, now.states, hasTrait(m, 'Undead'));
        out.push({ type: 'EFFECT', lines, results: now.hp !== m.hp ? [{ id: m.id, ...now }] : [] });
      }
      // Trample: on a Run, every smaller model it moves through or touches suffers a Hit (PW = its T, Knockdown) unless it Dodges.
      if (check.mode === 'run' && hasTrait(m, 'Trample')) {
        const pw = modelStats(m).t;
        const lines: { text: string; dice?: DiceResult }[] = [];
        const results: EffectResult[] = [];
        for (const o of trampled(state, m, to)) {
          const st = modelStats(o);
          if (!isOut(o)) {
            const dodge = rollDice(1, st.ag, 'Dodge', ctx.d20);
            lines.push({ text: `Trample: ${o.name} dodges ${m.name}, 1d20 vs AG ${st.ag} – ${dodge.successes ? 'success' : 'failed'}`, dice: dodge });
            if (dodge.successes) continue;
          }
          const need = Math.max(0, pw - st.arm);
          const dmg = rollDice(1, need, 'Damage', ctx.d20);
          const states = [...o.states];
          if (!isOut(o) && !states.includes('Crouched')) states.push('Crouched');
          let now = { hp: o.hp, states: states.filter((x) => !(x === 'Flying' && states.includes('Crouched'))) };
          if (dmg.successes) now = woundOnce(now.hp, now.states, hasTrait(o, 'Undead'));
          lines.push({ text: `Trample on ${o.name}: Knockdown; Damage 1d20 vs PW ${pw} − ARM ${st.arm} = ${need} – ${dmg.successes ? '1 Wound' : 'no Wound'}`, dice: dmg });
          results.push({ id: o.id, ...now });
        }
        if (lines.length) out.push({ type: 'EFFECT', lines, results });
      }
      // Thrown items lying by a model they took down are picked up in Base Contact with it.
      if (m.thrown?.length) {
        const here: Model = { ...m, x: to.x, y: to.y, z };
        const back = m.thrown.filter((t) => state.models.some((o) => o.id === t.at && gap(here, o) <= CONTACT));
        if (back.length) {
          const items = { ...m.items };
          for (const t of back) items[t.name] = (items[t.name] ?? 0) + t.n;
          out.push({ type: 'MODEL_KIT', id: m.id, items, thrown: m.thrown.filter((t) => !back.includes(t)), text: `${m.name} picks up ${back.map((t) => `${t.n} × ${t.name}`).join(', ')}` });
        }
      }
      const tokens = state.phase === 'playing' && check.mode !== 'free' && state.markers.some((k) => k.kind === 'intrigue' || k.kind === 'sigil');
      return tokens ? [...out, ...tokenContact(after(state, out), m.id, ctx.d20)] : out;
    }
    case 'ROTATE_MODEL': {
      const m = findModel(state, cmd.id);
      return [{ type: 'MODEL_ROTATED', id: m.id, facing: normDeg(num(cmd.facing, -720, 720, 'facing')) }];
    }
    case 'WOUND': {
      const m = findModel(state, cmd.id);
      if (m.states.includes('Dead')) fail('DEAD', `${m.name} is already Dead`);
      const now = woundOnce(m.hp, m.states, hasTrait(m, 'Undead'));
      const same = now.states.length === m.states.length && now.states.every((x) => m.states.includes(x));
      return [{ type: 'MODEL_HP', id: m.id, hp: now.hp, ...(same ? {} : { states: now.states }) }];
    }
    case 'HEAL': {
      const m = findModel(state, cmd.id);
      if (m.states.includes('Dead')) fail('DEAD', 'A Dead model cannot regain HP');
      if (m.hp >= m.maxHp) fail('FULL_HP', `${m.name} is at full HP`);
      const states = m.states.filter((s) => s !== 'Incapacitated');
      return [{ type: 'MODEL_HP', id: m.id, hp: m.hp + 1, ...(states.length !== m.states.length ? { states } : {}) }];
    }
    case 'SET_AP': {
      const m = findModel(state, cmd.id);
      return [{ type: 'MODEL_AP', id: m.id, ap: int(cmd.ap, 0, 9, 'AP') }];
    }
    case 'SET_STATE': {
      const m = findModel(state, cmd.id);
      if (!STATES.includes(cmd.state)) fail('BAD_VALUE', 'Unknown state');
      const on = cmd.on === true;
      if (m.states.includes(cmd.state) === on) return [];
      // A Warrior shifts to a Defensive Stance in its own Strategic Phase (it ends by itself in the next one).
      if (cmd.state === 'Defensive Stance' && on) {
        if (!hasClass(m, 'Warrior')) fail('CANNOT_ACT', `${m.name} is not a Warrior`);
        if (!strategicWindow(state, m.side)) fail('NOT_NOW', 'A Warrior shifts to a Defensive Stance in its own Strategic Phase, before any model is activated');
      }
      return [{ type: 'MODEL_STATE', id: m.id, state: cmd.state, on }];
    }
    case 'SET_LEADER': {
      const m = findModel(state, cmd.id);
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      return m.leader ? [] : [{ type: 'LEADER_SET', id: m.id }];
    }
    case 'REMOVE_MODEL': {
      const m = findModel(state, cmd.id);
      return [{ type: 'MODEL_REMOVED', id: m.id }];
    }
    case 'ROLL': {
      const count = int(cmd.count, 1, LIMITS.dice, 'Number of dice');
      const target = cmd.target === undefined || cmd.target === null ? null : int(cmd.target, 0, 40, 'Target');
      return [{ type: 'DICE_ROLLED', result: rollDice(count, target, text(cmd.label, 60), ctx.d20) }];
    }
    case 'READY': {
      if (state.phase !== 'setup') fail('STARTED', 'The game has already started');
      const ready: [boolean, boolean] = [state.ready[0], state.ready[1]];
      const out: EventBody[] = [];
      for (const s of ctx.solo ? ([0, 1] as const) : [ctx.side]) {
        if (ready[s]) continue;
        if (!state.models.some((m) => m.side === s)) fail('NO_MODELS', `${SIDE_NAME[s]} has no figures on the table yet`);
        if (state.quest && !state.schemes[s].kept) fail('SCHEME_FIRST', `${SIDE_NAME[s]} has to draw and keep a Scheme first`);
        // Figures still on the shelf are put into the Deployment Zone.
        for (const m of state.models.filter((x) => x.side === s && onShelf(state, x) !== null)) {
          const now = after(state, out);
          const spot = deploySpot(now, s, m.size) ?? fail('NO_ROOM', `There is no room in the Deployment Zone for ${m.name} – deploy it by hand or remove it`);
          const to = { x: round2(spot.x), y: round2(spot.y) };
          out.push({ type: 'MODEL_MOVED', id: m.id, from: { x: m.x, y: m.y }, to, facing: m.facing, dist: round2(dist(m, to)), cost: 0, mode: 'deploy' });
        }
        ready[s] = true;
        out.push({ type: 'PLAYER_READY', seat: s });
      }
      if (!(ready[0] && ready[1])) return out;
      // Both are ready: the Initiative Check waits for each player to roll their die.
      out.push({ type: 'INITIATIVE_PENDING' });
      return out;
    }
    case 'ROLL_INITIATIVE': {
      const ini = state.initiative ?? fail('NO_ROLL', 'No Initiative Check is waiting');
      const seats = (ctx.solo ? ([0, 1] as const) : ([ctx.side] as const)).filter((s) => ini.rolls[s] === null);
      if (seats.length === 0) fail('ROLLED', 'You have rolled – the other player has not yet');
      const mine: [number | null, number | null] = [ini.rolls[0], ini.rolls[1]];
      const out: EventBody[] = [];
      for (const s of seats) {
        mine[s] = ctx.d20();
        out.push({ type: 'INITIATIVE_ROLLED', seat: s, roll: mine[s]! });
      }
      if (mine[0] === null || mine[1] === null) return out;
      // Initiative Check: d20 + the Leader's Morale; the higher total takes the first turn. A tie is rolled again.
      const morale: [number, number] = [leaderMorale(state, 0), leaderMorale(state, 1)];
      let rolls: [number, number] = [mine[0], mine[1]];
      // Expeditionary Tactics: Double Time is discarded for +6.
      const dt = (s: Side): number => (state.models.some((m) => m.side === s && hasUpgrade(m, 'hel-double-time')) ? 6 : 0);
      const bonus: [number, number] = [dt(0), dt(1)];
      const total = (s: Side): number => rolls[s] + morale[s] + bonus[s];
      for (let i = 0; i < 50 && total(0) === total(1); i++) rolls = [ctx.d20(), ctx.d20()];
      const first: Side = total(0) >= total(1) ? 0 : 1;
      out.push({ type: 'GAME_STARTED', rolls, morale, first, ...(bonus[0] + bonus[1] > 0 ? { bonus } : {}) });
      // The first Strategic Phase of the player who begins: Lucky Charm.
      for (const m of state.models) if (m.side === first && hasUpgrade(m, 'sog-lucky-charm')) out.push(luckEvent(m));
      out.push(turnStart(state, 1, first));
      return out;
    }
    case 'ACTIVATE': {
      if (state.phase !== 'playing') fail('NOT_STARTED', 'The game has not started yet');
      const m = findModel(state, cmd.id);
      if (m.side !== state.active) fail('NOT_YOUR_TURN', `It is ${SIDE_NAME[state.active]}'s turn – this model can only react`);
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      if (isOut(m)) fail('CANNOT_ACT', `${m.name} is out of action`);
      if (m.ap < 1) fail('NO_AP', `${m.name} has no Activation Points left`);
      if (state.pendingTurn) fail('ROLL_FIRST', `The turn has ended: ${SIDE_NAME[state.pendingTurn.side]} rolls the dice of its Strategic Phase`);
      if (state.endPhase) fail('END_PHASE', 'A Ranger has made its End Phase Movement: no more Activations this turn');
      // Activating a model closes the Activation Sequence that was still open.
      const panic = panicRoll(state, m, ctx.d20);
      const closing = closeActivation(state, ctx);
      if (!panic || panic.successes) return [...closing, { type: 'MODEL_ACTIVATED', id: m.id, ...(panic ? { panic } : {}) }];
      const then = after(state, closing);
      const run = flight(then, then.models.find((x) => x.id === m.id) ?? m);
      return [...closing, { type: 'MODEL_ACTIVATED', id: m.id, panic, fled: run.fled }, ...run.events];
    }
    case 'REACT': {
      const a = state.activation;
      if (state.phase !== 'playing' || !a) return fail('NO_ACTIVATION', 'There is no Activation to react to');
      const m = findModel(state, cmd.id);
      if (m.side === state.active) fail('NOT_REACTIVE', 'Only the Reactive Player’s models can react');
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      if (isOut(m)) fail('CANNOT_ACT', `${m.name} is out of action`);
      if (m.id in a.reactions) fail('ALREADY_REACTED', `${m.name} has already reacted to this Activation`);
      if (m.ap < 1) fail('NO_AP', `${m.name} has no Activation Points left`);
      if (a.action !== null) fail('TOO_LATE', 'The Action has been resolved – it is too late to react');
      const intent: Intent = cmd.intent === 'attack' || cmd.intent === 'dodge' ? cmd.intent : 'other';
      let weapon = 0;
      if (intent === 'attack') {
        weapon = int(cmd.weapon, 0, 399, 'Weapon');
        if (!weaponAt(m, weapon)) fail('BAD_VALUE', 'That is not a weapon this model can attack with');
        if (m.states.includes('Blinded')) fail('CANNOT_ACT', 'A Blinded model cannot attack');
      }
      const check = reactCheck(state, m);
      if (intent === 'other' && check.ok && (a.taunted ?? []).includes(m.id)) fail('TAUNTED', `${m.name} was Taunted: it must react with an Attack or a Dodge`);
      const forced = cmd.anyway === true && (!check.ok || (check.dodgeOnly && intent !== 'dodge'));
      if (!forced) {
        if (!check.ok) return fail('NO_REACTION', check.reason);
        if (check.dodgeOnly && intent !== 'dodge') fail('NO_REACTION', check.note);
      }
      // Attack of Opportunity: the first point of the route where the activated model was within Reach.
      let at: Pt | undefined;
      let impede: EventBody | undefined;
      if (cmd.opportunity === true) {
        if (intent !== 'attack') fail('BAD_VALUE', 'An Attack of Opportunity is an Attack');
        const active = findModel(state, a.id);
        const route = a.path && a.path.length > 0 ? a.path : [{ x: active.x, y: active.y }];
        const hit = route.find((p) => planAttack(state, m, { ...active, x: p.x, y: p.y }, weapon, mods(cmd.mods), { reactive: true }).ok) ?? fail('NO_ATTACK', `${active.name} never came within ${m.name}'s Reach (and line of sight) along its route`);
        at = hit;
        const plan = planAttack(state, m, { ...active, x: hit.x, y: hit.y }, weapon, mods(cmd.mods), { reactive: true });
        // Impede: a Melee Attack of Opportunity on a model that is not Engaged ends its Movement there.
        if (hasSkill(m, 'Impede') && !plan.ranged && !active.states.includes('Engaged')) impede = { type: 'IMPEDED', id: active.id, who: m.id, at: hit };
      }
      const panic = panicRoll(state, m, ctx.d20);
      // A failed Morale roll leaves only a Dodge (towards the edge).
      const lost = panic !== undefined && panic.successes === 0;
      // Charm: reacting against the charming model takes an INT roll; a failure leaves only Nothing.
      const charmer = findModel(state, a.id);
      const charmLevel = hasSkill(charmer, 'Charm II') ? 2 : hasSkill(charmer, 'Charm I') ? 1 : 0;
      const charm = charmLevel > 0 && intent !== 'other' && !lost && !hasTrait(m, 'Construct') && !hasTrait(m, 'Elemental') ? rollDice(1, intOf(state, m), 'Charm, INT', ctx.d20) : undefined;
      const charmed = charm !== undefined && charm.successes === 0;
      const final: Intent = lost ? 'dodge' : charmed ? 'other' : intent;
      const keep = !lost && !charmed;
      return [
        { type: 'MODEL_REACTED', id: m.id, intent: final, weapon: keep ? weapon : 0, mods: keep ? mods(cmd.mods) : { ...NO_MODS }, ...(panic ? { panic } : {}), ...(forced ? { forced } : {}), ...(at && keep ? { at } : {}), ...(charm ? { charm, charmLevel } : {}) },
        ...(impede && keep ? [impede] : []),
      ];
    }
    case 'ACTION': {
      const a = state.activation;
      if (state.phase !== 'playing' || !a) return fail('NO_ACTIVATION', 'No model is activated');
      if (!may(ctx, state.active)) fail('NOT_YOUR_TURN', `It is ${SIDE_NAME[state.active]}'s turn`);
      if (a.action !== null) fail('ACTION_DONE', 'This model has already declared its Action');
      const active = findModel(state, a.id);
      // A Panicked model that failed its Morale roll.
      if (a.panic === 'flee' && cmd.action !== 'nothing') fail('PANICKED', `${active.name} failed its Morale roll: it Runs for the nearest edge and can only declare Nothing`);
      if (a.panic === 'hold' && cmd.action !== 'dodge') fail('PANICKED', `${active.name} failed its Morale roll while Engaged: Idle and Dodge`);
      if (cmd.action === 'perceive' || cmd.action === 'interact') {
        if (a.moved > modelStats(active).spd + 0.005) fail('RAN', `${active.name} ran – it can only declare Nothing`);
        if (cmd.action === 'perceive' && cmd.target !== undefined) {
          // Perceive against a Shrouded model: INT roll, in Awareness and line of sight; Tracking +3 and a reroll.
          const hidden = findModel(state, cmd.target);
          if (hidden.side === active.side || !hidden.states.includes('Shrouded')) fail('NO_ATTACK', 'Perceive reveals a Shrouded enemy');
          const st = modelStats(active);
          if (gap(active, hidden) > awareness(st) + 0.005) fail('NO_ATTACK', `${hidden.name} is outside ${active.name}'s Awareness`);
          if (!sight(state, active, hidden).los) fail('NO_ATTACK', `${active.name} has no line of sight to it`);
          const tracker = hasSkill(active, 'Tracking') || hasTrait(active, 'Tracking');
          const int = intOf(state, active) + (tracker ? 3 : 0);
          let roll = rollDice(1, int, 'Perceive, INT', ctx.d20);
          const first = roll;
          if (tracker && roll.successes === 0) roll = rollDice(1, int, 'Perceive, INT (Tracking reroll)', ctx.d20);
          const lines = [
            ...(first !== roll ? [{ text: `${active.name} tries to perceive the Shrouded model: 1d20 vs INT ${int} (Tracking +3) – failed, rerolled`, dice: first }] : []),
            { text: `${active.name} perceives the Shrouded model: 1d20 vs INT ${int}${tracker ? ' (Tracking +3)' : ''} – ${roll.successes ? `${hidden.name} is revealed` : 'failed'}`, dice: roll },
          ];
          const res = resolveAction(state, active, 'nothing', 0, null, NO_MODS, a.reactions, ctx.d20, a.moved, { seen: a.seen ? new Set(a.seen) : undefined });
          return [
            { type: 'ACTION_RESOLVED', action: 'perceive', lines: [...lines, ...res.lines], results: res.results, used: res.used, dealt: res.dealt, ...(res.mana.length ? { mana: res.mana } : {}), ...kitOf(res) },
            ...(roll.successes ? [{ type: 'MODEL_STATE', id: hidden.id, state: 'Shrouded', on: false } as EventBody] : []),
          ];
        }
        const k = state.markers.find((x) => x.id === cmd.marker && x.kind !== undefined) ?? fail('BAD_VALUE', 'There is no such token');
        const seenBy = a.seen ? new Set(a.seen) : undefined;
        const lines: { text: string; dice?: DiceResult }[] = [];
        const extra: EventBody[] = [];
        if (cmd.action === 'perceive') {
          if (k.kind !== 'intrigue') fail('NO_ATTACK', 'Perceive reveals an Intrigue token');
          const stats = modelStats(active);
          if (dist(active, k) - baseRadius(active.size) - MARKER_RADIUS > stats.ag + CONTACT) fail('NO_ATTACK', `The token is outside ${active.name}'s Awareness (${stats.ag}")`);
          const ghost: Model = { ...active, id: '-token-', side: other(active.side), x: k.x, y: k.y, size: 'small', states: [] };
          if (!sight(state, active, ghost).los) fail('NO_ATTACK', `${active.name} has no line of sight to the token`);
          const wit = intOf(state, active);
          const roll = rollDice(1, wit, 'Perceive, INT', ctx.d20);
          lines.push({ text: `${active.name} perceives the Intrigue token: 1d20 vs INT ${wit} – ${roll.successes ? 'revealed' : 'failed'}`, dice: roll });
          if (roll.successes) {
            const d = ctx.d20();
            extra.push({ type: 'MARKER_REVEALED', id: k.id, spell: sigilByRoll(d).name, roll: d, who: active.id });
          }
        } else {
          if (!touchesToken(active, active, k)) fail('NO_ATTACK', `${active.name} must be in Base Contact with the token`);
          if (k.kind === 'treasure') {
            lines.push({ text: `${active.name} picks up the Treasure` });
            extra.push({ type: 'TREASURE_TAKEN', id: active.id, marker: k.id });
          } else if (k.kind === 'cache' || k.kind === 'sigil') {
            if (state.round < 2) fail('NO_ATTACK', 'A Cache cannot be Interacted with in round 1');
            // A Sigil that is still there goes off first.
            if (k.kind === 'sigil') extra.push(...sigilBlast(state, k, ctx.d20));
            const then = after(state, extra);
            const me = then.models.find((x) => x.id === active.id);
            if (me && !isOut(me)) {
              const bonus = ['Rogue', 'Ranger', 'Alchemist'].some((c) => profileOf(me).classes.includes(c)) ? 3 : 0;
              const ag = modelStats(me).ag + bonus;
              const roll = rollDice(1, ag, 'Interact, AG', ctx.d20);
              lines.push({ text: `${active.name} works on the Cache: 1d20 vs AG ${ag}${bonus ? ' (+3 Class Bonus)' : ''} – ${roll.successes ? 'unlocked, it takes the Treasure' : 'failed'}`, dice: roll });
              if (roll.successes) extra.push({ type: 'TREASURE_TAKEN', id: active.id, marker: k.id }, { type: 'QUEST_SCORED', team: active.side, delta: 1, text: `${active.name} unlocked a Cache` });
            }
          } else fail('NO_ATTACK', k.kind === 'intrigue' ? 'Reveal the Intrigue token first' : 'This Cache has already been unlocked');
        }
        // Reactions against the model are resolved as with any other Action.
        const world = after(state, extra);
        const res = resolveAction(world, world.models.find((x) => x.id === active.id) ?? active, 'nothing', 0, null, NO_MODS, a.reactions, ctx.d20, a.moved, { seen: seenBy });
        const sigil = extra.filter((e) => e.type === 'EFFECT' || e.type === 'MARKER_SET');
        const rest = extra.filter((e) => e.type !== 'EFFECT' && e.type !== 'MARKER_SET');
        return [...sigil, { type: 'ACTION_RESOLVED', action: cmd.action, lines: [...lines, ...res.lines], results: res.results, used: res.used, dealt: res.dealt, ...(res.mana.length ? { mana: res.mana } : {}), ...kitOf(res) }, ...rest];
      }
      if (hasEnchant(active, 'Deep Freeze') && cmd.action !== 'nothing') fail('CANNOT_ACT', `${active.name} is in a Deep Freeze: it can only declare Nothing`);
      if (a.special && cmd.action !== 'nothing') fail('RAN', `${active.name} declared ${a.special === 'climb' ? 'Climb' : 'Jump'} (a Special Movement): it can only declare Nothing`);
      if (cmd.action === 'cast' && typeof cmd.spell === 'string' && cmd.spell in ZONES) return zoneEvents(state, ctx, active, cmd.spell, cmd.at, mods(cmd.mods));
      if (cmd.action === 'cast') return castEvents(state, ctx, active, cmd.spell, cmd.targets, mods(cmd.mods));
      if (cmd.action === 'ritual') return ritualEvents(state, ctx, active, cmd);
      if (cmd.action === 'mount') return mountAction(state, ctx, active);
      const action = cmd.action === 'attack' || cmd.action === 'dodge' || cmd.action === 'deathblow' ? cmd.action : cmd.action === 'nothing' ? 'nothing' : fail('BAD_VALUE', 'Unknown action');
      // Run is a Special Movement: afterwards only Nothing may be declared (Dash allows one melee Strike).
      const ran = a.moved > modelStats(active).spd + 0.005;
      if ((action === 'dodge' || action === 'deathblow') && ran) fail('RAN', `${active.name} ran – it can only declare Nothing`);
      const seen = a.seen ? new Set(a.seen) : undefined;
      if (action === 'deathblow') {
        // Death Blow: an Incapacitated enemy in Base Contact becomes Dead, no roll.
        const victim = findModel(state, cmd.target);
        if (victim.side === active.side || !victim.states.includes('Incapacitated') || victim.states.includes('Dead')) fail('NO_ATTACK', 'A Death Blow needs an Incapacitated enemy');
        if (gap(active, victim) > CONTACT) fail('NO_ATTACK', `${active.name} must be in Base Contact with ${victim.name}`);
        const res = resolveAction(state, active, 'nothing', 0, null, NO_MODS, a.reactions, ctx.d20, a.moved, { seen });
        const states = [...victim.states.filter((x) => x !== 'Incapacitated' && x !== 'Flying'), 'Dead' as StateName];
        return [
          {
            type: 'ACTION_RESOLVED',
            action,
            lines: [{ text: `${active.name} delivers a Death Blow: ${victim.name} is Dead` }, ...res.lines],
            results: [...res.results.filter((r) => r.id !== victim.id), { id: victim.id, hp: 0, states }],
            used: res.used,
            dealt: res.dealt,
            ...(res.mana.length ? { mana: res.mana } : {}), ...kitOf(res),
            deathblow: victim.id,
          },
        ];
      }
      const m = mods(cmd.mods);
      let weapon = 0;
      let target: Model | null = null;
      if (action === 'attack') {
        weapon = int(cmd.weapon, 0, 399, 'Weapon');
        const item = weaponAt(active, weapon);
        const area = item ? areaOf(item) : null;
        const at = cmd.at && typeof cmd.at === 'object' ? { x: num(cmd.at.x, 0, state.width, 'x'), y: num(cmd.at.y, 0, state.height, 'y') } : null;
        // A Targetless template may be aimed at a spot on the table.
        if (at && cmd.target === undefined) {
          if (!item || !area || area.shape !== 'circle' || !isTargetless(item)) fail('NO_ATTACK', 'Only a Targetless template can be aimed at a spot on the table');
          target = pointTarget(active, at);
        } else target = findModel(state, cmd.target);
        const plan = planAttack(state, active, target, weapon, m, { reactive: false, idle: a.moved === 0, ran });
        if (!plan.ok) fail(ran && !plan.weapon ? 'RAN' : plan.reason.includes(' ran ') ? 'RAN' : 'NO_ATTACK', plan.reason);
        if (area) return resolveEvents(state, ctx, action, weapon, target, m, false, { label: area.label, victims: areaVictims(state, active, area, target).map((v) => v.id) });
        // Splitting the Strikes between several targets (Active Role, Strike above 1).
        if (Array.isArray(cmd.split) && cmd.split.length > 0) {
          const split = cmd.split.slice(0, 6).map((x) => ({ id: typeof x?.id === 'string' ? x.id : '', n: int(x?.n, 1, 9, 'Strikes') }));
          const ids = new Set([target.id]);
          for (const x of split) {
            const t = findModel(state, x.id);
            if (ids.has(t.id)) fail('BAD_VALUE', `${t.name} is named twice`);
            ids.add(t.id);
            if (t.side === active.side) fail('BAD_TARGET', `${t.name} is not an enemy`);
            const p = planAttack(state, active, t, weapon, m, { reactive: false, idle: a.moved === 0, ran });
            if (!p.ok) fail('NO_ATTACK', p.reason);
          }
          const given = split.reduce((n, x) => n + x.n, 0);
          if (given >= plan.stk) fail('BAD_VALUE', `Strike ${plan.stk}: at most ${plan.stk - 1} can go to other targets – ${target.name} keeps at least 1`);
          return resolveEvents(state, ctx, action, weapon, target, m, false, undefined, split);
        }
        // Protector: the Reactive Player may put another model in the way before anything is rolled.
        const protectors = protectorsFor(state, target);
        if (protectors.length > 0) return [{ type: 'ATTACK_DECLARED', weapon, target: target.id, mods: m, protectors: protectors.map((p) => p.id) }];
      }
      return resolveEvents(state, ctx, action, weapon, target, m, false);
    }
    case 'PROTECT': {
      const a = state.activation;
      const pending = a?.pending;
      if (!a || !pending) return fail('NO_ACTIVATION', 'There is no declared Attack to answer');
      if (!may(ctx, other(state.active))) fail('NOT_YOURS', 'The Reactive Player decides about Protector');
      const ward = findModel(state, pending.target);
      if (cmd.id === undefined || cmd.id === null) return resolveEvents(state, ctx, 'attack', pending.weapon, ward, pending.mods, false);
      const p = findModel(state, cmd.id);
      if (!protectorsFor(state, ward).some((x) => x.id === p.id)) fail('CANNOT_ACT', `${p.name} cannot protect ${ward.name}`);
      const to = protectSpot(state, p, ward) ?? fail('NO_ROOM', `There is no room for ${p.name} next to ${ward.name}`);
      const step: EventBody = { type: 'PROTECTED', id: p.id, ward: ward.id, from: { x: p.x, y: p.y }, to };
      const then = after(state, [step]);
      return [step, ...resolveEvents(then, ctx, 'attack', pending.weapon, then.models.find((x) => x.id === p.id)!, pending.mods, true)];
    }
    case 'STRATAGEM':
      return stratagemEvents(state, ctx, cmd);
    case 'SUMMON':
      return summonAtStart(state, ctx, cmd);
    case 'DISMISS': {
      const c = findModel(state, cmd.id);
      const caster = c.summonedBy ? findModel(state, c.summonedBy) : fail('BAD_TARGET', `${c.name} was not summoned`);
      if (!may(ctx, c.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      if (state.phase === 'playing') {
        if (!strategicWindow(state, c.side)) fail('NOT_NOW', 'A summoned creature is dismissed in your Strategic Phase, before a model is activated');
        if ((state.used[caster.id] ?? []).includes('Dismiss')) fail('USED', `${caster.name} has already dismissed a creature this turn`);
      }
      return [{ type: 'MODEL_REMOVED', id: c.id, why: `dismissed by ${caster.name}` }, ...(state.phase === 'playing' ? [{ type: 'ABILITY_USED', id: caster.id, name: 'Dismiss' } as EventBody] : [])];
    }
    case 'SHROUD': {
      const m = findModel(state, cmd.id);
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      if (!hasSkill(m, 'Stealth II')) fail('NO_SKILL', `${m.name} has no Stealth II`);
      if (isOut(m) || m.states.includes('Shrouded')) fail('CANNOT_ACT', `${m.name} cannot become Shrouded now`);
      if (state.phase === 'playing' && !strategicWindow(state, m.side)) fail('NOT_NOW', `${m.name} can become Shrouded again in your Strategic Phase, before a model is activated`);
      if (m.treasure) fail('CANNOT_ACT', 'A model carrying a Treasure cannot be Shrouded');
      const watcher = state.models.find((o) => o.side !== m.side && !isOut(o) && sight(state, o, m).los);
      if (state.phase === 'playing' && watcher) fail('SEEN', `${watcher.name} has line of sight to ${m.name}`);
      return [{ type: 'MODEL_STATE', id: m.id, state: 'Shrouded', on: true }];
    }
    case 'TAUNT': {
      const a = state.activation;
      if (state.phase !== 'playing' || !a) return fail('NO_ACTIVATION', 'No model is activated');
      if (!may(ctx, state.active)) fail('NOT_YOUR_TURN', `It is ${SIDE_NAME[state.active]}'s turn`);
      const m = findModel(state, a.id);
      if (!hasSkill(m, 'Taunt')) fail('NO_SKILL', `${m.name} has no Taunt Skill`);
      if (a.action !== null) fail('TOO_LATE', 'Taunt can only be used during Movement');
      if (a.tauntUsed) fail('ALREADY_USED', `${m.name} has already Taunted in this Activation`);
      if ((state.strats ?? []).some((x) => x.seat !== m.side && x.name === 'Piercing Perception')) fail('CANCELLED', 'Piercing Perception cancels Taunt');
      const foes = state.models.filter((o) => o.side !== m.side && !isOut(o) && !(o.id in a.reactions) && (sight(state, o, m).los || gap(o, m) <= awareness(modelStats(o)) + 0.005));
      if (foes.length === 0) fail('NO_TARGET', 'No enemy sees or is aware of it');
      return [{ type: 'TAUNTED', id: m.id, rolls: foes.map((o) => ({ id: o.id, dice: rollDice(1, intOf(state, o), 'Taunt, INT', ctx.d20) })) }];
    }
    case 'MOUNT': {
      const m = findModel(state, cmd.id);
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      mountProblem(state, m);
      if (state.phase === 'playing') {
        if (!strategicWindow(state, m.side)) fail('NOT_NOW', `${m.name} mounts in your Strategic Phase (out of enemy sight) or with an Assist Action when activated`);
        const seen = state.models.find((e) => e.side !== m.side && !isOut(e) && sight(state, e, m).los);
        if (seen) fail('SEEN', `${seen.name} can see ${m.name}: mount with an Assist Action instead`);
      }
      return [{ type: 'MOUNTED', id: m.id }];
    }
    case 'DISMOUNT': {
      const m = findModel(state, cmd.id);
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      if (!m.mount?.on) fail('NOT_MOUNTED', `${m.name} is not mounted`);
      if (state.phase === 'playing' && !strategicWindow(state, m.side) && state.activation?.id !== m.id) fail('NOT_NOW', `${m.name} dismounts in your Strategic Phase or during its own Activation`);
      return [{ type: 'DISMOUNTED', id: m.id, why: 'choice' }];
    }
    case 'ENCHANT': {
      // Artificer: in its Strategic Phase one of its Enchantments on itself, without a roll.
      const m = findModel(state, cmd.id);
      if (state.phase !== 'playing') return fail('NOT_NOW', 'Enchantments are cast during the game');
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      if (m.side !== state.active || state.activation) fail('NOT_YOUR_TURN', 'An Artificer enchants itself in its own Strategic Phase');
      if (!hasClass(m, 'Artificer') || isOut(m)) fail('CANNOT_ACT', `${m.name} cannot do that`);
      const spell = spellsOf(profileOf(m)).find((x) => x.name === cmd.name && x.kind === 'Enchantment' && x.cast) ?? fail('BAD_VALUE', `${m.name} does not know that Enchantment`);
      if ((state.used[m.id] ?? []).includes('Artificer')) fail('USED', `${m.name} has already enchanted itself this turn`);
      return [{ type: 'ENCHANTED', id: m.id, name: spell.name, until: m.side === 0 ? 'blue' : 'red', caster: m.id }];
    }
    case 'DISENCHANT': {
      const m = findModel(state, cmd.id);
      const name = text(cmd.name, 60);
      return hasEnchant(m, name) ? [{ type: 'DISENCHANTED', id: m.id, names: [name] }] : [];
    }
    case 'CONVERT_MANA': {
      const m = findModel(state, cmd.id);
      if (state.phase !== 'playing') return fail('NOT_NOW', 'Mana is gathered during the game');
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      if (m.side !== state.active) fail('NOT_YOUR_TURN', 'A Mage turns Activation Points into Mana in its Active Role');
      if (!hasClass(m, 'Mage')) fail('CANNOT_ACT', `${m.name} is not a Mage`);
      if (isOut(m)) fail('CANNOT_ACT', `${m.name} cannot do that`);
      const n = int(cmd.count ?? 1, 1, 10, 'Count');
      if (m.ap < n) fail('NO_AP', `${m.name} has ${m.ap} Activation Point${m.ap === 1 ? '' : 's'}`);
      return [{ type: 'MODEL_MANA', id: m.id, ap: m.ap - n, mana: (m.mana ?? 0) + n }];
    }
    case 'USE_UPGRADE': {
      const m = findModel(state, cmd.id);
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      const up = text(cmd.upgrade, 60);
      if (!hasUpgrade(m, up)) fail('BAD_VALUE', `${m.name} does not have that Upgrade (any more)`);
      if (!strategicWindow(state, m.side)) fail('NOT_NOW', 'An Upgrade is discarded in your own Strategic Phase, before any model is activated');
      if (isOut(m)) fail('CANNOT_ACT', `${m.name} is out of action`);
      const spent = [...(m.spent ?? []), up];
      if (up === 'neu-first-aid') {
        // All States but Engaged, Crouched, Flying, Shrouded, Incapacitated and Dead leave an Alive model within Awareness.
        const t = findModel(state, cmd.target ?? m.id);
        if (t.side !== m.side) fail('BAD_TARGET', 'First Aid is for a model of your own party');
        if (isOut(t)) fail('BAD_TARGET', `${t.name} is not Alive`);
        if (t.id !== m.id && gap(m, t) > awareness(modelStats(m)) + CONTACT) fail('BAD_TARGET', `${t.name} is outside ${m.name}'s Awareness`);
        const gone = t.states.filter((x) => CANCELLABLE.includes(x));
        if (gone.length === 0) fail('BAD_TARGET', `${t.name} has no State that First Aid removes`);
        const temp = { ...t.temp };
        for (const g of gone) delete temp[g];
        return [
          { type: 'MODEL_KIT', id: m.id, spent, text: `${m.name} discards First Aid` },
          { type: 'EFFECT', lines: [{ text: `First Aid: ${t.name} is no longer ${gone.join(', ')}` }], results: [{ id: t.id, hp: t.hp, states: t.states.filter((x) => !gone.includes(x)), temp }] },
        ];
      }
      if (up === 'hel-surge-order') return [{ type: 'MODEL_KIT', id: m.id, spent, text: `${m.name} discards Expeditionary Tactics: Surge Order` }, { type: 'SURGE_ORDERED', seat: m.side, id: m.id }];
      return fail('BAD_VALUE', 'That Upgrade is not discarded for an effect');
    }
    case 'PICK_UPGRADE': {
      const m = findModel(state, cmd.id);
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      if (state.phase !== 'setup') fail('STARTED', 'The choice of an Upgrade is made before the game starts');
      const up = text(cmd.upgrade, 60);
      const card = profileById(m.profileId);
      const choice = (card ? upgradeChoices(card, m.upgrades).find((c) => c.id === up) : undefined) ?? fail('BAD_VALUE', `${m.name} has no choice to make there`);
      const pick = int(cmd.pick, 0, choice.options.length - 1, 'Choice');
      return [{ type: 'MODEL_KIT', id: m.id, picks: { ...m.picks, [up]: pick }, text: `${m.name}: ${choice.name} – ${choice.options[pick]}` }];
    }
    case 'LEAVE_FIELD': {
      const a = state.activation;
      const m = findModel(state, cmd.id);
      if (state.phase !== 'playing' || !a || a.id !== m.id || a.action !== null) return fail('NOT_ACTIVATED', 'Only the activated model can leave, before it declares an Action');
      if (!may(ctx, m.side)) fail('NOT_YOURS', 'That model belongs to the other player');
      if ((m.treasure ?? 0) < 1) fail('CANNOT_ACT', `${m.name} carries no Treasure`);
      if (state.round < 4) fail('NOT_NOW', 'A Treasure can be carried off the field from round 4');
      if (m.states.includes('Immobilized') || a.panic) fail('CANNOT_ACT', `${m.name} cannot leave now`);
      const r = baseRadius(m.size);
      const room = Math.max(0, m.side === 0 ? state.height - m.y - r : m.y - r);
      const spd = modelStats(m).spd;
      const limit = (m.states.includes('Crouched') || m.states.includes('Engaged') ? spd : spd * 2) - a.moved;
      if (room > limit + 0.005) fail('TOO_FAR', `${m.name} is ${room.toFixed(1)}" from its table edge and has ${Math.max(0, limit).toFixed(1)}" of movement left`);
      const edge = { x: m.x, y: m.side === 0 ? state.height - r - 0.01 : r + 0.01 };
      if (room > 0.05 && checkPath(state, m, edge)) fail('BLOCKED', 'The way to the table edge is blocked');
      const out: EventBody[] = [
        { type: 'MODEL_LEFT', id: m.id },
        { type: 'QUEST_SCORED', team: m.side, delta: 3 * m.treasure!, text: `${m.name} carried ${m.treasure === 1 ? 'a Treasure' : `${m.treasure} Treasures`} off the field` },
      ];
      const then = after(state, out);
      // The Quest ends when both Treasures have left the field.
      if (then.escaped[0] + then.escaped[1] >= 2) out.push(...finishEvents(then));
      return out;
    }
    case 'END_ACTIVATION': {
      if (!state.activation) fail('NO_ACTIVATION', 'No model is activated');
      if (!may(ctx, state.active)) fail('NOT_YOUR_TURN', `It is ${SIDE_NAME[state.active]}'s turn`);
      return closeActivation(state, ctx);
    }
    case 'END_TURN': {
      if (state.phase !== 'playing') fail('NOT_STARTED', 'The game has not started yet');
      if (state.pendingTurn) fail('ROLL_FIRST', `The turn has ended: ${SIDE_NAME[state.pendingTurn.side]} rolls the dice of its Strategic Phase`);
      if (!may(ctx, state.active)) fail('NOT_YOUR_TURN', `It is ${SIDE_NAME[state.active]}'s turn`);
      const out: EventBody[] = [...closeActivation(state, ctx)];
      if (!state.activation) out.push(...engagement(state));
      // End Phase: Schemes revealed this turn that are counted now.
      out.push(...schemesDue(after(state, out), 'end-phase', state.active));
      out.push({ type: 'TURN_ENDED' });
      out.push(...consequences(state, out));
      const roundEnds = state.active !== state.first;
      if (roundEnds) out.push(...roundScoring(after(state, out)));
      const finish = (): EventBody[] => {
        out.push(...finishEvents(after(state, out)));
        return out;
      };
      if ((roundEnds && state.round >= MAX_ROUNDS) || state.lastTurn) return finish();
      // The next player's Strategic Phase comes before the Upkeep, so its results count for the AP handed out.
      const next = other(state.active);
      // Schemes that run "until your next Strategic Phase".
      out.push(...schemesDue(after(state, out), 'next-strategic', next));
      // Dice to roll in that Strategic Phase: it waits for its player to roll them.
      const waiting = strategicRolls(after(state, out), next);
      if (waiting.length > 0) return [...out, { type: 'STRATEGIC_PENDING', seat: next, round: roundEnds ? state.round + 1 : state.round, rolls: waiting }];
      const strat = strategic(after(state, out), next, ctx.d20);
      out.push(...strat);
      out.push(...consequences(state, out));
      const then = after(state, out);
      // The Quest ends when a player starts their turn with nobody left standing.
      if (!then.models.some((m) => m.side === next && standing(m))) return finish();
      out.push(turnStart(then, roundEnds ? state.round + 1 : state.round, next));
      return out;
    }
    case 'ROLL_STRATEGIC': {
      const p = state.pendingTurn ?? fail('NO_ROLL', 'No Strategic Phase is waiting for its dice');
      if (!may(ctx, p.side)) fail('NOT_YOURS', `${SIDE_NAME[p.side]} rolls the dice of its Strategic Phase`);
      return beginTurn(state, p.side, p.round, ctx.d20);
    }
    case 'CONCEDE': {
      const side = ctx.solo && cmd.side !== undefined ? side01(cmd.side) : ctx.side;
      return [{ type: 'GAME_FINISHED', winner: other(side), conceded: side }];
    }
    case 'ADD_MARKER': {
      if (state.markers.filter((k) => k.kind === 'token').length >= 30) fail('TOO_MANY', 'There are 30 tokens on the table already');
      let n = 1;
      while (state.markers.some((k) => k.id === `tk${n}`)) n++;
      const name = text(cmd.name, 24) || `Token ${n}`;
      return [{ type: 'MARKER_ADDED', marker: { id: `tk${n}`, name, x: round2(num(cmd.x, 0, state.width, 'x')), y: round2(num(cmd.y, 0, state.height, 'y')), radius: 0, kind: 'token' } }];
    }
    case 'MOVE_MARKER': {
      const k = state.markers.find((x) => x.id === cmd.id && x.kind === 'token') ?? fail('NO_MARKER', 'That token is not on the table');
      return [{ type: 'MARKER_MOVED', id: k.id, x: round2(num(cmd.x, 0, state.width, 'x')), y: round2(num(cmd.y, 0, state.height, 'y')) }];
    }
    case 'REMOVE_MARKER': {
      const k = state.markers.find((x) => x.id === cmd.id && x.kind === 'token') ?? fail('NO_MARKER', 'That token is not on the table');
      return [{ type: 'MARKER_REMOVED', id: k.id }];
    }
    case 'SET_SCORE': {
      const side = side01(cmd.side);
      const round = int(cmd.round, 1, MAX_ROUNDS, 'Round');
      const kind = cmd.kind === 'scheme' ? 'scheme' : 'quest';
      const value = int(cmd.value, -10, 20, 'Victory Points');
      const vp = state.vp[side] + value - tallyOf(state)[kind][side][round - 1]!;
      if (vp < -20 || vp > 40) fail('BAD_VALUE', 'Victory Points out of range');
      if (vp === state.vp[side]) return [];
      return [{ type: 'VP_CHANGED', team: side, vp, round, kind }];
    }
    case 'ADD_VP': {
      const side = side01(cmd.side);
      const vp = state.vp[side] + int(cmd.delta, -10, 10, 'Victory Points');
      if (vp < -20 || vp > 40) fail('BAD_VALUE', 'Victory Points out of range');
      return [{ type: 'VP_CHANGED', team: side, vp }];
    }
    case 'DRAW_SCHEMES': {
      if (state.phase !== 'setup') fail('STARTED', 'Schemes are drawn before the game starts');
      const side = ctx.solo && cmd.side !== undefined ? side01(cmd.side) : ctx.side;
      if (state.schemes[side].drawn > 0) fail('SCHEME_DRAWN', `${SIDE_NAME[side]} has already drawn its Schemes`);
      const mine = state.models.filter((m) => m.side === side);
      const leader = mine.find((m) => m.leader);
      if (!leader) fail('NO_LEADER', `${SIDE_NAME[side]} needs a Leader before drawing Schemes`);
      // The number of cards is public; which ones they are is not – the server keeps them.
      return [{ type: 'SCHEMES_DRAWN', seat: side, count: schemeDrawsFor(leader!) }];
    }
    case 'KEEP_SCHEME': {
      const side = ctx.solo && cmd.side !== undefined ? side01(cmd.side) : ctx.side;
      if (state.schemes[side].drawn === 0) fail('NO_SCHEMES', 'Draw Schemes first');
      if (state.schemes[side].kept) fail('SCHEME_KEPT', 'A Scheme has already been chosen');
      return [{ type: 'SCHEME_KEPT', seat: side }];
    }
    case 'REVEAL_SCHEME': {
      const side = ctx.solo && cmd.side !== undefined ? side01(cmd.side) : ctx.side;
      if (!state.schemes[side].kept) fail('NO_SCHEMES', 'There is no Scheme to reveal');
      if (state.schemes[side].revealed) return [];
      const scheme = schemeByCode(cmd.code) ?? fail('BAD_VALUE', 'Unknown Scheme');
      if (state.phase === 'playing' && STRATEGIC_REVEAL.includes(scheme.code) && (state.active !== side || state.acted)) {
        fail('NOT_NOW', `${scheme.name} is revealed in your Strategic Phase: at the start of your turn, before a model is activated`);
      }
      const reveal: EventBody = { type: 'SCHEME_REVEALED', seat: side, code: scheme.code };
      const then = after(state, [reveal]);
      return [reveal, ...(state.phase === 'playing' ? schemesDue(then, 'reveal', side) : schemeScoring(then))];
    }
    default:
      return fail('BAD_COMMAND', 'Unknown command');
  }
}

/** Cards drawn by the Leader's Intellect: up to 13 – 2, 14 or 15 – 3, 16 or more – 4. */
/** End of the game: every revealed Scheme that has not been counted yet. */
export function schemeScoring(state: TableState): EventBody[] {
  return state.phase === 'finished' ? schemesDue(state, 'game-end') : [];
}

export function schemeDrawsFor(leader: Model): number {
  const i = modelStats(leader).int;
  return i >= 16 ? 4 : i >= 14 ? 3 : 2;
}

const MOVE_VERB: Record<MoveMode, string> = {
  climb: 'climbed',
  jump: 'jumped',
  deploy: 'deployed',
  walk: 'walked',
  run: 'ran',
  react: 'dodged',
  retreat: 'walked (Hit and Retreat)',
  follow: 'followed up',
  free: 'was repositioned',
};

/** Apply one event. The state is always exactly the result of applying every event in order. */
/** Events after which the last Movement can still be taken back. */
const HARMLESS = new Set<GameEvent['type']>(['MODEL_MOVED', 'MODEL_ROTATED', 'MOVE_UNDONE']);

/**
 * WarBracket: when both sides have a model of the same name, both carry their side at the end of the name
 * ("Citadel Guard (Blue)", "Citadel Guard (Red)") – the page shows the player's name there. So a line of the log
 * always tells whose model it speaks of. Shrouded models are left out (and keep their plain name): what the other
 * player may not know must not show in the names of their own models. Run after every event.
 */
export function ownerNames(state: TableState): void {
  const base = (name: string): string => name.replace(/ \((?:Blue|Red)\)$/, '');
  const names = [new Set<string>(), new Set<string>()];
  for (const m of state.models) if (!m.states.includes('Shrouded')) names[m.side]!.add(base(m.name));
  for (const m of state.models) {
    const b = base(m.name);
    const named = !m.states.includes('Shrouded') && names[m.side === 0 ? 1 : 0]!.has(b) ? `${b} (${SIDE_NAME[m.side]})` : b;
    if (named !== m.name) m.name = named;
  }
}

export function apply(state: TableState, ev: GameEvent): void {
  applyEvent(state, ev);
  ownerNames(state); // WarBracket
}

function applyEvent(state: TableState, ev: GameEvent): void {
  const before = ev.type === 'MODEL_MOVED' ? state.models.find((m) => m.id === ev.id) : undefined;
  // What a rollback restores: where the model stood and the Activation as it was.
  const snap =
    before && ev.type === 'MODEL_MOVED' && ev.mode !== 'free' && ev.mode !== 'follow'
      ? { ...(ev.bonus ? { bonus: { moved: state.bonus ? { ...state.bonus } : null, endPhase: state.endPhase === true, surge: state.surge ? [...state.surge.ids] : null } } : {}), id: before.id, x: before.x, y: before.y, ...(before.z ? { z: before.z } : {}), facing: before.facing, activation: state.activation ? (JSON.parse(JSON.stringify(state.activation)) as Activation) : null, ...(state.schemes[before.side].moved ? { moved: [...state.schemes[before.side].moved!] } : {}) }
      : undefined;
  applyCore(state, ev);
  if (snap) state.lastMove = snap;
  else if (!HARMLESS.has(ev.type)) delete state.lastMove;
}

function applyCore(state: TableState, ev: GameEvent): void {
  const log = (kind: LogLine['kind'], textLine: string, dice?: DiceResult) => {
    state.log.push({ seq: ev.seq, ts: ev.ts, side: ev.side, by: ev.by, kind, text: textLine, ...(dice ? { dice } : {}) });
    if (state.log.length > LIMITS.log) state.log.splice(0, state.log.length - LIMITS.log);
  };
  const find = (id: string) => state.models.find((x) => x.id === id);
  /** Items and Luck counters an Action used up. */
  const useKit = (list: KitUse[] | undefined): void => {
    for (const k of list ?? []) {
      const m = find(k.id);
      if (!m) continue;
      if (k.luck) m.luck = Math.max(0, (m.luck ?? 0) - k.luck);
      if (!k.item || !k.n) continue;
      const card = profileOf(m).weapons.find((x) => x.name === k.item);
      const left = Math.max(0, (m.items?.[k.item] ?? (card ? quantityOf(card) : 1)) - k.n);
      m.items = { ...m.items, [k.item]: left };
      if (k.at) (m.thrown ??= []).push({ name: k.item, n: k.n, at: k.at });
      log('info', `${m.name}: ${left} × ${k.item} left${k.at ? ` – the thrown ${k.n === 1 ? 'one' : 'ones'} can be picked up in Base Contact with the model it took down` : ''}`);
    }
  };
  const hpBefore = new Map(state.models.map((m) => [m.id, m.hp]));
  // A note about when a state ends goes with the state.
  for (const m of state.models) {
    if (!m.temp) continue;
    for (const k of Object.keys(m.temp) as StateName[]) if (!m.states.includes(k)) delete m.temp[k];
    if (Object.keys(m.temp).length === 0) delete m.temp;
  }
  // A model that is back on its feet can be scored again when it goes down again (FAQ 2026).
  if (state.scored.length > 0) state.scored = state.scored.filter((id) => !state.models.some((m) => m.id === id && standing(m)));

  /** Victory Points that arrive after the last turn (Schemes, corrections) can still change the result. */
  const finalScore = () => {
    if (state.phase !== 'finished') return;
    const winner = state.vp[0] === state.vp[1] ? 'draw' : state.vp[0] > state.vp[1] ? 0 : 1;
    if (winner === state.winner) return;
    state.winner = winner;
    log('turn', winner === 'draw' ? `The result is now a draw, ${state.vp[0]}:${state.vp[1]}` : `The result is now: ${SIDE_NAME[winner]} wins ${state.vp[0]}:${state.vp[1]}`);
  };

  switch (ev.type) {
    case 'TABLE_CREATED':
      state.name = ev.name;
      state.width = ev.width;
      state.height = ev.height;
      state.deployDepth = ev.deployDepth;
      if (ev.deploy === 'corner') state.deploy = 'corner';
      state.terrain = ev.terrain;
      if (ev.ground) state.ground = ev.ground;
      if (ev.relief) state.relief = ev.relief;
      if (ev.map) state.map = ev.map;
      state.quest = ev.quest ?? null;
      state.points = ev.points ?? DEFAULT_POINTS;
      state.markers = (questByCode(state.quest)?.markers ?? []).map((k) => {
        const at = { x: round2(ev.width * k.at.x), y: round2(ev.height * k.at.y) };
        // The Obelisk is where the map has it (often on a dais); a token has to lie where a model can get to it.
        const spot = k.kind ? tokenSpot(ev.terrain, ev.width, ev.height, at) : at;
        return { id: k.id, name: k.name, x: spot.x, y: spot.y, radius: k.radius, ...(k.kind ? { kind: k.kind } : {}) };
      });
      log('info', `Table "${ev.name}" created${state.quest ? ` – Quest: ${questByCode(state.quest)?.name ?? state.quest}` : ''}`);
      break;
    case 'PLAYER_JOINED':
      state.players[ev.seat] = ev.name;
      log('info', `joined as ${SIDE_NAME[ev.seat]}`);
      break;
    case 'MODEL_ADDED': {
      // Tables saved by the first prototype have figures without a profile; fill in the gaps.
      const raw = ev.model as Model & { klass?: string };
      const kinds = ['warrior', 'archer', 'mage', 'rogue', 'beast'];
      const model: Model = {
        ...raw,
        profileId: raw.profileId ?? null,
        kind: raw.kind ?? ((kinds.includes(raw.klass ?? '') ? raw.klass : 'warrior') as Model['kind']),
        leader: raw.leader ?? raw.klass === 'leader',
        ap: raw.ap ?? 0,
        states: [...(raw.states ?? [])],
      };
      state.models.push(model);
      state.nextModel[model.side] = Math.max(state.nextModel[model.side], Number(model.id.slice(1)) + 1);
      log('info', `${model.name} (${SIDE_NAME[model.side]}) placed on the table`);
      break;
    }
    case 'MODEL_MOVED': {
      const m = find(ev.id);
      if (!m) break;
      const a = state.activation;
      // Follow-Up: who had this model Engaged before its Dodge move.
      const holders = a && ev.mode === 'react' ? engagers(state, m) : [];
      m.x = ev.to.x;
      m.y = ev.to.y;
      m.facing = ev.facing;
      if (ev.z !== undefined) {
        if (ev.z > 0) m.z = ev.z;
        else delete m.z;
      }
      const cost = ev.cost ?? ev.dist;
      if (ev.bonus) {
        (state.bonus ??= {})[m.id] = round2((state.bonus[m.id] ?? 0) + cost);
        if (ev.bonus === 'ranger') state.endPhase = true;
        else if (state.surge && !state.surge.ids.includes(m.id)) state.surge.ids.push(m.id);
      }
      if (a && ev.mode === 'follow' && a.follow?.[m.id]) a.follow[m.id]!.moved = round2(a.follow[m.id]!.moved + cost);
      if (a && a.id === m.id && a.seen) notice(state, a, m, ev.from);
      // The route of the activated model, for Attacks of Opportunity.
      if (a && a.id === m.id && a.path && (ev.mode === 'walk' || ev.mode === 'run' || ev.mode === 'climb' || ev.mode === 'jump')) {
        const steps = Math.max(1, Math.ceil(ev.dist / 0.5));
        for (let i = 1; i <= steps; i++) a.path.push({ x: round2(ev.from.x + ((ev.to.x - ev.from.x) * i) / steps), y: round2(ev.from.y + ((ev.to.y - ev.from.y) * i) / steps) });
      }
      // Stand Your Ground: who has moved since the reveal.
      const own = state.schemes[m.side];
      if (own.moved && ev.mode !== 'free' && ev.mode !== 'deploy' && ev.dist > 0.005 && !own.moved.includes(m.id)) own.moved.push(m.id);
      if (a && (ev.mode === 'walk' || ev.mode === 'run' || ((ev.mode === 'climb' || ev.mode === 'jump') && !ev.special)) && a.id === m.id) a.moved = round2(a.moved + cost);
      // Climb / Jump as a Special Movement: counts as having run – only Nothing may follow.
      if (a && (ev.mode === 'climb' || ev.mode === 'jump') && ev.special && a.id === m.id) {
        a.special = ev.mode;
        a.specialUsed = round2((a.specialUsed ?? 0) + cost);
        a.moved = Math.max(a.moved, round2(modelStats(m).spd + 0.01));
      }
      if (a && ev.mode === 'retreat' && a.id === m.id) a.retreated = round2((a.retreated ?? 0) + cost);
      if (a && ev.mode === 'react') {
        const r = a.reactions[m.id];
        if (r) r.moved = round2(r.moved + cost);
        else if (a.id === m.id) a.dodged = round2(a.dodged + cost);
      }
      const extra = cost > ev.dist + 0.05 ? ` (costs ${cost.toFixed(1)}")` : '';
      const level = ev.z !== undefined ? (ev.z > 0 ? `, now ${ev.z}" high` : ', down on the table') : '';
      log('move', `${m.name} ${ev.mode ? MOVE_VERB[ev.mode] : 'moved'} ${ev.dist.toFixed(1)}"${extra}${level}${ev.special ? ' (Special Movement: only Nothing may follow)' : ''}`);
      if (a && holders.length > 0) {
        const still = engagers(state, m).map((e) => e.id);
        for (const f of holders) {
          if (still.includes(f.id) || !hasSkill(f, 'Follow-Up') || isOut(f) || a.follow?.[f.id]) continue;
          (a.follow ??= {})[f.id] = { target: m.id, moved: 0 };
          log('info', `${f.name} may Follow-Up: up to ${(modelStats(f).spd / 2).toFixed(1)}" towards ${m.name} (drag it)`);
        }
      }
      break;
    }
    case 'MODEL_ROTATED': {
      const m = find(ev.id);
      if (m) m.facing = ev.facing;
      break;
    }
    case 'MODEL_HP': {
      const m = find(ev.id);
      if (!m) break;
      const before = m.hp;
      m.hp = ev.hp;
      if (ev.states) m.states = [...ev.states];
      const now = m.states.includes('Dead') ? ' – Dead' : m.states.includes('Incapacitated') ? ' – Incapacitated' : '';
      log('hp', before === ev.hp ? `${m.name} suffers a Wound${now}` : `${m.name}: HP ${before} → ${ev.hp}${now}`);
      break;
    }
    case 'MODEL_AP': {
      const m = find(ev.id);
      if (!m) break;
      log('info', `${m.name}: AP ${m.ap} → ${ev.ap}`);
      m.ap = ev.ap;
      break;
    }
    case 'MODEL_STATE': {
      const m = find(ev.id);
      if (!m) break;
      m.states = m.states.filter((s) => s !== ev.state);
      if (ev.on) {
        m.states.push(ev.state);
        // Flying ends when the model is brought down.
        if (['Crouched', 'Immobilized', 'Incapacitated', 'Dead'].includes(ev.state)) m.states = m.states.filter((s) => s !== 'Flying');
      }
      log('info', `${m.name} is ${ev.on ? 'now' : 'no longer'} ${ev.state}`);
      break;
    }
    case 'LEADER_SET': {
      const m = find(ev.id);
      if (!m) break;
      for (const x of state.models) if (x.side === m.side) x.leader = x.id === m.id;
      log('info', `${m.name} leads ${SIDE_NAME[m.side]}`);
      break;
    }
    case 'MODEL_REMOVED': {
      const i = state.models.findIndex((x) => x.id === ev.id);
      if (i < 0) break;
      const [m] = state.models.splice(i, 1);
      if (state.activation?.id === ev.id) state.activation = null;
      else if (state.activation) delete state.activation.reactions[ev.id];
      log('info', `${m!.name} removed from the table${ev.why ? ` (${ev.why})` : ''}`);
      break;
    }
    case 'ABILITY_USED':
      (state.used[ev.id] ??= []).push(ev.name);
      break;
    case 'MOUNTED': {
      const m = find(ev.id);
      const def = mountById(m?.mount?.id);
      if (!m || !m.mount || !def || m.mount.on) break;
      m.mount = { ...m.mount, on: true, riderHp: m.hp };
      m.hp += m.mount.hp;
      m.maxHp += def.hp;
      m.size = def.size;
      m.states = m.states.filter((x) => x !== 'Crouched');
      log('turn', `${m.name} mounts its ${def.name}${ev.how ? ` (${ev.how})` : ''}`);
      break;
    }
    case 'DISMOUNTED': {
      const m = find(ev.id);
      const def = mountById(m?.mount?.id);
      if (!m || !m.mount?.on || !def) break;
      const riderMax = m.maxHp - def.hp;
      // The Mount's bonus HP is lost first.
      const lost = Math.max(0, (m.mount.riderHp ?? riderMax) + m.mount.hp - m.hp);
      let steed = Math.max(0, m.mount.hp - lost);
      const rider = Math.max(0, Math.min(riderMax, m.hp - steed));
      steed = Math.min(def.hp, Math.max(steed, m.hp - rider));
      m.hp = rider;
      m.maxHp = riderMax;
      m.size = m.mount.riderSize;
      m.mount = { id: m.mount.id, on: false, hp: steed, riderSize: m.mount.riderSize };
      if (ev.why === 'knockdown') m.states = m.states.filter((x) => x !== 'Crouched');
      log('turn', `${m.name} ${ev.why === 'knockdown' ? 'is knocked off' : ev.why === 'down' ? 'falls from' : 'dismounts'} its ${def.name}${steed < def.hp ? ` (${def.name} bonus HP left: ${steed})` : ''}`);
      break;
    }
    case 'DICE_ROLLED': {
      const r = ev.result;
      const head = r.label ? `${r.label}: ` : '';
      const tail =
        r.target === null
          ? ''
          : ` → ${r.successes} success${r.successes === 1 ? '' : 'es'} vs ${r.target}${r.crits ? `, ${r.crits} critical` : ''}`;
      log('dice', `${head}rolled ${r.dice.length}d20${tail}`, r);
      break;
    }
    case 'PLAYER_READY':
      state.ready[ev.seat] = true;
      log('info', `${SIDE_NAME[ev.seat]} is ready`);
      break;
    case 'INITIATIVE_PENDING':
      state.initiative = { rolls: [null, null] };
      log('turn', 'Both players are ready – the game begins with the Initiative Check: each rolls a d20 and adds the Morale of its Leader');
      break;
    case 'INITIATIVE_ROLLED':
      if (state.initiative) state.initiative.rolls[ev.seat] = ev.roll;
      break;
    case 'STRATEGIC_PENDING':
      state.pendingTurn = { side: ev.seat, round: ev.round, rolls: ev.rolls };
      log('turn', `${SIDE_NAME[ev.seat]}'s Strategic Phase: ${ev.rolls.length} ${ev.rolls.length === 1 ? 'roll waits' : 'rolls wait'} for its player`);
      break;
    case 'GAME_STARTED': {
      delete state.initiative;
      state.phase = 'playing';
      state.first = ev.first;
      state.partySize = [state.models.filter((m) => m.side === 0 && !isSummoned(m)).length, state.models.filter((m) => m.side === 1 && !isSummoned(m)).length];
      const line = ([0, 1] as const).map((s) => `${SIDE_NAME[s]} ${ev.rolls[s]}+${ev.morale[s]}${ev.bonus?.[s] ? `+${ev.bonus[s]} (Double Time)` : ''}=${ev.rolls[s] + ev.morale[s] + (ev.bonus?.[s] ?? 0)}`).join(', ');
      for (const s of [0, 1] as const) log('dice', `${SIDE_NAME[s]}: Initiative Check, 1d20 + M ${ev.morale[s]}${ev.bonus?.[s] ? ` + ${ev.bonus[s]} (Double Time)` : ''} = ${ev.rolls[s] + ev.morale[s] + (ev.bonus?.[s] ?? 0)}`, { dice: [ev.rolls[s]], target: null, successes: null, crits: 0, label: 'Initiative' });
      log('turn', `Initiative Check: ${line} – ${SIDE_NAME[ev.first]} goes first`);
      break;
    }
    case 'TURN_STARTED':
      state.round = ev.round;
      state.active = ev.active;
      state.activation = null;
      state.used = {};
      state.acted = false;
      delete state.pendingTurn;
      delete state.bonus;
      delete state.endPhase;
      delete state.surge;
      state.stratUsed = [];
      if (state.stratBlocked !== ev.active) state.stratBlocked = undefined;
      // Treasure Hunt: a player who begins a turn in Broken Morale plays the last turn of the Quest.
      state.lastTurn = state.quest === 'treasure-hunt' && state.broken[ev.active];
      if (state.lastTurn) log('turn', `${SIDE_NAME[ev.active]} is in Broken Morale: the Quest ends with this turn`);
      for (const m of state.models) {
        if (ev.rested.includes(m.id)) m.states = m.states.filter((s) => s !== 'Fatigued');
        m.ap = ev.ap[m.id] ?? 0;
      }
      log('turn', `Round ${ev.round} – ${SIDE_NAME[ev.active]}'s turn`);
      break;
    case 'MODEL_ACTIVATED': {
      const m = find(ev.id);
      if (!m) break;
      m.ap = Math.max(0, m.ap - 1);
      state.activation = { id: m.id, moved: 0, reactions: {}, action: null, dodged: 0, seen: [], near: [], path: [{ x: m.x, y: m.y }] };
      if (ev.fled) state.activation.panic = ev.fled;
      state.acted = true;
      notice(state, state.activation, m, m);
      log('turn', `${m.name} activates (${m.ap} AP left)`);
      if (ev.panic) log('combat', `${m.name} is Panicked: 1d20 vs M ${ev.panic.target} – ${ev.panic.successes ? 'it holds' : ev.fled === 'hold' ? 'failed: Engaged, it can only stay and Dodge' : 'failed: it Runs towards the nearest edge'}`, ev.panic);
      break;
    }
    case 'MODEL_REACTED': {
      const m = find(ev.id);
      if (!m || !state.activation) break;
      m.ap = Math.max(0, m.ap - 1);
      const intent = ev.intent ?? 'other';
      const weapon = ev.weapon ?? 0;
      state.activation.reactions[m.id] = { moved: 0, intent, weapon, mods: ev.mods ?? { ...NO_MODS }, ...(ev.at ? { at: ev.at } : {}), ...(ev.charm && ev.charm.successes === 0 && ev.charmLevel === 2 ? { drawn: true } : {}) };
      if (ev.forced && state.activation.seen && intent !== 'dodge' && !state.activation.seen.includes(m.id)) state.activation.seen.push(m.id);
      if (intent === 'attack' && state.schemes[m.side].attacked === false) state.schemes[m.side].attacked = true;
      const what = intent === 'attack' ? `an Attack (${weaponAt(m, weapon)?.name ?? 'weapon'})` : intent === 'dodge' ? 'a Dodge' : 'a Reaction';
      log('turn', `${m.name} declares ${ev.at ? 'an Attack of Opportunity' : what} (${m.ap} AP left)${ev.forced ? ' – allowed by the players' : ''}${ev.taunt ? ' – Taunted, it has to react' : ''}`);
      if (ev.panic) log('combat', `${m.name} is Panicked: 1d20 vs M ${ev.panic.target} – ${ev.panic.successes ? 'it holds' : 'failed: it can only Dodge, towards the edge'}`, ev.panic);
      if (ev.charm) {
        const who = find(state.activation.id)?.name ?? '?';
        const fail = ev.charmLevel === 2 ? `charmed: it can only declare Nothing, and at the end of the Activation Sequence it Walks its full SPD towards ${who}` : 'charmed: it can only declare Nothing';
        log('combat', `${m.name} reacts against ${who} (Charm ${ev.charmLevel === 2 ? 'II' : 'I'}): 1d20 vs INT ${ev.charm.target} – ${ev.charm.successes ? 'it resists' : fail}`, ev.charm);
      }
      if (state.activation.taunted) state.activation.taunted = state.activation.taunted.filter((x) => x !== m.id);
      break;
    }
    case 'MOVE_UNDONE': {
      const m = find(ev.id);
      const last = state.lastMove;
      if (!m || !last || last.id !== m.id) break;
      m.x = last.x;
      m.y = last.y;
      m.facing = last.facing;
      if (last.z) m.z = last.z;
      else delete m.z;
      state.activation = last.activation;
      // A Ranger's End Phase Movement or one on Surge Order: as if it had not been made.
      if (last.bonus) {
        if (last.bonus.moved) state.bonus = last.bonus.moved;
        else delete state.bonus;
        if (last.bonus.endPhase) state.endPhase = true;
        else delete state.endPhase;
        if (state.surge && last.bonus.surge) state.surge.ids = last.bonus.surge;
      }
      if (last.moved) state.schemes[m.side].moved = last.moved;
      delete state.lastMove;
      log('move', `${m.name}'s last Movement is taken back`);
      break;
    }
    case 'ROLL_PENDING':
      if (state.activation) state.activation.roll = { cmd: ev.cmd, wait: [...ev.wait], from: ev.from };
      log('turn', `The Action is declared – waiting for ${ev.wait.map((x) => SIDE_NAME[x]).join(' and ')} to roll`);
      break;
    case 'ROLL_READIED': {
      const r = state.activation?.roll;
      if (!r) break;
      r.wait = r.wait.filter((x) => x !== ev.seat);
      if (r.wait.length === 0) delete state.activation!.roll;
      break;
    }
    case 'REACTION_ADJUSTED': {
      const r = state.activation?.reactions[ev.id];
      const m = find(ev.id);
      if (!r || !m) break;
      r.mods = { ...r.mods, hit: ev.hit, stk: ev.stk };
      log('turn', `${m.name}'s Reaction: attribute ${ev.hit >= 0 ? '+' : ''}${ev.hit}, Strike ${ev.stk >= 0 ? '+' : ''}${ev.stk}`);
      break;
    }
    case 'ROLL_CANCELLED':
      if (state.activation) delete state.activation.roll;
      log('turn', 'The Action is called back');
      break;
    case 'TERRAIN_ADDED':
      state.terrain = [...state.terrain, ev.piece];
      break;
    case 'TERRAIN_REMOVED': {
      const names = state.terrain.filter((t) => ev.ids.includes(t.id)).map((t) => t.name);
      state.terrain = state.terrain.filter((t) => !ev.ids.includes(t.id));
      if (ev.why && names.length) log('info', `${[...new Set(names)].join(', ')}: ${ev.why === 'ends' ? 'the Spell ends' : ev.why}`);
      break;
    }
    case 'TAUNTED': {
      const a = state.activation;
      const m = find(ev.id);
      if (!a || !m) break;
      a.taunted = ev.rolls.filter((r) => r.dice.successes === 0).map((r) => r.id);
      a.tauntUsed = true;
      log('combat', `${m.name} uses Taunt`);
      for (const r of ev.rolls) log('combat', `${find(r.id)?.name ?? '?'}: Taunt, 1d20 vs INT ${r.dice.target} – ${r.dice.successes ? 'it keeps its head' : `it must react against ${m.name} if it can`}`, r.dice);
      break;
    }
    case 'IMPEDED': {
      const m = find(ev.id);
      if (!m || !state.activation) break;
      m.x = ev.at.x;
      m.y = ev.at.y;
      state.activation.impeded = true;
      if (!m.states.includes('Engaged')) m.states.push('Engaged');
      log('combat', `Impede: ${m.name}'s Movement ends where ${find(ev.who)?.name ?? '?'} attacked it – it is Engaged`);
      break;
    }
    case 'ACTION_RESOLVED': {
      if (state.activation) {
        state.activation.action = ev.action;
        delete state.activation.pending;
      }
      const actor = state.activation ? find(state.activation.id) : undefined;
      // Any Action other than Nothing ends the Shrouded State – for the activated model and for those that reacted.
      const reveal = (m: Model | undefined) => {
        if (!m?.states.includes('Shrouded')) return;
        m.states = m.states.filter((x) => x !== 'Shrouded');
        log('info', `${m.name} is no longer Shrouded`);
      };
      if (ev.action !== 'nothing') reveal(actor);
      for (const [id, r] of Object.entries(state.activation?.reactions ?? {})) if (r.intent !== 'other') reveal(find(id));
      if (actor) {
        const sc = state.schemes[actor.side];
        const now = sc.at !== undefined && sc.at.round === state.round && sc.at.active === state.active && !sc.scored;
        if (ev.action === 'attack' && sc.attacked === false) sc.attacked = true;
        if (ev.flank && now && sc.revealed === 'unmatched-flanking') sc.count = (sc.count ?? 0) + 1;
        if (ev.deathblow) state.tally[actor.side].deathblows += 1;
      }
      for (const x of ev.mana ?? []) {
        const caster = find(x.id);
        if (caster) caster.mana = Math.max(0, (caster.mana ?? 0) - x.spent);
      }
      for (const d of ev.dealt ?? []) {
        const by = find(d.by);
        const to = find(d.to);
        if (!by || !to || by.side === to.side) continue;
        const tally = state.tally[by.side];
        if (d.melee) tally.melee += d.wounds;
        if (d.reactive) tally.reactive += d.wounds;
        if (d.out && profileOf(to).cost > profileOf(by).cost && !tally.valor.includes(by.id)) tally.valor.push(by.id);
        const sc = state.schemes[by.side];
        const now = sc.at !== undefined && sc.at.round === state.round && sc.at.active === state.active && !sc.scored;
        if (now && sc.revealed === 'open-aggression' && by.side === state.active) sc.count = (sc.count ?? 0) + d.wounds;
      }
      for (const line of ev.lines) log('combat', line.text, line.dice);
      for (const r of ev.results) {
        const m = find(r.id);
        if (!m) continue;
        m.hp = r.hp;
        m.states = [...r.states];
        if (r.ap !== undefined) m.ap = r.ap;
        if (r.temp) m.temp = { ...r.temp };
        if (r.to) {
          m.x = r.to.x;
          m.y = r.to.y;
          const z = surfaceAt(state, r.to);
          if (z > 0.01 || m.z) m.z = z;
        }
      }
      for (const u of ev.used ?? []) (state.used[u.id] ??= []).push(u.what);
      useKit(ev.kit);
      if (ev.lines.length === 0 && ev.action === 'nothing') {
        const m = state.activation ? find(state.activation.id) : undefined;
        if (m) log('info', `${m.name} declares Nothing`);
      }
      break;
    }
    case 'STRATEGIC': {
      log('turn', 'Strategic Phase');
      for (const line of ev.lines) log('combat', line.text, line.dice);
      for (const r of ev.results) {
        const m = find(r.id);
        if (!m) continue;
        m.hp = r.hp;
        m.states = [...r.states];
        for (const k of Object.keys(m.temp ?? {}) as StateName[]) if (m.temp![k] === 'strategic' || !m.states.includes(k)) delete m.temp![k];
      }
      break;
    }
    case 'ENGAGEMENT': {
      const names = (ids: string[]) => ids.map((id) => find(id)?.name).filter(Boolean).join(', ');
      for (const m of state.models) {
        if (ev.on.includes(m.id) && !m.states.includes('Engaged')) m.states.push('Engaged');
        if (ev.off.includes(m.id)) m.states = m.states.filter((x) => x !== 'Engaged');
      }
      if (ev.on.length) log('info', `Engaged: ${names(ev.on)}`);
      if (ev.off.length) log('info', `No longer Engaged: ${names(ev.off)}`);
      break;
    }
    case 'ACTIVATION_ENDED':
      state.activation = null;
      break;
    case 'STRATAGEM_DECLARED': {
      (state.stratUsed ??= []).push(ev.name);
      state.strats = [...(state.strats ?? []), { seat: ev.seat, name: ev.name, text: ev.text, on: ev.on }];
      for (const g of ev.grants) {
        const m = find(g.id);
        if (m) m.boons = [...(m.boons ?? []).filter((b) => !(b.name === ev.name && b.from === ev.seat)), { name: ev.name, from: ev.seat, fx: g.fx }];
      }
      if (ev.negate) state.stratCheck = ev.seat === 0 ? 1 : 0;
      const names = ev.on.map((id) => find(id)?.name).filter(Boolean);
      log('turn', `${SIDE_NAME[ev.seat]} declares the Stratagem ${ev.name}${names.length ? ` – ${names.length > 4 ? `${names.length} models` : names.join(', ')}` : ''}`);
      for (const line of ev.lines) log('combat', line.text, line.dice);
      break;
    }
    case 'STRATAGEMS_ENDED': {
      const gone = (state.strats ?? []).filter((x) => x.seat === ev.seat).map((x) => x.name);
      state.strats = (state.strats ?? []).filter((x) => x.seat !== ev.seat);
      for (const m of state.models) {
        if (!m.boons) continue;
        m.boons = m.boons.filter((b) => b.from !== ev.seat);
        if (m.boons.length === 0) delete m.boons;
      }
      if (gone.length) log('info', `${SIDE_NAME[ev.seat]}'s Stratagem${gone.length > 1 ? 's' : ''} ${gone.join(', ')} ${ev.why === 'negated' ? (gone.length > 1 ? 'are negated' : 'is negated') : gone.length > 1 ? 'end' : 'ends'}`);
      break;
    }
    case 'STRATAGEM_CHECK':
      state.stratCheck = undefined;
      state.stratBlocked = ev.ok ? undefined : ev.seat;
      if (ev.text) log('turn', ev.text, ev.dice.dice.length ? ev.dice : undefined);
      break;
    case 'ENCHANTED': {
      const m = find(ev.id);
      if (!m) break;
      m.enchants = [...(m.enchants ?? []).filter((e) => e.name !== ev.name), { name: ev.name, until: ev.until, caster: ev.caster }];
      if (ev.caster === m.id && !state.activation) {
        (state.used[m.id] ??= []).push('Artificer');
        log('turn', `${m.name} (Artificer) enchants itself: ${ev.name}`);
      }
      break;
    }
    case 'DISENCHANTED': {
      const m = find(ev.id);
      if (!m) break;
      m.enchants = (m.enchants ?? []).filter((e) => !ev.names.includes(e.name));
      if (m.enchants.length === 0) delete m.enchants;
      log('info', `${m.name}: ${ev.names.join(', ')} ${ev.why === 'ends' ? (ev.names.length > 1 ? 'end' : 'ends') : 'removed'}`);
      break;
    }
    case 'MODEL_MANA': {
      const m = find(ev.id);
      if (!m) break;
      const gained = ev.mana - (m.mana ?? 0);
      m.ap = ev.ap;
      m.mana = ev.mana;
      log('turn', gained >= 0 ? `${m.name} turns ${gained} AP into Mana (${m.mana} Mana, ${m.ap} AP left)` : `${m.name} spends ${-gained} Mana (${m.mana} left)`);
      break;
    }
    case 'MODEL_KIT': {
      const m = find(ev.id);
      if (!m) break;
      if (ev.items) m.items = { ...m.items, ...ev.items };
      if (ev.luck !== undefined) m.luck = ev.luck;
      if (ev.spent) m.spent = [...ev.spent];
      if (ev.picks) m.picks = { ...m.picks, ...ev.picks };
      if (ev.thrown) {
        if (ev.thrown.length) m.thrown = [...ev.thrown];
        else delete m.thrown;
      }
      if (ev.text) log('info', ev.text);
      break;
    }
    case 'SURGE_ORDERED': {
      state.surge = { side: ev.seat, ids: [] };
      log('turn', `Surge Order: up to 3 Helian League models of ${SIDE_NAME[ev.seat]} may Walk, Climb or Jump now (drag them) – no Reactions`);
      break;
    }
    case 'EFFECT': {
      useKit(ev.kit);
      for (const line of ev.lines) log('combat', line.text, line.dice);
      for (const r of ev.results) {
        const m = find(r.id);
        if (!m) continue;
        m.hp = r.hp;
        m.states = [...r.states];
        if (r.ap !== undefined) m.ap = r.ap;
        if (r.temp) m.temp = { ...r.temp };
      }
      break;
    }
    case 'MARKER_REVEALED': {
      const k = state.markers.find((x) => x.id === ev.id);
      if (!k) break;
      const who = ev.who ? find(ev.who)?.name : undefined;
      log('turn', `${who ? `${who} reveals ${k.name}` : `${k.name} is revealed`}: a Sigil of ${ev.spell} (d20: ${ev.roll})`);
      k.kind = 'sigil';
      k.spell = ev.spell;
      k.name = `Sigil${tokenTag(k)}: ${ev.spell}`;
      break;
    }
    case 'MARKER_SET': {
      const k = state.markers.find((x) => x.id === ev.id);
      if (!k) break;
      k.kind = ev.kind;
      delete k.spell;
      k.name = ev.kind === 'cache' ? `Cache${tokenTag(k)}` : ev.kind === 'opened' ? `Cache${tokenTag(k)} (unlocked)` : ev.kind === 'treasure' ? 'Treasure' : k.name;
      break;
    }
    case 'TREASURE_TAKEN': {
      const m = find(ev.id);
      const i = state.markers.findIndex((x) => x.id === ev.marker);
      if (!m || i < 0) break;
      m.treasure = (m.treasure ?? 0) + 1;
      m.states = m.states.filter((x) => x !== 'Shrouded');
      const k = state.markers[i]!;
      if (k.kind === 'treasure') state.markers.splice(i, 1);
      else {
        k.kind = 'opened';
        k.name = `Cache${tokenTag(k)} (unlocked)`;
      }
      break;
    }
    case 'MODEL_LEFT': {
      const i = state.models.findIndex((x) => x.id === ev.id);
      if (i < 0) break;
      const [m] = state.models.splice(i, 1);
      state.escaped[m!.side] += m!.treasure ?? 0;
      if (state.activation?.id === ev.id) state.activation = null;
      log('turn', `${m!.name} leaves the field with ${m!.treasure === 1 ? 'a Treasure' : `${m!.treasure ?? 0} Treasures`}`);
      break;
    }
    case 'MODEL_FLED': {
      const m = find(ev.id);
      if (!m) break;
      m.states = [...m.states.filter((x) => x !== 'Incapacitated' && x !== 'Flying'), 'Dead'];
      log('combat', `${m.name} runs off the field – it is lost`);
      break;
    }
    case 'ATTACK_DECLARED': {
      const a = state.activation;
      const active = a ? find(a.id) : undefined;
      const target = find(ev.target);
      if (!a || !active || !target) break;
      a.pending = { weapon: ev.weapon, target: ev.target, mods: ev.mods, protectors: [...ev.protectors] };
      const names = ev.protectors.map((id) => find(id)?.name ?? '?').join(', ');
      log('turn', `${active.name} declares an Attack on ${target.name} (${weaponAt(active, ev.weapon)?.name ?? 'weapon'}) – ${SIDE_NAME[target.side]} may answer with Protector: ${names}`);
      break;
    }
    case 'PROTECTED': {
      const m = find(ev.id);
      const ward = find(ev.ward);
      if (!m || !ward) break;
      m.ap = Math.max(0, m.ap - 1);
      m.x = ev.to.x;
      m.y = ev.to.y;
      log('turn', `${m.name} steps in for ${ward.name} and takes the Attack (Protector, ${m.ap} AP left)`);
      break;
    }
    case 'TURN_ENDED':
      state.activation = null;
      for (const m of state.models) {
        m.ap = 0;
        // States that last "until the end of the turn".
        const over = m.states.filter((x) => m.temp?.[x] === 'turn');
        if (over.length === 0) continue;
        m.states = m.states.filter((x) => !over.includes(x));
        log('info', `${m.name} is no longer ${over.join(', ')}`);
      }
      break;
    case 'MARKER_ADDED':
      state.markers.push({ ...ev.marker });
      log('info', `puts the token "${ev.marker.name}" on the table`);
      break;
    case 'MARKER_MOVED': {
      const k = state.markers.find((x) => x.id === ev.id);
      if (!k) break;
      k.x = ev.x;
      k.y = ev.y;
      log('info', `moves the token "${k.name}"`);
      break;
    }
    case 'MARKER_REMOVED': {
      const k = state.markers.find((x) => x.id === ev.id);
      state.markers = state.markers.filter((x) => x.id !== ev.id);
      if (k) log('info', `takes the token "${k.name}" off the table`);
      break;
    }
    case 'GAME_FINISHED':
      delete state.initiative;
      delete state.pendingTurn;
      state.phase = 'finished';
      state.winner = ev.winner;
      state.activation = null;
      if (ev.conceded !== undefined) {
        state.conceded = ev.conceded;
        log('turn', `${SIDE_NAME[ev.conceded]} concedes the game`);
      }
      log('turn', ev.winner === 'draw' ? `Game over – a draw, ${state.vp[0]}:${state.vp[1]}` : `Game over – ${SIDE_NAME[ev.winner]} wins ${state.vp[0]}:${state.vp[1]}`);
      break;
    case 'QUEST_SCORED': {
      // A Quest gives at most 10 Victory Points.
      const got = (state.questVp ??= [0, 0]);
      const delta = ev.delta > 0 ? Math.min(ev.delta, Math.max(0, QUEST_VP_LIMIT - got[ev.team])) : ev.delta;
      got[ev.team] += delta;
      state.vp[ev.team] += delta;
      tallied(state, 'quest', ev.team, delta);
      if (ev.mark) state.scored.push(ev.mark);
      log('turn', `${SIDE_NAME[ev.team]} ${ev.delta >= 0 ? 'scores' : 'loses'} ${Math.abs(delta)} VP – ${ev.text}${delta !== ev.delta ? ` (the Quest gives at most ${QUEST_VP_LIMIT})` : ''} (now ${state.vp[ev.team]})`);
      break;
    }
    case 'BROKEN_MORALE':
      state.broken[ev.team] = true;
      for (const m of state.models) if (ev.ids.includes(m.id) && !m.states.includes('Panicked')) m.states.push('Panicked');
      // Whoever was Panicked only until the end of the turn now stays Panicked.
      for (const m of state.models) if (m.side === ev.team && m.temp?.Panicked) delete m.temp.Panicked;
      log('turn', `Broken Morale: fewer than half of ${SIDE_NAME[ev.team]} is still standing – the rest are Panicked`);
      break;
    case 'PARTY_DEPLOYED':
      state.factions[ev.team] = ev.faction;
      log('info', `${SIDE_NAME[ev.team]} deploys a ${ev.faction} party (${ev.points} pts)`);
      break;
    case 'SCHEMES_DRAWN':
      state.schemes[ev.seat].drawn = ev.count;
      log('info', `${SIDE_NAME[ev.seat]} draws ${ev.count} Schemes`);
      break;
    case 'SCHEME_KEPT':
      state.schemes[ev.seat].kept = true;
      log('info', `${SIDE_NAME[ev.seat]} has chosen a Scheme`);
      break;
    case 'SCHEME_SCORED': {
      const name = schemeByCode(ev.code)?.name ?? ev.code;
      state.schemes[ev.seat].scored = true;
      state.vp[ev.seat] += ev.delta;
      tallied(state, 'scheme', ev.seat, ev.delta);
      if (ev.worth !== undefined) log('turn', `${name} (${SIDE_NAME[ev.seat]}): by the table's count ${ev.worth} VP – ${ev.text}. Enter Scheme points on the score sheet`);
      else if (ev.auto) log('turn', `${SIDE_NAME[ev.seat]} scores ${ev.delta} VP for ${name} – ${ev.text} (now ${state.vp[ev.seat]})`);
      else log('turn', `${name} (${SIDE_NAME[ev.seat]}) is scored by hand – enter it on the score sheet`);
      finalScore();
      break;
    }
    case 'SCHEME_REVEALED':
      if (state.phase === 'playing') Object.assign(state.schemes[ev.seat], { at: { round: state.round, active: state.active }, count: 0, moved: [], attacked: false });
      state.schemes[ev.seat].revealed = ev.code;
      log('turn', `${SIDE_NAME[ev.seat]} reveals its Scheme: ${schemeByCode(ev.code)?.name ?? ev.code}`);
      break;
    case 'VP_CHANGED': {
      // Events saved before the field was renamed only have `side` (the player who clicked).
      const team = ev.team ?? ev.side ?? 0;
      log('info', `${SIDE_NAME[team]}: ${state.vp[team]} → ${ev.vp} VP${ev.round ? ` (round ${ev.round}, ${ev.kind === 'scheme' ? 'Scheme' : 'Quest'})` : ''}`);
      tallied(state, ev.kind ?? 'quest', team, ev.vp - state.vp[team], ev.round);
      state.vp[team] = ev.vp;
      finalScore();
      break;
    }
  }
  for (const m of state.models) if (m.hp < (hpBefore.get(m.id) ?? m.hp) && !state.hurt.includes(m.id)) state.hurt.push(m.id);
  // An Incapacitated model loses its Mana Counters.
  for (const m of state.models) if (m.mana && isOut(m)) delete m.mana;
  // A carrier that is taken out drops its Treasure next to it.
  for (const m of state.models) {
    if (!m.treasure || !isOut(m)) continue;
    for (let i = 0; i < m.treasure; i++) {
      const off = (baseRadius(m.size) + MARKER_RADIUS) * (m.x > state.width / 2 ? -1 : 1);
      state.markers.push({ id: `loot-${ev.seq}-${m.id}-${i}`, name: 'Treasure', x: round2(m.x + off), y: round2(Math.min(state.height - 0.6, Math.max(0.6, m.y + i * 1.1))), radius: 0, kind: 'treasure' });
    }
    log('turn', `${m.name} drops ${m.treasure === 1 ? 'the Treasure' : 'its Treasures'}`);
    delete m.treasure;
  }
  state.seq = ev.seq;
}
