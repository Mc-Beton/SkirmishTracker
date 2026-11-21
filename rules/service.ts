// The rules of a table, run for the WarBracket backend. The backend keeps the event log and the players' Scheme
// cards; this service only decides: a command and the log go in, the events that happened come out.
// It keeps the folded state of recent tables in memory to save the replay; with a stale or missing copy it asks
// for the whole log (NEED_LOG) and rebuilds.

import { randomInt } from 'node:crypto';
import { apply, decide, emptyState, RuleError, schemeScoring, tallyOf } from '../frontend/src/lib/eld/engine.ts';
import { BASES, buildMap, checkPlacements, KITS, MAPS, type GameMap, type Placement } from '../frontend/src/lib/eld/maps.ts';
import { drawSchemes } from '../frontend/src/lib/eld/quests.ts';
import type { Command, EventBody, GameEvent, Model, Side, TableState } from '../frontend/src/lib/eld/types.ts';
import { partyFrom, questFor, terrainFrom, type ListInput } from './mapping.ts';

export interface SchemeHand {
  options: string[];
  kept: string | null;
}
export type Hands = [SchemeHand | null, SchemeHand | null];

export class NeedLog extends Error {}
export class BadRequest extends Error {}

const MAX_TABLES = 300;
const MAX_EVENTS = 20000;
const cache = new Map<string, TableState>();

const d20 = (): number => randomInt(1, 21);

function remember(id: string, state: TableState): void {
  cache.delete(id);
  cache.set(id, state);
  if (cache.size > MAX_TABLES) cache.delete(cache.keys().next().value as string);
}

/** The state after `seq` events: from memory, or replayed from the log the caller sent. */
function stateOf(id: string, seq: number, log: unknown): TableState {
  const hit = cache.get(id);
  if (hit && hit.seq === seq) return hit;
  if (!Array.isArray(log)) throw new NeedLog();
  if (log.length > MAX_EVENTS) throw new BadRequest('The log is too long');
  const state = emptyState(id);
  for (const ev of log as GameEvent[]) step(state, ev);
  if (state.seq !== seq) throw new BadRequest(`The log ends at ${state.seq}, expected ${seq}`);
  return state;
}

// ---- hidden information: Shrouded models ----
// A model deployed Shrouded is a secret of its owner until something reveals it. The browsers fold the events
// themselves, so the secret must not be in what the other player (or an onlooker) is sent: for those viewers an
// event gets a second form in which the model is a plain token and its name does not appear. The event that reveals
// the model carries it as it then is (`unmask`), and the page puts it in the token's place.

/** What a viewer is sent instead of an event: `a` / `b` – the players, `o` – anybody else. Absent: the event itself. */
export interface View {
  a?: GameEvent;
  b?: GameEvent;
  o?: GameEvent;
}
type Kept = TableState & { /** Ids of the models nobody but their owner has seen yet. */ veil?: string[] };
const MASK = 'Shrouded';

const maskOf = (m: Model): Model =>
  ({ id: m.id, side: m.side, name: MASK, faction: m.faction, profileId: null, kind: 'rogue', size: m.size, leader: false, x: m.x, y: m.y, ...(m.z ? { z: m.z } : {}), facing: m.facing, hp: 1, maxHp: 1, ap: 0, states: ['Shrouded'] }) as Model;

function redact<T>(value: T, re: RegExp): T {
  if (typeof value === 'string') return value.replace(re, MASK) as T;
  if (Array.isArray(value)) return value.map((v) => redact(v, re)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'id' || k === 'type' ? v : redact(v, re)])) as T;
  return value;
}

/** Applies an event and says what the viewers who may not see everything get in its place (null: the event). */
function step(state: Kept, ev: GameEvent): View | null {
  apply(state, ev);
  const veil = new Set(state.veil ?? []);
  if (ev.type === 'MODEL_ADDED' && ev.model.states?.includes('Shrouded')) veil.add(ev.model.id);
  const hidden: Model[] = [];
  const shown: Model[] = [];
  for (const id of [...veil]) {
    const m = state.models.find((x) => x.id === id);
    if (!m) veil.delete(id);
    else if (!m.states.includes('Shrouded')) {
      veil.delete(id);
      shown.push(m);
    } else hidden.push(m);
  }
  state.veil = [...veil];
  if (hidden.length === 0 && shown.length === 0) return null;
  const raw = JSON.stringify(ev);
  const make = (sides: Side[]): GameEvent | undefined => {
    const hide = hidden.filter((m) => sides.includes(m.side));
    const show = shown.filter((m) => sides.includes(m.side));
    if (hide.length === 0 && show.length === 0) return undefined;
    let out = JSON.parse(raw) as GameEvent & { unmask?: Model[] };
    if (out.type === 'MODEL_ADDED' && hide.some((m) => m.id === out.model.id)) (out as { model: Model }).model = maskOf(out.model as Model);
    // What a hidden model carries (items, Luck, the choices of its Upgrades) stays its owner's secret.
    if (out.type === 'MODEL_KIT' && hide.some((m) => m.id === (out as { id: string }).id)) out = { type: 'MODEL_KIT', id: (out as { id: string }).id, seq: out.seq, ts: out.ts, side: out.side, by: out.by } as GameEvent & { unmask?: Model[] };
    // Its name in the texts of the event – unless a model everybody sees has the same name (then the text stays).
    const open = new Set(state.models.filter((m) => !hide.includes(m)).map((m) => m.name));
    const names = [...new Set(hide.map((m) => m.name))].filter((n) => !open.has(n)).sort((x, y) => y.length - x.length);
    if (names.length > 0) {
      const alts = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      out = redact(out, new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?! \\d)(?![\\p{L}\\p{N}])`, 'gu'));
    }
    if (show.length > 0) out.unmask = structuredClone(show);
    return JSON.stringify(out) === raw ? undefined : out;
  };
  const view: View = {};
  const a = make([1]);
  const b = make([0]);
  const o = make([0, 1]);
  if (a) view.a = a;
  if (b) view.b = b;
  if (o) view.o = o;
  return a || b || o ? view : null;
}

/** The views of the events of one answer, in step with `out`. */
const viewsOf = new WeakMap<GameEvent[], (View | null)[]>();
const views = (out: GameEvent[]): (View | null)[] => viewsOf.get(out) ?? out.map(() => null);

/** Numbers the events, applies them to the state and returns them as they are to be stored. */
function commit(state: TableState, bodies: EventBody[], side: Side | null, by: string, out: GameEvent[]): void {
  if (state.seq + bodies.length > MAX_EVENTS) throw new RuleError('TABLE_FULL_LOG', 'This table has reached its event limit');
  if (!viewsOf.has(out)) viewsOf.set(out, []);
  for (const body of bodies) {
    const ev = { ...body, seq: state.seq + 1, ts: Date.now(), side, by } as GameEvent;
    // The copy is what gets stored: the state may keep (and later change) parts of the event it was given.
    out.push(structuredClone(ev));
    viewsOf.get(out)!.push(step(state, ev));
  }
}

export interface Summary {
  phase: TableState['phase'];
  round: number;
  active: Side;
  vp: [number, number];
  winner: Side | 'draw' | null;
  factions: [string | null, string | null];
  seq: number;
  /** Victory Points round by round (index 0 = round 1), for the Quest and for Schemes, by side. */
  sheet: ReturnType<typeof tallyOf>;
  /** The side that gave the game up. */
  conceded?: Side;
}

const summary = (s: TableState): Summary => ({ phase: s.phase, round: s.round, active: s.active, vp: s.vp, winner: s.winner, factions: s.factions, seq: s.seq, sheet: tallyOf(s), ...(s.conceded !== undefined ? { conceded: s.conceded } : {}) });

const name = (v: unknown, fallback: string): string => {
  // eslint-disable-next-line no-control-regex
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 40) : '';
  return s || fallback;
};
const side01 = (v: unknown): Side => {
  if (v !== 0 && v !== 1) throw new BadRequest('Unknown side');
  return v;
};

function deploy(state: TableState, side: Side, list: ListInput, out: GameEvent[]): void {
  const party = partyFrom(list);
  if (typeof party === 'string') throw new RuleError('BAD_PARTY', party);
  commit(state, decide(state, { type: 'DEPLOY_PARTY', side, ...party }, { d20, side, solo: true }), null, 'Table', out);
}

export interface CreateRequest {
  tableId: string;
  name?: string;
  width: number;
  height: number;
  /** Depth of the belts, or the radius of the corner zones. */
  deployDepth: number;
  deploy?: 'standard' | 'corner';
  /** Rules shapes of the map (WarBracket format). */
  terrain?: unknown;
  /** A 3D table: a map of the game by its id (frontend/src/lib/eld/maps.ts) instead of `terrain`, always 36" x 36". */
  gameMap?: string | null;
  /** A map an admin made (stored by the backend): used instead of `gameMap`, checked again here. */
  customMap?: unknown;
  /** WarBracket quest code. */
  quest?: string | null;
  by: string;
  party: ListInput;
}

/** How many elements with a model a map may have: every one is a file of several megabytes for each player. */
export const MAX_MODELS = 12;

/**
 * A map made in the admin's map creator ({name, base, items}): a known ground, known elements inside their sizes and
 * on the table, not too many models. Returns the map as it is to be stored; a problem is a RuleError (BAD_MAP).
 */
export function checkMap(raw: unknown): GameMap {
  const m = (raw ?? {}) as { name?: unknown; base?: unknown; items?: unknown };
  const base = BASES.find((b) => b.id === m.base);
  if (!base) throw new RuleError('BAD_MAP', 'Unknown ground');
  const items = checkPlacements(m.items);
  if (typeof items === 'string') throw new RuleError('BAD_MAP', items);
  const models = items.filter((i: Placement) => KITS.find((k) => k.id === i.kit)?.model).length;
  if (models > MAX_MODELS) throw new RuleError('BAD_MAP', `A map can have at most ${MAX_MODELS} elements with a model (this one has ${models})`);
  const title = name(m.name, '');
  if (!title) throw new RuleError('BAD_MAP', 'The map needs a name');
  return { id: 'custom', name: title, base: base.id, items };
}

/** A new table: the field, the creator's party on its shelf, the creator in the first seat. */
export function create(req: CreateRequest): { events: GameEvent[]; views: (View | null)[]; summary: Summary; map?: string } {
  const id = String(req.tableId ?? '');
  if (!id) throw new BadRequest('tableId is missing');
  const size = (v: unknown) => (typeof v === 'number' && v >= 12 && v <= 72 ? v : 36);
  const state = emptyState(id);
  const out: GameEvent[] = [];
  const depth = typeof req.deployDepth === 'number' && req.deployDepth >= 2 && req.deployDepth <= 18 ? req.deployDepth : 8;
  // A 3D table plays on a map of the game: its terrain (with the models drawn for it), its ground picture and relief.
  const gameMap = req.customMap != null ? checkMap(req.customMap) : req.gameMap == null || req.gameMap === '' ? null : MAPS.find((m) => m.id === req.gameMap);
  if (gameMap === undefined) throw new RuleError('BAD_MAP', 'Unknown map');
  const built = gameMap ? buildMap(gameMap) : null;
  commit(
    state,
    [
      built
        ? { type: 'TABLE_CREATED', name: name(built.map, 'Table'), width: 36, height: 36, deployDepth: depth, ...(req.deploy === 'corner' ? { deploy: 'corner' as const } : {}), terrain: built.terrain, quest: questFor(req.quest), points: 999, ...(built.ground ? { ground: built.ground } : {}), ...(built.relief ? { relief: built.relief } : {}), map: built.map }
        : { type: 'TABLE_CREATED', name: name(req.name, 'Table'), width: size(req.width), height: size(req.height), deployDepth: depth, ...(req.deploy === 'corner' ? { deploy: 'corner' as const } : {}), terrain: terrainFrom(req.terrain), quest: questFor(req.quest), points: 999 },
    ],
    null,
    'Table',
    out,
  );
  deploy(state, 0, req.party, out);
  const by = name(req.by, 'Player 1');
  commit(state, [{ type: 'PLAYER_JOINED', seat: 0, name: by }], 0, by, out);
  remember(id, state);
  return { events: out, views: views(out), summary: summary(state), ...(built ? { map: built.map } : {}) };
}

export interface JoinRequest {
  tableId: string;
  seq: number;
  log?: unknown;
  by: string;
  party?: ListInput | null;
}

/** The second player sits down; during deployment their party lines up on its shelf. */
export function join(req: JoinRequest): { events: GameEvent[]; views: (View | null)[]; summary: Summary } {
  const state = structuredClone(stateOf(String(req.tableId), Number(req.seq), req.log));
  if (state.players[1] !== null) throw new RuleError('SEAT_TAKEN', 'Both seats are taken');
  const out: GameEvent[] = [];
  if (req.party && state.phase === 'setup' && state.schemes[1].drawn === 0) deploy(state, 1, req.party, out);
  const by = name(req.by, 'Player 2');
  commit(state, [{ type: 'PLAYER_JOINED', seat: 1, name: by }], 1, by, out);
  remember(state.id, state);
  return { events: out, views: views(out), summary: summary(state) };
}

export interface CommandRequest {
  tableId: string;
  seq: number;
  log?: unknown;
  cmd: Command;
  side: Side;
  by: string;
  hands?: Hands;
}

/** One command of a player. Scheme cards are hidden information: they travel as `hands`, never in the events. */
export function command(req: CommandRequest): { events: GameEvent[]; views: (View | null)[]; hands: Hands; summary: Summary } {
  const cmd = req.cmd;
  if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') throw new BadRequest('cmd is missing');
  const side = side01(req.side);
  // Work on a copy: a refused command must leave the remembered state untouched.
  const state = structuredClone(stateOf(String(req.tableId), Number(req.seq), req.log));
  const hands: Hands = [req.hands?.[0] ?? null, req.hands?.[1] ?? null];
  // While the other seat is empty the only player moves both sides (solo play and testing).
  const solo = state.players[side === 0 ? 1 : 0] === null;
  const ctx = { d20, side, solo };
  const by = name(req.by, side === 0 ? 'Player 1' : 'Player 2');
  const seat: Side = solo && 'side' in cmd && (cmd.side === 0 || cmd.side === 1) ? cmd.side : side;
  const hand = hands[seat];
  const out: GameEvent[] = [];
  if (cmd.type === 'DRAW_SCHEMES') {
    const bodies = decide(state, cmd, ctx);
    const mine = state.models.filter((m) => m.side === seat);
    const faction = state.factions[seat] ?? (mine.find((m) => m.leader) ?? mine[0])?.faction ?? 'Neutral';
    const count = bodies[0]?.type === 'SCHEMES_DRAWN' ? bodies[0].count : 2;
    hands[seat] = { options: drawSchemes(faction, count, d20), kept: null };
    commit(state, bodies, side, by, out);
  } else if (cmd.type === 'KEEP_SCHEME') {
    if (!hand || !hand.options.includes(cmd.code)) throw new RuleError('BAD_VALUE', 'That Scheme is not one of the drawn cards');
    const bodies = decide(state, cmd, ctx);
    hands[seat] = { options: hand.options, kept: cmd.code };
    commit(state, bodies, side, by, out);
  } else if (cmd.type === 'REVEAL_SCHEME') {
    if (!hand?.kept) throw new RuleError('NO_SCHEMES', 'There is no Scheme to reveal');
    commit(state, decide(state, { ...cmd, code: hand.kept }, ctx), side, by, out);
  } else {
    commit(state, decide(state, cmd, ctx), side, by, out);
  }
  // At the end of the game all Schemes are revealed, and the ones the table can check are counted.
  if (state.phase === 'finished') {
    for (const s of [0, 1] as const) {
      const kept = hands[s]?.kept;
      if (kept && !state.schemes[s].revealed) commit(state, [{ type: 'SCHEME_REVEALED', seat: s, code: kept }], null, 'Table', out);
    }
    const scores = schemeScoring(state);
    if (scores.length > 0) commit(state, scores, null, 'Table', out);
  }
  remember(state.id, state);
  return { events: out, views: views(out), hands, summary: summary(state) };
}

/** Forget a table (tests). */
export const forget = (id: string): boolean => cache.delete(id);
