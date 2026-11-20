// What the panel of a table of the game engine works out from the state: who may do what, previews of moves
// and Attacks, templates, ranges and sight lines. Pure functions over the engine (frontend/src/lib/eld).

import { AOE_POINT, areaOf, areaVictims, artOptions, attackOptions, isRanged, isTargetless, planAttack, pointTarget, weaponAt, type Area, type AttackPlan } from "@/lib/eld/combat.ts";
import { checkMove, type Actor } from "@/lib/eld/engine.ts";
import { baseRadius, shelfHidden } from "@/lib/eld/geometry.ts";
import { engagers, seesAllAround, sight } from "@/lib/eld/los.ts";
import type { Weapon } from "@/lib/eld/profiles.ts";
import { hasSkill, modelStats } from "@/lib/eld/stats.ts";
import type { Boon } from "@/lib/eld/stratagems.ts";
import type { Model, Mods, Pt, Side, TableState } from "@/lib/eld/types.ts";

/** Who looks at the table. `solo`: the other seat is empty, so this player moves both sides. */
export type Viewer = Actor & { canAct: boolean };

export const mayControl = (v: Viewer, side: Side): boolean => v.canAct && (v.solo || v.side === side);

/** A Shrouded figure of the other player: shown as a token, its card kept back. */
export const concealed = (v: Viewer, m: Model): boolean => m.states.includes("Shrouded") && !mayControl(v, m.side);
/** A figure on the hidden part of the other player's shelf: not shown at all. */
export const unseen = (st: TableState, v: Viewer, m: Model): boolean => !mayControl(v, m.side) && shelfHidden(st, m);

/** The table as this viewer may see it. */
export function masked(st: TableState, v: Viewer): TableState {
  if (!st.models.some((m) => concealed(v, m) || unseen(st, v, m))) return st;
  return {
    ...st,
    models: st.models
      .filter((m) => !unseen(st, v, m))
      .map((m) => (concealed(v, m) ? ({ ...m, name: "Shrouded", kind: "rogue", leader: false, hp: m.maxHp } as Model) : m)),
  };
}

/** What the player has picked on the cards: weapons, targets, modifiers… kept per figure. */
export type Ui = {
  weapon: Record<string, number>;
  target: Record<string, string>;
  /** Where a Targetless template is aimed. */
  spot: Record<string, Pt>;
  art: Record<string, string>;
  snipe: Record<string, boolean>;
  /** Knockback: the spot the target is pushed towards. */
  push: Record<string, Pt>;
  split: Record<string, Record<string, number>>;
  cast: Record<string, string>;
  castOn: Record<string, string[]>;
  ritual: Record<string, string>;
  raise: Record<string, string[]>;
  raiseDead: string;
  strat: Record<string, string[]>;
  stratSpell: Record<string, string>;
  mods: { hit: number; stk: number; pw: number };
  /** Lucky Charm: spend a Luck counter on this Action or Reaction. Mage: spend an AP to reroll the failed dice of the Spell. */
  luck: boolean;
  mage: boolean;
  /** Ranged Friendly Fire: the ally a stray shot hits ("" = the first one). */
  ally: string;
  reactAnyway: boolean;
  moveHow: "walk" | "climb" | "jump";
  /** The dice window is open for the Attack being put together. */
  composing: boolean;
};

export const initialUi: Ui = {
  weapon: {}, target: {}, spot: {}, art: {}, snipe: {}, push: {}, split: {}, cast: {}, castOn: {}, ritual: {}, raise: {},
  raiseDead: "", strat: {}, stratSpell: {}, mods: { hit: 0, stk: 0, pw: 0 }, luck: false, mage: false, ally: "", reactAnyway: false, moveHow: "walk", composing: false,
};

const clamp = (n: number): number => Math.max(-20, Math.min(20, Math.trunc(n || 0)));

/** The modifiers that go with an Attack of this figure with this weapon. */
export function readMods(st: TableState, ui: Ui, m?: Model, weaponIndex?: number): Mods {
  const wp = m && weaponIndex !== undefined ? weaponAt(m, weaponIndex) : undefined;
  const want = m ? (ui.art[m.id] ?? "") : "";
  // A Combat Art stays chosen only while it fits the weapon (Fencing: melee, Archery: ranged).
  const art = m && wp && artOptions(m, isRanged(wp)).some((o) => o.id === want) ? want : "";
  const snipe = !!m && !!wp && isRanged(wp) && !!ui.snipe[m.id] && hasSkill(m, "Snipe");
  const push = m && st.activation?.id === m.id ? ui.push[m.id] : undefined;
  return { hit: clamp(ui.mods.hit), stk: clamp(ui.mods.stk), pw: clamp(ui.mods.pw), art, ...(snipe ? { snipe } : {}), ...(push ? { push } : {}), ...(ui.luck ? { luck: true } : {}), ...(ui.ally ? { ally: ui.ally } : {}), ...(ui.mage ? { mage: true } : {}) };
}

export type Preview = { ok: boolean; label: string; at?: Pt };

/** Dropping a figure on or right next to another one puts the two exactly base to base. */
export function snapToContact(st: TableState, m: Model, x: number, y: number): Pt | null {
  let best: Pt | null = null;
  let bestGap = 0.4;
  for (const o of st.models) {
    if (o.id === m.id) continue;
    const touch = baseRadius(m.size) + baseRadius(o.size);
    const d = Math.hypot(x - o.x, y - o.y);
    if (d < 0.01 || d - touch > bestGap) continue;
    bestGap = d - touch;
    const k = (touch + 0.006) / d;
    best = { x: Math.round((o.x + (x - o.x) * k) * 100) / 100, y: Math.round((o.y + (y - o.y) * k) * 100) / 100 };
  }
  return best;
}

const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

/** What dragging this figure to (x, y) would do: allowed or not, and the line shown next to it. */
export function previewMove(st: TableState, v: Viewer, m: Model, x: number, y: number, free: boolean, how?: "climb" | "jump"): Preview {
  const snap = snapToContact(st, m, x, y);
  let at = snap ?? { x, y };
  let c = checkMove(st, v, m, at, free, how);
  if (!c.ok && snap) {
    // The snapped spot does not work (too far, blocked): judge the spot the player pointed at instead.
    at = { x, y };
    c = checkMove(st, v, m, at, free, how);
  }
  const contact = snap && at === snap ? " · Base Contact" : "";
  if (!c.ok) return { ok: false, label: c.message, at };
  const z = m.z ?? 0;
  const up = c.z !== undefined && Math.abs(c.z - z) > 0.005 ? ` · ${c.z > z ? "up" : "down"} to ${c.z ? `${c.z}" high` : "the table"}` : "";
  const done = (c.spent + c.cost).toFixed(1);
  if (c.mode === "climb" || c.mode === "jump") return { ok: true, at, label: `${cap(c.mode)} ${done}" / ${c.limit}"${up}${c.fall ? ` · falls ${c.fall.toFixed(1)}"` : ""}${c.special ? " · then only Nothing" : ""}` };
  if (c.mode === "walk" || c.mode === "run") return { ok: true, at, label: `${cap(c.mode)} ${done}" / ${c.mode === "walk" ? c.walk : c.limit}"${up}${contact}` };
  if (c.mode === "follow") return { ok: true, at, label: `Follow-Up ${done}" / ${c.limit}"${contact}` };
  if (c.mode === "retreat") return { ok: true, at, label: `Hit and Retreat ${done}" / ${c.walk}"${contact}` };
  if (c.mode === "react") return { ok: true, at, label: `${done}" / ${c.limit}"${contact}` };
  return { ok: true, at, label: `${c.cost.toFixed(1)}"${contact}` };
}

/** Hit and Retreat: the activated model attacked and no enemy has it Engaged. */
export const canRetreat = (st: TableState, m: Model): boolean =>
  st.activation?.id === m.id && st.activation.action === "attack" && hasSkill(m, "Hit and Retreat") && engagers(st, m).length === 0;

export type TemplateShape = { circle?: { at: Pt; r: number }; poly?: Pt[]; ok: boolean };

/** Where the template of an Attack lies: a circle on the spot, or a spray from the attacker's base towards it. */
export function templateShape(m: Model, area: Area, at: Pt, ok: boolean): TemplateShape | null {
  if (area.shape === "circle") return { circle: { at, r: area.r }, ok };
  const far = Math.hypot(at.x - m.x, at.y - m.y);
  if (far < 0.01) return null;
  const ux = (at.x - m.x) / far;
  const uy = (at.y - m.y) / far;
  const ax = m.x + ux * baseRadius(m.size);
  const ay = m.y + uy * baseRadius(m.size);
  const ex = ax + ux * area.length;
  const ey = ay + uy * area.length;
  const half = area.width / 2;
  return { poly: [{ x: ax, y: ay }, { x: ex - uy * half, y: ey + ux * half }, { x: ex + uy * half, y: ey - ux * half }], ok };
}

/** Everything the Action panel shows for an Attack of the activated figure with the picks made so far. */
export type AttackSetup = {
  ran: boolean;
  canDash: boolean;
  canAttack: boolean;
  enemies: Model[];
  wi: number;
  item: Weapon | undefined;
  area: Area | null;
  spotOk: boolean;
  spot: Pt | undefined;
  plans: Map<string, AttackPlan>;
  targetId: string | undefined;
  plan: AttackPlan | null;
  centre: Pt | undefined;
  under: Model[];
  canSplit: boolean;
  picks: Record<string, number>;
  others: Model[];
  given: number;
};

export function attackSetup(st: TableState, ui: Ui, m: Model): AttackSetup {
  const a = st.activation!;
  const ran = a.moved > modelStats(m).spd + 0.005;
  const canDash = ran && hasSkill(m, "Dash");
  const enemies = st.models.filter((e) => e.side !== m.side && !e.states.includes("Dead"));
  const options = attackOptions(m);
  const wi = options.some((o) => o.index === ui.weapon[m.id]) ? ui.weapon[m.id]! : options[0]!.index;
  const mods = readMods(st, ui, m, wi);
  const ctx = { reactive: false, idle: a.moved === 0, ran };
  const plans = new Map(enemies.map((e) => [e.id, planAttack(st, m, e, wi, mods, ctx)]));
  // Templates: a circular Targetless one may be aimed at a spot on the table instead of a model.
  const item = weaponAt(m, wi);
  const area = item ? areaOf(item) : null;
  const spotOk = !!item && area?.shape === "circle" && isTargetless(item);
  const spot = spotOk ? ui.spot[m.id] : undefined;
  if (spot) plans.set(AOE_POINT, planAttack(st, m, pointTarget(m, spot), wi, mods, ctx));
  let targetId = ui.target[m.id];
  if (!targetId || !plans.has(targetId)) targetId = enemies.find((e) => plans.get(e.id)!.ok)?.id ?? enemies[0]?.id;
  const plan = targetId ? plans.get(targetId)! : null;
  const centre: Pt | undefined = targetId === AOE_POINT ? spot : enemies.find((e) => e.id === targetId);
  const under = area && centre ? areaVictims(st, m, area, centre) : [];
  // Splitting the Strikes: other enemies the same Attack can reach.
  const canSplit = !!plan?.ok && plan.stk > 1 && !area && targetId !== AOE_POINT;
  const others = canSplit ? enemies.filter((e) => e.id !== targetId && plans.get(e.id)?.ok) : [];
  const picks: Record<string, number> = {};
  for (const [id, n] of Object.entries(ui.split[m.id] ?? {})) if (others.some((e) => e.id === id) && n > 0) picks[id] = n;
  const given = Object.values(picks).reduce((n, x) => n + x, 0);
  return { ran, canDash, canAttack: !ran || canDash, enemies, wi, item, area, spotOk, spot, plans, targetId, plan, centre, under, canSplit, picks, others, given };
}

/** The template of the Attack the activated figure is preparing, for the player preparing it. */
export function preparedTemplate(st: TableState, v: Viewer, ui: Ui, selected: string | null): TemplateShape | null {
  const a = st.activation;
  const m = a && a.action === null && !a.pending ? st.models.find((o) => o.id === a.id) : undefined;
  if (!m || !mayControl(v, m.side) || selected !== m.id) return null;
  const s = attackSetup(st, ui, m);
  if (!s.area || !s.centre || !s.plan) return null;
  return templateShape(m, s.area, s.centre, s.plan.ok);
}

export type RangeRing = { id: string; radius: number; color: string; dashed?: boolean };

/** What is left of Walk and Run for the activated figure, and the Awareness of the selected one. */
export function rangeRings(st: TableState, selected: Model | undefined, showAwareness: boolean): RangeRing[] {
  const rings: RangeRing[] = [];
  const a = st.activation;
  const act = a ? st.models.find((m) => m.id === a.id) : undefined;
  if (a && act) {
    const spd = modelStats(act).spd;
    if (a.action === null) {
      if (spd - a.moved > 0.05) rings.push({ id: act.id, radius: spd - a.moved, color: "rgba(255,255,255,.75)" });
      if (spd * 2 - a.moved > 0.05 && (!act.states.includes("Engaged") || hasSkill(act, "Hit and Retreat"))) rings.push({ id: act.id, radius: spd * 2 - a.moved, color: "rgba(251,191,36,.8)" });
    } else if (canRetreat(st, act) && spd - (a.retreated ?? 0) > 0.05) rings.push({ id: act.id, radius: spd - (a.retreated ?? 0), color: "rgba(255,255,255,.75)" });
  }
  if (showAwareness && selected) rings.push({ id: selected.id, radius: modelStats(selected).ag + baseRadius(selected.size), color: "rgba(51,211,224,.8)", dashed: true });
  return rings;
}

export type SightLine = { from: string; to: string; color: string };

/** Line of sight of the selected figure: a line to every enemy it sees (yellow: Cover or through a Forest). */
export function sightLines(st: TableState, sel: Model | undefined): { lines: SightLine[]; arc: { id: string; full: boolean } | null } {
  if (!sel || sel.states.includes("Dead")) return { lines: [], arc: null };
  const lines: SightLine[] = [];
  for (const e of st.models) {
    if (e.side === sel.side || e.states.includes("Dead")) continue;
    const s = sight(st, sel, e);
    if (s.los) lines.push({ from: sel.id, to: e.id, color: s.cover !== 0 || s.forest ? "#fbbf24" : "#4ade80" });
  }
  return { lines, arc: { id: sel.id, full: seesAllAround(sel) } };
}

/** One line on what a Stratagem gives a figure. */
export function boonText(fx: Boon): string {
  const out: string[] = [];
  for (const [k, n] of Object.entries(fx.stats ?? {})) out.push(`${n > 0 ? "+" : ""}${n} ${k.toUpperCase()}`);
  const named = [...(fx.traits ?? []), ...(fx.skills ?? []), ...(fx.classes ?? []).map((c) => `${c} Class`)];
  if (named.length) out.push(`gains ${named.join(", ")}`);
  if (fx.attackTraits?.length) out.push(`Attacks gain ${fx.attackTraits.join(", ")}`);
  if (fx.meleePw) out.push(`Melee Attacks +${fx.meleePw} PW`);
  if (fx.spellPw) out.push(`Spell Attacks +${fx.spellPw} PW`);
  if (fx.poisonUp) out.push("Attacks gain Poison I (Poison II if they have Poison I)");
  if (fx.formation) out.push("+1 ARM for every other friendly figure in Base Contact");
  if (fx.lightCover) out.push("Light Cover");
  if (fx.exposed) out.push("failed Damage rolls against it may be rerolled once");
  if (fx.reminder) out.push(fx.reminder);
  return out.join(" · ");
}

/** The engine calls the sides Blue and Red; on this table they are the two players. */
export function withNames(text: string, players: [string | null, string | null]): string {
  return text.replace(/\bBlue\b/g, players[0] ?? "Player 1").replace(/\bRed\b/g, players[1] ?? "Player 2");
}
