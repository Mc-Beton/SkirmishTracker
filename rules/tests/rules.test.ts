import { buildMap, checkPlacements, KITS, MAPS } from '../../frontend/src/lib/eld/maps.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_POINTS, defaultTerrain, deploySpot, FACTIONS, profilesOf, randomParty } from '../../frontend/src/lib/eld/content.ts';
import { areaOf, areaVictims, artOptions, attackOptions, confront, formationArm, gap, immuneTo, moraleOf, isTargetless, NO_MODS, planAttack, pointTarget, resolveAction, UNARMED_INDEX, weaponAt } from '../../frontend/src/lib/eld/combat.ts';
import { apply, checkMove, decide, deployDepthFor, emptyState, reactCheck, RuleError, rollDice, schemeScoring } from '../../frontend/src/lib/eld/engine.ts';
import { engagers, sight } from '../../frontend/src/lib/eld/los.ts';
import { baseRadius, heightProfile, inShallowWater, checkPath, checkPlacement, circleHitsPolygon, edgeDistance, facingTo, moveCost, pointInPolygon, rect, segmentDistance, onShelf, shelfHidden, shelfPlacement, surfaceAt } from '../../frontend/src/lib/eld/geometry.ts';
import { limitIn, PARTY_FACTIONS, partyPoints, partyProblems, recruitPool } from '../../frontend/src/lib/eld/party.ts';
import { figureKind, profileById, PROFILES } from '../../frontend/src/lib/eld/profiles.ts';
import { drawSchemes, QUESTS, schemeByCode, SCHEMES } from '../../frontend/src/lib/eld/quests.ts';
import { SPELL_INDEX, spellsOf, spellWeapons } from '../../frontend/src/lib/eld/spells.ts';
import { effectiveStats, hasSkill, hasTrait, modelStats, profileOf, weaponNumbers } from '../../frontend/src/lib/eld/stats.ts';
import type { Command, GameEvent, Model, Side, TableState, TerrainPiece } from '../../frontend/src/lib/eld/types.ts';
import { isCharacter, upgradesCost, withUpgrades } from '../../frontend/src/lib/eld/upgrades.ts';

function table(terrain: TerrainPiece[] = defaultTerrain(), quest: string | null = null): TableState {
  const s = emptyState('test');
  apply(s, { type: 'TABLE_CREATED', name: 'T', width: 36, height: 36, deployDepth: 8, terrain, quest, seq: 1, ts: 0, side: null, by: 'Table' });
  return s;
}

interface Opts {
  side?: Side;
  solo?: boolean;
  d20?: () => number;
}

/** Runs a command the way the server does and returns the events it produced. */
function run(s: TableState, cmd: Command, o: Opts = {}): GameEvent[] {
  const bodies = decide(s, cmd, { d20: o.d20 ?? (() => 10), side: o.side ?? 0, solo: o.solo ?? true });
  const out: GameEvent[] = [];
  for (const b of bodies) {
    const ev = { ...b, seq: s.seq + 1, ts: 0, side: o.side ?? 0, by: 'tester' } as GameEvent;
    apply(s, ev);
    out.push(ev);
  }
  // The dice that wait for a player are rolled right away: the Initiative Check, the next Strategic Phase.
  if (cmd.type === 'READY' && s.initiative) out.push(...run(s, { type: 'ROLL_INITIATIVE' }, o));
  if (cmd.type === 'END_TURN' && s.pendingTurn) out.push(...run(s, { type: 'ROLL_STRATEGIC' }, { ...o, solo: true }));
  return out;
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof RuleError) return e.code;
    throw e;
  }
  return 'OK';
}

const add = (profileId: string, x: number, y: number, side: Side = 0, free = false): Command => ({ type: 'ADD_MODEL', side, profileId, x, y, ...(free ? { free } : {}) });
const model = (s: TableState, id: string) => s.models.find((m) => m.id === id)!;

/** Two small parties, deployed and started. Blue: Clan Champion a1, Bushi a2. Red: Citadel Guard b1, Flameshaper b2. */
function started(first: Side = 0): TableState {
  const s = table();
  run(s, add('sog-clan-champion', 16, 30));
  run(s, add('sog-bushi-attendant', 20, 30));
  run(s, add('hel-citadel-guard', 16, 6, 1));
  run(s, add('hel-flameshaper', 20, 6, 1));
  // Clan Champion M 17, Citadel Guard M 14 (highest on Red, no Leader): choose rolls so the wanted side wins.
  const rolls = first === 0 ? [10, 10] : [1, 20];
  let i = 0;
  run(s, { type: 'READY' }, { d20: () => rolls[i++]! });
  return s;
}

test('geometry basics', () => {
  const sq = rect(5, 5, 2, 2);
  assert.equal(pointInPolygon({ x: 5, y: 5 }, sq), true);
  assert.equal(pointInPolygon({ x: 7, y: 5 }, sq), false);
  assert.equal(circleHitsPolygon({ x: 6.4, y: 5 }, 0.5, sq), true);
  assert.equal(circleHitsPolygon({ x: 6.5, y: 5 }, 0.5, sq), false, 'touching is allowed');
  assert.equal(facingTo({ x: 0, y: 0 }, { x: 0, y: -1 }), 0);
  assert.equal(facingTo({ x: 0, y: 0 }, { x: 1, y: 0 }), 90);
  assert.equal(facingTo({ x: 0, y: 0 }, { x: 0, y: 1 }), 180);
  assert.equal(facingTo({ x: 0, y: 0 }, { x: -1, y: 0 }), 270);
  assert.ok(Math.abs(baseRadius('small') * 2 * 25.4 - 25) < 1e-9);
  assert.equal(segmentDistance({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 }), 0, 'crossing segments');
  assert.equal(segmentDistance({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 3 }), 3);
});

test('profiles are complete and consistent', () => {
  assert.equal(PROFILES.filter((p) => !p.summoned).length, 54);
  assert.equal(PROFILES.filter((p) => p.summoned).length, 5);
  assert.equal(new Set(PROFILES.map((p) => p.id)).size, PROFILES.length, 'ids are unique');
  for (const p of PROFILES) {
    assert.ok(FACTIONS.some((f) => f.name === p.faction), p.name);
    if (p.summoned) {
      // Creature cards: no Recruitment Cost, ARM up to 10, a Tier for the Summoning Limit.
      assert.ok(p.cost === 0 && p.tier >= 1 && p.tier <= 4 && p.arm <= 10 && p.spd >= 3, p.name);
      continue;
    }
    assert.ok(p.sta >= 2 && p.sta <= 3 && p.spd >= 4 && p.spd <= 7 && p.hp >= 1 && p.hp <= 8 && p.arm >= 0 && p.arm <= 7, p.name);
    for (const v of [p.off, p.def, p.acc, p.int, p.ag, p.t, p.m]) assert.ok(v >= 6 && v <= 20, p.name);
    assert.ok(p.cost >= 8 && p.cost <= 45, p.name);
    assert.ok(['warrior', 'archer', 'mage', 'rogue', 'beast'].includes(figureKind(p)));
  }
  for (const f of FACTIONS.filter((x) => x.playable)) assert.ok(profilesOf(f.name).some((p) => p.stratagems.length > 0), `${f.name} has a Leader`);
  // Spot checks against the cards.
  const guard = profileById('hel-citadel-guard')!;
  assert.deepEqual([guard.sta, guard.spd, guard.arm, guard.hp, guard.off, guard.def, guard.m, guard.cost, guard.limit], [2, 4, 6, 2, 12, 16, 14, 18, 2]);
  const rasetsu = profileById('oni-red-rasetsu')!;
  assert.deepEqual([rasetsu.sta, rasetsu.spd, rasetsu.hp, rasetsu.t, rasetsu.cost], [3, 6, 6, 15, 35]);
  assert.equal(figureKind(profileById('sog-bushi-attendant')!), 'archer');
  assert.equal(figureKind(profileById('the-nightshade')!), 'rogue');
  assert.equal(figureKind(profileById('oni-marauder')!), 'beast');
  const colossus = profileById('sum-colossus')!;
  assert.deepEqual([colossus.sta, colossus.spd, colossus.arm, colossus.hp, colossus.t, colossus.tier, colossus.size], [3, 4, 10, 6, 17, 4, 'colossal']);
});

test('states change attributes', () => {
  const p = profileById('sog-clan-champion')!; // STA 2 SPD 5 ARM 5 OFF 16 AG 10 T 13
  assert.equal(effectiveStats(p, []).spd, 5);
  assert.deepEqual([effectiveStats(p, ['Crouched']).spd, effectiveStats(p, ['Crouched']).arm], [3, 3], 'halved, rounded up');
  assert.equal(effectiveStats(p, ['Crouched', 'Slowed']).spd, 2, 'halved twice, rounding up each time: 5 → 3 → 2');
  assert.equal(effectiveStats(p, ['Slowed', 'Flying']).spd, 5, 'a halving and a doubling cancel out');
  assert.equal(effectiveStats(p, ['Flying']).spd, 10);
  const weak = effectiveStats(p, ['Weakened']);
  assert.deepEqual([weak.t, weak.sta], [7, 1]);
  assert.deepEqual([effectiveStats(p, ['Confused']).off, effectiveStats(p, ['Confused']).ag], [8, 5]);

  const stats = effectiveStats(p, []);
  const spear = p.weapons[0]!; // PW T, STK STA
  assert.deepEqual(weaponNumbers(spear, stats, [], false), { pw: 13, stk: 2 });
  assert.deepEqual(weaponNumbers(spear, stats, [], true), { pw: 13, stk: 1 }, 'Strike 1 in the Reactive Role');
  assert.deepEqual(weaponNumbers(p.weapons[2]!, stats, [], false), { pw: 11, stk: 2 }, 'Piercing Dagger T-2');
  const bludgeon = profileById('hel-citadel-guard')!.weapons[0]!; // T+3, STA-1
  assert.deepEqual(weaponNumbers(bludgeon, effectiveStats(profileById('hel-citadel-guard')!, []), [], false), { pw: 15, stk: 1 });
  assert.deepEqual(weaponNumbers(profileById('hel-citadel-guard')!.weapons[2]!, stats, [], false), { pw: null, stk: null }, 'a Shield has no attack');
});

test('deployment', () => {
  const s = table();
  run(s, add('sog-clan-champion', 18, 33));
  run(s, add('sog-bushi-attendant', 21, 33));
  assert.deepEqual(s.models.map((m) => m.id), ['a1', 'a2']);
  assert.equal(model(s, 'a1').leader, true, 'the first model with Stratagems becomes Leader');
  assert.equal(model(s, 'a2').leader, false);
  assert.deepEqual([model(s, 'a1').hp, model(s, 'a1').maxHp, model(s, 'a1').kind], [3, 3, 'warrior']);
  assert.ok(Math.abs(edgeDistance(model(s, 'a1'), model(s, 'a2')) - (3 - 2 * baseRadius('medium'))) < 1e-9);
  run(s, add('sog-bushi-attendant', 24, 33));
  assert.equal(model(s, 'a3').name, 'Bushi Attendant 2');

  assert.equal(code(() => run(s, add('sog-bushi-attendant', 18.5, 33))), 'MODEL');
  assert.equal(code(() => run(s, add('sog-bushi-attendant', 0.1, 33))), 'OFF_TABLE');
  assert.equal(code(() => run(s, add('sog-bushi-attendant', 12, 20))), 'ZONE', 'outside the Deployment Zone');
  assert.equal(code(() => run(s, add('sog-bushi-attendant', 12, 28.3))), 'ZONE', 'the whole base must be inside');
  assert.equal(code(() => run(s, add('nope', 12, 33))), 'BAD_VALUE');
  assert.equal(code(() => run(s, add('sog-bushi-attendant', 9, 14, 0, true))), 'TERRAIN', 'even a free placement cannot be inside a house');
  assert.equal(code(() => run(s, add('hel-flameshaper', 12, 3, 1), { side: 0, solo: false })), 'NOT_YOURS');
  run(s, add('hel-flameshaper', 12, 3, 1), { side: 1, solo: false });
  run(s, add('the-hired-blade', 12, 20, 1, true)); // Infiltration: placed with a free move

  // Before the game starts figures move freely inside their own zone.
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 10, y: 30 });
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 10, y: 25 })), 'ZONE');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 10, y: 31 }, { side: 1, solo: false })), 'NOT_YOURS');
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 10, y: 25, free: true });
  assert.equal(model(s, 'a1').y, 25);

  run(s, { type: 'SET_LEADER', id: 'a2' });
  assert.deepEqual(s.models.filter((m) => m.leader).map((m) => m.id), ['a2']);
  run(s, { type: 'REMOVE_MODEL', id: 'a3' });
  run(s, add('sog-bushi-attendant', 24, 33));
  assert.equal(model(s, 'a4').name, 'Bushi Attendant 2', 'ids are never reused, names are');
});

test('starting the game: ready, Initiative Check, Upkeep', () => {
  const s = table();
  run(s, add('sog-clan-champion', 16, 30));
  assert.equal(code(() => run(s, { type: 'READY' })), 'NO_MODELS', 'Red has nothing on the table');
  run(s, add('hel-citadel-guard', 16, 6, 1));
  assert.equal(code(() => run(s, { type: 'ACTIVATE', id: 'a1' })), 'NOT_STARTED');

  // Two seated players: the game starts when the second one is ready.
  let ev = run(s, { type: 'READY' }, { side: 0, solo: false });
  assert.deepEqual(ev.map((e) => e.type), ['PLAYER_READY']);
  assert.equal(s.phase, 'setup');
  // Both ready: the Initiative Check waits for each player to roll their die (Red's is rolled at once here).
  ev = run(s, { type: 'READY' }, { side: 1, solo: false, d20: () => 9 });
  assert.deepEqual(ev.map((e) => e.type), ['PLAYER_READY', 'INITIATIVE_PENDING', 'INITIATIVE_ROLLED']);
  assert.deepEqual([s.phase, s.initiative?.rolls], ['setup', [null, 9]]);
  assert.equal(code(() => run(s, { type: 'ROLL_INITIATIVE' }, { side: 1, solo: false })), 'ROLLED');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 16, y: 31 }, { side: 0, solo: false })), 'ROLL_FIRST');
  ev = run(s, { type: 'ROLL_INITIATIVE' }, { side: 0, solo: false, d20: () => 3 });
  assert.deepEqual(ev.map((e) => e.type), ['INITIATIVE_ROLLED', 'GAME_STARTED', 'TURN_STARTED']);
  assert.equal(s.initiative, undefined);
  // Blue 3 + M 17 = 20, Red 9 + M 14 = 23.
  assert.equal(s.first, 1);
  assert.deepEqual([s.phase, s.round, s.active], ['playing', 1, 1]);
  assert.deepEqual(s.models.map((m) => m.ap), [2, 2], 'AP = Stamina');
  assert.equal(code(() => run(s, { type: 'READY' })), 'STARTED');
});

test('activation, walk and run limits, reactions', () => {
  const s = started(0);
  assert.equal(s.active, 0);
  const champ = model(s, 'a1'); // SPD 5, at (16, 30)
  const actor = { side: 0 as Side, solo: true };

  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 16, y: 27 })), 'NOT_ACTIVATED');
  assert.equal(code(() => run(s, { type: 'ACTIVATE', id: 'b1' })), 'NOT_YOUR_TURN');
  assert.equal(code(() => run(s, { type: 'REACT', id: 'b1' })), 'NO_ACTIVATION');
  assert.equal(code(() => run(s, { type: 'ACTIVATE', id: 'a1' }, { side: 1, solo: false })), 'NOT_YOURS');

  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(champ.ap, 1);
  assert.deepEqual(s.activation, { id: 'a1', moved: 0, reactions: {}, action: null, dodged: 0, seen: ['b1', 'b2'], near: [], path: [{ x: model(s, 'a1').x, y: model(s, 'a1').y }] });

  // Preview and server use the same check.
  const walk = checkMove(s, actor, champ, { x: 16, y: 26 }, false);
  assert.deepEqual(walk, { ok: true, mode: 'walk', cost: 4, spent: 0, walk: 5, limit: 10, z: 0 });
  assert.equal(checkMove(s, actor, champ, { x: 16, y: 23 }, false).ok && 'run', 'run');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 16, y: 19.5 })), 'TOO_FAR');

  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 16, y: 26 }); // 4" walk
  assert.match(s.log.at(-1)!.text, /Clan Champion walked 4\.0"/);
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 23 }); // 5" more: 9" in total = run
  assert.match(s.log.at(-1)!.text, /ran 5\.0"/);
  assert.equal(s.activation!.moved, 9);
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 21.5 })), 'TOO_FAR', 'the whole route counts');
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 22 });
  assert.equal(s.activation!.moved, 10);

  // The other side reacts: 1 AP, once per Activation, may move half its Speed (Citadel Guard SPD 4 → 2").
  const guard = model(s, 'b1');
  assert.equal(code(() => run(s, { type: 'REACT', id: 'a2' })), 'NOT_REACTIVE');
  run(s, { type: 'REACT', id: 'b1', intent: 'dodge' });
  assert.equal(guard.ap, 1);
  assert.equal(code(() => run(s, { type: 'REACT', id: 'b1' })), 'ALREADY_REACTED');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'b1', x: 16, y: 8.5 })), 'TOO_FAR');
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 16, y: 8 });
  assert.match(s.log.at(-1)!.text, /dodged 2\.0"/);
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'b2', x: 20, y: 7 })), 'NOT_ACTIVATED', 'b2 did not react');
  run(s, { type: 'REACT', id: 'b2' });
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'b2', x: 20, y: 7 })), 'NO_DODGE', 'only a Dodge comes with a move');

  // Second activation of the same model starts a fresh movement allowance.
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.deepEqual([champ.ap, s.activation!.moved], [0, 0]);
  run(s, { type: 'END_ACTIVATION' });
  assert.equal(s.activation, null);
  assert.equal(code(() => run(s, { type: 'ACTIVATE', id: 'a1' })), 'NO_AP');

  // States limit movement.
  run(s, { type: 'ACTIVATE', id: 'a2' }); // Bushi Attendant SPD 5 at (20, 30)
  run(s, { type: 'SET_STATE', id: 'a2', state: 'Crouched', on: true });
  assert.equal(modelStats(model(s, 'a2')).spd, 3);
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a2', x: 20, y: 26.5 })), 'TOO_FAR', 'Crouched: Walk only, at half Speed');
  run(s, { type: 'SET_STATE', id: 'a2', state: 'Immobilized', on: true });
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a2', x: 20, y: 29 })), 'CANNOT_MOVE');
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: 20, y: 29, free: true });
});

test('paths: tall scenery and enemies block, water costs double', () => {
  const s = started(0);
  const champ = model(s, 'a1');
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 9, y: 18, free: true }); // just below the House (3" tall)
  assert.equal(checkPath(s, champ, { x: 9, y: 10 }), 'PATH_TERRAIN');
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 30, y: 14, free: true }); // below the Boulder (1" tall, lower than the model)
  assert.equal(checkPath(s, champ, { x: 30, y: 10 }), null, 'low scenery can be crossed');
  assert.equal(checkPlacement(s, champ.size, 30, 12, 'a1'), 'TERRAIN', 'but not stood in');

  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 33, y: 23, free: true });
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 33, y: 26, free: true });
  assert.equal(checkPath(s, champ, { x: 33, y: 20 }), 'PATH_ENEMY');
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: 31, y: 26, free: true });
  assert.equal(checkPath(s, model(s, 'a2'), { x: 35, y: 26 }), null, 'allies let each other pass');
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Flying', on: true });
  assert.equal(checkPath(s, champ, { x: 33, y: 20 }), null, 'Flying models pass over');
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Flying', on: false });

  // The Pond is centred at (15.5, 21), about 5.2" wide.
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 21, free: true });
  const across = moveCost(s, champ, { x: 19, y: 21 });
  assert.ok(across > 11.5 && across < 12.6, `7" of which ~5" through water costs ${across}`);
  assert.equal(moveCost(s, champ, { x: 12, y: 25 }), 4);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 19, y: 21 })), 'TOO_FAR');
});

test('wounds, turns and the end of the game', () => {
  const s = started(0);
  const shaper = model(s, 'b2'); // HP 1
  run(s, { type: 'SET_STATE', id: 'b2', state: 'Flying', on: true });
  run(s, { type: 'WOUND', id: 'b2' });
  assert.deepEqual([shaper.hp, [...shaper.states].sort()], [0, ['Crouched', 'Incapacitated']]);
  assert.equal(code(() => run(s, { type: 'REACT', id: 'b2' })), 'NO_ACTIVATION');
  run(s, { type: 'HEAL', id: 'b2' });
  assert.deepEqual([shaper.hp, shaper.states], [1, ['Crouched']]);
  assert.equal(code(() => run(s, { type: 'HEAL', id: 'b2' })), 'FULL_HP');
  run(s, { type: 'WOUND', id: 'b2' });
  run(s, { type: 'WOUND', id: 'b2' });
  assert.ok(shaper.states.includes('Dead') && !shaper.states.includes('Incapacitated'));
  assert.equal(code(() => run(s, { type: 'WOUND', id: 'b2' })), 'DEAD');
  assert.equal(code(() => run(s, { type: 'HEAL', id: 'b2' })), 'DEAD');

  run(s, { type: 'SET_STATE', id: 'a2', state: 'Fatigued', on: true });
  run(s, { type: 'SET_STATE', id: 'b1', state: 'Fatigued', on: true });
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Weakened', on: true });
  run(s, { type: 'ADD_VP', side: 0, delta: 2 });
  run(s, { type: 'ADD_VP', side: 1, delta: 1 });
  assert.deepEqual(s.vp, [2, 1], 'each side keeps its own score, whoever clicks');
  assert.equal(code(() => run(s, { type: 'ADD_VP', side: 0, delta: 0.5 })), 'BAD_VALUE');
  assert.equal(code(() => run(s, { type: 'END_TURN' }, { side: 1, solo: false })), 'NOT_YOUR_TURN');

  run(s, { type: 'ACTIVATE', id: 'a1' });
  let ev = run(s, { type: 'END_TURN' });
  assert.deepEqual(ev.map((e) => e.type), ['ACTIVATION_ENDED', 'TURN_ENDED', 'TURN_STARTED']);
  assert.deepEqual([s.round, s.active], [1, 1], 'second turn of round 1');
  // Red is active: its Fatigued model recovers and gets AP; Blue's Fatigued model gets none; Weakened = STA - 1; Dead = 0.
  assert.deepEqual(s.models.map((m) => [m.id, m.ap]), [['a1', 1], ['a2', 0], ['b1', 2], ['b2', 0]]);
  assert.equal(model(s, 'b1').states.includes('Fatigued'), false);
  assert.equal(model(s, 'a2').states.includes('Fatigued'), true);

  run(s, { type: 'END_TURN' });
  assert.deepEqual([s.round, s.active], [2, 0]);
  assert.equal(model(s, 'a2').ap, 2, 'Blue recovered in its own Strategic Phase');
  for (let i = 0; i < 7; i++) run(s, { type: 'END_TURN' });
  assert.deepEqual([s.round, s.active, s.phase], [5, 1, 'playing']);
  ev = run(s, { type: 'END_TURN' });
  assert.equal(ev.at(-1)!.type, 'GAME_FINISHED');
  assert.deepEqual([s.phase, s.winner], ['finished', 0]);
  assert.equal(code(() => run(s, { type: 'WOUND', id: 'a1' })), 'GAME_OVER');
  run(s, { type: 'ROLL', count: 1 }); // dice still work
});

test('dice', () => {
  const seq = (vals: number[]) => () => vals.shift()!;
  const r = rollDice(5, 10, 'Attack', seq([1, 10, 11, 20, 5]));
  assert.deepEqual([r.successes, r.crits], [3, 1]);
  const high = rollDice(3, 22, '', seq([20, 19, 1]));
  assert.deepEqual([high.successes, high.crits], [3, 2], 'above 20 a result of 20 is critical too');
  const zero = rollDice(2, 0, '', seq([1, 2]));
  assert.deepEqual([zero.successes, zero.crits], [0, 0]);
  assert.equal(rollDice(2, null, '', seq([3, 4])).successes, null);
  const s = table();
  assert.equal(code(() => run(s, { type: 'ROLL', count: 21 })), 'BAD_VALUE');
  assert.equal(code(() => run(s, { type: 'ROLL', count: 1.5 })), 'BAD_VALUE');
  run(s, { type: 'ROLL', count: 3, target: 12, label: 'Dodge' });
  assert.equal(s.log.at(-1)!.dice!.dice.length, 3);
});

test('random parties respect points and Limits and always fit the Deployment Zone', () => {
  for (let round = 0; round < 300; round++) {
    let seed = round + 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const s = table();
    const playable = FACTIONS.filter((f) => f.playable);
    for (const side of [0, 1] as const) {
      const faction = playable[(round + side) % playable.length]!.name;
      const party = randomParty(faction, DEFAULT_POINTS, rnd).map((id) => profileById(id)!);
      assert.ok(party.length >= 1 && party.length <= 6);
      assert.ok(party[0]!.stratagems.length > 0, 'the first model is a Leader');
      assert.ok(party.reduce((sum, p) => sum + p.cost, 0) <= DEFAULT_POINTS);
      assert.deepEqual(partyProblems({ faction, models: party.map((p) => p.id), leader: 0 }, DEFAULT_POINTS), []);
      for (const p of party) {
        assert.equal(p.faction, faction);
        if (p.limit !== null) assert.ok(party.filter((x) => x.id === p.id).length <= p.limit, `${p.name} over its Limit`);
        const spot = deploySpot(s, side, p.size);
        assert.ok(spot, `no room for ${p.name}`);
        run(s, add(p.id, spot.x, spot.y, side));
      }
    }
    assert.equal(s.models.filter((m) => m.leader).length, 2);
    run(s, { type: 'READY' });
    assert.equal(s.phase, 'playing');
  }
});

test('replaying the events gives the same table, including tables saved by the first prototype', () => {
  const s = table();
  const events: GameEvent[] = [];
  const cmds: Command[] = [
    add('sog-clan-champion', 10, 33),
    add('hel-citadel-guard', 12, 3, 1),
    { type: 'READY' },
    { type: 'ACTIVATE', id: 'a1' },
    { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 30 },
    { type: 'REACT', id: 'b1' },
    { type: 'ROLL', count: 4, target: 9 },
    { type: 'WOUND', id: 'b1' },
    { type: 'END_TURN' },
  ];
  for (const c of cmds) for (const ev of run(s, c, { d20: () => 7 })) events.push(JSON.parse(JSON.stringify(ev)) as GameEvent);
  const again = table();
  for (const ev of events) apply(again, ev);
  assert.deepEqual(again, s);

  const old = table();
  apply(old, {
    type: 'MODEL_ADDED',
    model: { id: 'a1', side: 0, name: 'Leader 1', faction: 'Undead', klass: 'leader', size: 'medium', x: 18, y: 33, facing: 0, hp: 3, maxHp: 3 },
    seq: 2,
    ts: 0,
    side: null,
    by: 'Table',
  } as unknown as GameEvent);
  apply(old, { type: 'MODEL_MOVED', id: 'a1', from: { x: 18, y: 33 }, to: { x: 18, y: 30 }, facing: 0, dist: 3, seq: 3, ts: 0, side: 0, by: 'x' });
  apply(old, { type: 'MODEL_HP', id: 'a1', hp: 2, seq: 4, ts: 0, side: 0, by: 'x' });
  const m = old.models[0]!;
  assert.deepEqual([m.kind, m.leader, m.ap, m.states, m.profileId, m.y, m.hp], ['warrior', true, 0, [], null, 30, 2]);
  assert.equal(modelStats(m).spd, 5, 'figures without a profile use generic attributes');
});

// ---- line of sight, Cover, Engaged ----

const wall = (id: string, cx: number, cy: number, w: number, h: number, height: number): TerrainPiece => ({ id, kind: 'obstacle', env: 'ruin', name: 'Wall', shape: rect(cx, cy, w, h), height });
const wood = (id: string, cx: number, cy: number): TerrainPiece => ({ id, kind: 'area', env: 'forest', name: 'Forest', shape: rect(cx, cy, 3, 3), height: 3 });

/** A bare table with one viewer (Blue Bushi Attendant a1) and one target (Red Flameshaper b1), both Medium. */
function duel(terrain: TerrainPiece[], a: [number, number, number], b: [number, number]): TableState {
  const s = table(terrain);
  run(s, add('sog-bushi-attendant', a[0], a[1], 0, true));
  run(s, { type: 'ROTATE_MODEL', id: 'a1', facing: a[2] });
  run(s, add('hel-flameshaper', b[0], b[1], 1, true));
  return s;
}

test('line of sight: front arc, scenery, models, forests', () => {
  let s = duel([], [5, 10, 90], [15, 10]);
  assert.deepEqual(sight(s, model(s, 'a1'), model(s, 'b1')), { los: true, reason: '', cover: 0, forest: false });
  run(s, { type: 'ROTATE_MODEL', id: 'a1', facing: 270 });
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).reason, 'behind');
  run(s, { type: 'ROTATE_MODEL', id: 'a1', facing: 0 });
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).los, true, 'exactly to the side is still the Front arc');
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Blinded', on: true });
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).reason, 'blinded');
  // Vigilance: no Back arc.
  run(s, add('hel-citadel-guard', 15, 20, 1, true)); // b2, facing 180
  run(s, add('sog-bushi-attendant', 15, 14, 0, true)); // a2 stands behind the guard
  assert.equal(sight(s, model(s, 'b2'), model(s, 'a2')).los, true);

  // A wall taller than both blocks; one lower than both does not.
  s = duel([wall('w', 10, 10, 0.5, 4, 3)], [5, 10, 90], [15, 10]);
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).reason, 'blocked');
  s = duel([wall('w', 10, 10, 0.5, 4, 1)], [5, 10, 90], [15, 10]);
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).los, true, 'both models look over a 1" wall');
  run(s, { type: 'SET_STATE', id: 'b1', state: 'Crouched', on: true });
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 11, y: 10, free: true });
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).reason, 'blocked', 'crouching right behind it hides the model');

  // Another model in the way blocks; a Crouched one does not.
  s = duel([], [5, 26, 90], [12, 26]);
  run(s, add('sog-bushi-attendant', 8, 26, 0, true));
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).reason, 'blocked');
  run(s, { type: 'SET_STATE', id: 'a2', state: 'Crouched', on: true });
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).los, true);

  // One Forest: visible but -3 for Ranged Attacks; two Forests: no line of sight.
  s = duel([wood('f1', 10, 20)], [5, 20, 90], [25, 20]);
  assert.deepEqual(sight(s, model(s, 'a1'), model(s, 'b1')), { los: true, reason: '', cover: 0, forest: true });
  s = duel([wood('f1', 10, 20), wood('f2', 18, 20)], [5, 20, 90], [25, 20]);
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).reason, 'forest');
  run(s, { type: 'SET_STATE', id: 'b1', state: 'Flying', on: true });
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).los, true, 'everyone sees a Flying model');
});

test('Cover: Heavy behind tall scenery, Light behind low scenery or when Crouched', () => {
  // The target peeks around the end of a 3" wall, within 1" of it.
  let s = duel([wall('w', 10, 10, 0.5, 4, 3)], [5, 13.2, 90], [11.1, 11.6]);
  assert.deepEqual(sight(s, model(s, 'a1'), model(s, 'b1')), { los: true, reason: '', cover: -4, forest: false });
  // Same spot, but the wall is only 1" high: the model is seen over it, its legs are hidden.
  s = duel([wall('w', 10, 10, 0.5, 4, 1)], [5, 13.2, 90], [11.1, 11.6]);
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).cover, -2);
  // More than 1" away from the scenery: no Cover.
  s = duel([wall('w', 10, 10, 0.5, 4, 1)], [5, 10, 90], [15, 10]);
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).cover, 0);
  s = duel([], [5, 10, 90], [15, 10]);
  run(s, { type: 'SET_STATE', id: 'b1', state: 'Crouched', on: true });
  assert.equal(sight(s, model(s, 'a1'), model(s, 'b1')).cover, -2, 'a Crouched model has Light Cover');
});

// ---- attacks ----

/** started() with the Clan Champion a1 and the Citadel Guard b1 facing each other in the open. */
function melee(gapInches: number): TableState {
  const s = started(0);
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 33, y: 20, free: true }); // faces up (0)
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 33, y: 20 - 2 * baseRadius('medium') - gapInches, facing: 180, free: true });
  return s;
}
const dice = (...vals: number[]) => ({ d20: () => vals.shift() ?? assert.fail('ran out of dice') });

test('attack options and what an attack needs', () => {
  const s = melee(0.5);
  const champ = model(s, 'a1');
  const guard = model(s, 'b1');
  assert.deepEqual(attackOptions(champ).map((o) => o.weapon.name), ['Spear', 'Sword', 'Piercing Dagger', 'Unarmed', 'Spear (thrown)']);
  assert.deepEqual(attackOptions(guard).map((o) => o.index), [0, 1, UNARMED_INDEX], 'the Shield is not an attack');

  const none = { hit: 0, stk: 0, pw: 0 };
  const spear = planAttack(s, champ, guard, 0, none, { reactive: false });
  // OFF 16, −3 for the Guard's Shield (attacked from the front); Strike 2 + 1 (Armsmaster, Active Role).
  assert.deepEqual([spear.ok, spear.attrName, spear.attr, spear.stk, spear.pw], [true, 'OFF', 13, 3, 13]);
  assert.deepEqual(spear.notes, ['Shield −3', 'Armsmaster +1 Strike']);
  assert.match(planAttack(s, champ, guard, 2, none, { reactive: false }).reason, /out of Reach/, 'the dagger needs Base Contact');
  const back = planAttack(s, guard, champ, 0, none, { reactive: true });
  assert.match(back.reason, /out of Reach/, 'the bludgeon (Reach 0) cannot answer a spear (Reach 2)');
  const modded = planAttack(s, champ, guard, 0, { hit: -3, stk: 1, pw: 6 }, { reactive: false });
  assert.deepEqual([modded.attr, modded.stk, modded.pw], [10, 4, 19]);
  run(s, { type: 'ROTATE_MODEL', id: 'a1', facing: 180 });
  assert.equal(planAttack(s, champ, guard, 0, none, { reactive: false }).ok, true, 'the Champion has Vigilance: no Back arc');
  run(s, { type: 'ROTATE_MODEL', id: 'a1', facing: 0 });

  // Ranged: range bands, Cover, and no shooting while Engaged.
  const bow = model(s, 'a2'); // Bushi Attendant, Short Bow 0-20": 0 · 21-40": -6, ACC 12
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: 3, y: 33, free: true });
  run(s, { type: 'MOVE_MODEL', id: 'b2', x: 3, y: 20, free: true });
  assert.equal(planAttack(s, bow, model(s, 'b2'), 0, none, { reactive: false }).reason, '');
  assert.deepEqual([planAttack(s, bow, model(s, 'b2'), 0, none, { reactive: false }).attr, planAttack(s, bow, model(s, 'b2'), 0, none, { reactive: false }).attrName], [12, 'ACC']);
  run(s, { type: 'ROTATE_MODEL', id: 'a2', facing: 180 });
  assert.match(planAttack(s, bow, model(s, 'b2'), 0, none, { reactive: false }).reason, /No line of sight to Flameshaper: the target is behind/);
  run(s, { type: 'ROTATE_MODEL', id: 'a2', facing: 0 });
  run(s, { type: 'MOVE_MODEL', id: 'b2', x: 3, y: 8, free: true });
  const far = planAttack(s, bow, model(s, 'b2'), 0, none, { reactive: false });
  assert.deepEqual([far.attr, far.notes], [6, ['range −6']]);
  run(s, { type: 'SET_STATE', id: 'b2', state: 'Crouched', on: true });
  assert.deepEqual(planAttack(s, bow, model(s, 'b2'), 0, none, { reactive: false }).notes, ['range −6', 'Light Cover −2']);
  run(s, { type: 'MOVE_MODEL', id: 'b2', x: 3, y: 31.74, facing: 180, free: true }); // base to base with the archer
  run(s, { type: 'SET_STATE', id: 'b2', state: 'Crouched', on: false });
  assert.match(planAttack(s, bow, model(s, 'b2'), 0, none, { reactive: false }).reason, /Engaged/);
});

test('Engaged follows Reach and line of sight when an Activation ends', () => {
  const s = melee(0.5);
  run(s, { type: 'ACTIVATE', id: 'a2' });
  run(s, { type: 'END_ACTIVATION' });
  // Spear Reach 2": the Guard is Engaged. Bludgeon Reach 0": the Champion is not.
  assert.deepEqual(engagers(s, model(s, 'b1')).map((m) => m.id), ['a1']);
  assert.equal(model(s, 'b1').states.includes('Engaged'), true);
  assert.equal(model(s, 'a1').states.includes('Engaged'), false);
  assert.match(s.log.at(-1)!.text, /Engaged: Citadel Guard/);
  // Without line of sight the Champion no longer keeps it Engaged.
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Blinded', on: true });
  run(s, { type: 'ACTIVATE', id: 'a2' });
  run(s, { type: 'END_ACTIVATION' });
  assert.equal(model(s, 'b1').states.includes('Engaged'), false);
});

test('Confrontation rules', () => {
  const st = (d: number, attr: number) => ({ d, hit: d <= attr || d === 1, crit: d === 1 });
  // Rulebook example: A (13) rolls 6 and 11, B (12) rolls 8. B's 8 cancels the 6, A's 11 cancels the 8.
  let [a, b] = confront([st(6, 13), st(11, 13)], [st(8, 12)]);
  assert.deepEqual([a.map((x) => x.d), b.map((x) => x.d)], [[11], []]);
  [a, b] = confront([st(6, 13), st(11, 13), st(13, 13)], [st(8, 12)]);
  assert.deepEqual(a.map((x) => x.d), [11, 13]);
  [a, b] = confront([st(9, 13)], [st(9, 12)]);
  assert.deepEqual([a.length, b.length], [0, 0], 'equal results cancel each other');
  [a, b] = confront([st(14, 13)], [st(3, 12)]);
  assert.deepEqual([a.length, b.length], [0, 1], 'a failed roll cancels nothing');
  [a, b] = confront([st(1, 13), st(12, 13)], [st(11, 12)]);
  assert.deepEqual([a.map((x) => x.d), b.length], [[1, 12], 0], 'a Critical Hit beats everything');
  [a, b] = confront([st(1, 13)], [st(1, 12), st(12, 12)]);
  assert.deepEqual([a.map((x) => x.d), b.map((x) => x.d)], [[1], [1]], 'two Critical Hits both land, nothing else does');
});

test('resolving attacks: unopposed, out of Reach, Confrontation, Wounds', () => {
  const s = melee(0.5);
  const champ = model(s, 'a1');
  const guard = model(s, 'b1'); // ARM 6, HP 2
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'attack', weapon: 2, target: 'b1' })), 'NO_ATTACK');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'a2' })), 'NO_ATTACK');
  run(s, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 1 }); // Short Sword, Reach 0: too short
  // Spear: 3 dice vs OFF 13 → 5 hits, the 20s miss. Damage: PW 13 − ARM 6 = 7 → a 3 wounds.
  let ev = run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, dice(5, 20, 20, 3));
  assert.equal(ev[0]!.type, 'ACTION_RESOLVED');
  // For the picture on the table: who struck with what, and who was hit.
  assert.deepEqual(ev[0]!.type === 'ACTION_RESOLVED' && ev[0]!.fx, { from: 'a1', name: 'Spear', at: { x: guard.x, y: guard.y }, hit: ['b1'] });
  const texts = s.log.slice(-4).map((l) => l.text);
  assert.match(texts[0]!, /Clan Champion attacks Citadel Guard with Spear: 3d20 vs OFF 13/);
  assert.match(texts[1]!, /vs PW 13 − ARM 6 = 7 – 1 Wound/);
  assert.match(texts[2]!, /Citadel Guard's Attack fails – Clan Champion is out of Reach/);
  assert.match(texts[3]!, /Citadel Guard suffers 1 Wound \(HP 1\/2\)/);
  assert.deepEqual([guard.hp, champ.hp], [1, 3]);
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'nothing' })), 'ACTION_DONE');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 33, y: 21 })), 'ACTION_DONE', 'movement comes before the Action');
  assert.equal(code(() => run(s, { type: 'REACT', id: 'b2', intent: 'dodge' })), 'TOO_LATE');
  run(s, { type: 'END_ACTIVATION' });

  // Base to base: now the Guard's bludgeon answers and the two are in a Confrontation.
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 33, y: 20 - 2 * baseRadius('medium'), facing: 180, free: true });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 0 }); // Small Bludgeon: DEF 16, Strike 1 + 1 (Sentinel), PW 15
  // Champion 8, 12, 20 – Guard 10, 20: the 10 cancels the 8, the 12 cancels the 10. Damage 7 vs 7 → Wound.
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, dice(8, 12, 20, 10, 20, 7));
  assert.ok(s.log.some((l) => /Confrontation: Clan Champion lands 1 Hit, Citadel Guard lands 0 Hits/.test(l.text)));
  assert.deepEqual([guard.hp, champ.hp], [0, 3]);
  assert.ok(guard.states.includes('Incapacitated') && guard.states.includes('Crouched'));

  // The Guard wins a Confrontation: fresh game, the Guard rolls higher. Bludgeon PW 15, Armor-Piercing: ARM 5 → 3.
  // The Wound comes with Stun: the Champion rolls T 13 (a 5 resists).
  const t = melee(0);
  run(t, { type: 'ACTIVATE', id: 'a1' });
  run(t, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 0 });
  run(t, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b1' }, dice(4, 9, 20, 15, 20, 10, 5));
  assert.ok(t.log.some((l) => /vs PW 15 − ARM 3 = 12 – 1 Wound/.test(l.text)));
  assert.ok(t.log.some((l) => /Clan Champion: Stun, T 13 – resisted/.test(l.text)));
  assert.deepEqual([model(t, 'a1').hp, model(t, 'b1').hp], [2, 2]);
  // A Critical Hit ignores Armor: Sword PW 13 − 0.
  run(t, { type: 'ACTIVATE', id: 'a1' });
  run(t, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b1' }, dice(1, 20, 20, 13));
  assert.ok(t.log.some((l) => /Critical Hit\): 1d20 vs PW 13 − ARM 0 = 13 – 1 Wound/.test(l.text)));
  assert.equal(model(t, 'b1').hp, 1);
});

test('resolving attacks: Dodge, Reactions against a model that does not attack back, Run', () => {
  const s = started(0);
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: 33, y: 28, free: true }); // Bushi Attendant, Short Bow, ACC 12
  run(s, { type: 'MOVE_MODEL', id: 'b2', x: 33, y: 10, facing: 180, free: true }); // Flameshaper AG 12, ARM 1, HP 1
  run(s, { type: 'ACTIVATE', id: 'a2' });
  run(s, { type: 'REACT', id: 'b2', intent: 'dodge' });
  // Two arrows hit (4, 9); the Dodge (12 vs AG 12) succeeds, so no Damage rolls are made.
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b2' }, dice(4, 9, 12));
  assert.ok(s.log.some((l) => /Flameshaper dodges Bushi Attendant: 1d20 vs AG 12 – success/.test(l.text)));
  assert.equal(model(s, 'b2').hp, 1);
  run(s, { type: 'MOVE_MODEL', id: 'b2', x: 33, y: 7 }); // the Dodge move: half of SPD 6
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'b2', x: 33, y: 6 })), 'TOO_FAR');

  // Second shot: a Critical Hit cannot be dodged.
  run(s, { type: 'ACTIVATE', id: 'a2' });
  // Its Dodge move left the Flameshaper facing away: it cannot react to what it does not see...
  assert.equal(code(() => run(s, { type: 'REACT', id: 'b2', intent: 'dodge' })), 'NO_REACTION');
  run(s, { type: 'ROTATE_MODEL', id: 'b2', facing: 180 }); // ...until it turns round
  run(s, { type: 'REACT', id: 'b2', intent: 'dodge' });
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b2' }, dice(1, 15, 5, 13));
  assert.ok(s.log.some((l) => /Flameshaper suffers 1 Wound and is Incapacitated/.test(l.text)));

  // A Reaction Attack against a model that just walks past is resolved when the Activation ends.
  const t = melee(0);
  run(t, { type: 'ACTIVATE', id: 'a1' });
  run(t, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 0 });
  const ev = run(t, { type: 'END_ACTIVATION' }, dice(6, 20, 2, 5)); // 6 vs DEF 16 hits; damage 2 vs 15 − 3; Stun resisted
  assert.deepEqual(ev.map((e) => e.type), ['ACTION_RESOLVED', 'ENGAGEMENT', 'ACTIVATION_ENDED']);
  assert.equal(model(t, 'a1').hp, 2);
  // The active model may Dodge instead: one AG roll per attacker. Champion AG 10.
  run(t, { type: 'ACTIVATE', id: 'a1' });
  run(t, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 0 });
  run(t, { type: 'ACTION', action: 'dodge' }, dice(6, 20, 10));
  assert.equal(model(t, 'a1').hp, 2, 'dodged');
  run(t, { type: 'MOVE_MODEL', id: 'a1', x: 33, y: 23 }); // Dodge move 3" (half of SPD 5, rounded up), away from the Guard
  assert.equal(code(() => run(t, { type: 'MOVE_MODEL', id: 'a1', x: 33, y: 23.5 })), 'TOO_FAR');

  // After a Run only Nothing may be declared.
  const u = melee(8);
  run(u, { type: 'ACTIVATE', id: 'a1' });
  run(u, { type: 'MOVE_MODEL', id: 'a1', x: 33, y: 13.5 }); // 6.5": a Run
  assert.equal(code(() => run(u, { type: 'ACTION', action: 'dodge' })), 'RAN');
  run(u, { type: 'MOVE_MODEL', id: 'a2', x: 31, y: 13.5, free: true }); // the Bushi Attendant has no Dash
  // The Champion has Dash: after a Run it may make one unmodified melee Strike.
  run(u, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, dice(20));
  assert.ok(u.log.some((l) => /Spear: 1d20 vs OFF 13 \(Shield −3; Dash: 1 Strike/.test(l.text)));
  run(u, { type: 'ACTIVATE', id: 'a2' });
  run(u, { type: 'MOVE_MODEL', id: 'a2', x: 31, y: 7.5 }); // 6": a Run for SPD 5
  assert.equal(code(() => run(u, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b1' })), 'RAN');
  run(u, { type: 'ACTION', action: 'nothing' });
  assert.match(u.log.at(-1)!.text, /declares Nothing/);
});

// ---- Traits, Combat Arts, Class abilities ----

/** Blue a1 and Red b1 base to base on a bare table, facing each other. Not started: used for plans and direct resolution. */
function faceOff(blue: string, red: string): TableState {
  const s = table([]);
  run(s, add(blue, 18, 20, 0, true));
  run(s, add(red, 18, 20 - baseRadius(profileById(blue)!.size) - baseRadius(profileById(red)!.size), 1, true));
  for (const m of s.models) m.states = m.states.filter((x) => x !== 'Shrouded');
  return s;
}
const fight = (s: TableState, attacker: string, weapon: number, target: string, vals: number[], art = '') =>
  resolveAction(s, model(s, attacker), 'attack', weapon, model(s, target), { ...NO_MODS, art }, {}, () => vals.shift() ?? assert.fail('ran out of dice'));

test('attack plans apply Class abilities, weapon Traits and Combat Arts', () => {
  let s = faceOff('the-nightshade', 'sog-bushi-attendant');
  let plan = planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, NO_MODS, { reactive: false });
  // Mastercrafted Piercing Dagger: STK STA+1; Assassin: Critical on 1-3.
  assert.deepEqual([plan.attr, plan.stk, plan.pw, plan.critMax, plan.traits], [17, 3, 8, 3, ['Armor-Piercing']]);
  assert.deepEqual(artOptions(model(s, 'a1'), false).map((o) => o.id), ['Assassination I', 'Assassination II', 'Assassination III', 'Assassination IV']);
  plan = planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, { ...NO_MODS, art: 'Assassination I' }, { reactive: false });
  assert.equal(plan.pw, 14, '+6 PW');
  plan = planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, { ...NO_MODS, art: 'Assassination IV' }, { reactive: false });
  assert.equal(plan.allCrit, true);
  assert.equal(planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, { ...NO_MODS, art: 'Assassination IV' }, { reactive: true }).allCrit, false, 'Active Role only');
  run(s, { type: 'SET_STATE', id: 'b1', state: 'Crouched', on: true });
  assert.equal(planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, NO_MODS, { reactive: false }).stk, 4, '+1 Strike against a Crouched model');

  s = faceOff('sog-clan-champion', 'sog-bushi-attendant');
  const champ = model(s, 'a1');
  assert.deepEqual(artOptions(champ, false).map((o) => o.id), ['Fencing I', 'Fencing II', 'Fencing III', 'Fencing IV']);
  assert.deepEqual(artOptions(champ, true), [], 'Fencing is for Melee Attacks');
  assert.equal(planAttack(s, champ, model(s, 'b1'), 1, { ...NO_MODS, art: 'Fencing III' }, { reactive: false }).stk, 4, 'STA 2 + Armsmaster + Second Wind');
  assert.deepEqual(planAttack(s, champ, model(s, 'b1'), 1, { ...NO_MODS, art: 'Fencing IV' }, { reactive: false }).traits, ['Knockdown']);
  assert.match(planAttack(s, champ, model(s, 'b1'), 1, { ...NO_MODS, art: 'Archery I' }, { reactive: false }).reason, /cannot use Archery I/);
  assert.equal(planAttack(s, champ, model(s, 'b1'), 1, { ...NO_MODS, art: 'Fencing III' }, { reactive: false, foeDuelist: true }).stk, 3, 'a Duelist cancels Arts up to level III');
  assert.equal(code(() => run(s, { type: 'SET_STATE', id: 'a1', state: 'Defensive Stance', on: true })), 'NOT_NOW', 'a Warrior shifts to it in its own Strategic Phase');
  champ.states.push('Defensive Stance');
  assert.deepEqual([planAttack(s, champ, model(s, 'b1'), 1, NO_MODS, { reactive: false }).stk, planAttack(s, champ, model(s, 'b1'), 1, NO_MODS, { reactive: true }).stk], [2, 2], 'Defensive Stance: 1 (+Armsmaster) active, full Strike reactive');

  // Marksman who stood still, and Soldiers standing together.
  s = faceOff('sog-musha-bowmaster', 'hel-flameshaper');
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 18, y: 8, free: true });
  assert.equal(planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, NO_MODS, { reactive: false, idle: true }).attr, 18, 'ACC 14 + 4');
  assert.equal(planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, NO_MODS, { reactive: false, idle: false }).attr, 14);
  run(s, add('hel-flameshaper', 20, 8, 1, true));
  run(s, add('hel-citadel-guard', 16, 8, 1, true));
  const shaper = planAttack(s, model(s, 'b1'), model(s, 'a1'), UNARMED_INDEX, NO_MODS, { reactive: false });
  assert.match(shaper.reason, /out of Reach/);
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 8 + 2 * baseRadius('medium'), free: true });
  assert.deepEqual(planAttack(s, model(s, 'b1'), model(s, 'a1'), UNARMED_INDEX, NO_MODS, { reactive: false }).notes.slice(0, 1), ['Soldier +2']);
});

test('resolving attacks applies Cleave, Demon, Berserker, Undead, Shields and Fencing', () => {
  // Red Rasetsu (Demon; blade with Cleave) wounds a Bushi Attendant (HP 2, ARM 4): Cleave adds a Wound.
  let s = faceOff('sog-bushi-attendant', 'oni-red-rasetsu');
  let out = fight(s, 'b1', 0, 'a1', [5, 20, 20, 10, 5]); // one Hit; damage 10 vs 19 − 4; Morale 5 vs 16 holds
  let texts = out.lines.map((l) => l.text);
  assert.ok(texts.includes('Cleave: 1 additional Wound on Bushi Attendant'));
  assert.ok(texts.some((t) => /Bushi Attendant: Demon, M \(Menacing Red Rasetsu −2\) 14 – holds firm/.test(t)), texts.join(' | '));
  assert.deepEqual(out.results, [{ id: 'a1', hp: 0, states: ['Incapacitated', 'Crouched'] }]);
  out = fight(s, 'b1', 0, 'a1', [5, 20, 20, 10, 17]); // this time the Morale roll fails
  assert.deepEqual(out.results[0]!.states, ['Incapacitated', 'Crouched', 'Panicked']);

  // Berserker: once per turn a Toughness roll for each Wound.
  out = fight(s, 'a1', 1, 'b1', [3, 4, 2, 2, 5, 20]); // Short Sword, 2 Hits, 2 Wounds (13 − 3); T 15: one negated
  assert.ok(out.lines.some((l) => /Red Rasetsu: Berserker \(once per turn\), 2d20 vs T 15 – 1 Wound negated/.test(l.text)));
  assert.deepEqual([out.results[0]!.hp, out.used], [5, [{ id: 'b1', what: 'Berserker' }]]);
  s.used = { b1: ['Berserker'] };
  out = fight(s, 'a1', 1, 'b1', [3, 4, 2, 2]);
  assert.equal(out.results[0]!.hp, 4, 'already used this turn');

  // Undead: no Incapacitated, 0 HP is Dead; immune to Poison. Its Shield takes 3 off a frontal Melee Attack.
  s = faceOff('sog-clan-champion', 'und-bonewalker');
  out = fight(s, 'a1', 1, 'b1', [5, 20, 20, 3]);
  assert.match(out.lines[0]!.text, /Sword: 3d20 vs OFF 13 \(Shield −3; Armsmaster \+1 Strike\)/);
  assert.deepEqual(out.results, [{ id: 'b1', hp: 0, states: ['Dead'] }]);
  s = faceOff('und-bonewalker', 'und-bonewalker');
  out = fight(s, 'a1', 0, 'b1', [5, 5, 3, 3]); // Corroded Weapon: Poison I, but the target is Undead
  assert.equal(out.lines.some((l) => /Weakened/.test(l.text)), false);

  // Poison II and Stagger on the living: Troll bite, Oni club.
  s = faceOff('sog-bushi-attendant', 'gob-troll-prowler');
  run(s, { type: 'SET_AP', id: 'a1', ap: 2 });
  out = fight(s, 'b1', 2, 'a1', [5, 3]); // Venomous Bite, 1 Strike; damage 3 vs 15 − 4
  assert.deepEqual(out.results, [{ id: 'a1', hp: 1, states: ['Weakened', 'Poisoned'] }]);
  s = faceOff('sog-bushi-attendant', 'oni-marauder');
  run(s, { type: 'SET_AP', id: 'a1', ap: 2 });
  out = fight(s, 'b1', 0, 'a1', [5, 20, 20, 5]); // War Club: Armor-Piercing (ARM 4 → 2), Stagger; damage 20 vs 19 − 2 fails; M 5 n/a
  assert.deepEqual(out.results, [{ id: 'a1', hp: 2, states: [], ap: 1 }], 'Stagger costs 1 AP even without a Wound');

  // Confrontation with Fencing I: the opponent's Melee Attack suffers −3.
  s = faceOff('sog-clan-champion', 'hel-citadel-guard');
  const reactions = { b1: { intent: 'attack' as const, weapon: 1, mods: { ...NO_MODS, art: 'Fencing I' } } };
  const vals = [20, 20, 20, 20, 20];
  out = resolveAction(s, model(s, 'a1'), 'attack', 1, model(s, 'b1'), NO_MODS, reactions, () => vals.shift()!);
  assert.match(out.lines[0]!.text, /Sword: 3d20 vs OFF 10 \(Shield −3; Armsmaster \+1 Strike; opponent's Fencing −3\)/);
  assert.match(out.lines[1]!.text, /strikes back at Clan Champion with Short Sword: 2d20 vs DEF 16 \(Fencing I; Sentinel \+1 Strike\)/);
});

test('Strategic Phase: Bleeding, Poisoned, Recovery Check, Regeneration', () => {
  const s = started(0); // Blue: Clan Champion a1 (T 13, HP 3), Bushi a2 (T 13, HP 2). Red: Guard b1, Flameshaper b2 (T 8, HP 1)
  run(s, { type: 'SET_STATE', id: 'b1', state: 'Bleeding', on: true });
  run(s, { type: 'WOUND', id: 'b2' }); // Incapacitated
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Poisoned', on: true });
  // Blue ends its turn: Red's Strategic Phase. Guard: Bleeding, T 12 – a 15 fails → Wound. Flameshaper: Recovery, T 8 – a 6 succeeds.
  let ev = run(s, { type: 'END_TURN' }, dice(15, 6));
  // The two rolls wait for Red (the test rolls them at once).
  assert.deepEqual(ev.map((e) => e.type), ['TURN_ENDED', 'STRATEGIC_PENDING', 'STRATEGIC', 'TURN_STARTED']);
  assert.deepEqual(ev[1]!.type === 'STRATEGIC_PENDING' && ev[1]!.rolls.map((r) => `${r.who}: ${r.what} ${r.target}`), ['Citadel Guard: Bleeding, T 12', 'Flameshaper: Recovery Check, T 8']);
  assert.equal(model(s, 'b1').hp, 1);
  assert.deepEqual([model(s, 'b2').hp, model(s, 'b2').states.includes('Incapacitated'), model(s, 'b2').states.includes('Weakened')], [1, false, true]);
  assert.equal(model(s, 'b2').ap, 1, 'recovered before the Upkeep: STA 2 − 1 (Weakened)');
  assert.equal(model(s, 'a1').hp, 3, 'not Blue\'s Strategic Phase');
  // Red ends its turn: Blue's Strategic Phase. Champion: Poisoned, T 13 − 6 = 7 – an 8 fails.
  ev = run(s, { type: 'END_TURN' }, dice(8, 20));
  assert.equal(model(s, 'a1').hp, 2);
  assert.ok(s.log.some((l) => /Clan Champion: Poisoned, T −6, 1d20 vs 7 – failed/.test(l.text)));

  // Regeneration: the Troll regains 1 HP and stops Bleeding before it would roll for it.
  const t = table([]);
  run(t, add('gob-troll-prowler', 18, 32));
  run(t, add('sog-bushi-attendant', 18, 4, 1));
  run(t, { type: 'READY' }, { d20: () => 10 }); // Red: 10 + M 16 beats Blue: 10 + M 10
  assert.equal(t.active, 1);
  run(t, { type: 'WOUND', id: 'a1' });
  run(t, { type: 'SET_STATE', id: 'a1', state: 'Bleeding', on: true });
  run(t, { type: 'END_TURN' }, dice());
  assert.deepEqual([model(t, 'a1').hp, model(t, 'a1').states], [6, []]);
});

// ---- Quests, Schemes, Broken Morale ----

/** A Quest game on a bare table. Blue: Clan Champion a1 (Leader, 23 pts), Bushi a2, a3 (13 pts). Red: Citadel Guard b1 (18), Flameweaver Errant b2 (Leader, 21), Flameshaper b3 (15). */
function questGame(quest: string): TableState {
  const s = table([], quest);
  run(s, add('sog-clan-champion', 14, 32));
  run(s, add('sog-bushi-attendant', 18, 32));
  run(s, add('sog-bushi-attendant', 22, 32));
  run(s, add('hel-citadel-guard', 14, 4, 1));
  run(s, add('hel-flameweaver-errant', 18, 4, 1));
  run(s, add('hel-flameshaper', 22, 4, 1));
  assert.equal(code(() => run(s, { type: 'READY' })), 'SCHEME_FIRST');
  for (const side of [0, 1] as const) {
    run(s, { type: 'DRAW_SCHEMES', side });
    assert.equal(code(() => run(s, { type: 'DRAW_SCHEMES', side })), 'SCHEME_DRAWN');
    run(s, { type: 'KEEP_SCHEME', code: 'no-quarter', side });
  }
  assert.deepEqual(s.schemes.map((x) => [x.drawn, x.kept, x.revealed]), [[2, true, null], [2, true, null]], 'Leader INT 13 → 2 cards each');
  run(s, { type: 'READY' }, dice(12, 10)); // Blue 12 + 17 beats Red 10 + 18 (M 16, +2 for the two Soldiers next to its Leader)
  assert.deepEqual([s.phase, s.active, s.partySize], ['playing', 0, [3, 3]]);
  return s;
}

test('Quest and Scheme data', () => {
  assert.deepEqual(QUESTS.map((q) => q.code), ['open-hostilities', 'awaiting-reinforcements', 'treasure-hunt']);
  assert.equal(SCHEMES.length, 25);
  assert.equal(new Set(SCHEMES.map((x) => x.code)).size, 25);
  for (const f of FACTIONS) {
    // Every result of the d20 leads to a known Scheme, and a hand never holds the same one twice.
    for (let roll = 1; roll <= 20; roll++) assert.ok(schemeByCode(drawSchemes(f.name, 1, () => roll)[0]), `${f.name} ${roll}`);
    let n = 0;
    const hand = drawSchemes(f.name, 4, () => (n++ % 20) + 1);
    assert.equal(new Set(hand).size, 4);
  }
  assert.deepEqual(drawSchemes('Empire of Soga', 2, () => 20), ['stalwart-defender'].slice(0, 1), 'gives up instead of looping forever when the dice keep repeating');
  assert.deepEqual(drawSchemes('Helian League', 1, () => 20), ['peacekeeping-paragon']);
  assert.deepEqual(drawSchemes('Oni Clans', 1, () => 2), ['opportunistic-manipulation'], 'Monster Factions use the Neutral Schemes');
});

test('Open Hostilities: bounties, Leader bonus, Broken Morale, Panicked rolls', () => {
  const s = questGame('open-hostilities');
  run(s, { type: 'WOUND', id: 'b3' }); // Flameshaper, HP 1, 15 pts → 1 VP
  assert.deepEqual(s.vp, [1, 0]);
  assert.match(s.log.at(-1)!.text, /Blue scores 1 VP – Flameshaper is out \(15 pts\)/);
  run(s, { type: 'HEAL', id: 'b3' }); // back on its feet…
  run(s, { type: 'WOUND', id: 'b3' }); // …and down again: scored again (FAQ 2026)
  assert.deepEqual(s.vp, [2, 0]);
  run(s, { type: 'WOUND', id: 'b3' }); // now Dead: not scored again
  assert.deepEqual(s.vp, [2, 0]);
  run(s, { type: 'WOUND', id: 'b2' });
  run(s, { type: 'WOUND', id: 'b2' }); // Flameweaver Errant, HP 2, 21 pts, Leader → 2 + 1
  assert.deepEqual(s.vp, [5, 0]);
  // Two of three Red models are out: Broken Morale, the Guard is Panicked.
  assert.deepEqual([s.broken, model(s, 'b1').states.includes('Panicked')], [[false, true], true]);
  assert.match(s.log.at(-1)!.text, /Broken Morale/);
  // Blue loses the Champion (23 pts, Leader → 3 + 1); one of three down is not yet Broken Morale.
  for (let i = 0; i < 3; i++) run(s, { type: 'WOUND', id: 'a1' });
  assert.deepEqual([s.vp, s.broken[0]], [[5, 4], false]);

  // A Panicked model rolls Morale when it reacts or activates (Guard M 14).
  run(s, { type: 'ACTIVATE', id: 'a2' });
  run(s, { type: 'REACT', id: 'b1', intent: 'dodge' }, dice(15));
  assert.match(s.log.at(-1)!.text, /Citadel Guard is Panicked: 1d20 vs M 14 – failed/);
  run(s, { type: 'END_TURN' }, dice(20, 10)); // Red's Strategic Phase: Recovery Check of the Errant fails (T 12)
  run(s, { type: 'ACTIVATE', id: 'b1' }, dice(3));
  assert.match(s.log.at(-1)!.text, /Citadel Guard is Panicked: 1d20 vs M 14 – it holds/);

  // The Quest ends when a player starts a turn with nobody standing.
  run(s, { type: 'WOUND', id: 'a2' });
  run(s, { type: 'WOUND', id: 'a2' });
  run(s, { type: 'WOUND', id: 'a3' });
  run(s, { type: 'WOUND', id: 'a3' });
  assert.deepEqual(s.vp, [5, 6]);
  const ev = run(s, { type: 'END_TURN' }, dice(20, 20, 20, 20));
  assert.equal(ev.at(-1)!.type, 'GAME_FINISHED');
  assert.deepEqual([s.phase, s.winner], ['finished', 1]);
});

test('Awaiting Reinforcements: Obelisk scoring from round 2, ceasefire in round 1', () => {
  const s = questGame('awaiting-reinforcements');
  assert.deepEqual(s.markers, [{ id: 'obelisk', name: 'Obelisk', x: 18, y: 18, radius: 6 }]);
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 22, free: true }); // Champion (23 pts) at the Obelisk
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' });
  assert.deepEqual([s.round, s.vp], [2, [0, 0]], 'nothing is scored in round 1');
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' });
  assert.deepEqual(s.vp, [3, 0], 'present + Stronger Presence + opponent absent');
  // Red brings the Guard (18) and the Errant (21): 39 pts against 23.
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 16, y: 14, free: true });
  run(s, { type: 'MOVE_MODEL', id: 'b2', x: 20, y: 14, free: true });
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' });
  assert.deepEqual(s.vp, [4, 2], 'Blue: present. Red: present + Stronger Presence');
  // 6" is measured to the base: a model 7" from the centre of the marker still counts, one at 8" does not.
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 25, free: true });
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 16, y: 4, free: true });
  run(s, { type: 'MOVE_MODEL', id: 'b2', x: 18, y: 10, free: true });
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' });
  assert.deepEqual(s.vp, [7, 2]);
  assert.equal(s.broken.some(Boolean), false);

  // Ceasefire: an attack in round 1 costs the attacker 4 VP.
  const t = questGame('awaiting-reinforcements');
  run(t, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 20, free: true });
  run(t, { type: 'MOVE_MODEL', id: 'b1', x: 18, y: 20 - 2 * baseRadius('medium'), free: true });
  run(t, { type: 'ACTIVATE', id: 'a1' });
  run(t, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b1' }, dice(20, 20, 20));
  assert.deepEqual(t.vp, [-4, 0]);
});

// ---- party builder ----

test('who can recruit whom', () => {
  const names = (f: string) => recruitPool(f).map((p) => p.id);
  for (const f of PARTY_FACTIONS) assert.ok(recruitPool(f).length > 0, f);
  // The four realms hire Neutrals and each other's semi-neutral models.
  assert.ok(names('Helian League').includes('neu-guildsworn-knight'));
  assert.ok(names('Helian League').includes('sog-onitaoshi'));
  assert.ok(!names('Helian League').includes('sog-clan-champion'));
  assert.ok(!names('Helian League').includes('oni-marauder'));
  // Monster Factions hire no Neutrals; the Undead march with the Oni.
  assert.deepEqual([...new Set(recruitPool('Goblin Wartribes').map((p) => p.faction))], ['Goblin Wartribes']);
  assert.deepEqual([...new Set(recruitPool('Oni Clans').map((p) => p.faction))], ['Oni Clans', 'Undead']);
  // A Neutral party: Neutral models and every semi-neutral one.
  assert.ok(names('Neutral').includes('the-hired-blade') && names('Neutral').includes('neu-tomoe') && !names('Neutral').includes('the-nightshade'));
  // The Slayer Dragoon: Limit 2 at home, 1 as a mercenary.
  const dragoon = profileById('the-slayer-dragoon')!;
  assert.deepEqual([limitIn(dragoon, 'Coalition of Thenion'), limitIn(dragoon, 'Empire of Soga')], [2, 1]);
});

test('party validation', () => {
  const ok = { faction: 'Empire of Soga', models: ['sog-clan-champion', 'sog-bushi-attendant', 'sog-bushi-attendant', 'neu-amazon-gladiatrix'], leader: 0 };
  assert.deepEqual(partyProblems(ok, 85), []); // 23 + 13 + 13 + 32 = 81
  assert.deepEqual(partyProblems(ok, 60), ['81 points – the limit is 60']);
  assert.deepEqual(partyProblems({ ...ok, models: ['sog-clan-champion', 'sog-clan-champion'] }, 85), ['Clan Champion: 2 recruited, Limit 1']);
  assert.deepEqual(partyProblems({ ...ok, models: ['the-nightshade'] }, 85), ['Nightshade cannot be recruited by Empire of Soga', 'At least one model must belong to Empire of Soga']);
  assert.deepEqual(partyProblems({ ...ok, models: ['neu-amazon-gladiatrix', 'the-hired-blade'] }, 85), ['At least one model must belong to Empire of Soga']);
  assert.deepEqual(partyProblems({ ...ok, models: ['the-slayer-dragoon', 'the-slayer-dragoon', 'sog-bushi-attendant'] }, 85), ['Slayer Dragoon: 2 recruited, Limit 1']);
  assert.deepEqual(partyProblems({ ...ok, leader: 7 }, 85), ['Choose a Leader']);
  assert.deepEqual(partyProblems({ ...ok, models: [] }, 85), ['The party has no models']);
  assert.deepEqual(partyProblems({ faction: 'Undead', models: ['und-bonewalker'], leader: 0 }, 85), ['Unknown faction']);
  assert.deepEqual(partyProblems({ faction: 'Goblin Wartribes', models: Array(11).fill('gob-brawlers'), leader: 0 }, 100), ['A party may contain up to 10 models']);
  assert.deepEqual(partyProblems({ faction: 'Goblin Wartribes', models: Array(7).fill('gob-brawlers'), leader: 0 }, 60), [], 'no Limit on Brawlers');
  assert.deepEqual(partyProblems({ faction: 'Neutral', models: ['neu-guildsworn-knight', 'the-hired-blade'], leader: 0 }, 60), []);
});

test('deploying a party', () => {
  const s = table(defaultTerrain(), 'open-hostilities');
  const soga = { faction: 'Empire of Soga', models: ['sog-bushi-attendant', 'sog-clan-champion', 'neu-renegade-rasetsu'], leader: 1 };
  assert.equal(code(() => run(s, { type: 'DEPLOY_PARTY', side: 0, ...soga })), 'BAD_PARTY', '63 points on a 60-point table');
  soga.models = ['sog-bushi-attendant', 'sog-clan-champion', 'sog-musha-bowmaster'];
  run(s, { type: 'DEPLOY_PARTY', side: 0, ...soga });
  assert.deepEqual(s.models.map((m) => [m.name, m.leader]), [['Bushi Attendant', false], ['Clan Champion', true], ['Musha Bowmaster', false]]);
  assert.deepEqual([s.factions, s.points], [['Empire of Soga', null], 60]);
  // The party lines up on Blue's shelf, on the part both players see.
  for (const m of s.models) assert.ok(onShelf(s, m) === 0 && !shelfHidden(s, m) && shelfPlacement(s, m.size, m.x, m.y, 0, m.id) === null);
  assert.equal(code(() => run(s, { type: 'DEPLOY_PARTY', side: 1, faction: 'Oni Clans', models: ['oni-red-rasetsu'], leader: 0 }, { side: 0, solo: false })), 'NOT_YOURS');
  // Deploying again replaces the party.
  run(s, { type: 'DEPLOY_PARTY', side: 0, faction: 'Oni Clans', models: ['oni-red-rasetsu', 'und-bonewalker', 'und-bonewalker'], leader: 0 });
  assert.deepEqual(s.models.map((m) => m.name), ['Red Rasetsu', 'Bonewalker', 'Bonewalker 2']);
  assert.equal(s.factions[0], 'Oni Clans');
  // Once Schemes are drawn the party is fixed.
  run(s, { type: 'DRAW_SCHEMES', side: 0 });
  assert.equal(code(() => run(s, { type: 'DEPLOY_PARTY', side: 0, ...soga })), 'SCHEME_DRAWN');
});

test('Upgrades: slots, Limits, restrictions and cost', () => {
  const base = { faction: 'Empire of Soga', models: ['sog-clan-champion', 'sog-bushi-attendant', 'sog-seigen'], leader: 0 };
  const cost = partyPoints(base.models);
  const withUp = (upgrades: string[][], faction = base.faction) => partyProblems({ ...base, faction, upgrades }, 100);

  // Clan Champion has Resourceful I: two Upgrades; the Bushi one.
  assert.deepEqual(withUp([['sog-seasoned-combatant', 'neu-additional-protection'], ['sog-daikyuu-tsukai'], []]), []);
  // Seasoned Combatant 2 + Additional Protection 1 + War Bow at 2 (the Bushi's Primary Weapon is a Short Bow).
  assert.equal(partyPoints(base.models, [['sog-seasoned-combatant', 'neu-additional-protection'], ['sog-daikyuu-tsukai'], []]), cost + 5);
  assert.deepEqual(withUp([[], ['neu-utility-tool', 'neu-first-aid'], []]), ['Bushi Attendant: 2 Upgrades, it may carry 1']);
  assert.deepEqual(withUp([[], ['neu-pouch', 'neu-first-aid'], []]), [], 'a Pouch makes room for one more');
  assert.deepEqual(withUp([[], [], ['neu-pouch']]), ['Seigen, of the Keshōbarai is a Character and cannot take Upgrades']);
  assert.deepEqual(withUp([['sog-seasoned-combatant', 'sog-seasoned-combatant'], [], []]), ['Clan Champion has Seasoned Combatant twice']);
  assert.deepEqual(withUp([['sog-lucky-charm'], ['sog-lucky-charm'], []]), ['Lucky Charm: 2 bought, Limit 1']);
  assert.deepEqual(withUp([['the-poisoned-weapons'], [], []]), ['Poisoned Weapons on Clan Champion: Only Coalition of Thenion parties can buy this']);
  assert.deepEqual(withUp([['nope'], [], []]), ['Clan Champion: unknown Upgrade']);

  const helian = { faction: 'Helian League', models: ['hel-flameshaper', 'sog-onitaoshi'], leader: 0 };
  assert.deepEqual(partyProblems({ ...helian, upgrades: [['sog-yari-tsukai'], []] }, 60).length, 1, 'Soga Upgrades are not for a Helian party');
  assert.deepEqual(partyProblems({ ...helian, upgrades: [['neu-camaraderie'], []] }, 60), ['Camaraderie on Flameshaper: Only a Neutral or semi-neutral model']);
  assert.deepEqual(partyProblems({ ...helian, upgrades: [[], ['neu-camaraderie']] }, 60), []);
  assert.deepEqual(partyProblems({ ...helian, upgrades: [[], ['hel-seasoned-combatant']] }, 60), [], 'a hired model may carry the faction’s Upgrade');

  const oni = { faction: 'Oni Clans', models: ['oni-red-yaksha'], leader: 0 };
  assert.deepEqual(partyProblems({ ...oni, upgrades: [['neu-utility-tool']] }, 60), []);

  // Devotion: Paimon makes the model's other Upgrades 1 cheaper, never below 1.
  const nightshade = profileById('the-nightshade')!;
  assert.equal(upgradesCost(nightshade, ['the-devotion-paimon', 'the-concealed-approach', 'neu-pouch']), 2 + 2 + 1);
});

test('Upgrades change the card the table plays with', () => {
  const s = table();
  s.points = 100;
  run(s, {
    type: 'DEPLOY_PARTY',
    side: 0,
    faction: 'Empire of Soga',
    models: ['sog-clan-champion', 'sog-bushi-attendant', 'sog-bushi-attendant'],
    leader: 0,
    upgrades: [['neu-additional-protection', 'sog-kanabou-tsukai'], ['sog-bujutsu-expertise'], []],
  });
  const [champ, bushi, plain] = s.models.filter((m) => m.side === 0) as [Model, Model, Model];
  assert.deepEqual(champ.upgrades, ['neu-additional-protection', 'sog-kanabou-tsukai']);
  assert.equal(plain.upgrades, undefined);
  assert.equal(modelStats(champ).arm, 7);
  assert.equal(modelStats(champ).ag, 8);
  assert.equal(profileOf(champ).weapons[0]!.name, 'Heavy Bludgeon');
  assert.equal(profileOf(champ).weapons.length, 3);
  assert.deepEqual(profileOf(bushi).classes, ['Warrior', 'Armsmaster']);
  assert.deepEqual(profileOf(bushi).arts, ['Fencing I']);
  assert.deepEqual(profileOf(plain).classes, ['Warrior']);
  assert.equal(profileById('sog-bushi-attendant')!.classes.length, 1, 'the card itself is untouched');
  assert.ok(artOptions(bushi, false).length > 0, 'the Bushi can now use Fencing');
  assert.equal(s.points, 100);

  // Next rank of an Art the model already has; Poison on every weapon; +1 Strike on the Primary Weapon.
  assert.deepEqual(withUpgrades(profileById('sog-musha-blademaster')!, ['sog-bujutsu-expertise']).arts.filter((a) => a.startsWith('Fencing')).length, 1);
  // Adept Shaper: the Flameshaper's Art of Sorcery II becomes III, which brings Fireball.
  const shaper = withUpgrades(profileById('hel-flameshaper')!, ['hel-adept-shaper']);
  assert.deepEqual(shaper.arts, ['Art of Sorcery III']);
  assert.deepEqual([spellsOf(profileById('hel-flameshaper')!).some((x) => x.name === 'Fireball'), spellsOf(shaper).some((x) => x.name === 'Fireball')], [false, true]);
  const poisoned = withUpgrades(profileById('the-hired-blade')!, ['the-poisoned-weapons']);
  assert.ok(poisoned.weapons.filter((w) => w.pw !== '-').every((w) => /Poison I/.test(w.effect ?? '')));
  assert.equal(withUpgrades(profileById('hel-citadel-guard')!, ['hel-reduce-weight-item']).weapons[0]!.stk, 'STA');
  assert.equal(isCharacter(profileById('hel-anari')!), true);
  assert.equal(isCharacter(profileById('hel-citadel-guard')!), false);
});

test('rerolls: Dual Wield, a Mastercrafted weapon, Advantage', () => {
  const lines = (out: { lines: { text: string }[] }) => out.lines.map((l) => l.text);
  // Swashbuckler (Dual Wield, Strike 2): a 20 misses and is rolled again.
  let s = faceOff('the-swashbuckler', 'sog-bushi-attendant');
  let out = fight(s, 'a1', 0, 'b1', [20, 5, 3, 20, 20, 20]);
  assert.ok(lines(out).includes('Thenrin Swashbuckler: Dual Wield – rerolls 1 missed Attack roll, 1 now hits'));
  assert.ok(lines(out).some((t) => /Damage on Bushi Attendant \(Short Sword\): 2d20/.test(t)), 'both Strikes hit after the reroll');
  out = fight(s, 'a1', 0, 'b1', [5, 5, 20, 20, 20]);
  assert.ok(!lines(out).some((t) => /rerolls/.test(t)), 'nothing missed, nothing rerolled');

  // Bladebrethren Elite: Dual Wield rerolls one miss, the Mastercrafted Sword the other; a die is rerolled once.
  s = faceOff('the-bladebrethren-elite', 'sog-bushi-attendant');
  out = fight(s, 'a1', 0, 'b1', [20, 19, 2, 20, 20, 20]);
  const re = lines(out).filter((t) => /rerolls/.test(t));
  assert.deepEqual(re, ['Bladebrethren Elite: Dual Wield – rerolls 1 missed Attack roll, 1 now hits', 'Bladebrethren Elite: Mastercrafted Sword – rerolls 1 missed Attack roll, 0 now hit']);

  // Slayer Dragoon, Advantage (Large, Huge, Colossal): against a Large target every miss is rolled again, once.
  s = faceOff('the-slayer-dragoon', 'the-night-temple-priestess');
  out = fight(s, 'a1', 0, 'b1', [20, 4, 20, 20, 20, 20]);
  assert.ok(lines(out).includes('Slayer Dragoon: Advantage (Large, Huge, Colossal) – rerolls 1 missed Attack roll, 1 now hits'));
  s = faceOff('the-slayer-dragoon', 'sog-bushi-attendant');
  out = fight(s, 'a1', 0, 'b1', [20]);
  assert.ok(!lines(out).some((t) => /rerolls/.test(t)), 'a Medium target gives no Advantage');
  // Rangers-Guild Hunter, Advantage (Beast): the Oni Pariah is a Beast.
  s = faceOff('the-rangers-guild-hunter', 'oni-pariah');
  out = fight(s, 'a1', 1, 'b1', [20, 20, 20, 20]);
  assert.ok(lines(out).includes('Rangers-Guild Hunter: Advantage (Beast) – rerolls 2 missed Attack rolls, 0 now hit'));
});

test('states that end by themselves', () => {
  // Poison I (here from Assassination II): Weakened until the victim's next Strategic Phase.
  const s = table([]);
  run(s, add('the-nightshade', 18, 20, 0, true));
  run(s, add('sog-bushi-attendant', 18, 20 - 2 * baseRadius('medium'), 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  assert.equal(s.active, 0);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  // 3 Strikes hit (no Critical); Rogue AG roll fails; Damage 8 − 2 = 6: one Wound.
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1', mods: { hit: 0, stk: 0, pw: 0, art: 'Assassination II' } }, dice(5, 5, 5, 20, 20, 20, 3));
  const bushi = model(s, 'b1');
  assert.ok(s.log.some((l) => l.text === 'Bushi Attendant is Weakened (Poison I) until its next Strategic Phase'));
  assert.deepEqual([bushi.hp, bushi.states, bushi.temp], [1, ['Weakened'], { Weakened: 'strategic' }]);
  run(s, { type: 'END_ACTIVATION' });
  // A state with a note that ends with the turn.
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Slowed', on: true });
  model(s, 'a1').temp = { Slowed: 'turn' };
  run(s, { type: 'END_TURN' }, dice(20, 20));
  assert.deepEqual([model(s, 'a1').states.includes('Slowed'), model(s, 'a1').temp], [false, undefined]);
  assert.ok(s.log.some((l) => l.text === 'Nightshade is no longer Slowed'));
  // Red's Strategic Phase came with the new turn.
  assert.ok(s.log.some((l) => l.text === 'Bushi Attendant is no longer Weakened'));
  assert.deepEqual([bushi.states, bushi.temp, bushi.ap], [['Engaged'], undefined, 2]);

  // A lasting cause on top of a passing one makes the state stay.
  const t = faceOff('the-nightshade', 'sog-bushi-attendant');
  model(t, 'b1').states.push('Weakened');
  model(t, 'b1').temp = { Weakened: 'strategic' };
  t.models[0]!.upgrades = ['the-poisoned-weapons'];
  let out = fight(t, 'a1', 0, 'b1', [5, 5, 5, 20, 20, 20, 3], 'Assassination II'); // dagger now Poison I, the Art adds nothing new
  assert.deepEqual(out.results[0]!.temp, { Weakened: 'strategic' });
  model(t, 'a1').upgrades = ['the-poisoned-weapons', 'the-poisoned-weapons']; // Poison II
  out = fight(t, 'a1', 0, 'b1', [5, 5, 5, 20, 20, 20, 3]);
  assert.ok(out.lines.some((l) => l.text === 'Bushi Attendant stays Weakened'));
  assert.deepEqual([out.results[0]!.states, out.results[0]!.temp], [['Weakened', 'Poisoned'], {}]);

  // Demon: Panicked until the end of the turn.
  const d = faceOff('sog-bushi-attendant', 'oni-red-rasetsu');
  out = fight(d, 'b1', 0, 'a1', [5, 20, 20, 10, 17]);
  assert.deepEqual(out.results[0]!.temp, { Panicked: 'turn' });
});

test('Chain Attack', () => {
  // Blue: Citadel Guard attacks a Bushi; the Helrin Expatriate next to the Bushi has Chain Attack.
  const s = faceOff('hel-citadel-guard', 'sog-bushi-attendant');
  const bushi = model(s, 'b1');
  run(s, add('hel-helrin-expatriate', bushi.x + 2 * baseRadius('medium') + 0.3, bushi.y, 0, true));
  run(s, { type: 'ROTATE_MODEL', id: 'a2', facing: 270 });
  // Guard hits (5); Expatriate's Chain Attack hits (4) and wounds (2 vs 12 − 4); the Guard's Damage roll fails.
  let out = fight(s, 'a1', 0, 'b1', [5, 4, 2, 20]);
  const texts = out.lines.map((l) => l.text);
  assert.ok(texts.includes('Helrin Expatriate: Chain Attack on Bushi Attendant with Sword, 1d20 vs OFF 13'));
  assert.ok(texts.findIndex((t) => /Chain Attack/.test(t)) < texts.findIndex((t) => /Damage on Bushi Attendant \(Small Bludgeon\)/.test(t)), 'before the Damage rolls');
  assert.equal(out.results[0]!.hp, 1);
  // No Hit, no Chain Attack.
  out = fight(s, 'a1', 0, 'b1', [20]);
  assert.ok(!out.lines.some((l) => /Chain Attack/.test(l.text)));
  // It must see the enemy.
  run(s, { type: 'ROTATE_MODEL', id: 'a2', facing: 90 });
  out = fight(s, 'a1', 0, 'b1', [5, 20]);
  assert.ok(!out.lines.some((l) => /Chain Attack/.test(l.text)));
});

test('Hit and Retreat', () => {
  const s = table([]);
  run(s, add('hel-eonian-runner', 18, 26, 0, true));
  run(s, add('sog-bushi-attendant', 18, 18, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  const actor = { side: 0 as Side, solo: true };
  // Engaged, but the Skill cancels that in the Movement Step: it may Run.
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Engaged', on: true });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  const far = checkMove(s, actor, model(s, 'a1'), { x: 28, y: 26 }, false);
  assert.deepEqual([far.ok, far.ok && far.mode], [true, 'run']);
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Engaged', on: false });
  // Javelin (Reach T 13) from 7": after the Attack one more Walk, SPD 6 in all.
  run(s, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b1' }, dice(20, 20, 20, 20));
  let ev = run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 30 });
  assert.deepEqual([ev[0]!.type, ev[0]!.type === 'MODEL_MOVED' && ev[0]!.mode, s.activation!.retreated], ['MODEL_MOVED', 'retreat', 4]);
  assert.match(s.log.at(-1)!.text, /walked \(Hit and Retreat\)/);
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 33 })), 'TOO_FAR');
  run(s, { type: 'END_ACTIVATION' });
  run(s, { type: 'END_TURN' }, dice(20, 20));
  run(s, { type: 'END_TURN' }, dice(20, 20));

  // An enemy that has it Engaged after the Attack keeps it there (FAQ 2026).
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 18, y: 30 - 2 * baseRadius('medium'), facing: 180, free: true });
  run(s, { type: 'ROTATE_MODEL', id: 'a1', facing: 0 });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, dice(20, 20, 20, 20));
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 33 })), 'ACTION_DONE');
});

test('Infiltration and Tactician widen the Deployment Zone', () => {
  const s = table([]); // 36" deep, 8" zones; Blue deploys at the bottom
  const depth = (id: string, side: Side = 0) => deployDepthFor(s, { side, profileId: id });
  assert.deepEqual([depth('sog-bushi-attendant'), depth('the-rangers-guild-hunter'), depth('the-hired-blade')], [8, 9, 28]);
  assert.equal(code(() => run(s, add('sog-bushi-attendant', 10, 20))), 'ZONE');
  run(s, add('the-hired-blade', 10, 9)); // Infiltration II: right up to the opponent's zone
  assert.equal(code(() => run(s, add('the-hired-blade', 14, 8.2))), 'ZONE', 'not inside it');
  run(s, add('the-rangers-guild-hunter', 20, 28)); // Infiltration I: the middle line of Blue's half
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a2', x: 20, y: 26 })), 'ZONE');
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 15 });
  // Tharos is a Tactician: his whole party deploys 5" further forward, and Red's infiltrators stay out of that.
  assert.equal(depth('the-tharos'), 13);
  run(s, add('the-tharos', 24, 24));
  assert.equal(depth('sog-bushi-attendant'), 13);
  run(s, add('sog-bushi-attendant', 28, 24));
  assert.deepEqual([depth('sog-bushi-attendant', 1), depth('the-hired-blade', 1)], [8, 23]);
});

test('Schemes the table can check are counted at the end of the game', () => {
  const s = started(0); // Blue: Champion a1, Bushi a2 at the bottom. Red: Guard b1, Flameshaper b2 at the top.
  run(s, { type: 'WOUND', id: 'b2' });
  run(s, { type: 'WOUND', id: 'b2' }); // Dead
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: 24, y: 5, free: true }); // into Red's Deployment Zone
  s.phase = 'finished';
  s.winner = 'draw';
  const score = (seat: Side, code: string): [number, boolean] => {
    s.schemes[seat] = { drawn: 2, kept: true, revealed: code };
    const ev = schemeScoring(s).find((e) => e.type === 'SCHEME_SCORED' && e.seat === seat);
    s.schemes[seat] = { drawn: 0, kept: false, revealed: null };
    return ev?.type === 'SCHEME_SCORED' ? [ev.delta, ev.auto] : [-1, false];
  };
  const blue: Record<string, number> = {
    'virtuous-commander': 2, 'no-quarter': 1, 'peacekeeping-paragon': 1, 'engetsu-formation': 1, 'breach-their-defenses': 2,
    'steadfast-expansion': 1, 'stalwart-defender': 3, 'decisive-victory': 3, 'assassination-contract': 0, 'strength-in-numbers': 3,
  };
  for (const [code, vp] of Object.entries(blue)) assert.deepEqual(score(0, code), [vp, true], code);
  assert.deepEqual(score(1, 'stalwart-defender'), [0, true], 'the Bushi stands in Red\'s zone');
  assert.deepEqual(score(1, 'decisive-victory'), [0, true]);
  assert.deepEqual(score(1, 'strength-in-numbers'), [0, true]);
  assert.deepEqual(score(1, 'blood-for-blood'), [0, false], 'needs a choice by the player: by hand');
  // Leave Unnoticed: models no standing enemy can see.
  const unseen = [model(s, 'a1'), model(s, 'a2')].filter((m) => !sight(s, model(s, 'b1'), m).los).length;
  assert.deepEqual(score(0, 'leave-unnoticed'), [unseen, true]);

  // Revealing after the game counts the Scheme at once and can change the result.
  s.schemes[0] = { drawn: 2, kept: true, revealed: null };
  const ev = run(s, { type: 'REVEAL_SCHEME', code: 'virtuous-commander', side: 0 });
  assert.deepEqual(ev.map((e) => e.type), ['SCHEME_REVEALED', 'SCHEME_SCORED']);
  assert.deepEqual([s.vp, s.winner, s.schemes[0].scored], [[2, 0], 0, true]);
  assert.match(s.log.at(-1)!.text, /The result is now: Blue wins 2:0/);
  assert.deepEqual(schemeScoring(s), [], 'counted once');
  // Schemes scored by hand: the VP buttons still work after the last turn.
  run(s, { type: 'ADD_VP', side: 1, delta: 2 });
  assert.deepEqual([s.vp, s.winner], [[2, 2], 'draw']);
});

test('who may react: line of sight during the move, Awareness, Stealth', () => {
  // Blue Bushi a1 walks up behind the Red Flameshaper b1 (AG 12), which looks the other way.
  const setup = (blue: string, startY: number) => {
    const s = table([]);
    run(s, add(blue, 18, startY, 0, true));
    run(s, add('hel-flameshaper', 18, 10, 1, true));
    run(s, { type: 'ROTATE_MODEL', id: 'b1', facing: 0 }); // faces the top edge, away from Blue
    run(s, { type: 'READY' }, dice(20, 1));
    run(s, { type: 'ACTIVATE', id: 'a1' });
    return s;
  };
  let s = setup('sog-bushi-attendant', 27);
  assert.deepEqual([s.activation!.seen, s.activation!.near], [[], []]);
  assert.deepEqual(reactCheck(s, model(s, 'b1')), { ok: false, reason: 'Flameshaper has had no line of sight to Bushi Attendant and it has not come within its Awareness' });
  assert.equal(code(() => run(s, { type: 'REACT', id: 'b1', intent: 'dodge' })), 'NO_REACTION');
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 22 }); // 5" closer: inside Awareness 12"
  assert.deepEqual([s.activation!.seen, s.activation!.near], [[], ['b1']]);
  const check = reactCheck(s, model(s, 'b1'));
  assert.deepEqual([check.ok, check.ok && check.dodgeOnly], [true, true]);
  assert.equal(code(() => run(s, { type: 'REACT', id: 'b1', intent: 'attack', weapon: UNARMED_INDEX })), 'NO_REACTION');
  run(s, { type: 'REACT', id: 'b1', intent: 'dodge' });
  // The unseen attacker is dodged on halved Agility: 12 → 6, so a 7 fails.
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, dice(5, 5, 7, 20, 20));
  assert.ok(s.log.some((l) => /Flameshaper dodges Bushi Attendant: 1d20 vs AG 6 \(halved, no line of sight\) – failed/.test(l.text)));

  // A model that sees the mover at some point of its Movement may react as it likes.
  s = setup('sog-bushi-attendant', 27);
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 30, y: 25, facing: 270, free: true }); // beside Blue's path, looking across it
  assert.deepEqual(s.activation!.seen, []);
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 23 });
  assert.deepEqual(s.activation!.seen, ['b1']);
  run(s, { type: 'REACT', id: 'b1', intent: 'attack', weapon: UNARMED_INDEX });

  // Stealth: within Awareness but unseen means no Reaction at all.
  s = setup('the-hired-blade', 20);
  assert.deepEqual([s.activation!.seen, s.activation!.near], [[], ['b1']]);
  assert.deepEqual(reactCheck(s, model(s, 'b1')), { ok: false, reason: 'Hired Blade has Stealth: no Reaction without line of sight' });
  // The players can overrule the table.
  run(s, { type: 'REACT', id: 'b1', intent: 'dodge', anyway: true });
  assert.match(s.log.at(-1)!.text, /Flameshaper declares a Dodge \(1 AP left\) – allowed by the players/);
});

test('Death Blow', () => {
  const s = table([]);
  run(s, add('sog-bushi-attendant', 18, 20, 0, true));
  run(s, add('hel-flameshaper', 18, 20 - 2 * baseRadius('medium'), 1, true));
  run(s, add('hel-citadel-guard', 30, 6, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'deathblow', target: 'b1' })), 'NO_ATTACK', 'the target is not Incapacitated');
  run(s, { type: 'WOUND', id: 'b1' });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'deathblow', target: 'b2' })), 'NO_ATTACK');
  run(s, { type: 'ACTION', action: 'deathblow', target: 'b1' });
  assert.deepEqual([model(s, 'b1').states.includes('Dead'), model(s, 'b1').states.includes('Incapacitated'), s.tally[0].deathblows], [true, false, 1]);
  assert.ok(s.log.some((l) => l.text === 'Bushi Attendant delivers a Death Blow: Flameshaper is Dead'));
  assert.equal(s.activation!.action, 'deathblow');
});

test('Schemes counted during the game', () => {
  // Blue: Champion a1 (23 pts), Bushi a2 (13). Red: Guard b1 (18), Flameshaper b2 (15).
  const reveal = (s: TableState, seat: Side, code: string, o: Opts = {}) => {
    s.schemes[seat] = { drawn: 2, kept: true, revealed: null };
    return run(s, { type: 'REVEAL_SCHEME', code, side: seat }, o);
  };
  const scored = (ev: GameEvent[]) => ev.filter((e) => e.type === 'SCHEME_SCORED').map((e) => (e.type === 'SCHEME_SCORED' ? [e.seat, e.code, e.delta] : []));

  // Relentless Advance: revealed at the start of the turn, counted in its End Phase.
  let s = started(0);
  assert.equal(code(() => reveal(s, 1, 'relentless-advance')), 'NOT_NOW', 'not in the opponent\'s turn');
  reveal(s, 0, 'relentless-advance');
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: 20, y: 10, free: true });
  let ev = run(s, { type: 'END_TURN' }, dice(20, 20));
  assert.deepEqual(scored(ev), [[0, 'relentless-advance', 1]]);
  assert.deepEqual([s.vp, s.schemes[0].scored], [[1, 0], true]);

  // After a model has been activated the Strategic Phase is over.
  s = started(0);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => reveal(s, 0, 'stand-your-ground')), 'NOT_NOW');
  // Fierce as Fire can be revealed at any time.
  reveal(s, 0, 'fierce-as-fire');

  // Stand Your Ground: counted at the start of the owner's next Strategic Phase.
  s = started(0);
  reveal(s, 0, 'stand-your-ground');
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 16, y: 27 });
  ev = run(s, { type: 'END_TURN' }, dice(20, 20));
  assert.deepEqual(scored(ev), [], 'not yet');
  ev = run(s, { type: 'END_TURN' }, dice(20, 20));
  assert.deepEqual(scored(ev), [[0, 'stand-your-ground', 1]], 'the Bushi stood still, the Champion moved');

  // Last Warning: no Attack declared until the next Strategic Phase.
  s = started(0);
  reveal(s, 0, 'last-warning');
  run(s, { type: 'END_TURN' }, dice(20, 20));
  ev = run(s, { type: 'END_TURN' }, dice(20, 20));
  assert.deepEqual(scored(ev), [[0, 'last-warning', 3]]);

  // Open Aggression and Unmatched Flanking count what happens after the reveal, in that turn.
  for (const [scheme, vp] of [['open-aggression', 1], ['unmatched-flanking', 1]] as const) {
    s = melee(0);
    run(s, { type: 'ROTATE_MODEL', id: 'b1', facing: 0 }); // the Guard has Vigilance and sees all around anyway
    run(s, { type: 'MOVE_MODEL', id: 'b2', x: 30, y: 20, facing: 270, free: true });
    run(s, { type: 'MOVE_MODEL', id: 'a2', x: 30 + 2 * baseRadius('medium'), y: 20, facing: 270, free: true }); // Bushi behind the Flameshaper
    reveal(s, 0, scheme);
    run(s, { type: 'ACTIVATE', id: 'a2' });
    // The Guard stands within half its SPD of the Flameshaper and has Protector: Red is asked first.
    ev = run(s, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b2' });
    assert.deepEqual([ev.map((e) => e.type), s.activation!.pending?.protectors], [['ATTACK_DECLARED'], ['b1']]);
    assert.equal(code(() => run(s, { type: 'END_ACTIVATION' })), 'PENDING');
    run(s, { type: 'PROTECT' }, dice(5, 5, 2, 2, 20, 20)); // nobody steps in
    assert.equal(s.activation!.pending, undefined);
    ev = run(s, { type: 'END_TURN' }, dice(20, 20, 20, 20));
    assert.deepEqual(scored(ev), [[0, scheme, vp]], scheme);
    // Appear Weak (melee Wounds), Martial Valor (a 13-point Bushi took out a 15-point Flameshaper), Cunning Tenacity.
    assert.deepEqual([s.tally[0].melee, s.tally[0].valor, s.hurt], [1, ['a2'], ['b2']]);
  }

  // Opportunistic Manipulation is counted on the spot.
  s = started(0);
  ev = reveal(s, 0, 'opportunistic-manipulation');
  assert.deepEqual(scored(ev), [[0, 'opportunistic-manipulation', 1]], 'enemies stand in their own Deployment Zone');

  // Wounds dealt in Reaction (Fierce as Fire).
  s = melee(0);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 0 });
  run(s, { type: 'END_ACTIVATION' }, dice(6, 20, 2, 5));
  assert.deepEqual([s.tally[1].reactive, s.tally[1].melee, s.hurt], [1, 1, ['a1']]);
});

test('Protector steps in for an ally', () => {
  // Blue Champion a1 attacks the Red Flameshaper b1; the Citadel Guard b2 (Protector, SPD 4) stands 1.5" from it.
  const s = table([]);
  const r = baseRadius('medium');
  run(s, add('sog-clan-champion', 18, 20, 0, true));
  run(s, add('hel-flameshaper', 18, 20 - 2 * r, 1, true));
  run(s, add('hel-citadel-guard', 18 + 2 * r + 1.5, 20 - 2 * r, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  let ev = run(s, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b1' }); // Sword
  assert.deepEqual(ev.map((e) => e.type), ['ATTACK_DECLARED']);
  assert.match(s.log.at(-1)!.text, /Clan Champion declares an Attack on Flameshaper \(Sword\) – Red may answer with Protector: Citadel Guard/);
  assert.equal(code(() => run(s, { type: 'PROTECT', id: 'b2' }, { side: 0, solo: false })), 'NOT_YOURS', 'the Active Player does not decide');
  assert.equal(code(() => run(s, { type: 'PROTECT', id: 'b1' })), 'CANNOT_ACT');
  // The Guard steps in: Sword vs its Shield (OFF 16 − 3), 3 Strikes; Damage 13 − ARM 6.
  ev = run(s, { type: 'PROTECT', id: 'b2' }, dice(5, 20, 20, 3));
  assert.deepEqual(ev.map((e) => e.type), ['PROTECTED', 'ACTION_RESOLVED']);
  const guard = model(s, 'b2');
  assert.ok(Math.abs(edgeDistance(guard, model(s, 'b1'))) < 0.05, 'in Base Contact with its ally');
  assert.deepEqual([guard.ap, guard.hp, model(s, 'b1').hp], [1, 1, 1], 'the Guard paid 1 AP and took the Wound');
  assert.ok(s.log.some((l) => /Clan Champion attacks Citadel Guard with Sword/.test(l.text)));
  assert.deepEqual([s.activation!.action, s.activation!.pending], ['attack', undefined]);

  // Out of AP, too far away or on the attacker's side: no question is asked.
  run(s, { type: 'END_ACTIVATION' });
  run(s, { type: 'SET_AP', id: 'b2', ap: 0 });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  ev = run(s, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b1' }, dice(20, 20, 20));
  assert.deepEqual(ev[0]!.type, 'ACTION_RESOLVED');
});

test('a Panicked model flees from a roof and round a wall', () => {
  // On a house 3" high, 9" from the bottom edge: it comes down on the edge side (the height counts double) and runs on.
  const s = table([{ id: 'h', kind: 'obstacle', env: 'building', name: 'House', shape: rect(18, 27, 4, 4), height: 3 }]);
  run(s, add('sog-bushi-attendant', 18, 31, 0, true));
  run(s, add('sog-bushi-attendant', 6, 30, 0, true));
  run(s, add('hel-flameshaper', 18, 4, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 27, free: true });
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Panicked', on: true });
  assert.equal(model(s, 'a1').z, 3, 'it starts on the roof');
  const ev = run(s, { type: 'ACTIVATE', id: 'a1' }, dice(20));
  assert.deepEqual(ev.map((e) => e.type), ['MODEL_ACTIVATED', 'MODEL_MOVED', 'MODEL_MOVED']);
  const a = model(s, 'a1');
  assert.deepEqual([a.z ?? 0, a.x], [0, 18]);
  assert.ok(a.y > 30 && a.y < 35.5, `on the ground between the house and the edge (${a.y})`);

  // A wall right across the straight way: it goes round instead of standing still.
  const s2 = table([wall('w', 18, 31, 6, 1, 3)]);
  run(s2, add('sog-bushi-attendant', 18, 28, 0, true));
  run(s2, add('sog-bushi-attendant', 6, 30, 0, true));
  run(s2, add('hel-flameshaper', 18, 4, 1, true));
  run(s2, { type: 'READY' }, dice(20, 1));
  run(s2, { type: 'SET_STATE', id: 'a1', state: 'Panicked', on: true });
  run(s2, { type: 'ACTIVATE', id: 'a1' }, dice(20));
  const b = model(s2, 'a1');
  assert.ok(b.y > 31.5 && Math.abs(b.x - 18) > 2, `past the wall, to one side (${b.x}, ${b.y})`);
});

test('a Panicked model that fails its Morale roll', () => {
  // Bushi (M 16, SPD 5) at 7" from the bottom edge: a whole Run (10") would take it off the field.
  const setup = (y: number) => {
    const s = table([]);
    run(s, add('sog-bushi-attendant', 18, y, 0, true));
    run(s, add('sog-bushi-attendant', 10, 30, 0, true));
    run(s, add('hel-flameshaper', 18, 4, 1, true));
    run(s, { type: 'READY' }, dice(20, 1));
    run(s, { type: 'SET_STATE', id: 'a1', state: 'Panicked', on: true });
    return s;
  };
  let s = setup(29);
  let ev = run(s, { type: 'ACTIVATE', id: 'a1' }, dice(20));
  assert.deepEqual(ev.map((e) => e.type), ['MODEL_ACTIVATED', 'MODEL_MOVED', 'MODEL_FLED', 'ACTIVATION_ENDED']);
  assert.deepEqual([model(s, 'a1').states.includes('Dead'), s.activation], [true, null]);
  assert.match(s.log.at(-1)!.text, /Bushi Attendant runs off the field – it is lost/);

  // From the middle of the table it Runs 10" towards the nearest edge and can only declare Nothing.
  s = setup(20);
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 18, free: true }); // 12" from the left edge is nearest
  ev = run(s, { type: 'ACTIVATE', id: 'a1' }, dice(20));
  assert.deepEqual(ev.map((e) => e.type), ['MODEL_ACTIVATED', 'MODEL_MOVED']);
  assert.deepEqual([model(s, 'a1').x, model(s, 'a1').y, s.activation!.panic, s.activation!.moved], [2, 18, 'flee', 10]);
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' })), 'PANICKED');
  run(s, { type: 'ACTION', action: 'nothing' });

  // A passed roll changes nothing.
  s = setup(20);
  ev = run(s, { type: 'ACTIVATE', id: 'a1' }, dice(3));
  assert.deepEqual([ev.map((e) => e.type), s.activation!.panic], [['MODEL_ACTIVATED'], undefined]);

  // Engaged: it stays where it is and may only Dodge.
  s = setup(20);
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 18, y: 20 - 2 * baseRadius('medium'), facing: 180, free: true });
  run(s, { type: 'ACTIVATE', id: 'a1' }, dice(20));
  assert.equal(s.activation!.panic, 'hold');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 23 })), 'PANICKED');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'nothing' })), 'PANICKED');
  run(s, { type: 'ACTION', action: 'dodge' });

  // In Reaction a failed roll turns whatever was declared into a Dodge.
  s = setup(20);
  run(s, { type: 'END_TURN' }, dice(20, 20));
  run(s, { type: 'ACTIVATE', id: 'b1' });
  run(s, { type: 'REACT', id: 'a1', intent: 'attack', weapon: 0 }, dice(20));
  assert.equal(s.activation!.reactions.a1!.intent, 'dodge');
});

test('Follow-Up and the Recovery Check reroll', () => {
  // The Red Guard (Follow-Up, SPD 4) has the Blue Bushi Engaged; the Bushi dodges away.
  const s = table([]);
  const r = baseRadius('medium');
  run(s, add('sog-bushi-attendant', 18, 20, 0, true));
  run(s, add('hel-citadel-guard', 18, 20 - 2 * r, 1, true));
  run(s, { type: 'ROTATE_MODEL', id: 'b1', facing: 180 });
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'dodge' });
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 23 }); // 3" away: out of the Guard's Reach
  assert.deepEqual(s.activation!.follow, { b1: { target: 'a1', moved: 0 } });
  assert.match(s.log.at(-1)!.text, /Citadel Guard may Follow-Up: up to 2\.0" towards Bushi Attendant/);
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'b1', x: 18, y: 17.5 })), 'FOLLOW', 'only towards the model that got away');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'b1', x: 18, y: 21.5 })), 'TOO_FAR');
  const ev = run(s, { type: 'MOVE_MODEL', id: 'b1', x: 18, y: 20.5 });
  assert.equal(ev[0]!.type === 'MODEL_MOVED' && ev[0]!.mode, 'follow');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'b1', x: 18, y: 21 })), 'TOO_FAR', 'half its SPD in all');

  // Recovery Check: with a standing ally in Base Contact a failed roll is rolled again.
  const t = table([]);
  run(t, add('sog-bushi-attendant', 18, 30, 0, true));
  run(t, add('sog-bushi-attendant', 18 + 2 * r, 30, 0, true));
  run(t, add('hel-flameshaper', 18, 4, 1, true));
  run(t, { type: 'READY' }, dice(1, 20)); // Red goes first
  assert.equal(t.active, 1);
  run(t, { type: 'WOUND', id: 'a1' });
  run(t, { type: 'WOUND', id: 'a1' });
  run(t, { type: 'END_TURN' }, dice(20, 5)); // T 13: 20 fails, the reroll of 5 succeeds
  assert.ok(t.log.some((l) => /Bushi Attendant: Recovery Check again \(ally in Base Contact\), T, 1d20 vs 13 – success/.test(l.text)));
  assert.deepEqual([model(t, 'a1').hp, model(t, 'a1').states.includes('Incapacitated')], [1, false]);
});

test('Treasure Hunt: tokens, Sigils, the Cache and carrying the Treasure off', () => {
  const s = table([], 'treasure-hunt');
  const r = baseRadius('medium');
  const touch = r + 0.49 + 0.05;
  assert.deepEqual(s.markers.map((k) => [k.id, k.kind, k.x, k.y]), [['cache-1', 'intrigue', 12, 18], ['cache-2', 'intrigue', 24, 18]]);
  run(s, add('sog-bushi-attendant', 12, 30)); // a1: INT 10, AG 10, ARM 4, HP 2
  run(s, add('sog-bushi-attendant', 16, 30)); // a2
  run(s, add('hel-flameshaper', 24, 6, 1)); // b1: AG 12, ARM 1, HP 1
  run(s, add('hel-citadel-guard', 28, 6, 1)); // b2
  run(s, { type: 'SET_LEADER', id: 'a1' });
  run(s, { type: 'SET_LEADER', id: 'b1' });
  for (const side of [0, 1] as const) {
    run(s, { type: 'DRAW_SCHEMES', side });
    run(s, { type: 'KEEP_SCHEME', code: 'no-quarter', side });
  }
  run(s, { type: 'READY' }, dice(20, 1));
  const token = (id: string) => s.markers.find((k) => k.id === id)!;

  // Round 1: Perceive reveals the Sigil from a distance; touching it does not set it off yet.
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 21, free: true });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'interact', marker: 'cache-1' })), 'NO_ATTACK', 'not in Base Contact');
  let ev = run(s, { type: 'ACTION', action: 'perceive', marker: 'cache-1' }, dice(5, 10));
  assert.deepEqual(ev.map((e) => e.type), ['ACTION_RESOLVED', 'MARKER_REVEALED']);
  assert.deepEqual([token('cache-1').kind, token('cache-1').spell], ['sigil', 'Claws of Earth']);
  assert.equal(s.log.at(-1)!.text, 'Bushi Attendant reveals Intrigue token A: a Sigil of Claws of Earth (d20: 10)');
  assert.equal(token('cache-1').name, 'Sigil A: Claws of Earth');
  run(s, { type: 'ACTIVATE', id: 'a1' });
  ev = run(s, { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 18 + touch });
  assert.deepEqual(ev.map((e) => e.type), ['MODEL_MOVED'], 'Sigils do not go off in round 1');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'interact', marker: 'cache-1' })), 'NO_ATTACK', 'no Cache in round 1');
  run(s, { type: 'END_TURN' }, dice(20, 20));
  run(s, { type: 'END_TURN' }, dice(20, 20));
  assert.deepEqual([s.round, s.active], [2, 0]);

  // Round 2: Interact sets the Sigil off first (3 Hits, PW 14 − ARM 4), then the AG roll for the Cache.
  run(s, { type: 'ACTIVATE', id: 'a1' });
  ev = run(s, { type: 'ACTION', action: 'interact', marker: 'cache-1' }, dice(20, 20, 20, 20, 5));
  assert.deepEqual(ev.map((e) => e.type), ['EFFECT', 'MARKER_SET', 'ACTION_RESOLVED', 'TREASURE_TAKEN', 'QUEST_SCORED']);
  assert.ok(s.log.some((l) => l.text === 'The Sigil goes off: Claws of Earth (PW 14, 3 Hits)'));
  assert.ok(s.log.some((l) => /Damage on Bushi Attendant \(Claws of Earth\): 3d20 vs PW 14 − ARM 4 = 10 – 0 Wounds/.test(l.text)));
  assert.deepEqual([model(s, 'a1').treasure, token('cache-1').kind, s.vp], [1, 'opened', [1, 0]]);
  assert.equal(code(() => run(s, { type: 'LEAVE_FIELD', id: 'a1' })), 'NOT_ACTIVATED');
  run(s, { type: 'END_TURN' }, dice(20, 20));

  // Red walks into the other token: revealed (d20 1: Inferno) and set off at once. Dodge fails, 1 Wound, Burn (3).
  run(s, { type: 'MOVE_MODEL', id: 'b1', x: 24, y: 14, free: true });
  run(s, { type: 'ACTIVATE', id: 'b1' });
  ev = run(s, { type: 'MOVE_MODEL', id: 'b1', x: 24, y: 18 - touch }, dice(1, 20, 5, 20, 20, 20));
  assert.deepEqual(ev.map((e) => e.type), ['MODEL_MOVED', 'MARKER_REVEALED', 'EFFECT', 'MARKER_SET']);
  assert.deepEqual([model(s, 'b1').states.includes('Incapacitated'), token('cache-2').kind], [true, 'cache']);
  assert.ok(s.log.some((l) => /Burn \(3\) on Flameshaper: 3d20 vs PW 14 – 0 Wounds/.test(l.text)));

  // A carrier that goes down drops the Treasure; an ally picks it up.
  run(s, { type: 'WOUND', id: 'a1' });
  run(s, { type: 'WOUND', id: 'a1' });
  const loot = s.markers.find((k) => k.kind === 'treasure')!;
  assert.deepEqual([model(s, 'a1').treasure, loot.name], [undefined, 'Treasure']);
  run(s, { type: 'END_TURN' }, dice(20, 20, 20, 20));
  assert.deepEqual([s.round, s.active], [3, 0]);
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: loot.x + touch, y: loot.y, free: true });
  run(s, { type: 'ACTIVATE', id: 'a2' });
  run(s, { type: 'ACTION', action: 'interact', marker: loot.id });
  assert.deepEqual([model(s, 'a2').treasure, s.markers.some((k) => k.kind === 'treasure')], [1, false]);

  // From round 4 the carrier may leave over its own table edge: 3 VP.
  run(s, { type: 'ACTIVATE', id: 'a2' });
  assert.equal(code(() => run(s, { type: 'LEAVE_FIELD', id: 'a2' })), 'NOT_NOW');
  run(s, { type: 'END_TURN' }, dice(20, 20, 20, 20));
  run(s, { type: 'END_TURN' }, dice(20, 20, 20, 20));
  assert.deepEqual([s.round, s.active], [4, 0]);
  run(s, { type: 'ACTIVATE', id: 'a2' });
  assert.equal(code(() => run(s, { type: 'LEAVE_FIELD', id: 'a2' })), 'TOO_FAR');
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: 12, y: 30, free: true });
  ev = run(s, { type: 'LEAVE_FIELD', id: 'a2' });
  assert.deepEqual(ev.map((e) => e.type), ['MODEL_LEFT', 'QUEST_SCORED']);
  assert.deepEqual([s.models.some((m) => m.id === 'a2'), s.escaped, s.vp, s.activation], [false, [1, 0], [4, 0], null]);
  // Blue has one model down and one gone with a Treasure: that one still counts, so no Broken Morale.
  assert.deepEqual(s.broken, [false, false]);

  // A Treasure still held when the game ends is worth 2 VP; the second Treasure leaving ends the Quest.
  run(s, { type: 'END_TURN' }, dice(20, 20, 20, 20));
  model(s, 'b2').treasure = 1;
  run(s, { type: 'MOVE_MODEL', id: 'b2', x: 28, y: 3, free: true });
  run(s, { type: 'ACTIVATE', id: 'b2' });
  ev = run(s, { type: 'LEAVE_FIELD', id: 'b2' });
  assert.deepEqual(ev.map((e) => e.type), ['MODEL_LEFT', 'QUEST_SCORED', 'GAME_FINISHED']);
  assert.deepEqual([s.phase, s.vp, s.winner], ['finished', [4, 3], 0]);

  const t = table([], 'treasure-hunt');
  run(t, add('sog-bushi-attendant', 12, 30));
  run(t, add('hel-flameshaper', 24, 6, 1));
  run(t, { type: 'SET_LEADER', id: 'a1' });
  run(t, { type: 'SET_LEADER', id: 'b1' });
  for (const side of [0, 1] as const) {
    run(t, { type: 'DRAW_SCHEMES', side });
    run(t, { type: 'KEEP_SCHEME', code: 'no-quarter', side });
  }
  run(t, { type: 'READY' }, dice(20, 1));
  model(t, 'a1').treasure = 1;
  for (let i = 0; i < 9; i++) run(t, { type: 'END_TURN' }, dice(20, 20));
  ev = run(t, { type: 'END_TURN' }, dice(20, 20));
  assert.deepEqual(ev.filter((e) => e.type === 'QUEST_SCORED' || e.type === 'GAME_FINISHED').map((e) => e.type), ['QUEST_SCORED', 'GAME_FINISHED']);
  assert.deepEqual([t.vp, t.winner], [[2, 0], 0]);
});

test('Spells: what a model knows, casting attack Spells, Mana', () => {
  const names = (id: string) => spellsOf(profileById(id)!).map((x) => x.name);
  assert.deepEqual(names('hel-flameshaper'), ['Ignite', 'Flare']); // Art of Sorcery II, Affinity (Fire)
  assert.deepEqual(names('san-vizier'), ['Summon Gargoyle', 'Summon Golem', 'Summon Earth Elemental', 'Summon Colossus', 'Summon Imp', 'Mana Burst', 'Dispel Magic']);
  assert.deepEqual(names('gob-chanra'), ['Primal Claw', 'Fire Breath', 'Fortified Recovery', 'Misfortune', 'Searing Blood'], 'Affinity (Any)');
  assert.equal(names('sog-bushi-attendant').length, 0);
  assert.deepEqual(spellWeapons(profileById('hel-flameshaper')!).map((x) => [x.index, x.weapon.name, x.weapon.type]), [[100, 'Ignite', 'Spell, Sorcery, Ranged'], [101, 'Flare', 'Spell, Sorcery, Ranged/Melee']]);

  const lines = (out: { lines: { text: string }[] }) => out.lines.map((l) => l.text);
  const apart = (blue: string, red: string, gapInches: number) => {
    const s = faceOff(blue, red);
    const a = model(s, 'a1');
    const b = model(s, 'b1');
    run(s, { type: 'MOVE_MODEL', id: 'b1', x: b.x, y: a.y - baseRadius(a.size) - baseRadius(b.size) - gapInches, free: true });
    return s;
  };
  // Ignite from 8": INT 12, Strike STA 2, PW INT 12 against ARM 4, Burn (1). A Sorcerer rerolls one miss.
  let s = apart('hel-flameshaper', 'sog-bushi-attendant', 8);
  let out = fight(s, 'a1', 100, 'b1', [20, 5, 4, 3, 20, 20]);
  assert.match(lines(out)[0]!, /^Flameshaper attacks Bushi Attendant with Ignite: 2d20 vs INT 12 \(Spell; Burn 1\)/);
  assert.ok(lines(out).includes('Flameshaper: Sorcerer – rerolls 1 missed Attack roll, 1 now hits'));
  assert.ok(lines(out).some((t) => /Damage on Bushi Attendant \(Ignite\): 2d20 vs PW 12 − ARM 4 = 8 – 1 Wound/.test(t)));
  assert.ok(lines(out).some((t) => /Burn/.test(t)));
  // Out of its 16" Reach; and an ordinary weapon index still works.
  s = apart('hel-flameshaper', 'sog-bushi-attendant', 17);
  assert.match(planAttack(s, model(s, 'a1'), model(s, 'b1'), 100, NO_MODS, { reactive: false }).reason, /out of range/);
  // Flare (Ranged/Melee, Reach 3): at 2" it is cast at range, in Base Contact as a Melee Attack.
  s = apart('hel-flameshaper', 'sog-bushi-attendant', 2);
  let plan = planAttack(s, model(s, 'a1'), model(s, 'b1'), 101, NO_MODS, { reactive: false });
  assert.deepEqual([plan.ok, plan.ranged, plan.attrName, plan.attr, plan.pw, plan.stk], [true, true, 'INT', 12, 12, 1]);
  s = faceOff('hel-flameshaper', 'sog-bushi-attendant');
  plan = planAttack(s, model(s, 'a1'), model(s, 'b1'), 101, NO_MODS, { reactive: false });
  assert.deepEqual([plan.ok, plan.ranged, plan.notes.includes('Spell, cast in melee')], [true, false, true]);
  // In its Reactive Role too: Strike 1.
  assert.equal(planAttack(s, model(s, 'a1'), model(s, 'b1'), 100, NO_MODS, { reactive: true }).ok, false, 'Ignite is Ranged only: not while Engaged');
  assert.equal(planAttack(s, model(s, 'a1'), model(s, 'b1'), 101, NO_MODS, { reactive: true }).stk, 1);

  // A Mystic casts with Morale: Kitsune Spellmaiden, M 15.
  s = apart('sog-kitsune-spellmaiden', 'sog-bushi-attendant', 2);
  plan = planAttack(s, model(s, 'a1'), model(s, 'b1'), 101, NO_MODS, { reactive: false });
  assert.deepEqual([plan.weapon?.name, plan.attrName, plan.attr, plan.pw], ['Flare', 'M', 15, 15]);

  // Ethereal Blades: Strike 5; four successful rolls give PW +6, Armor-Piercing and Stagger. A Wizard rerolls one miss of an Elder Spell.
  s = faceOff('san-spelldancer-voidcaster', 'sog-bushi-attendant');
  out = fight(s, 'a1', 100, 'b1', [5, 5, 5, 20, 20, 5, 20, 20, 20, 20]);
  assert.match(lines(out)[0]!, /with Ethereal Blades: 5d20 vs INT 12/);
  assert.ok(lines(out).includes('Spelldancer Voidcaster: Wizard – rerolls 1 missed Attack roll, 1 now hits'));
  assert.ok(lines(out).includes('Ethereal Blades, 4 successful rolls: PW +6, Armor-Piercing, Stagger'));
  assert.ok(lines(out).some((t) => /vs PW 15 − ARM 2 = 13/.test(t)), 'INT 12 − 3 + 6, half of ARM 4');

  // Ice Spikes: Slowed until the caster's next Strategic Phase.
  s = apart('hel-anari', 'sog-bushi-attendant', 6);
  const spikes = spellWeapons(profileById('hel-anari')!).find((x) => x.weapon.name === 'Ice Spikes')!.index;
  out = fight(s, 'a1', spikes, 'b1', [5, 20, 20, 20]);
  assert.deepEqual([out.results[0]!.states, out.results[0]!.temp], [['Slowed'], { Slowed: 'blue' }]);

  // The state outlasts Red's own Strategic Phase and ends in Blue's. Mana: a Mage turns AP into Mana in its turn.
  const g = table([]);
  run(g, add('hel-anari', 18, 30, 0, true));
  run(g, add('sog-bushi-attendant', 18, 6, 1, true));
  run(g, { type: 'READY' }, dice(20, 1));
  run(g, { type: 'SET_STATE', id: 'b1', state: 'Slowed', on: true });
  model(g, 'b1').temp = { Slowed: 'blue' };
  let ev = run(g, { type: 'CONVERT_MANA', id: 'a1', count: 1 });
  assert.deepEqual([ev[0]!.type, model(g, 'a1').ap, model(g, 'a1').mana], ['MODEL_MANA', 1, 1]);
  assert.equal(code(() => run(g, { type: 'CONVERT_MANA', id: 'a1', count: 2 })), 'NO_AP');
  assert.equal(code(() => run(g, { type: 'CONVERT_MANA', id: 'b1' })), 'NOT_YOUR_TURN');
  run(g, { type: 'END_TURN' }, dice(20, 20));
  assert.equal(code(() => run(g, { type: 'CONVERT_MANA', id: 'b1' })), 'CANNOT_ACT', 'not a Mage');
  assert.deepEqual([model(g, 'b1').states.includes('Slowed'), model(g, 'a1').mana], [true, 1], 'Mana stays from turn to turn');
  run(g, { type: 'END_TURN' }, dice(20, 20));
  assert.deepEqual([model(g, 'b1').states.includes('Slowed'), model(g, 'b1').temp], [false, undefined]);
  run(g, { type: 'WOUND', id: 'a1' });
  run(g, { type: 'WOUND', id: 'a1' });
  assert.equal(model(g, 'a1').mana, undefined, 'an Incapacitated model loses its Mana');
});

test('templates: a circular Spell aimed at a spot, a spray, Casting Aura', () => {
  const index = (profile: string, spell: string) => spellWeapons(profileById(profile)!).find((x) => x.weapon.name === spell)!.index;
  // Flameweaver Noble a1 throws a Fireball (Circular L, r 2.36") at the Bushi b1. Under it: its own ally a2,
  // b1 and the Champion b2 next to it. The Onitaoshi b3 stands 7" away.
  const s = table([]);
  run(s, add('hel-flameweaver-noble', 18, 30, 0, true));
  run(s, add('hel-flameshaper', 17, 21.3, 0, true));
  run(s, add('sog-bushi-attendant', 18, 20, 1, true));
  run(s, add('sog-clan-champion', 19.5, 20, 1, true));
  run(s, add('sog-onitaoshi', 25, 20, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  const fireball = index('hel-flameweaver-noble', 'Fireball');
  const noble = model(s, 'a1');
  const ball = areaOf(weaponAt(noble, fireball)!)!;
  assert.deepEqual([ball.shape, ball.label, isTargetless(weaponAt(noble, fireball)!)], ['circle', 'Circular L', true]);
  assert.deepEqual(areaVictims(s, noble, ball, { x: 18, y: 20 }).map((m) => m.id), ['a2', 'b1', 'b2']);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'REACT', id: 'b2', intent: 'dodge' });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'attack', weapon: index('hel-flameweaver-noble', 'Ignite'), at: { x: 18, y: 20 } })), 'NO_ATTACK', 'Ignite has no template');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'attack', weapon: fireball, at: { x: 18, y: 5 } })), 'NO_ATTACK', 'out of its 16" Reach');
  // Attack roll 5 hits. a2: Damage fails. b1: 3 wounds it, Burn (1) fails. b2: its Dodge (AG 10) fails, Damage fails.
  // (The Flameshaper has Chain Attack and joins in with a Flare of its own: 20, a miss.)
  const ev = run(s, { type: 'ACTION', action: 'attack', weapon: fireball, at: { x: 18, y: 20 } }, dice(5, 10, 20, 20, 3, 20, 20, 20)); // the 10: the Flameshaper's Morale roll for Friendly Fire
  assert.deepEqual(ev.map((e) => e.type), ['ACTION_RESOLVED']);
  const texts = s.log.map((l) => l.text);
  assert.ok(texts.some((t) => /^Flameweaver Noble attacks a spot on the table with Fireball: 1d20 vs INT 14/.test(t)));
  assert.ok(texts.includes('Circular L template: Flameshaper, Bushi Attendant, Clan Champion under it'));
  assert.ok(texts.some((t) => /Clan Champion dodges Flameweaver Noble/.test(t)));
  assert.ok(texts.some((t) => /Damage on Flameshaper \(Fireball\)/.test(t)), 'friends under the template are hit too');
  assert.deepEqual([model(s, 'b1').hp, model(s, 'b2').hp, model(s, 'b3').hp, model(s, 'a2').hp], [1, 3, 3, 1]);
  assert.equal(s.models.some((m) => m.id === '-point-'), false);

  // A miss: the template is not placed.
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'attack', weapon: fireball, target: 'b1' }, dice(20, 20));
  assert.ok(s.log.some((l) => l.text === 'Circular L: the template is not placed'));

  // Fire Breath (Spray S, 8.4" long): everything in the cone in front of the Goblin Shaman.
  const g = table([]);
  run(g, add('gob-shaman', 18, 30, 0, true));
  run(g, add('sog-bushi-attendant', 18, 27, 1, true));
  run(g, add('sog-clan-champion', 19.3, 24.5, 1, true)); // beside the line, so the Bushi does not hide it
  run(g, add('sog-onitaoshi', 24, 27, 1, true));
  run(g, add('sog-bushi-attendant', 18, 19, 1, true));
  run(g, { type: 'READY' }, dice(20, 1));
  const breath = index('gob-shaman', 'Fire Breath');
  const spray = areaOf(weaponAt(model(g, 'a1'), breath)!)!;
  assert.equal(spray.shape, 'spray');
  assert.deepEqual(areaVictims(g, model(g, 'a1'), spray, model(g, 'b1')).map((m) => m.id), ['b1', 'b2']);
  run(g, { type: 'ACTIVATE', id: 'a1' });
  run(g, { type: 'ACTION', action: 'attack', weapon: breath, target: 'b1' }, dice(5, 20, 20, 20, 20, 20, 20));
  assert.ok(g.log.some((l) => /^Goblin Shaman attacks Bushi Attendant with Fire Breath: 2d20 vs M 14/.test(l.text)));
  assert.ok(g.log.some((l) => l.text === 'Spray S template: Bushi Attendant, Clan Champion under it'));

  // Casting Aura: Smite reaches as far as the Hierophant's Awareness (AG 11) and needs no line of sight.
  const h = table([]);
  run(h, add('hel-hierophant', 18, 30, 0, true));
  run(h, add('sog-bushi-attendant', 18, 22, 1, true));
  const smite = index('hel-hierophant', 'Smite');
  const hier = model(h, 'a1');
  assert.equal(planAttack(h, hier, pointTarget(hier, { x: 18, y: 22 }), smite, NO_MODS, { reactive: false }).ok, true);
  assert.match(planAttack(h, hier, pointTarget(hier, { x: 18, y: 16 }), smite, NO_MODS, { reactive: false }).reason, /out of range/);
  run(h, { type: 'ROTATE_MODEL', id: 'a1', facing: 180 }, { solo: true });
  const blind = planAttack(h, model(h, 'a1'), pointTarget(hier, { x: 18, y: 22 }), smite, NO_MODS, { reactive: false });
  assert.deepEqual([blind.ok, blind.attr, blind.notes.includes('no line of sight: halved')], [true, 8, true]);
});

test('casting: Enchantments last until the caster\'s next Strategic Phase and change attacks and attributes', () => {
  // Anari (Enchanter, Mage, INT 16) a1, a Flameshaper a2 in Base Contact with the Bushi b1; the Champion b2 far off.
  const s = table([]);
  run(s, add('hel-anari', 26, 26, 0, true));
  run(s, add('hel-flameshaper', 18, 23.3, 0, true));
  run(s, add('sog-bushi-attendant', 18, 22, 1, true));
  run(s, add('sog-clan-champion', 30, 4, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  const names = (id: string) => (model(s, id).enchants ?? []).map((e) => e.name);
  run(s, { type: 'SET_AP', id: 'a1', ap: 8 });
  const before = planAttack(s, model(s, 'a2'), model(s, 'b1'), UNARMED_INDEX, NO_MODS, { reactive: false });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'cast', spell: 'Fireball', targets: ['b1'] })), 'BAD_VALUE', 'an Attack Spell is not cast on a model this way');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'cast', spell: 'Cutting Chill', targets: ['a2', 'a1'] })), 'BAD_VALUE', 'Strike 1: one target');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'cast', spell: 'Cutting Chill', targets: ['b2'] })), 'NO_ATTACK', 'out of its 16" Reach');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'cast', spell: 'Deep Freeze', targets: ['b1'] })), 'NO_MANA');
  // An Enchanter enchants an ally without a roll.
  let ev = run(s, { type: 'ACTION', action: 'cast', spell: 'Cutting Chill', targets: ['a2'] }, dice(20));
  assert.deepEqual(ev.map((e) => e.type).slice(0, 3), ['EFFECT', 'ENCHANTED', 'ACTION_RESOLVED']);
  assert.ok(s.log.some((l) => l.text === 'Anari, Erudite Prodigy casts Cutting Chill on Flameshaper – no roll (Enchanter)'));
  assert.deepEqual(model(s, 'a2').enchants, [{ name: 'Cutting Chill', until: 'blue', caster: 'a1' }]);
  const chilled = planAttack(s, model(s, 'a2'), model(s, 'b1'), UNARMED_INDEX, NO_MODS, { reactive: false });
  assert.deepEqual([chilled.pw - before.pw, chilled.traits.includes('Immobilize'), before.traits.includes('Immobilize')], [2, true, false]);

  // Deep Freeze costs 1 Mana and is rolled against an enemy: −3 ARM, and it can only declare Nothing.
  run(s, { type: 'CONVERT_MANA', id: 'a1' });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  const arm = modelStats(model(s, 'b1')).arm;
  run(s, { type: 'ACTION', action: 'cast', spell: 'Deep Freeze', targets: ['b1'] }, dice(17));
  assert.deepEqual([names('b1'), model(s, 'a1').mana], [[], 0], 'a failed roll still costs the Mana');
  run(s, { type: 'CONVERT_MANA', id: 'a1' });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'cast', spell: 'Deep Freeze', targets: ['b1'] }, dice(16));
  assert.deepEqual([names('b1'), modelStats(model(s, 'b1')).arm], [['Deep Freeze'], Math.max(0, arm - 3)]);
  // The same Enchantment twice: still one.
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'cast', spell: 'Cutting Chill', targets: ['a2'] });
  assert.deepEqual(names('a2'), ['Cutting Chill']);

  // Red's turn: the Enchantments are still there; the frozen Bushi can only declare Nothing.
  run(s, { type: 'END_TURN' });
  assert.deepEqual([names('a2'), names('b1')], [['Cutting Chill'], ['Deep Freeze']]);
  run(s, { type: 'ACTIVATE', id: 'b1' }, { side: 1 });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'a2' }, { side: 1 })), 'CANNOT_ACT');
  run(s, { type: 'ACTION', action: 'nothing' }, { side: 1 });
  // Blue's Strategic Phase ends them.
  ev = run(s, { type: 'END_TURN' }, { side: 1 });
  assert.equal(ev.filter((e) => e.type === 'DISENCHANTED').length, 2);
  assert.deepEqual([model(s, 'a2').enchants, model(s, 'b1').enchants, modelStats(model(s, 'b1')).arm], [undefined, undefined, arm]);
  assert.ok(s.log.some((l) => l.text === 'Flameshaper: Cutting Chill ends'));

  // Attribute Enchantments and the Arcane Shield cap; an Artificer enchants itself in its Strategic Phase.
  const p = profileById('sog-bushi-attendant')!;
  const plain = effectiveStats(p, []);
  assert.equal(effectiveStats(p, [], [{ name: 'Stoneskin' }]).arm, plain.arm + 3);
  assert.equal(effectiveStats(p, [], [{ name: 'Featherlight' }]).spd, plain.spd + 2);
  assert.equal(effectiveStats(p, ['Slowed'], [{ name: 'Featherlight' }]).spd, Math.ceil((plain.spd + 2) / 2));
  assert.equal(effectiveStats({ ...p, arm: 4 }, [], [{ name: 'Arcane Shield' }]).arm, 6);
  assert.equal(effectiveStats({ ...p, arm: 7 }, [], [{ name: 'Arcane Shield' }]).arm, 7);
  const t = table([]);
  run(t, add('san-faris-outrider', 18, 30, 0, true));
  run(t, add('sog-bushi-attendant', 18, 6, 1, true));
  run(t, { type: 'READY' }, dice(20, 1));
  assert.equal(code(() => run(t, { type: 'ENCHANT', id: 'a1', name: 'Stoneskin' })), 'BAD_VALUE');
  run(t, { type: 'ENCHANT', id: 'a1', name: 'Arcane Shield' });
  assert.equal(code(() => run(t, { type: 'ENCHANT', id: 'a1', name: 'Spectral Blade' })), 'USED');
  assert.deepEqual(model(t, 'a1').enchants, [{ name: 'Arcane Shield', until: 'blue', caster: 'a1' }]);
  run(t, { type: 'DISENCHANT', id: 'a1', name: 'Arcane Shield' });
  assert.equal(model(t, 'a1').enchants, undefined);
});

test('casting: Healing Spells, a Vitalist, Purgation and several targets', () => {
  // Hierophant (Vitalist, INT 15, STA 2) a1 with two Citadel Guards in Base Contact, a third 8" ahead.
  const s = table([]);
  run(s, add('hel-hierophant', 18, 30, 0, true));
  run(s, add('hel-citadel-guard', 16.72, 30, 0, true));
  run(s, add('hel-citadel-guard', 19.28, 30, 0, true));
  run(s, add('hel-citadel-guard', 18, 22, 0, true));
  run(s, add('sog-bushi-attendant', 18, 16, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  const max = model(s, 'a2').maxHp;
  for (const id of ['a2', 'a3', 'a4']) run(s, { type: 'WOUND', id });
  run(s, { type: 'SET_AP', id: 'a1', ap: 8 });
  run(s, { type: 'SET_STATE', id: 'a2', state: 'Bleeding', on: true });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'cast', spell: 'Curative Touch', targets: ['a4'] })), 'NO_ATTACK', 'Reach 0: Base Contact');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'cast', spell: 'Curative Touch', targets: ['a1', 'a2', 'a3'] })), 'BAD_VALUE', 'Strike STA: two targets');
  // A Vitalist heals allies that are not Incapacitated without a roll.
  run(s, { type: 'ACTION', action: 'cast', spell: 'Curative Touch', targets: ['a2', 'a3'] }, dice(20, 20));
  assert.deepEqual([model(s, 'a2').hp, model(s, 'a3').hp, model(s, 'a2').states.includes('Bleeding')], [max, max, false]);
  assert.ok(s.log.some((l) => l.text === 'Expeditionary Hierophant casts Curative Touch on Citadel Guard – no roll (Vitalist)'));

  // An Incapacitated ally needs the roll: a failure, then a success puts it back on its feet.
  for (let i = 1; i < max; i++) run(s, { type: 'WOUND', id: 'a4' });
  assert.ok(model(s, 'a4').states.includes('Incapacitated'));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'cast', spell: 'Curative Miracle', targets: ['a4'] }, dice(16));
  assert.equal(model(s, 'a4').hp, 0);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'cast', spell: 'Curative Miracle', targets: ['a4'] }, dice(15));
  assert.deepEqual([model(s, 'a4').hp, model(s, 'a4').states.includes('Incapacitated')], [max, false]);

  // Purgation strips Enchantments (here from an enemy, rolled) and cures Poisoned.
  apply(s, { type: 'ENCHANTED', id: 'b1', name: 'Stoneskin', until: 'red', caster: 'b1', seq: s.seq + 1, ts: 0, side: 1, by: 't' } as GameEvent);
  run(s, { type: 'SET_STATE', id: 'b1', state: 'Poisoned', on: true });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'cast', spell: 'Purgation', targets: ['b1'] }, dice(4));
  assert.deepEqual([model(s, 'b1').enchants, model(s, 'b1').states.includes('Poisoned')], [undefined, false]);
  // Anointment: enemy Enchantments cannot target the model.
  apply(s, { type: 'ENCHANTED', id: 'b1', name: 'Anointment', until: 'red', caster: 'b1', seq: s.seq + 1, ts: 0, side: 1, by: 't' } as GameEvent);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'cast', spell: 'Protective Barrier', targets: ['b1'] })), 'NO_ATTACK');

  // Burning Resolve: a model without Activation Points regains one.
  const k = table([]);
  run(k, add('sog-kitsune-spellmaiden', 18, 30, 0, true));
  run(k, add('sog-bushi-attendant', 18, 26, 0, true));
  run(k, add('hel-citadel-guard', 18, 4, 1, true));
  run(k, { type: 'READY' }, dice(20, 1));
  run(k, { type: 'SET_AP', id: 'a2', ap: 0 });
  run(k, { type: 'ACTIVATE', id: 'a1' });
  // A Mystic casts with Morale (15).
  run(k, { type: 'ACTION', action: 'cast', spell: 'Burning Resolve', targets: ['a2'] }, dice(15));
  assert.equal(model(k, 'a2').ap, 1);
  assert.ok(k.log.some((l) => /casts Burning Resolve on Bushi Attendant: 1d20 vs M 15 – success/.test(l.text)));
});

test('Stratagems: declared in the Strategic Phase by the Leader, last until its next one, Affiliation', () => {
  // Clan Champion (Leader) a1, Bushi Attendant a2 (Warrior), a hired Neutral a3; Red: Citadel Guard, Flameshaper.
  const s = table([]);
  run(s, add('sog-clan-champion', 10, 30, 0, true));
  run(s, add('sog-bushi-attendant', 14, 30, 0, true));
  run(s, add('neu-guildsworn-knight', 18, 30, 0, true));
  run(s, add('hel-citadel-guard', 10, 6, 1, true));
  run(s, add('hel-flameshaper', 14, 6, 1, true));
  run(s, { type: 'SET_LEADER', id: 'a1' });
  run(s, { type: 'SET_LEADER', id: 'b1' });
  run(s, { type: 'READY' }, dice(20, 1));
  const spd = (id: string) => modelStats(model(s, id)).spd;
  const before = ['a1', 'a2', 'a3', 'b1'].map(spd);
  assert.equal(code(() => run(s, { type: 'STRATAGEM', name: 'Sacred Vow' })), 'BAD_VALUE', 'not on its card');
  run(s, { type: 'STRATAGEM', name: 'Advance!' });
  // The hired Neutral has another Affiliation: no benefit.
  assert.deepEqual(['a1', 'a2', 'a3', 'b1'].map(spd), [before[0]! + 1, before[1]! + 1, before[2], before[3]]);
  assert.equal(code(() => run(s, { type: 'STRATAGEM', name: 'Evasion Tactics' })), 'NOT_NOW', 'one Stratagem per Strategic Phase');
  assert.ok(s.log.some((l) => l.text === "Blue declares the Stratagem Advance! – Clan Champion, Bushi Attendant"));
  // Red's turn: still in effect; Red cannot declare for Blue, and its own Leader has none to fear.
  run(s, { type: 'END_TURN' });
  assert.equal(spd('a2'), before[1]! + 1);
  assert.equal(code(() => run(s, { type: 'STRATAGEM', name: 'Advance!', side: 0 })), 'NOT_NOW');
  run(s, { type: 'END_TURN' }, { side: 1 });
  // Blue's next Strategic Phase: it ends, and a new one may be declared – but not once a model has activated.
  assert.equal(spd('a2'), before[1]);
  assert.ok(s.log.some((l) => l.text === "Blue's Stratagem Advance! ends"));
  run(s, { type: 'ACTIVATE', id: 'a2' });
  assert.equal(code(() => run(s, { type: 'STRATAGEM', name: 'Back to Back' })), 'NOT_NOW');
  run(s, { type: 'ACTION', action: 'nothing' });
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' }, { side: 1 });
  // Back to Back: Vigilance on the card; Brazen Assault: Warriors gain Dash and Fearless.
  run(s, { type: 'STRATAGEM', name: 'Brazen Assault' });
  assert.deepEqual([hasSkill(model(s, 'a2'), 'Dash'), hasTrait(model(s, 'a2'), 'Fearless'), hasTrait(model(s, 'a3'), 'Fearless')], [true, true, true], 'the Knight has Fearless on its own card');
  assert.equal(model(s, 'a3').boons, undefined);
  // An Incapacitated Leader declares no more Stratagems.
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' }, { side: 1 });
  for (let i = 0; i < model(s, 'a1').maxHp; i++) run(s, { type: 'WOUND', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'STRATAGEM', name: 'Advance!' })), 'NOT_NOW');
});

test('Stratagems: healing, State removal, enchanting, two at once (Strategist), self', () => {
  // Great Guard (Leader) with two wounded Bushi; Overcome Pain, Rally Troops (its own version), Close Ranks.
  const s = table([]);
  run(s, add('sog-great-guard', 10, 30, 0, true));
  run(s, add('sog-bushi-attendant', 11.28, 30, 0, true));
  run(s, add('sog-bushi-attendant', 20, 30, 0, true));
  run(s, add('hel-citadel-guard', 10, 6, 1, true));
  run(s, { type: 'SET_LEADER', id: 'a1' });
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'WOUND', id: 'a2' });
  assert.equal(code(() => run(s, { type: 'STRATAGEM', name: 'Overcome Pain', targets: ['a2', 'a3'] })), 'BAD_VALUE');
  run(s, { type: 'STRATAGEM', name: 'Overcome Pain', targets: ['a2'] });
  assert.equal(model(s, 'a2').hp, model(s, 'a2').maxHp);
  const next = () => {
    run(s, { type: 'END_TURN' });
    run(s, { type: 'END_TURN' }, { side: 1 });
  };
  next();
  run(s, { type: 'SET_STATE', id: 'a3', state: 'Bleeding', on: true });
  run(s, { type: 'STRATAGEM', name: 'Rally Troops' });
  assert.deepEqual([model(s, 'a3').states.includes('Bleeding'), hasTrait(model(s, 'a3'), 'Fearless')], [false, true]);
  next();
  run(s, { type: 'STRATAGEM', name: 'Close Ranks' });
  assert.deepEqual([formationArm(s, model(s, 'a1')), formationArm(s, model(s, 'a2')), formationArm(s, model(s, 'a3'))], [1, 1, 0]);
  assert.equal(hasTrait(model(s, 'a2'), 'Vigilance'), true, 'Warriors gain Vigilance');

  // Anari (Strategist): Active Support with one of her Enchantments and Weaver's Aura in the same phase.
  const h = table([]);
  run(h, add('hel-anari', 10, 30, 0, true));
  run(h, add('hel-flameshaper', 14, 30, 0, true));
  run(h, add('hel-citadel-guard', 18, 30, 0, true));
  run(h, add('sog-bushi-attendant', 14, 22, 1, true));
  run(h, { type: 'SET_LEADER', id: 'a1' });
  run(h, { type: 'READY' }, dice(20, 1));
  const pw = () => planAttack(h, model(h, 'a2'), model(h, 'b1'), SPELL_INDEX, NO_MODS, { reactive: false }).pw;
  const plain = pw();
  assert.equal(code(() => run(h, { type: 'STRATAGEM', name: 'Active Support', targets: ['a2', 'a3'], spell: 'Fireball' })), 'BAD_VALUE');
  run(h, { type: 'STRATAGEM', name: 'Active Support', targets: ['a2', 'a3'], spell: 'Cutting Chill' });
  assert.deepEqual([model(h, 'a2').enchants?.[0]?.name, model(h, 'a3').enchants?.[0]?.name], ['Cutting Chill', 'Cutting Chill']);
  assert.equal(code(() => run(h, { type: 'STRATAGEM', name: 'Active Support', targets: ['a2'], spell: 'Cutting Chill' })), 'USED');
  run(h, { type: 'STRATAGEM', name: "Weaver's Aura" });
  assert.equal(pw(), plain + 2);
  assert.equal(code(() => run(h, { type: 'STRATAGEM', name: 'Talented Command', targets: ['a2'] })), 'NOT_NOW', 'two at most');

  // Na'ra: Adrenaline Rush gives itself an AP and Fatigue until its next Strategic Phase.
  const n = table([]);
  run(n, add('san-nara', 10, 30, 0, true));
  run(n, add('hel-citadel-guard', 10, 6, 1, true));
  run(n, { type: 'SET_LEADER', id: 'a1' });
  run(n, { type: 'READY' }, dice(20, 1));
  const ap = model(n, 'a1').ap;
  run(n, { type: 'STRATAGEM', name: 'Adrenaline Rush' });
  assert.deepEqual([model(n, 'a1').ap, model(n, 'a1').states.includes('Fatigued')], [ap + 1, true]);
});

test('Stratagems: Subterfuge – Exploiting Weakness, Unfavorable Terrain, Mind Invasion, Unconventional Tactics', () => {
  // Nightshade (Leader) against a Bushi Attendant.
  const s = table([]);
  run(s, add('the-nightshade', 18, 22.7, 0, true));
  run(s, add('sog-bushi-attendant', 18, 21.4, 1, true));
  run(s, { type: 'SET_LEADER', id: 'a1' });
  run(s, { type: 'READY' }, dice(20, 1));
  const spd = modelStats(model(s, 'b1')).spd;
  run(s, { type: 'STRATAGEM', name: 'Exploiting Weakness', targets: ['b1'] });
  assert.equal(code(() => run(s, { type: 'STRATAGEM', name: 'Unfavorable Terrain' })), 'NOT_NOW');
  // Mastery of Poisons is not declared: the attack has no Poison. One Hit, damage roll 20 (failed), reroll 1.
  const before = planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, NO_MODS, { reactive: false });
  assert.equal(before.traits.includes('Poison I'), false);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, dice(1, 20, 20, 20, 20, 20, 1));
  assert.ok(s.log.some((l) => /^Exploiting Weakness: \d failed Damage rolls? rerolled/.test(l.text)), s.log.slice(-6).map((l) => l.text).join(' | '));
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' }, { side: 1 });
  run(s, { type: 'STRATAGEM', name: 'Unfavorable Terrain' });
  assert.equal(modelStats(model(s, 'b1')).spd, spd - 1);
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' }, { side: 1 });
  run(s, { type: 'STRATAGEM', name: 'Mastery of Poisons' });
  assert.equal(planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, NO_MODS, { reactive: false }).traits.includes('Poison I'), true);

  // Guildsworn Knight's Unconventional Tactics negates the Clan Champion's Advance! and makes it roll next time.
  const g = table([]);
  run(g, add('sog-clan-champion', 10, 30, 0, true));
  run(g, add('neu-guildsworn-knight', 10, 6, 1, true));
  run(g, { type: 'SET_LEADER', id: 'a1' });
  run(g, { type: 'SET_LEADER', id: 'b1' });
  run(g, { type: 'READY' }, dice(20, 1));
  const champ = modelStats(model(g, 'a1')).spd;
  run(g, { type: 'STRATAGEM', name: 'Advance!' });
  run(g, { type: 'END_TURN' });
  run(g, { type: 'STRATAGEM', name: 'Unconventional Tactics' }, { side: 1 });
  assert.equal(modelStats(model(g, 'a1')).spd, champ);
  assert.ok(g.log.some((l) => l.text === "Blue's Stratagem Advance! is negated"));
  // The Champion (M 17) fails its roll: no Stratagem this turn.
  run(g, { type: 'END_TURN' }, { side: 1, d20: () => 20 });
  assert.ok(g.log.some((l) => /Unconventional Tactics, 1d20 vs M 17 – no Stratagem this turn/.test(l.text)));
  assert.equal(code(() => run(g, { type: 'STRATAGEM', name: 'Advance!' })), 'NOT_NOW');

  // Blue Rasetsu's Mind Invasion: INT −3 or Confused until its next Strategic Phase.
  const o = table([]);
  run(o, add('oni-blue-rasetsu', 18, 30, 0, true));
  run(o, add('sog-bushi-attendant', 18, 24, 1, true));
  run(o, add('sog-bushi-attendant', 4, 4, 1, true));
  run(o, { type: 'SET_LEADER', id: 'a1' });
  run(o, { type: 'READY' }, dice(20, 1));
  assert.equal(code(() => run(o, { type: 'STRATAGEM', name: 'Mind Invasion', targets: ['b2'] })), 'BAD_TARGET', 'outside Awareness');
  run(o, { type: 'STRATAGEM', name: 'Mind Invasion', targets: ['b1'] }, dice(20));
  assert.deepEqual([model(o, 'b1').states.includes('Confused'), model(o, 'b1').temp?.Confused], [true, 'blue']);
});

test('Stratagems: raising and harvesting the Dead', () => {
  // Chiyohime (Leader): Profane Mend raises a Dead ally; Soul Harvest removes Dead models for Mana.
  const s = table([]);
  run(s, add('oni-chiyohime', 18, 30, 0, true));
  run(s, add('oni-red-rasetsu', 20, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 26, 1, true));
  run(s, add('sog-bushi-attendant', 18, 4, 1, true));
  run(s, add('sog-bushi-attendant', 34, 4, 1, true));
  run(s, { type: 'SET_LEADER', id: 'a1' });
  run(s, { type: 'READY' }, dice(20, 1));
  const kill = (id: string) => {
    for (let i = 0; i <= model(s, id).maxHp; i++) run(s, { type: 'WOUND', id });
  };
  kill('a2');
  kill('b1');
  kill('b2');
  assert.ok(model(s, 'a2').states.includes('Dead'));
  run(s, { type: 'STRATAGEM', name: 'Profane Mend', targets: ['a2'] });
  assert.deepEqual([model(s, 'a2').hp, model(s, 'a2').states.includes('Dead')], [1, false]);
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' }, { side: 1 });
  assert.equal(code(() => run(s, { type: 'STRATAGEM', name: 'Soul Harvest', targets: ['b1', 'b2'] })), 'BAD_TARGET', 'the second one is beyond Awareness');
  run(s, { type: 'STRATAGEM', name: 'Soul Harvest', targets: ['b1'] });
  assert.deepEqual([s.models.some((m) => m.id === 'b1'), model(s, 'a1').mana], [false, 2]);
});

test('Conjuration: Ritual, Summoning Limit, placement, Mana, Refined Conjuration, Temporary Bind', () => {
  // Vizier of Conjurations (Mage, Summoner, STA 2) a1 with 6 Mana; a Bushi far away for Red.
  const s = table([]);
  run(s, add('san-vizier', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 4, 1, true));
  run(s, add('sog-bushi-attendant', 30, 4, 1, true));
  run(s, { type: 'SET_LEADER', id: 'a1' });
  run(s, { type: 'READY' }, dice(20, 1));
  model(s, 'a1').mana = 6;
  run(s, { type: 'SET_AP', id: 'a1', ap: 6 });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  // Not in Base Contact (the Staff of Conjuration is not on the card's Inventory? it is: within Awareness).
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'ritual', spell: 'Summon Imp', at: { x: 18, y: 28.5 } })), 'NO_CARD');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'ritual', spell: 'Summon Gargoyle', at: { x: 18, y: 10 } })), 'NO_ROOM', 'beyond Awareness');
  run(s, { type: 'ACTION', action: 'ritual', spell: 'Summon Gargoyle', at: { x: 18, y: 28.5 } });
  const garg = s.models.find((m) => m.profileId === 'sum-gargoyle')!;
  assert.deepEqual([garg.summonedBy, garg.ap, garg.side, model(s, 'a1').mana], ['a1', 2, 0, 5]);
  assert.ok(s.log.some((l) => /performs a Ritual: Summon Gargoyle \(1 Mana\) – the Gargoyle appears with 2 AP/.test(l.text)));
  run(s, { type: 'END_ACTIVATION' });
  // Load 1 of STA 2: a Golem (Tier II) may still come, and then the limit is full.
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'ritual', spell: 'Summon Golem', at: { x: 21, y: 30 } });
  assert.equal(model(s, 'a1').mana, 3);
  run(s, { type: 'END_ACTIVATION' });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'ritual', spell: 'Summon Gargoyle', at: { x: 15, y: 30 } })), 'LIMIT');
  run(s, { type: 'ACTION', action: 'nothing' });
  // Next Strategic Phase: Temporary Bind sets the Golem's Summoning Limit to 0, Refined Conjuration can't be declared too (one per turn).
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' }, { side: 1 });
  const golem = s.models.find((m) => m.profileId === 'sum-golem')!;
  run(s, { type: 'STRATAGEM', name: 'Temporary Bind', targets: [golem.id] });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'ritual', spell: 'Summon Gargoyle', at: { x: 15, y: 30 } });
  assert.equal(s.models.filter((m) => m.summonedBy === 'a1').length, 3);
  // Dismiss one in the next Strategic Phase – only one per phase, and not after an activation.
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' }, { side: 1 });
  run(s, { type: 'DISMISS', id: golem.id });
  assert.equal(s.models.some((m) => m.id === golem.id), false);
  assert.equal(code(() => run(s, { type: 'DISMISS', id: garg.id })), 'USED');
  // Two Gargoyles fill the limit; one falls (a Construct at 0 HP leaves the field).
  const other = s.models.find((m) => m.profileId === 'sum-gargoyle' && m.id !== garg.id)!;
  run(s, { type: 'WOUND', id: other.id });
  run(s, { type: 'STRATAGEM', name: 'Refined Conjuration' });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  const mana = model(s, 'a1').mana!;
  run(s, { type: 'ACTION', action: 'ritual', spell: 'Summon Golem', at: { x: 21, y: 30 } });
  assert.equal(model(s, 'a1').mana, mana - 1, 'Refined Conjuration: 2 − 1');
});

test('Conjuration: a downed caster loses its creatures, Constructs at 0 HP leave, Summoner start, Raise the Undead', () => {
  const s = table([]);
  run(s, add('san-vizier', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 4, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 4, 1, true));
  // Summoner: one Tier II or lower creature during deployment, in Awareness.
  assert.equal(code(() => run(s, { type: 'SUMMON', id: 'a1', spell: 'Summon Earth Elemental', at: { x: 22, y: 30 } })), 'BAD_VALUE');
  run(s, { type: 'SUMMON', id: 'a1', spell: 'Summon Golem', at: { x: 22, y: 30 } });
  assert.equal(code(() => run(s, { type: 'SUMMON', id: 'a1', spell: 'Summon Gargoyle', at: { x: 14, y: 30 } })), 'USED');
  run(s, { type: 'READY' }, dice(20, 1));
  // Summoned creatures are not part of the party for Broken Morale.
  assert.deepEqual(s.partySize, [2, 1]);
  const golem = s.models.find((m) => m.summonedBy === 'a1')!;
  // A Construct at 0 HP is removed from the field.
  for (let i = 0; i < golem.maxHp; i++) run(s, { type: 'WOUND', id: golem.id });
  assert.equal(s.models.some((m) => m.id === golem.id), false);
  // The caster goes down: its creatures leave at the end of the Activation Sequence.
  model(s, 'a1').mana = 2;
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'ritual', spell: 'Summon Gargoyle', at: { x: 18, y: 28.5 } });
  run(s, { type: 'END_ACTIVATION' });
  for (let i = 0; i < model(s, 'a1').maxHp; i++) run(s, { type: 'WOUND', id: 'a1' });
  assert.equal(s.models.some((m) => m.profileId === 'sum-gargoyle'), false);

  // Chiyohime (Necromancy V): Raise the Undead at a Dead model within its Casting Aura.
  const o = table([]);
  run(o, add('oni-chiyohime', 18, 30, 0, true));
  run(o, add('sog-bushi-attendant', 18, 26, 1, true));
  run(o, add('sog-bushi-attendant', 18, 4, 1, true));
  run(o, { type: 'READY' }, dice(20, 1));
  for (let i = 0; i <= model(o, 'b1').maxHp; i++) run(o, { type: 'WOUND', id: 'b1' });
  model(o, 'a1').mana = 2;
  run(o, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(o, { type: 'ACTION', action: 'ritual', spell: 'Raise the Undead', dead: 'b1', picks: ['und-forgotten-hero', 'und-bonewalker'] })), 'BAD_VALUE');
  run(o, { type: 'ACTION', action: 'ritual', spell: 'Raise the Undead', dead: 'b1', picks: ['und-bonewalker', 'und-vengeful-spirit'] });
  const raised = o.models.filter((m) => m.summonedBy === 'a1');
  assert.deepEqual([raised.length, raised.every((m) => m.side === 0), o.models.some((m) => m.id === 'b1'), model(o, 'a1').mana], [2, true, false, 0]);
});

test('Mounts: riding the Lupus Rex – card, bonus HP, mounting rules, Knockdown, party cost', () => {
  const s = table([]);
  run(s, add('the-slayer-dragoon', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 4, 1, true));
  const rider = () => model(s, 'a1');
  const foot = modelStats(rider());
  run(s, { type: 'MOUNT', id: 'a1' });
  const up = modelStats(rider());
  assert.deepEqual([up.spd, up.arm, up.def, up.t, up.off], [9, foot.arm - 2, foot.def + 3, foot.t + 2, foot.off]);
  assert.deepEqual([rider().size, rider().hp, rider().maxHp, hasTrait(rider(), 'Vigilance'), hasSkill(rider(), 'Hit and Retreat')], ['huge', 3, 3, true, true]);
  const card = profileOf(rider());
  assert.ok(card.weapons.some((w) => w.name === 'Bite & Claws'));
  // Reach 0 Items other than the Mount's Natural Weapons cannot be used; the Lance can.
  const sword = card.weapons.findIndex((w) => w.name === 'Short Sword');
  assert.equal(planAttack(s, rider(), model(s, 'b1'), sword, NO_MODS, { reactive: false }).ok, false);
  // The bonus HP goes first and stays lost.
  run(s, { type: 'WOUND', id: 'a1' });
  run(s, { type: 'DISMOUNT', id: 'a1' });
  assert.deepEqual([rider().hp, rider().maxHp, rider().size, rider().mount?.hp], [2, 2, 'medium', 0]);
  run(s, { type: 'MOUNT', id: 'a1' });
  assert.deepEqual([rider().hp, rider().maxHp], [2, 3]);
  run(s, { type: 'READY' }, dice(20, 1));
  // In the game: Knockdown throws the Rider off (no Crouched); mounting again is refused while an enemy sees it.
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Crouched', on: true });
  assert.deepEqual([rider().mount?.on, rider().states.includes('Crouched')], [false, false]);
  assert.ok(s.log.some((l) => l.text.startsWith('Slayer Dragoon is knocked off its Lupus Rex')));
  assert.equal(code(() => run(s, { type: 'MOUNT', id: 'a1' })), 'SEEN');
  // An Assist Action does it in the Active Role.
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'mount' });
  assert.equal(rider().mount?.on, true);

  // Party: the Mount costs 5 and only a Rider may take it.
  const list = { faction: 'Coalition of Thenion', models: ['the-slayer-dragoon', 'the-nightshade'], leader: 1, mounts: [true, false] };
  assert.equal(partyPoints(list.models, undefined, list.mounts), partyPoints(list.models) + 5);
  assert.deepEqual(partyProblems({ ...list, mounts: [false, true] }, 100), ['Nightshade cannot ride a Mount']);
});

test('splitting Strikes between targets, each resolved on its own', () => {
  // Clan Champion (Spear, Reach 2, Strike 2 + Armsmaster 1) between two Bushi Attendants.
  const s = table([]);
  run(s, add('sog-clan-champion', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 17, 28.6, 1, true));
  run(s, add('sog-bushi-attendant', 19.2, 28.6, 1, true));
  run(s, add('sog-bushi-attendant', 4, 4, 1, true));
  run(s, add('sog-bushi-attendant', 32, 4, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1', split: [{ id: 'b2', n: 3 }] })), 'BAD_VALUE', 'the main target keeps one');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1', split: [{ id: 'b3', n: 1 }] })), 'NO_ATTACK', 'out of Reach');
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1', split: [{ id: 'b2', n: 1 }] }, { d20: () => 20 });
  const text = s.log.map((l) => l.text);
  assert.ok(text.includes('Clan Champion splits its Strikes: Bushi Attendant 2 ×1, the rest at Bushi Attendant'));
  assert.ok(text.some((t) => t.startsWith('Clan Champion attacks Bushi Attendant with Spear: 2d20')));
  assert.ok(text.some((t) => t.startsWith('Clan Champion attacks Bushi Attendant 2 with Spear: 1d20')));
});

test('Sweep I hits every other model in Reach and line of sight, friend or foe', () => {
  // Onitaoshi's Greatsword (Reach 2, Sweep I) at a Bushi; another Bushi and an ally stand within Reach in front.
  const s = table([]);
  run(s, add('sog-onitaoshi', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 16.6, 29.2, 0, true));
  run(s, add('sog-bushi-attendant', 18, 28.6, 1, true));
  run(s, add('sog-bushi-attendant', 19.6, 28.9, 1, true));
  run(s, add('sog-bushi-attendant', 18, 20, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, { d20: () => 5 });
  const line = s.log.map((l) => l.text).find((t) => t.startsWith('Sweep I:'));
  assert.ok(line, s.log.slice(-8).map((l) => l.text).join(' | '));
  assert.ok(line!.includes('Bushi Attendant 2') && line!.includes('Bushi Attendant') && !line!.includes('Bushi Attendant 3'), line);
  assert.equal(model(s, 'a2').hp < model(s, 'a2').maxHp || s.log.some((l) => l.text.startsWith('Damage on Bushi Attendant (Greatsword)')), true);
});

test('Attack of Opportunity on the route, and Impede', () => {
  // A Bushi runs past a reacting model at 0.7" and ends out of its Reach.
  const setup = (reactor: string) => {
    const s = table([]);
    run(s, add('sog-bushi-attendant', 12, 22, 0, true));
    run(s, add(reactor, 10, 18, 1, true));
    run(s, add('sog-bushi-attendant', 4, 4, 1, true));
    run(s, { type: 'READY' }, dice(20, 1));
    run(s, { type: 'ROTATE_MODEL', id: 'b1', facing: 90 });
    run(s, { type: 'ACTIVATE', id: 'a1' });
    run(s, { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 13 });
    return s;
  };
  // Onitaoshi (no Impede): an ordinary Attack in Reaction would be out of Reach; as an Attack of Opportunity it lands.
  const s = setup('sog-onitaoshi');
  const ev = run(s, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 0, opportunity: true });
  const at = (ev[0] as { at?: { x: number; y: number } }).at!;
  assert.ok(at && at.y < 22 && at.y > 13, JSON.stringify(at));
  assert.deepEqual([model(s, 'a1').x, model(s, 'a1').y], [12, 13], 'no Impede: it stays where it ran to');
  run(s, { type: 'ACTION', action: 'nothing' }, { d20: () => 5 });
  const text = s.log.map((l) => l.text);
  // WarBracket: a name both sides have carries the side.
  assert.ok(text.some((t) => /^Onitaoshi(?: \((?:Blue|Red)\))?: Attack of Opportunity where Bushi Attendant(?: \((?:Blue|Red)\))? came into Reach/.test(t)));
  assert.ok(text.some((t) => /^Onitaoshi(?: \((?:Blue|Red)\))? attacks Bushi Attendant(?: \((?:Blue|Red)\))? with Greatsword/.test(t)), text.slice(-6).join(' | '));
  // Too far away all along the route: refused.
  const f = setup('sog-onitaoshi');
  run(f, { type: 'MOVE_MODEL', id: 'b1', x: 4, y: 18, free: true });
  assert.equal(code(() => run(f, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 0, opportunity: true })), 'NO_ATTACK');

  // Great Guard (Impede): the Bushi's Movement ends where it was attacked and it is Engaged.
  const g = setup('sog-great-guard');
  run(g, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 0, opportunity: true });
  assert.ok(model(g, 'a1').y > 13 && model(g, 'a1').states.includes('Engaged'));
  assert.equal(code(() => run(g, { type: 'MOVE_MODEL', id: 'a1', x: 12, y: 12 })), 'IMPEDED');
});

test('height: stepping, Climb, Jump, standing on scenery, Fall Damage, Reach up and down', () => {
  // A crate 2" high, a house 3" high, a tower 8" high.
  const terrain: TerrainPiece[] = [
    { id: 'c', kind: 'obstacle', env: 'building', name: 'Crate', shape: rect(10, 18, 3, 3), height: 2 },
    { id: 'h', kind: 'obstacle', env: 'building', name: 'House', shape: rect(20, 18, 4, 4), height: 3 },
    { id: 't', kind: 'obstacle', env: 'building', name: 'Tower', shape: rect(30, 18, 3, 3), height: 8 },
  ];
  const s = table(terrain);
  run(s, add('sog-bushi-attendant', 10, 20.2, 0, true)); // SPD 5: Climb / Jump 3"
  run(s, add('sog-bushi-attendant', 20, 21, 0, true));
  run(s, add('sog-bushi-attendant', 4, 4, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'SET_AP', id: 'a1', ap: 6 });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  // Walking up 2" is more than its 1.8" Hitbox: Climb or Jump.
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 10, y: 19.3 })), 'NEED_CLIMB');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 10, y: 18, how: 'climb' })), 'TOO_FAR', '2.2" across + 2" up > 3"');
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 10, y: 19.3, how: 'climb' });
  assert.equal(model(s, 'a1').z, 2);
  assert.equal(s.activation?.special, 'climb');
  assert.equal(code(() => run(s, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b1' })), 'RAN', 'a Special Movement: only Nothing');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 10, y: 18 })), 'SPECIAL_FIRST');
  run(s, { type: 'ACTION', action: 'nothing' });
  // On the crate it walks freely; walking off the 2" edge needs a Jump (or Climb).
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 10.5, y: 18 });
  assert.equal(model(s, 'a1').z, 2);
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 13, y: 18 })), 'NEED_CLIMB');
  run(s, { type: 'ACTION', action: 'nothing' });
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 12.2, y: 18, how: 'jump' });
  assert.equal(model(s, 'a1').z, undefined, 'back on the table');
  run(s, { type: 'ACTION', action: 'nothing' });

  // Reach up and down: Hitboxes 1.2" apart in height count towards Reach.
  const roof = model(s, 'a2');
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: 20, y: 19.5, free: true });
  assert.equal(model(s, 'a2').z, 3);
  const below = { ...roof, id: 'x', side: 1 as Side, x: 20, y: 21.2, z: undefined };
  const g = gap(model(s, 'a2'), below);
  assert.ok(g > 1.1 && g < 1.4, String(g));
  // Models on different levels do not collide.
  assert.equal(checkPlacement(s, 'medium', 20, 19.5, undefined, false), 'TERRAIN');
  assert.equal(checkPlacement(s, 'medium', 20, 18.2, 'a2', true), null);

  // Fall Damage: from the 8" tower a 2.9" Jump down leaves 7.2" of fall – 2 AG rolls (halved SPD 3).
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 30, y: 18, free: true });
  assert.equal(model(s, 'a1').z, 8);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 30, y: 20.9, how: 'jump' }, dice(20, 20));
  assert.ok(s.log.some((l) => /^Bushi Attendant(?: \(Blue\))? falls 7\.\d": 2d20 vs AG 10 – 2 Wounds/ /* WarBracket: both sides have one, so the name carries the side */.test(l.text)), s.log.slice(-3).map((l) => l.text).join(' | '));
  assert.equal(model(s, 'a1').hp, 0);
});

test('Knockback pushes away (or the chosen way), stops at obstacles, not against much larger models', () => {
  // Slayer Dragoon (on foot) hits a Bushi with the Slayer's Lance (Knockback I).
  const s = table([]);
  run(s, add('the-slayer-dragoon', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 28.2, 1, true));
  run(s, add('oni-marauder', 26, 30, 1, true));
  run(s, add('sog-bushi-attendant', 4, 4, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  const before = { ...model(s, 'b1') };
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, { d20: () => 2 });
  const b1 = model(s, 'b1');
  assert.ok(Math.abs(b1.x - before.x) < 0.01 && Math.abs(before.y - b1.y - 1) < 0.06, `pushed 1" straight away: ${b1.x},${b1.y}`);
  assert.ok(s.log.some((l) => l.text.startsWith('Knockback I: Bushi Attendant is pushed 1.0"')));

  // The attacker's chosen direction.
  const t = table([]);
  run(t, add('the-slayer-dragoon', 18, 30, 0, true));
  run(t, add('sog-bushi-attendant', 18, 28.2, 1, true));
  run(t, add('sog-bushi-attendant', 4, 4, 1, true));
  run(t, { type: 'READY' }, dice(20, 1));
  run(t, { type: 'ACTIVATE', id: 'a1' });
  run(t, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1', mods: { push: { x: 30, y: 28.2 } } }, { d20: () => 2 });
  assert.ok(Math.abs(model(t, 'b1').x - 19) < 0.06 && Math.abs(model(t, 'b1').y - 28.2) < 0.01, 'pushed sideways');

  // Up against a wall: it stops there.
  const u = table([{ id: 'wall', kind: 'obstacle', env: 'ruin', name: 'Wall', shape: rect(18, 26.6, 6, 0.4), height: 3 } as TerrainPiece]);
  run(u, add('the-slayer-dragoon', 18, 30, 0, true));
  run(u, add('sog-bushi-attendant', 18, 28.2, 1, true));
  run(u, add('sog-bushi-attendant', 4, 4, 1, true));
  run(u, { type: 'READY' }, dice(20, 1));
  run(u, { type: 'ACTIVATE', id: 'a1' });
  run(u, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, { d20: () => 2 });
  assert.ok(model(u, 'b1').y > 27.3 && model(u, 'b1').y < 28.2, `stopped by the wall: ${model(u, 'b1').y}`);
  assert.ok(u.log.some((l) => l.text.includes('(stopped by an obstacle)')));

  // A Huge Oni is two Sizes larger than a Medium Dragoon.
  const v = table([]);
  run(v, add('the-slayer-dragoon', 18, 30, 0, true));
  run(v, add('oni-marauder', 18, 27.6, 1, true));
  run(v, { type: 'READY' }, dice(20, 1));
  run(v, { type: 'ACTIVATE', id: 'a1' });
  const y0 = model(v, 'b1').y;
  run(v, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, { d20: () => 2 });
  assert.equal(model(v, 'b1').y, y0);
  assert.ok(v.log.some((l) => l.text.includes('too big to be pushed')));
});

test('Resistance I halves PW, Resistance II negates the Attack', () => {
  const s = table([]);
  run(s, add('hel-flameshaper', 18, 20, 0, true));
  run(s, add('sog-seigen', 18, 14, 1, true));
  run(s, add('gob-troll-prowler', 24, 14, 1, true));
  const caster = model(s, 'a1');
  const fire = spellWeapons(profileOf(caster)).find((x) => !/AoE|Casting Aura/.test(x.weapon.rch))!;
  const plain = planAttack(s, caster, { ...model(s, 'b1'), profileId: 'sog-bushi-attendant' }, fire.index, NO_MODS, { reactive: false });
  const vsSeigen = planAttack(s, caster, model(s, 'b1'), fire.index, NO_MODS, { reactive: false });
  assert.ok(plain.ok && vsSeigen.ok, vsSeigen.reason);
  assert.equal(vsSeigen.pw, Math.ceil(plain.pw / 2));
  assert.ok(vsSeigen.notes.some((n) => n.startsWith('Resistance I (Spells, Profane): PW halved')));
  // A Troll's Venomous Bite (Poison II) against the Troll: Hits and effects negated.
  run(s, add('gob-troll-prowler', 24, 14 + 2 * baseRadius('huge') + 0.01, 0, true));
  const biter = s.models[s.models.length - 1]!;
  biter.facing = 0;
  const bite = profileOf(biter).weapons.findIndex((w) => w.name === 'Venomous Bite');
  const res = resolveAction(s, biter, 'attack', bite, model(s, 'b2'), { ...NO_MODS }, {}, () => 1);
  assert.ok(res.lines.some((l) => l.text.includes('Resistance II (Poison) – 1 Hit and their effects negated')), res.lines.map((l) => l.text).join(' | '));
});

test('Snipe and Ranged Friendly Fire', () => {
  // Tharos shoots a Bushi that a Blue Bushi stands next to.
  const s = table([]);
  run(s, add('the-tharos', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 18, 1, true));
  run(s, add('sog-bushi-attendant', 18 + 2 * baseRadius('medium') + 0.01, 18, 0, true));
  const plain = planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, NO_MODS, { reactive: false });
  const snipe = planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, { ...NO_MODS, snipe: true }, { reactive: false });
  assert.ok(plain.notes.includes('Friendly Fire −4'), plain.notes.join(', '));
  assert.equal(snipe.attr, plain.attr + 4, 'Snipe ignores Friendly Fire');
  assert.equal(snipe.stk, 1);
  assert.ok(!snipe.ok || snipe.notes.includes('Snipe: Cover ignored'));
  const melee = planAttack(s, model(s, 'a1'), model(s, 'b1'), 1, { ...NO_MODS, snipe: true }, { reactive: false });
  assert.equal(melee.ok, false);
  const bushi = planAttack(s, model(s, 'a2'), model(s, 'b1'), 0, { ...NO_MODS, snipe: true }, { reactive: false });
  assert.equal(bushi.ok, false, 'no Snipe Skill');
});

test('Menacing, Inspiring and the Spirit Drum change Morale; Watchful doubles reactive AP', () => {
  const s = table([]);
  run(s, add('sog-bushi-attendant', 18, 30, 0, true));
  run(s, add('oni-marauder', 18, 20, 1, true));
  run(s, add('gob-shaman', 30, 10, 1, true));
  run(s, add('gob-chanra', 30, 12, 1, true));
  const bushi = model(s, 'a1');
  const base = modelStats(bushi).m;
  assert.equal(moraleOf(s, bushi).m, base - 2);
  assert.ok(moraleOf(s, bushi).notes[0]!.startsWith('Menacing'));
  // The Goblins stand next to each other: Inspiring I from the other.
  assert.equal(moraleOf(s, model(s, 'b3')).m, modelStats(model(s, 'b3')).m + 6);
  run(s, add('sog-kitsune-spellmaiden', 19, 31.5, 0, true));
  assert.equal(moraleOf(s, model(s, 'a1')).m, base, 'Spirit Drum');

  const t = table([]);
  run(t, add('sog-great-guard', 18, 30, 0, true));
  run(t, add('sog-bushi-attendant', 18, 6, 1, true));
  run(t, { type: 'READY' }, dice(1, 20));
  assert.equal(t.active, 1);
  assert.equal(model(t, 'a1').ap, 2 * modelStats(model(t, 'a1')).sta, 'reactive: double AP');
});

test('Charm: a failed INT roll leaves only Nothing; Taunt makes enemies react', () => {
  const s = table([]);
  run(s, add('sog-kitsune-spellmaiden', 18, 22, 0, true));
  run(s, add('sog-bushi-attendant', 18, 20.6, 1, true));
  run(s, add('sog-bushi-attendant', 24, 20.6, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 1 }, { side: 1, d20: () => 20 });
  assert.equal(s.activation!.reactions.b1!.intent, 'other');
  assert.ok(s.log.some((l) => l.text.startsWith('Bushi Attendant reacts against Kitsune Spellmaiden (Charm I)') && l.text.includes('charmed')));
  run(s, { type: 'REACT', id: 'b2', intent: 'dodge' }, { side: 1, d20: () => 1 });
  assert.equal(s.activation!.reactions.b2!.intent, 'dodge');

  const t = table([]);
  run(t, add('sog-onitaoshi', 18, 22, 0, true));
  run(t, add('sog-bushi-attendant', 18, 14, 1, true));
  run(t, add('sog-bushi-attendant', 30, 30, 1, true));
  run(t, { type: 'READY' }, dice(20, 1));
  assert.equal(code(() => run(t, { type: 'TAUNT' })), 'NO_ACTIVATION');
  run(t, { type: 'ACTIVATE', id: 'a1' });
  run(t, { type: 'TAUNT' }, { d20: () => 20 });
  assert.deepEqual(t.activation!.taunted, ['b1']);
  assert.equal(code(() => run(t, { type: 'TAUNT' })), 'ALREADY_USED');
  run(t, { type: 'REACT', id: 'b1', intent: 'dodge' }, { side: 1 });
  assert.deepEqual(t.activation!.taunted, []);
});

test('Knockback off a roof causes Fall Damage; Charm II walks the charmed model in; Taunted models react', () => {
  // A Bushi on the edge of a 5" block is pushed off: SPD 5 → halved 3 → one AG roll.
  const s = table([{ id: 'block', kind: 'obstacle', env: 'ruin', name: 'Block', shape: rect(18, 26, 6, 6), height: 5 } as TerrainPiece]);
  run(s, add('the-slayer-dragoon', 10, 32, 0, true));
  run(s, add('sog-bushi-attendant', 10, 8, 1, true));
  run(s, add('sog-bushi-attendant', 4, 4, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  const top = surfaceAt(s, { x: 18, y: 26 });
  assert.equal(top, 5);
  // Find the block's edge towards −y and stand the Bushi just inside it, the Dragoon behind.
  let edge = 26;
  while (surfaceAt(s, { x: 18, y: edge - 0.1 }) === 5) edge -= 0.1;
  Object.assign(model(s, 'b1'), { x: 18, y: edge + 0.5, z: 5 });
  Object.assign(model(s, 'a1'), { x: 18, y: edge + 0.5 + 2 * baseRadius('medium') + 0.02, z: 5, facing: 0 });
  const hp = model(s, 'b1').hp;
  const rolls = [2, 20, 20, 20, 20];
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, { d20: () => rolls.shift() ?? 20 });
  const texts = s.log.map((l) => l.text);
  assert.ok(texts.some((t) => t.includes('away from Slayer Dragoon and falls 5.0"')), texts.slice(-8).join(' | '));
  assert.ok(texts.some((t) => t.includes('Fall Damage, AG')), texts.slice(-8).join(' | '));
  assert.ok(model(s, 'b1').hp < hp);
  assert.equal(model(s, 'b1').z ?? 0, 0);

  // Charm II.
  const lure = PROFILES.find((p) => p.skills.includes('Charm II'));
  if (lure) {
    const t = table([]);
    run(t, add(lure.id, 18, 26, 0, true));
    run(t, add('sog-bushi-attendant', 18, 16, 1, true));
    run(t, { type: 'READY' }, dice(20, 1));
    run(t, { type: 'ACTIVATE', id: 'a1' });
    run(t, { type: 'REACT', id: 'b1', intent: 'dodge' }, { side: 1, d20: () => 20 });
    assert.equal(t.activation!.reactions.b1!.drawn, true);
    run(t, { type: 'ACTION', action: 'nothing' });
    run(t, { type: 'END_ACTIVATION' });
    assert.ok(Math.abs(model(t, 'b1').y - (16 + modelStats(model(t, 'b1')).spd)) < 0.11, `walked in: ${model(t, 'b1').y}`);
  }

  // Taunt: the model that failed reacts by itself when the Action is declared; Nothing is refused.
  const u = table([]);
  run(u, add('sog-onitaoshi', 18, 22, 0, true));
  run(u, add('sog-bushi-attendant', 18, 14, 1, true));
  run(u, { type: 'READY' }, dice(20, 1));
  run(u, { type: 'ACTIVATE', id: 'a1' });
  run(u, { type: 'TAUNT' }, { d20: () => 20 });
  assert.equal(code(() => run(u, { type: 'REACT', id: 'b1', intent: 'other' }, { side: 1 })), 'TAUNTED');
  const ap = model(u, 'b1').ap;
  run(u, { type: 'ACTION', action: 'nothing' }, { d20: () => 20 });
  assert.equal(model(u, 'b1').ap, ap - 1);
  assert.ok(u.log.some((l) => l.text.includes('Taunted, it has to react')));
});

test('Stealth II: deployed Shrouded, only Perceive targets it, Attacks from it surprise, it can hide again', () => {
  const s = table([]);
  run(s, add('the-nightshade', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 26, 1, true));
  run(s, add('sog-bushi-attendant', 4, 4, 1, true));
  assert.ok(model(s, 'a1').states.includes('Shrouded'));
  const shot = planAttack(s, model(s, 'b1'), model(s, 'a1'), 0, NO_MODS, { reactive: false });
  assert.equal(shot.ok, false);
  assert.match(shot.reason ?? '', /Shrouded/);
  run(s, { type: 'READY' }, dice(1, 20));
  assert.equal(s.active, 1);
  // Red perceives it: INT roll.
  run(s, { type: 'ACTIVATE', id: 'b1' });
  run(s, { type: 'ACTION', action: 'perceive', target: 'a1' }, { d20: () => 20 });
  assert.ok(model(s, 'a1').states.includes('Shrouded'), 'failed roll');
  run(s, { type: 'END_ACTIVATION' });
  run(s, { type: 'ACTIVATE', id: 'b1' });
  run(s, { type: 'ACTION', action: 'perceive', target: 'a1' }, { d20: () => 1 });
  assert.ok(!model(s, 'a1').states.includes('Shrouded'), 'revealed');
  run(s, { type: 'END_ACTIVATION' });
  run(s, { type: 'END_TURN' });
  // Blue's Strategic Phase: seen by b1, so it cannot hide; turn b1 away and it can.
  assert.equal(code(() => run(s, { type: 'SHROUD', id: 'a1' })), 'SEEN');
  model(s, 'b1').facing = 0;
  model(s, 'b2').facing = 0;
  run(s, { type: 'SHROUD', id: 'a1' });
  assert.ok(model(s, 'a1').states.includes('Shrouded'));
  // Attacking out of the Shrouded State: Surprise Attack, and it is revealed.
  model(s, 'a1').y = 26 + 2 * baseRadius('medium') + 0.01;
  run(s, { type: 'ACTIVATE', id: 'a1' });
  const plan = planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, NO_MODS, { reactive: false });
  assert.ok(plan.traits.includes('Surprise Attack'));
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, { d20: () => 2 });
  assert.ok(!model(s, 'a1').states.includes('Shrouded'));
  assert.ok(s.log.some((l) => l.text.startsWith('Surprise Attack: Bushi Attendant')));
});

test('Ladders: a model walks up without Climb, paying double for the height', () => {
  const s = table([{ id: 'tower', kind: 'obstacle', env: 'building', name: 'Tower', shape: rect(18, 20, 4, 4), height: 3, ladders: [{ x: 18, y: 22 }] } as TerrainPiece]);
  run(s, add('sog-bushi-attendant', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 4, 4, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  Object.assign(model(s, 'a1'), { x: 18, y: 23 });
  // Away from the ladder: too high to step.
  Object.assign(model(s, 'a1'), { x: 16.3, y: 23 });
  assert.equal(checkMove(s, { side: 0, solo: true }, model(s, 'a1'), { x: 16.3, y: 21 }, false).ok, false);
  // At the ladder: 2" across + 2 × 3" up.
  Object.assign(model(s, 'a1'), { x: 18, y: 23 });
  const up = checkMove(s, { side: 0, solo: true }, model(s, 'a1'), { x: 18, y: 21 }, false);
  assert.ok(up.ok, up.ok ? '' : up.message);
  assert.equal(up.ok && up.cost, 8);
  assert.equal(up.ok && up.z, 3);
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 21 });
  assert.equal(model(s, 'a1').z, 3);
  // Down again: the height once.
  const t = table([{ id: 'tower', kind: 'obstacle', env: 'building', name: 'Tower', shape: rect(18, 20, 4, 4), height: 3, ladders: [{ x: 18, y: 22 }] } as TerrainPiece]);
  run(t, add('sog-bushi-attendant', 18, 30, 0, true));
  run(t, add('sog-bushi-attendant', 4, 4, 1, true));
  run(t, { type: 'READY' }, dice(20, 1));
  run(t, { type: 'ACTIVATE', id: 'a1' });
  Object.assign(model(t, 'a1'), { x: 18, y: 21, z: 3 });
  const down = checkMove(t, { side: 0, solo: true }, model(t, 'a1'), { x: 18, y: 23 }, false);
  assert.equal(down.ok && down.cost, 5);
});

test('Transmutation: Blessed Rain and Downpour make Shallow Aquatic ground', () => {
  const rainer = PROFILES.find((p) => spellsOf(p).some((x) => x.name === 'Blessed Rain'))!;
  assert.ok(rainer, 'a model knows Blessed Rain');
  const s = table([]);
  run(s, add(rainer.id, 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 27, 1, true));
  run(s, add('sog-bushi-attendant', 20, 31, 0, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', action: 'cast', spell: 'Blessed Rain' }, { d20: () => 1 });
  const zone = s.terrain.find((t) => t.name === 'Blessed Rain')!;
  assert.ok(zone && zone.only === 1 && zone.cover === 0 && zone.until === 'blue');
  // Double cost for the enemy, not for the caster's side.
  assert.equal(moveCost(s, { ...model(s, 'b1'), y: 29.5 }, { x: 18, y: 28.5 }), 2);
  assert.equal(moveCost(s, model(s, 'a2'), { x: 20, y: 30 }), 1);
  // Light Cover for an ally inside.
  model(s, 'b1').y = 22;
  model(s, 'b1').facing = 180;
  const shot = planAttack(s, { ...model(s, 'b1'), profileId: 'the-tharos' }, model(s, 'a2'), 0, NO_MODS, { reactive: false });
  assert.ok(shot.notes.includes('Light Cover (Blessed Rain) −2'), shot.notes.join(', '));
  // It ends in Blue's next Strategic Phase.
  run(s, { type: 'END_ACTIVATION' });
  run(s, { type: 'END_TURN' });
  assert.ok(s.terrain.some((t) => t.name === 'Blessed Rain'));
  run(s, { type: 'END_TURN' });
  assert.ok(!s.terrain.some((t) => t.name === 'Blessed Rain'));

  if (spellsOf(rainer).some((x) => x.name === 'Downpour')) {
    model(s, 'a1').mana = 1;
    run(s, { type: 'ACTIVATE', id: 'a1' });
    assert.equal(code(() => run(s, { type: 'ACTION', action: 'cast', spell: 'Downpour', at: { x: 18, y: 2 } })), 'NO_ATTACK');
    run(s, { type: 'ACTION', action: 'cast', spell: 'Downpour', at: { x: 10, y: 22 } }, { d20: () => 1 });
    assert.ok(s.terrain.some((t) => t.name === 'Downpour' && t.env === 'water' && t.only === undefined));
    assert.equal(model(s, 'a1').mana, 0);
  }
});

test('Creature rules: Construct and Elemental immunities, AP steal, Everflowing, Trample, Intimidating', () => {
  const s = table([]);
  run(s, add('sum-gargoyle', 18, 20, 0, true));
  run(s, add('sog-bushi-attendant', 18, 20 - baseRadius('small') - baseRadius('medium') - 0.01, 1, true));
  run(s, add('sum-water-elemental', 30, 10, 1, true));
  run(s, add('sum-colossus', 6, 30, 0, true));
  run(s, add('sog-bushi-attendant', 6, 24, 1, true));
  run(s, add('sog-bushi-attendant', 4, 4, 0, true));
  assert.ok(immuneTo(model(s, 'a1'), 'Poisoned') && immuneTo(model(s, 'a1'), 'Confused') && immuneTo(model(s, 'b2'), 'Bleeding'));
  run(s, { type: 'READY' }, dice(20, 1));
  // Everflowing: not Engaged, and the ground around it costs double.
  assert.deepEqual(engagers(s, model(s, 'b2')), []);
  Object.assign(model(s, 'a3'), { x: 30, y: 14 });
  assert.equal(moveCost(s, model(s, 'a3'), { x: 30, y: 13 }), 2);
  assert.equal(moveCost(s, model(s, 'b2'), { x: 30, y: 11 }), 1);
  Object.assign(model(s, 'a3'), { x: 4, y: 4 });
  // Gargoyle's Claws: the first Wound gives it an AP and takes one.
  run(s, { type: 'ACTIVATE', id: 'a1' });
  const [ap, foe] = [model(s, 'a1').ap, model(s, 'b1').ap];
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, { d20: () => 2 });
  assert.ok(s.log.some((l) => l.text.startsWith("Gargoyle's Claws: Gargoyle gains 1 AP")), s.log.slice(-6).map((l) => l.text).join(' | '));
  assert.equal(model(s, 'a1').ap, ap + 1);
  assert.equal(model(s, 'b1').ap, Math.max(0, foe - 1));
  run(s, { type: 'END_ACTIVATION' });
  // Intimidating: a Panicked model that sees the Colossus is at −6.
  const scared = model(s, 'b3');
  scared.facing = 180;
  const calm = moraleOf(s, scared).m;
  scared.states.push('Panicked');
  assert.equal(moraleOf(s, scared).m, Math.max(0, calm - 6));
  scared.states = scared.states.filter((x) => x !== 'Panicked');
  // Trample: the Colossus runs through the Bushi.
  run(s, { type: 'ACTIVATE', id: 'a2' });
  const spd = modelStats(model(s, 'a2')).spd;
  const dodge = [20, 1];
  model(s, 'b3').y = 28.5;
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: 6, y: 30 - spd - 1 }, { d20: () => dodge.shift() ?? 1 });
  assert.ok(s.log.some((l) => l.text.startsWith('Trample on Bushi Attendant')), s.log.slice(-5).map((l) => l.text).join(' | '));
  assert.ok(model(s, 'b3').states.includes('Crouched') || model(s, 'b3').hp === 0);
});

test('rollback: the last Movement can be taken back until dice are rolled or someone reacts', () => {
  const s = table([]);
  run(s, add('sog-bushi-attendant', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 14, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  assert.equal(code(() => run(s, { type: 'UNDO_MOVE' })), 'NO_UNDO');
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 27 });
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 20, y: 27 });
  assert.equal(s.activation!.moved, 5);
  assert.equal(code(() => run(s, { type: 'UNDO_MOVE' }, { side: 1, solo: false })), 'NOT_YOURS');
  run(s, { type: 'UNDO_MOVE' });
  assert.deepEqual([model(s, 'a1').x, model(s, 'a1').y, s.activation!.moved], [18, 27, 3]);
  // Only one step back.
  assert.equal(code(() => run(s, { type: 'UNDO_MOVE' })), 'NO_UNDO');
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 26 });
  run(s, { type: 'REACT', id: 'b1', intent: 'dodge' }, { side: 1 });
  assert.equal(code(() => run(s, { type: 'UNDO_MOVE' })), 'NO_UNDO');
  run(s, { type: 'ACTION', action: 'nothing' }, { d20: () => 5 });
  run(s, { type: 'END_ACTIVATION' });
  // A free dice roll also closes it.
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 25 });
  run(s, { type: 'ROLL', count: 1 });
  assert.equal(code(() => run(s, { type: 'UNDO_MOVE' })), 'NO_UNDO');
});

test('dice window: a held Action waits for the reacting player to press Roll', () => {
  const s = table([]);
  run(s, add('sog-bushi-attendant', 18, 20, 0, true));
  run(s, add('sog-bushi-attendant', 18, 20 - 2 * baseRadius('medium') - 0.01, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 1 }, { side: 1, solo: false });
  run(s, { type: 'ACTION', hold: true, action: 'attack', weapon: 1, target: 'b1' }, { side: 0, solo: false });
  assert.deepEqual(s.activation!.roll?.wait, [1]);
  assert.equal(s.activation!.action, null);
  // Nothing else goes on; only Red can roll; Blue may call it back.
  assert.equal(code(() => run(s, { type: 'END_ACTIVATION' }, { side: 0, solo: false })), 'ROLLING');
  assert.equal(code(() => run(s, { type: 'ROLL_DICE' }, { side: 0, solo: false })), 'NOT_YOURS');
  assert.equal(code(() => run(s, { type: 'CANCEL_ROLL' }, { side: 1, solo: false })), 'NOT_YOURS');
  run(s, { type: 'CANCEL_ROLL' }, { side: 0, solo: false });
  assert.equal(s.activation!.roll, undefined);
  run(s, { type: 'ACTION', hold: true, action: 'attack', weapon: 1, target: 'b1' }, { side: 0, solo: false });
  run(s, { type: 'ROLL_DICE' }, { side: 1, solo: false, d20: () => 3 });
  assert.equal(s.activation!.roll, undefined);
  assert.equal(s.activation!.action, 'attack');
  assert.ok(s.log.some((l) => l.text.startsWith('Confrontation')));
  run(s, { type: 'END_ACTIVATION' });
  // Nobody reacts, or one player moves both sides: resolved at once.
  run(s, { type: 'ACTIVATE', id: 'a1' });
  run(s, { type: 'ACTION', hold: true, action: 'attack', weapon: 1, target: 'b1' }, { side: 0, solo: false, d20: () => 3 });
  assert.equal(s.activation!.action, 'attack');
});

test('shelves: figures wait on the shelf, move into the zone, and Ready deploys the rest', () => {
  const s = table([]);
  run(s, { type: 'DEPLOY_PARTY', side: 0, faction: 'Empire of Soga', models: ['sog-clan-champion', 'sog-bushi-attendant', 'sog-bushi-attendant'], leader: 0 });
  run(s, { type: 'DEPLOY_PARTY', side: 1, faction: 'Empire of Soga', models: ['sog-clan-champion', 'sog-bushi-attendant'], leader: 0 });
  assert.ok(s.models.every((m) => onShelf(s, m) === m.side));
  // Into the hidden quarter of the own shelf, not onto the other player's shelf, not into the middle of the table.
  run(s, { type: 'MOVE_MODEL', id: 'a2', x: 33, y: 39 });
  assert.ok(shelfHidden(s, model(s, 'a2')));
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a2', x: 10, y: -3 })), 'ZONE');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a2', x: 10, y: 20 })), 'ZONE');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'b1', x: 10, y: -3 }, { side: 0, solo: false })), 'NOT_YOURS');
  // Deployed by hand, and taken back.
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 32 });
  run(s, { type: 'UNDO_MOVE' });
  assert.equal(onShelf(s, model(s, 'a1')), 0);
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 32 });
  // Ready: whatever is still on a shelf goes into its Deployment Zone.
  const quest = s.quest;
  s.quest = null;
  run(s, { type: 'READY' }, dice(20, 1));
  s.quest = quest;
  assert.equal(s.phase, 'playing');
  assert.ok(s.models.every((m) => onShelf(s, m) === null));
  assert.deepEqual([model(s, 'a1').x, model(s, 'a1').y], [18, 32]);
  assert.equal(code(() => run(s, { type: 'ACTIVATE', id: 'a1' }) && run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 38 })), 'ZONE');
});

test('reacting player adjusts a Reaction; a Quest gives at most 10 VP; Greater Cure', () => {
  const s = table([]);
  run(s, add('sog-bushi-attendant', 18, 20, 0, true));
  run(s, add('sog-bushi-attendant', 18, 20 - 2 * baseRadius('medium') - 0.01, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(code(() => run(s, { type: 'REACT_MODS', id: 'b1', hit: 2 }, { side: 1, solo: false })), 'NO_REACTION');
  run(s, { type: 'REACT', id: 'b1', intent: 'attack', weapon: 1 }, { side: 1, solo: false });
  run(s, { type: 'ACTION', hold: true, action: 'attack', weapon: 1, target: 'b1' }, { side: 0, solo: false });
  assert.equal(code(() => run(s, { type: 'REACT_MODS', id: 'b1', hit: 2 }, { side: 0, solo: false })), 'NOT_YOURS');
  run(s, { type: 'REACT_MODS', id: 'b1', hit: 2, stk: 1 }, { side: 1, solo: false });
  assert.deepEqual([s.activation!.reactions.b1!.mods.hit, s.activation!.reactions.b1!.mods.stk], [2, 1]);
  run(s, { type: 'ROLL_DICE' }, { side: 1, solo: false, d20: () => 3 });
  assert.equal(code(() => run(s, { type: 'REACT_MODS', id: 'b1', hit: 0 }, { side: 1, solo: false })), 'TOO_LATE');

  // The Quest limit.
  for (const delta of [6, 6, 3]) apply(s, { type: 'QUEST_SCORED', team: 0, delta, text: 'test', seq: s.seq + 1, ts: 0, side: 0, by: 't' } as GameEvent);
  assert.equal(s.questVp![0], 10);
  assert.ok(s.log.at(-1)!.text.includes('at most 10'));

  // Greater Cure.
  const healer = PROFILES.find((p) => spellsOf(p).some((x) => x.name === 'Greater Cure'));
  if (healer) {
    const t = table([]);
    run(t, add(healer.id, 18, 30, 0, true));
    run(t, add('sog-bushi-attendant', 18, 24, 0, true));
    run(t, add('sog-bushi-attendant', 4, 4, 1, true));
    run(t, { type: 'READY' }, dice(20, 1));
    model(t, 'a2').states.push('Poisoned', 'Slowed', 'Crouched');
    model(t, 'a1').mana = 3;
    run(t, { type: 'ACTIVATE', id: 'a1' });
    run(t, { type: 'ACTION', action: 'cast', spell: 'Greater Cure', at: { x: 18, y: 24.5 } }, { d20: () => 1 });
    assert.deepEqual(model(t, 'a2').states, ['Crouched']);
    assert.ok(!t.terrain.some((x) => x.name === 'Greater Cure'));
  }
});

test('Paladin and Bladebrethren Stratagems: Solemn Presence, Sacred Vow, Dishearten, Vicious Opportunism', () => {
  const s = table([]);
  run(s, add('hel-paladin', 18, 30, 0, true));
  run(s, add('hel-citadel-guard', 20, 30, 0, true));
  run(s, add('the-bladebrethren-elite', 18, 20, 1, true));
  run(s, add('sog-bushi-attendant', 20, 20, 1, true));
  for (const id of ['a1', 'b1']) run(s, { type: 'SET_LEADER', id });
  run(s, { type: 'READY' }, dice(20, 1));
  const soldier = s.models.find((m) => m.side === 0 && profileOf(m).classes.includes('Soldier') && m.id !== 'a1');
  run(s, { type: 'STRATAGEM', name: 'Solemn Presence' });
  assert.ok(hasTrait(model(s, 'a1'), 'Vigilance'));
  if (soldier) assert.ok(hasTrait(soldier, 'Vigilance'));
  run(s, { type: 'END_TURN' });
  // Red: Dishearten on the Paladin – a failed halved M roll costs it 1 AP every turn.
  model(s, 'b1').facing = 180;
  run(s, { type: 'STRATAGEM', name: 'Dishearten', targets: ['a1'] }, { side: 1, d20: () => 20 });
  assert.ok(model(s, 'a1').boons?.some((b) => b.fx.apDrain === 1), s.log.slice(-3).map((l) => l.text).join(' | '));
  run(s, { type: 'END_TURN' }, { side: 1 });
  assert.equal(model(s, 'a1').ap, modelStats(model(s, 'a1')).sta - 1);
  // Vicious Opportunism: +6 PW and Cleave against a Crouched model.
  const t = table([]);
  run(t, add('the-bladebrethren-elite', 18, 20, 0, true));
  run(t, add('sog-bushi-attendant', 18, 20 - 2 * baseRadius('medium') - 0.01, 1, true));
  run(t, { type: 'READY' }, dice(20, 1));
  const before = planAttack(t, model(t, 'a1'), model(t, 'b1'), 0, NO_MODS, { reactive: false });
  run(t, { type: 'STRATAGEM', name: 'Vicious Opportunism' });
  model(t, 'b1').states.push('Crouched');
  const after = planAttack(t, model(t, 'a1'), model(t, 'b1'), 0, NO_MODS, { reactive: false });
  assert.equal(after.pw, before.pw + 6);
  assert.ok(after.traits.includes('Cleave'));
});

test('maps: the maps of the game build, the stream is Shallow Water, own maps are checked', () => {
  const sanctuary = buildMap(MAPS.find((m) => m.id === 'sanctuary')!);
  assert.equal(sanctuary.ground, 'stream.jpg');
  assert.ok(sanctuary.terrain.filter((t) => t.env === 'water' && t.kind === 'area').length >= 3, 'the stream is water');
  assert.ok(sanctuary.terrain.some((t) => t.model?.file === 'altar.glb') && sanctuary.terrain.every((t) => t.shape.length >= 3));
  // In the stream: movement costs double and a Dodge is rolled on half AG (the same rule as a pond).
  const s = table(sanctuary.terrain);
  run(s, add('sog-bushi-attendant', 13.5, 2, 0, true));
  assert.equal(inShallowWater(s, model(s, 'a1')), true);
  assert.equal(moveCost(s, model(s, 'a1'), { x: 13.5, y: 2.6 }), 1.2);
  // What a player sends is checked: known kits, on the table, within the kit's sizes, at most 30.
  assert.deepEqual(checkPlacements([{ kit: 'altar', x: 10, y: 10, size: 8, turn: 375 }]), [{ kit: 'altar', x: 10, y: 10, size: 8, turn: 15 }]);
  assert.match(checkPlacements([{ kit: 'castle', x: 1, y: 1, size: 5, turn: 0 }]) as string, /Unknown/);
  assert.match(checkPlacements([{ kit: 'altar', x: 50, y: 1, size: 8, turn: 0 }]) as string, /off the table/);
  assert.match(checkPlacements([{ kit: 'altar', x: 5, y: 5, size: 40, turn: 0 }]) as string, /between/);
  assert.match(checkPlacements(Array.from({ length: 31 }, () => ({ kit: 'rock', x: 5, y: 5, size: 4, turn: 0 }))) as string, /at most 30/);
  assert.match(checkPlacements('x') as string, /list/);
});

test('maps: the second set of scenery and the three painted maps', () => {
  assert.equal(new Set(KITS.map((k) => k.id)).size, KITS.length, 'kit ids are unique');
  for (const kit of KITS) {
    assert.ok(kit.parts.length > 0 && kit.size[0] <= kit.size[1] && kit.size[1] <= kit.size[2], kit.id);
    assert.ok(kit.parts.every((p) => p.shape.length >= 3 && p.shape.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))), kit.id);
    // A sculpted element is one unit across: its shapes stay inside it.
    if (kit.model) assert.ok(kit.parts.every((p) => p.shape.every((q) => Math.abs(q.x) <= 0.55 && Math.abs(q.y) <= 0.55)), kit.id);
  }
  for (const map of MAPS) {
    if (!map.terrain) assert.deepEqual(checkPlacements(map.items), map.items, map.id);
    assert.ok(buildMap(map).terrain.every((t) => t.shape.length >= 3), map.id);
  }
  const garden = buildMap(MAPS.find((m) => m.id === 'garden')!);
  assert.equal(garden.ground, 'garden.jpg');
  assert.equal(buildMap(MAPS.find((m) => m.id === 'desert')!).ground, 'desert.jpg');
  const frozen = buildMap(MAPS.find((m) => m.id === 'frozen')!);
  assert.equal(frozen.ground, 'frozen.jpg');
  assert.ok(frozen.terrain.some((t) => t.env === 'water') && frozen.terrain.some((t) => t.env === 'forest' && t.unseen));
  // The bridge over the garden stream: a deck with two short slabs up at each end. Every step is low enough for
  // a Small figure to walk, and a figure on the deck does not stand in the water under it.
  const g = table(garden.terrain);
  assert.equal(surfaceAt(g, { x: 27.1, y: 9.9 }), 1.4);
  const over = [0, ...heightProfile(g, { x: 23.5, y: 9.9 }, { x: 30.7, y: 9.9 })];
  assert.equal(Math.max(...over), 1.4);
  assert.ok(over.every((z, i) => i === 0 || Math.abs(z - over[i - 1]!) <= 0.5), 'no step higher than half an inch');
  run(g, add('sog-bushi-attendant', 22, 9.9, 0, true));
  const walker = model(g, 'a1');
  Object.assign(walker, { x: 27.1, y: 9.9, z: 0 });
  assert.equal(inShallowWater(g, walker), true, 'the stream runs under the bridge');
  walker.z = 1.4;
  assert.equal(inShallowWater(g, walker), false);
  // The lotus pond is Shallow Water although a model is drawn for it.
  Object.assign(walker, { x: 28.9, y: 30.6, z: 0 });
  assert.equal(inShallowWater(g, walker), true);
});

// ---- Class abilities, items and Upgrade cards the table applies itself ----
import { intOf, soldierBonus, THROWN_INDEX } from '../../frontend/src/lib/eld/combat.ts';
import { SUMMONS } from '../../frontend/src/lib/eld/engine.ts';
import { hasClass } from '../../frontend/src/lib/eld/stats.ts';
import { hasUpgrade, upgradeChoices } from '../../frontend/src/lib/eld/upgrades.ts';

const touching = 2 * baseRadius('medium') + 0.02;

test('items: Throwing, Quantity and Consumables', () => {
  const s = table([]);
  run(s, add('the-hired-blade', 18, 24, 0, true)); // Short Sword, Dagger (Quantity 2)
  run(s, add('hel-eonian-runner', 24, 24, 0, true)); // Javelin (Consumable, Quantity 4)
  run(s, add('sog-bushi-attendant', 18, 18, 1, true));
  const blade = model(s, 'a1');
  blade.states = [];
  blade.upgrades = ['neu-utility-tool'];
  run(s, { type: 'READY' }, dice(20, 1));
  assert.match(profileOf(blade).weapons[1]!.effect!, /Quantity 3/, 'Utility Tool: one more Dagger, not a second entry');
  assert.deepEqual(attackOptions(blade).map((o) => o.weapon.name), ['Short Sword', 'Dagger', 'Unarmed', 'Dagger (thrown)']);
  const thrown = attackOptions(blade).find((o) => o.weapon.thrown)!;
  assert.equal(thrown.index, THROWN_INDEX + 1);
  const plan = planAttack(s, blade, model(s, 'b1'), thrown.index, NO_MODS, { reactive: false });
  assert.deepEqual([plan.ok, plan.ranged, plan.attrName, plan.stk], [true, true, 'ACC', 3], 'Reach T, one Strike for each Dagger');
  // Two Daggers thrown, both miss: they are gone.
  run(s, { type: 'ACTIVATE', id: 'a1' });
  let ev = run(s, { type: 'ACTION', action: 'attack', weapon: thrown.index, target: 'b1', mods: { stk: -1 } }, dice(20, 20));
  assert.deepEqual(ev[0]!.type === 'ACTION_RESOLVED' && ev[0]!.kit, [{ id: 'a1', item: 'Dagger', n: 2 }]);
  assert.equal(blade.items!.Dagger, 1);
  // The last one takes the Bushi down (a 1 is a Critical Hit; the Rogue's AG roll fails; Damage 5 vs PW 7).
  model(s, 'b1').hp = 1;
  run(s, { type: 'ACTIVATE', id: 'a1' });
  ev = run(s, { type: 'ACTION', action: 'attack', weapon: THROWN_INDEX + 1, target: 'b1' }, dice(1, 20, 5));
  assert.ok(model(s, 'b1').states.includes('Incapacitated'));
  assert.deepEqual([blade.items!.Dagger, blade.thrown], [0, [{ name: 'Dagger', n: 1, at: 'b1' }]]);
  assert.deepEqual(attackOptions(blade).map((o) => o.weapon.name), ['Short Sword', 'Unarmed'], 'no Dagger left, to stab or to throw');
  // In Base Contact with the model it took down the Dagger is picked up again.
  run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 18 + touching, free: true });
  assert.deepEqual([blade.items!.Dagger, blade.thrown], [1, undefined]);
  // A Consumable: one is used up by each Attack, whatever its Strike.
  run(s, { type: 'ACTIVATE', id: 'a2' });
  run(s, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b1' }, dice(16, 16)); // ACC 14 − 4: the Hired Blade is in Base Contact with the target
  assert.equal(model(s, 'a2').items!.Javelin, 3);
});

test('Soldier: Morale and Intellect too, Companion of Hairon counts itself', () => {
  const s = started(0);
  const guard = model(s, 'b1');
  const shaper = model(s, 'b2');
  assert.equal(soldierBonus(s, guard), 1);
  assert.deepEqual(moraleOf(s, guard), { m: 15, notes: ['Soldier +1'] });
  assert.equal(intOf(s, shaper), 13);
  guard.upgrades = ['hel-companion-of-hairon'];
  assert.equal(soldierBonus(s, guard), 2);
  shaper.states.push('Incapacitated');
  assert.deepEqual([soldierBonus(s, guard), soldierBonus(s, shaper)], [1, 0]);
});

test('Ranger: a Normal Movement in the End Phase, then no more Activations', () => {
  const s = table([]);
  run(s, add('hel-eonian-runner', 18, 30));
  run(s, add('sog-bushi-attendant', 22, 30));
  run(s, add('sog-bushi-attendant', 18, 6, 1));
  run(s, { type: 'READY' }, dice(20, 1));
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 26 })), 'NOT_ACTIVATED', 'not before a model has been activated');
  run(s, { type: 'ACTIVATE', id: 'a2' });
  run(s, { type: 'END_ACTIVATION' });
  let ev = run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 25 });
  assert.equal(ev[0]!.type === 'MODEL_MOVED' && ev[0]!.bonus, 'ranger');
  // Taken back, it is as if it had not been made: the turn goes on.
  run(s, { type: 'UNDO_MOVE' });
  assert.deepEqual([s.endPhase, s.bonus, model(s, 'a1').y], [undefined, undefined, 30]);
  ev = run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 25 });
  assert.equal(s.endPhase, true);
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a1', x: 18, y: 23 })), 'TOO_FAR', 'SPD 6 in all');
  assert.equal(code(() => run(s, { type: 'MOVE_MODEL', id: 'a2', x: 22, y: 28 })), 'NOT_ACTIVATED', 'the Bushi is no Ranger');
  assert.equal(code(() => run(s, { type: 'ACTIVATE', id: 'a2' })), 'END_PHASE');
  run(s, { type: 'END_TURN' });
  assert.deepEqual([s.endPhase, s.bonus], [undefined, undefined]);
});

test('Mage: an Activation Point for the failed dice of a Spell', () => {
  const s = table([]);
  run(s, add('hel-flameweaver-noble', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 20, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  const fireball = spellWeapons(profileById('hel-flameweaver-noble')!).find((x) => x.weapon.name === 'Fireball')!.index;
  run(s, { type: 'ACTIVATE', id: 'a1' });
  assert.equal(model(s, 'a1').ap, 1);
  run(s, { type: 'ACTION', action: 'attack', weapon: fireball, target: 'b1', mods: { mage: true } }, dice(20, 20, 20)); // the roll, its Scepter's reroll, the Mage's
  assert.ok(s.log.some((l) => /Mage \(1 AP spent\) – rerolls 1 missed Attack roll/.test(l.text)), s.log.slice(-4).map((l) => l.text).join(' | '));
  assert.equal(model(s, 'a1').ap, 0);
});

test('Friendly Fire: a roll of 17–20 hits the ally in Base Contact, which rolls Morale', () => {
  const s = table([]);
  run(s, add('sog-bushi-attendant', 18, 28, 0, true)); // Short Bow
  run(s, add('sog-bushi-attendant', 18 + touching, 20, 0, true));
  run(s, add('sog-bushi-attendant', 18, 20, 1, true));
  run(s, { type: 'READY' }, dice(20, 1));
  const plan = planAttack(s, model(s, 'a1'), model(s, 'b1'), 0, NO_MODS, { reactive: false });
  assert.deepEqual([plan.attr, plan.friendly], [8, ['a2']], 'ACC 12, −4 for the ally');
  run(s, { type: 'ACTIVATE', id: 'a1' });
  // 17: the ally is hit (Morale 10 holds, Damage 3 wounds it). 5: a Hit on the target, its Damage roll fails.
  run(s, { type: 'ACTION', action: 'attack', weapon: 0, target: 'b1' }, dice(17, 5, 10, 3, 20));
  const texts = s.log.map((l) => l.text);
  assert.ok(texts.some((t) => /^Friendly Fire: the roll of 17 hits Bushi Attendant/.test(t)), texts.slice(-6).join(' | '));
  assert.ok(texts.some((t) => /Friendly Fire, M 16 – holds firm/.test(t)));
  assert.deepEqual([model(s, 'a2').hp, model(s, 'b1').hp, model(s, 'a2').states.includes('Panicked')], [1, 2, false]);
  assert.deepEqual(s.tally[0].melee + s.tally[0].reactive, 0, 'a Wound on an ally is nobody\'s score');
});

test('Lucky Charm: Luck counters and the dice they reroll', () => {
  const s = table([]);
  run(s, add('sog-bushi-attendant', 18, 20, 0, true));
  run(s, add('sog-bushi-attendant', 18, 20 - touching, 1, true));
  model(s, 'a1').upgrades = ['sog-lucky-charm'];
  run(s, { type: 'READY' }, dice(20, 1));
  assert.equal(model(s, 'a1').luck, 1, 'the first Strategic Phase of the player who begins');
  const plan = planAttack(s, model(s, 'a1'), model(s, 'b1'), 1, NO_MODS, { reactive: false });
  assert.equal(plan.ok, true, plan.reason);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  const ev = run(s, { type: 'ACTION', action: 'attack', weapon: 1, target: 'b1', mods: { luck: true } }, dice(...Array(plan.stk).fill(20), 20));
  assert.ok(s.log.some((l) => /Lucky Charm – rerolls 1 missed Attack roll/.test(l.text)));
  assert.deepEqual(ev[0]!.type === 'ACTION_RESOLVED' && ev[0]!.kit, [{ id: 'a1', luck: 1 }]);
  assert.equal(model(s, 'a1').luck, 0);
  run(s, { type: 'END_TURN' });
  run(s, { type: 'END_TURN' });
  assert.equal(model(s, 'a1').luck, 1, 'one more in its next Strategic Phase');
});

test('First Aid, Double Time and Surge Order are discarded for their effect', () => {
  const s = started(0);
  model(s, 'a1').upgrades = ['neu-first-aid'];
  model(s, 'b1').upgrades = ['neu-first-aid'];
  model(s, 'a2').states.push('Bleeding');
  assert.equal(code(() => run(s, { type: 'USE_UPGRADE', id: 'a1', upgrade: 'neu-first-aid', target: 'b2' })), 'BAD_TARGET');
  run(s, { type: 'USE_UPGRADE', id: 'a1', upgrade: 'neu-first-aid', target: 'a2' });
  assert.deepEqual([model(s, 'a2').states.includes('Bleeding'), hasUpgrade(model(s, 'a1'), 'neu-first-aid')], [false, false]);
  assert.equal(code(() => run(s, { type: 'USE_UPGRADE', id: 'a1', upgrade: 'neu-first-aid', target: 'a2' })), 'BAD_VALUE');
  // Red's Recovery Check: the Guard's First Aid makes it succeed without a roll.
  Object.assign(model(s, 'b2'), { hp: 0, states: ['Incapacitated', 'Crouched'] });
  run(s, { type: 'END_TURN' }, dice());
  assert.deepEqual([model(s, 'b2').hp, model(s, 'b2').states.includes('Incapacitated'), hasUpgrade(model(s, 'b1'), 'neu-first-aid')], [1, false, false]);
  assert.ok(s.log.some((l) => l.text === "Citadel Guard discards First Aid: Flameshaper's Recovery Check succeeds"));

  // Double Time: +6 to the Initiative Check. Surge Order: up to 3 Helian League models move in the Strategic Phase.
  const t = table();
  run(t, add('sog-clan-champion', 16, 30));
  run(t, add('hel-citadel-guard', 16, 6, 1));
  run(t, add('hel-flameshaper', 20, 6, 1));
  model(t, 'b1').upgrades = ['hel-double-time'];
  model(t, 'b2').upgrades = ['hel-surge-order'];
  run(t, { type: 'READY' }, dice(10, 10)); // Blue 10 + 17, Red 10 + 15 + 6
  assert.equal(t.active, 1);
  assert.ok(t.log.some((l) => /Red 10\+15\+6 \(Double Time\)=31/.test(l.text)), t.log.slice(-3).map((l) => l.text).join(' | '));
  assert.equal(code(() => run(t, { type: 'MOVE_MODEL', id: 'b1', x: 16, y: 9 })), 'NOT_ACTIVATED');
  run(t, { type: 'USE_UPGRADE', id: 'b2', upgrade: 'hel-surge-order' });
  const ev = run(t, { type: 'MOVE_MODEL', id: 'b1', x: 16, y: 9 });
  assert.equal(ev[0]!.type === 'MODEL_MOVED' && ev[0]!.bonus, 'surge');
  assert.equal(code(() => run(t, { type: 'MOVE_MODEL', id: 'b1', x: 16, y: 12 })), 'TOO_FAR', 'SPD 4');
  assert.deepEqual(t.surge, { side: 1, ids: ['b1'] });
  run(t, { type: 'ACTIVATE', id: 'b1' });
  run(t, { type: 'END_ACTIVATION' });
  assert.equal(code(() => run(t, { type: 'MOVE_MODEL', id: 'b2', x: 20, y: 9 })), 'NOT_ACTIVATED', 'the Strategic Phase is over');
});

test('Smokescreen: the Haze Bomb leaves a Hazy area', () => {
  const s = table([]);
  run(s, add('sog-bushi-attendant', 18, 30, 0, true));
  run(s, add('sog-bushi-attendant', 18, 14, 1, true));
  model(s, 'a1').upgrades = ['neu-smokescreen'];
  run(s, { type: 'READY' }, dice(20, 1));
  const bomb = attackOptions(model(s, 'a1')).find((o) => o.weapon.name === 'Haze Bomb')!;
  assert.equal(planAttack(s, model(s, 'b1'), model(s, 'a1'), 0, NO_MODS, { reactive: true }).ok, true);
  run(s, { type: 'ACTIVATE', id: 'a1' });
  const ev = run(s, { type: 'ACTION', action: 'attack', weapon: bomb.index, at: { x: 18, y: 22 } }, dice(5));
  assert.deepEqual(ev.map((e) => e.type), ['ACTION_RESOLVED', 'TERRAIN_ADDED']);
  assert.equal(model(s, 'a1').items!['Haze Bomb'], 0);
  assert.equal(attackOptions(model(s, 'a1')).some((o) => o.weapon.name === 'Haze Bomb'), false);
  assert.match(planAttack(s, model(s, 'b1'), model(s, 'a1'), 0, NO_MODS, { reactive: true }).reason, /Hazy area is in the way/);
  // It lasts until the user's next Strategic Phase.
  run(s, { type: 'END_TURN' });
  assert.equal(s.terrain.some((p) => p.name === 'Haze'), true);
  run(s, { type: 'END_TURN' });
  assert.equal(s.terrain.some((p) => p.name === 'Haze'), false);
});

test('Upgrades with a choice, and what a summoner\'s Upgrades give its creatures', () => {
  const mage = profileById('san-academy-expeditioner')!;
  const before = mage.traits.find((x) => x.startsWith('Affinity'))!;
  assert.deepEqual(upgradeChoices(mage, ['san-elemental-lineage']).map((c) => c.options), [['Fire', 'Water', 'Earth', 'Air']]);
  for (const [i, el] of ['Fire', 'Water', 'Earth', 'Air'].entries()) {
    const now = withUpgrades(mage, ['san-elemental-lineage'], { 'san-elemental-lineage': i }).traits.find((x) => x.startsWith('Affinity'))!;
    assert.ok(now.includes(el) && (before.includes(el) ? now === before : now.length > before.length), `${before} + ${el} = ${now}`);
    const swapped = withUpgrades(mage, ['san-mana-catalyst'], { 'san-mana-catalyst': i }).traits.find((x) => x.startsWith('Affinity'))!;
    assert.ok(swapped.includes(el) && swapped.split(',').length === before.split(',').length, `${before} -> ${swapped}`);
  }
  const s = table([]);
  run(s, add('san-vizier', 18, 30));
  const vizier = model(s, 'a1');
  vizier.upgrades = ['san-conjured-retinue', 'san-personal-guard', 'san-elemental-lineage'];
  run(s, { type: 'PICK_UPGRADE', id: 'a1', upgrade: 'san-elemental-lineage', pick: 1 });
  assert.ok(profileOf(vizier).traits.some((x) => /^Affinity \(.*Water/.test(x)));
  assert.equal(code(() => run(s, { type: 'PICK_UPGRADE', id: 'a1', upgrade: 'san-conjured-retinue', pick: 0 })), 'BAD_VALUE');
  assert.equal(SUMMONS['Summon Golem'], 'sum-golem');
  run(s, { type: 'SUMMON', id: 'a1', spell: 'Summon Golem', at: { x: 22, y: 30 } });
  const golem = s.models.find((m) => m.summonedBy === 'a1')!;
  assert.deepEqual([hasClass(golem, 'Soldier'), hasClass(golem, 'Sentinel')], [true, true]);
  assert.equal(partyProblems({ faction: 'Sand Kingdoms', models: ['san-vizier'], leader: 0, upgrades: [['san-retinue-soldier']] }, 100).some((p) => /cannot be bought/.test(p)), true);
});

test('Defensive Stance: a Warrior, in its own Strategic Phase, until the next one', () => {
  const s = started(0);
  assert.equal(code(() => run(s, { type: 'SET_STATE', id: 'b1', state: 'Defensive Stance', on: true })), 'CANNOT_ACT', 'the Citadel Guard is no Warrior');
  run(s, { type: 'SET_STATE', id: 'a1', state: 'Defensive Stance', on: true });
  run(s, { type: 'END_TURN' });
  assert.equal(model(s, 'a1').states.includes('Defensive Stance'), true);
  run(s, { type: 'END_TURN' });
  assert.equal(model(s, 'a1').states.includes('Defensive Stance'), false);
});
