// The rules of a table, run for the WarBracket backend. The backend keeps the event log and the players' Scheme
// cards; this service only decides: a command and the log go in, the events that happened come out.
// It keeps the folded state of recent tables in memory to save the replay; with a stale or missing copy it asks
// for the whole log (NEED_LOG) and rebuilds.

import { randomInt } from 'node:crypto';
import { apply, decide, emptyState, RuleError, schemeScoring } from '../frontend/src/lib/eld/engine.ts';
import { drawSchemes } from '../frontend/src/lib/eld/quests.ts';
import type { Command, EventBody, GameEvent, Side, TableState } from '../frontend/src/lib/eld/types.ts';
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
  for (const ev of log as GameEvent[]) apply(state, ev);
  if (state.seq !== seq) throw new BadRequest(`The log ends at ${state.seq}, expected ${seq}`);
  return state;
}

/** Numbers the events, applies them to the state and returns them as they are to be stored. */
function commit(state: TableState, bodies: EventBody[], side: Side | null, by: string, out: GameEvent[]): void {
  if (state.seq + bodies.length > MAX_EVENTS) throw new RuleError('TABLE_FULL_LOG', 'This table has reached its event limit');
  for (const body of bodies) {
    const ev = { ...body, seq: state.seq + 1, ts: Date.now(), side, by } as GameEvent;
    // The copy is what gets stored: the state may keep (and later change) parts of the event it was given.
    out.push(structuredClone(ev));
    apply(state, ev);
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
}

const summary = (s: TableState): Summary => ({ phase: s.phase, round: s.round, active: s.active, vp: s.vp, winner: s.winner, factions: s.factions, seq: s.seq });

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
  /** WarBracket quest code. */
  quest?: string | null;
  by: string;
  party: ListInput;
}

/** A new table: the field, the creator's party on its shelf, the creator in the first seat. */
export function create(req: CreateRequest): { events: GameEvent[]; summary: Summary } {
  const id = String(req.tableId ?? '');
  if (!id) throw new BadRequest('tableId is missing');
  const size = (v: unknown) => (typeof v === 'number' && v >= 12 && v <= 72 ? v : 36);
  const state = emptyState(id);
  const out: GameEvent[] = [];
  const depth = typeof req.deployDepth === 'number' && req.deployDepth >= 2 && req.deployDepth <= 18 ? req.deployDepth : 8;
  commit(
    state,
    [{ type: 'TABLE_CREATED', name: name(req.name, 'Table'), width: size(req.width), height: size(req.height), deployDepth: depth, ...(req.deploy === 'corner' ? { deploy: 'corner' as const } : {}), terrain: terrainFrom(req.terrain), quest: questFor(req.quest), points: 999 }],
    null,
    'Table',
    out,
  );
  deploy(state, 0, req.party, out);
  const by = name(req.by, 'Player 1');
  commit(state, [{ type: 'PLAYER_JOINED', seat: 0, name: by }], 0, by, out);
  remember(id, state);
  return { events: out, summary: summary(state) };
}

export interface JoinRequest {
  tableId: string;
  seq: number;
  log?: unknown;
  by: string;
  party?: ListInput | null;
}

/** The second player sits down; during deployment their party lines up on its shelf. */
export function join(req: JoinRequest): { events: GameEvent[]; summary: Summary } {
  const state = structuredClone(stateOf(String(req.tableId), Number(req.seq), req.log));
  if (state.players[1] !== null) throw new RuleError('SEAT_TAKEN', 'Both seats are taken');
  const out: GameEvent[] = [];
  if (req.party && state.phase === 'setup' && state.schemes[1].drawn === 0) deploy(state, 1, req.party, out);
  const by = name(req.by, 'Player 2');
  commit(state, [{ type: 'PLAYER_JOINED', seat: 1, name: by }], 1, by, out);
  remember(state.id, state);
  return { events: out, summary: summary(state) };
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
export function command(req: CommandRequest): { events: GameEvent[]; hands: Hands; summary: Summary } {
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
  return { events: out, hands, summary: summary(state) };
}

/** Forget a table (tests). */
export const forget = (id: string): boolean => cache.delete(id);
