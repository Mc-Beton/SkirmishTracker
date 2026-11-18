import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, emptyState, RuleError } from '../../frontend/src/lib/eld/engine.ts';
import type { Command, GameEvent, Side, TableState } from '../../frontend/src/lib/eld/types.ts';
import { partyFrom, questFor, terrainFrom } from '../mapping.ts';
import { command, create, forget, join, NeedLog, type Hands } from '../service.ts';

const HELIAN = {
  faction: 'HELIAN_LEAGUE',
  units: [{ name: 'Expeditionary Hierophant', leader: true }, { name: 'Citadel Guard', items: ['Additional Protection'] }, { name: 'Flameshaper' }, { name: 'Helrin Expatriate' }],
};

/** What the backend does: keeps the log and the hands, sends them when asked. */
class Backend {
  log: GameEvent[] = [];
  hands: Hands = [null, null];
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  get seq(): number {
    return this.log.length;
  }
  state(): TableState {
    const s = emptyState(this.id);
    for (const ev of this.log) apply(s, ev);
    return s;
  }
  send(cmd: Command, side: Side, withLog = false): GameEvent[] {
    const res = command({ tableId: this.id, seq: this.seq, cmd, side, by: side === 0 ? 'Ann' : 'Bob', hands: this.hands, ...(withLog ? { log: this.log } : {}) });
    this.log.push(...res.events);
    this.hands = res.hands;
    return res.events;
  }
}

function start(id: string, extra: Partial<Parameters<typeof create>[0]> = {}): Backend {
  const b = new Backend(id);
  const made = create({ tableId: id, name: 'Test map', width: 36, height: 36, deployDepth: 8, by: 'Ann', party: HELIAN, ...extra });
  b.log.push(...made.events);
  const sat = join({ tableId: id, seq: b.seq, by: 'Bob', party: { faction: 'Helian League', units: HELIAN.units } });
  b.log.push(...sat.events);
  return b;
}

test('a WarBracket list becomes a party: names, Leader, Upgrades, Mount', () => {
  const party = partyFrom(HELIAN);
  assert.equal(typeof party, 'object');
  if (typeof party === 'string') return;
  assert.deepEqual(party.models, ['hel-hierophant', 'hel-citadel-guard', 'hel-flameshaper', 'hel-helrin-expatriate']);
  assert.equal(party.leader, 0);
  assert.deepEqual(party.upgrades?.[1], ['neu-additional-protection']);
  const rider = partyFrom({ faction: 'ADVENTURERS_GUILD', units: [{ name: 'The Slayer Dragoon', leader: true }, { name: 'Lupus Rex' }] });
  assert.equal(typeof rider, 'object');
  if (typeof rider !== 'string') assert.deepEqual(rider.mounts, [true]);
  assert.match(String(partyFrom({ faction: 'HELIAN_LEAGUE', units: [{ name: 'Nobody Known' }] })), /no card/);
  assert.match(String(partyFrom({ faction: 'HELIAN_LEAGUE', units: [{ name: 'Lupus Rex' }] })), /Rider|no models/);
});

test('map shapes become terrain; only quests the engine runs are passed on', () => {
  const sq = [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }];
  const t = terrainFrom([
    { kind: 'OBSTACLE', points: sq, height: 2, envs: [] },
    { kind: 'AREA', points: sq, height: 0, envs: ['FOREST', 'DIFFICULT'] },
    { kind: 'AREA', points: sq, height: 0, envs: ['AQUATIC_SHALLOW'] },
    { kind: 'AREA', points: sq, height: 0, envs: ['DARK'] },
    { kind: 'OBSTACLE', points: sq.slice(0, 2), height: 2 },
  ]);
  assert.deepEqual(t.map((x) => `${x.kind}:${x.env}`), ['obstacle:ruin', 'area:forest', 'area:water']);
  assert.equal(questFor('TREASURE_HUNT'), 'treasure-hunt');
  assert.equal(questFor('MAGIC_STONES'), null);
});

test('create, join and a first exchange with the dice window', () => {
  const b = start('svc-1');
  let s = b.state();
  assert.deepEqual(s.players, ['Ann', 'Bob']);
  assert.equal(s.models.filter((m) => m.side === 0).length, 4);
  assert.equal(s.models.filter((m) => m.side === 1).length, 4);
  assert.equal(s.models.find((m) => m.side === 0 && m.leader)?.profileId, 'hel-hierophant');
  // Not your party.
  assert.throws(() => b.send({ type: 'MOVE_MODEL', id: s.models.find((m) => m.side === 1)!.id, x: 10, y: 4 }, 0), RuleError);
  // Schemes: the cards stay in the hands, the events only count them.
  const drawn = b.send({ type: 'DRAW_SCHEMES' }, 0);
  assert.equal(drawn[0]!.type, 'SCHEMES_DRAWN');
  assert.ok(b.hands[0]!.options.length >= 2);
  assert.ok(!JSON.stringify(drawn).includes(b.hands[0]!.options[0]!));
  b.send({ type: 'KEEP_SCHEME', code: b.hands[0]!.options[0]! }, 0);
  assert.equal(b.hands[0]!.kept, b.hands[0]!.options[0]);
  b.send({ type: 'READY' }, 0);
  b.send({ type: 'READY' }, 1);
  s = b.state();
  assert.equal(s.phase, 'playing');
  assert.equal(s.round, 1);
  // Everybody left on a shelf was put into the Deployment Zone.
  assert.ok(s.models.every((m) => m.y > 0 && m.y < 36));
  const active = s.active;
  const mover = s.models.find((m) => m.side === active)!;
  b.send({ type: 'ACTIVATE', id: mover.id }, active);
  assert.throws(() => b.send({ type: 'ACTIVATE', id: mover.id }, active === 0 ? 1 : 0), RuleError);
  b.send({ type: 'ACTION', hold: true, action: 'nothing' }, active);
  b.send({ type: 'END_ACTIVATION' }, active);
  assert.equal(b.state().activation, null);
});

test('a forgotten table asks for the log, and the reply is the same as from memory', () => {
  const b = start('svc-2');
  forget('svc-2');
  assert.throws(() => b.send({ type: 'READY' }, 0), NeedLog);
  const evs = b.send({ type: 'READY' }, 0, true);
  assert.ok(evs.some((e) => e.type === 'PLAYER_READY'));
  // A stale sequence number (the backend rolled back) also asks for the log.
  assert.throws(() => command({ tableId: 'svc-2', seq: b.seq - 1, cmd: { type: 'READY' }, side: 1, by: 'Bob' }), NeedLog);
});

test('a refused command leaves the remembered state untouched', () => {
  const b = start('svc-3');
  const before = b.seq;
  assert.throws(() => b.send({ type: 'END_TURN' }, 0), RuleError);
  assert.equal(b.send({ type: 'READY' }, 0)[0]!.seq, before + 1);
});

test('corner deployment, tokens and conceding', () => {
  const b = start('svc-4', { deploy: 'corner', deployDepth: 9, quest: 'QUARTER_WAR' });
  let s = b.state();
  assert.equal(s.deploy, 'corner');
  const mine = s.models.find((m) => m.side === 0)!;
  assert.throws(() => b.send({ type: 'MOVE_MODEL', id: mine.id, x: 30, y: 33 }, 0), RuleError);
  b.send({ type: 'MOVE_MODEL', id: mine.id, x: 3, y: 32 }, 0);
  b.send({ type: 'ADD_MARKER', name: 'Stone', x: 18, y: 18 }, 0);
  s = b.state();
  const token = s.markers.find((k) => k.kind === 'token')!;
  assert.equal(token.name, 'Stone');
  b.send({ type: 'MOVE_MARKER', id: token.id, x: 20, y: 18 }, 1);
  b.send({ type: 'READY' }, 0);
  b.send({ type: 'READY' }, 1);
  s = b.state();
  assert.equal(s.phase, 'playing');
  // Auto-deployed models stand inside their corners.
  for (const m of s.models) assert.ok(Math.hypot(m.x - (m.side === 0 ? 0 : 36), m.y - (m.side === 0 ? 36 : 0)) <= 9.01, `${m.name} at ${m.x},${m.y}`);
  b.send({ type: 'REMOVE_MARKER', id: token.id }, 0);
  const end = b.send({ type: 'CONCEDE' }, 1);
  assert.equal(end.find((e) => e.type === 'GAME_FINISHED')?.winner, 0);
  assert.equal(b.state().phase, 'finished');
});
