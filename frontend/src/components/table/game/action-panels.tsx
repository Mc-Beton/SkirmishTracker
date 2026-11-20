"use client";

// What a figure can do right now: the Action Step of the activated figure (Attack, Dodge, Nothing, Spells,
// Rituals, tokens) and the Reaction of a figure of the other player. The engine's own words (weapons, Spells,
// what was applied, why something is refused) are shown as the engine gives them.

import { AOE_POINT, artOptions, attackOptions, CONTACT, gap, intOf, isRanged, knockbackInches, knockbackTo, moraleOf, planAttack, weaponAt } from "@/lib/eld/combat.ts";
import { sight } from "@/lib/eld/los.ts";
import { castAttr, castProblem, castTargets, conjureCost, reactCheck, summonLoad, SUMMONS, touchesToken, ZONES } from "@/lib/eld/engine.ts";
import { baseRadius } from "@/lib/eld/geometry.ts";
import { mountById } from "@/lib/eld/mounts.ts";
import { profileById, PROFILES } from "@/lib/eld/profiles.ts";
import { MARKER_RADIUS } from "@/lib/eld/quests.ts";
import { SPELL_INDEX, spellsOf } from "@/lib/eld/spells.ts";
import { hasClass, hasSkill, modelStats, profileOf } from "@/lib/eld/stats.ts";
import type { Command, Model, TableState } from "@/lib/eld/types.ts";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { attackSetup, readMods, type Ui, type Viewer } from "@/lib/table/game-logic";

/** What the next click on the table is for. */
export type Aim =
  | null
  | { kind: "spot" }
  | { kind: "push" }
  | { kind: "zone"; spell: string }
  | { kind: "summon"; caster: string; spell: string; profile: string; start: boolean };

export type RollGate = { title: string; sub: string; dice: number; target: number; attr: string; notes?: string[] };

type T = (key: string, values?: Record<string, string | number>) => string;

export type PanelCtx = {
  st: TableState;
  viewer: Viewer;
  ui: Ui;
  patch: (fn: (ui: Ui) => Ui) => void;
  send: (cmd: Command) => void;
  /** Opens the dice window for a roll whose dice are fixed by the rules; Roll declares the Action. */
  rollGate: (o: RollGate, cmd: Command, then?: () => void) => void;
  aim: Aim;
  setAim: (a: Aim) => void;
  t: T;
};

const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
const sel = "h-8 px-2 text-xs";
const small = "text-xs";
const warn = "text-xs text-amber-400";
const muted = "text-xs text-muted-foreground";

function ModsRow({ c }: { c: PanelCtx }) {
  const field = (key: "hit" | "stk" | "pw", label: string) => (
    <label className="grid gap-0.5 text-xs text-muted-foreground">
      {label}
      <input type="number" min={-20} max={20} value={c.ui.mods[key]} aria-label={label}
        className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm tabular-nums text-foreground"
        onChange={(e) => c.patch((u) => ({ ...u, mods: { ...u.mods, [key]: Math.max(-20, Math.min(20, Math.trunc(Number(e.target.value) || 0))) } }))} />
    </label>
  );
  return (
    <div className="grid grid-cols-3 gap-2" title={c.t("modsHint")}>
      {field("hit", c.t("modAttr"))}
      {field("stk", c.t("modStrike"))}
      {field("pw", c.t("modPower"))}
    </div>
  );
}

const resetMods = (c: PanelCtx) => c.patch((u) => ({ ...u, mods: { hit: 0, stk: 0, pw: 0 }, luck: false, mage: false }));

/** Lucky Charm and the Mage's reroll: asked for when the Action or Reaction is declared, spent only if a die calls for it. */
function ExtraRow({ c, m }: { c: PanelCtx; m: Model }) {
  const luck = (m.luck ?? 0) > 0;
  const mage = hasClass(m, "Mage") && m.ap >= 1 && spellsOf(profileOf(m)).length > 0;
  if (!luck && !mage) return null;
  const box = (key: "luck" | "mage", label: string, hint: string) => (
    <label className="flex items-center gap-2 text-xs" title={hint}>
      <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={c.ui[key]} onChange={(e) => c.patch((u) => ({ ...u, [key]: e.target.checked }))} /> {label}
    </label>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {luck && box("luck", c.t("useLuck", { n: m.luck ?? 0 }), c.t("useLuckHint"))}
      {mage && box("mage", c.t("mageReroll"), c.t("mageRerollHint"))}
    </div>
  );
}
/** A Spell cast with the Mage's reroll asked for. */
const mageMods = (c: PanelCtx): { mods?: { mage: true } } => (c.ui.mage ? { mods: { mage: true } } : {});

function WeaponSelect({ c, m, wi }: { c: PanelCtx; m: Model; wi: number }) {
  return (
    <NativeSelect className={sel} aria-label={c.t("weapon")} value={String(wi)}
      onChange={(e) => c.patch((u) => ({ ...u, weapon: { ...u.weapon, [m.id]: Number(e.target.value) } }))}>
      {attackOptions(m).map((o) => <option key={o.index} value={o.index}>{o.index >= SPELL_INDEX ? `✦ ${o.weapon.name} (Spell)` : o.weapon.name}</option>)}
    </NativeSelect>
  );
}

/** Combat Art picker, or nothing when the figure has no Art for this weapon. */
function ArtSelect({ c, m, wi }: { c: PanelCtx; m: Model; wi: number }) {
  const wp = weaponAt(m, wi);
  const options = wp ? artOptions(m, isRanged(wp)) : [];
  if (options.length === 0) return null;
  return (
    <label className="grid gap-0.5 text-xs text-muted-foreground">
      {c.t("combatArt")}
      <NativeSelect className={sel} value={readMods(c.st, c.ui, m, wi).art ?? ""}
        onChange={(e) => c.patch((u) => ({ ...u, art: { ...u.art, [m.id]: e.target.value } }))}>
        <option value="">{c.t("noArt")}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </NativeSelect>
    </label>
  );
}

/** Movement Step: drag to Walk / Run, or Climb or Jump (Special Movements unless the figure has Climbing / Leap). */
function MoveChooser({ c, m }: { c: PanelCtx; m: Model }) {
  const a = c.st.activation;
  if (!a || a.id !== m.id || a.action !== null) return null;
  const how = a.special ?? c.ui.moveHow;
  const spd = modelStats(m).spd;
  const climbing = hasSkill(m, "Climbing");
  const leap = hasSkill(m, "Leap");
  const opt = (id: "walk" | "climb" | "jump", label: string, title: string) => (
    <Button type="button" size="sm" variant={how === id ? "default" : "outline"} className="h-7 px-2 text-xs" title={title}
      disabled={!!a.special && a.special !== id} onClick={() => c.patch((u) => ({ ...u, moveHow: id }))}>{label}</Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={muted}>{c.t("dragTo")}{m.z ? ` (${m.z}″ ▲)` : ""}</span>
      {opt("walk", "Walk / Run", `${spd}" / ${spd * 2}"`)}
      {opt("climb", climbing ? "Climb (Climbing)" : "Climb", climbing ? `Climbing: Normal Movement, ${spd}"` : `Special Movement: ${Math.ceil(spd / 2)}"; then only Nothing`)}
      {opt("jump", leap ? "Jump (Leap)" : "Jump", leap ? `Leap: Normal Movement, ${spd}"` : `Special Movement: ${Math.ceil(spd / 2)}"; then only Nothing`)}
    </div>
  );
}

/** Knockback: where the target goes – straight away, or towards a spot the attacker picks. */
function KnockbackRow({ c, m, traits, targetId }: { c: PanelCtx; m: Model; traits: string[]; targetId: string | undefined }) {
  const kb = traits.find((x) => x.startsWith("Knockback"));
  const victim = c.st.models.find((o) => o.id === targetId);
  if (!kb || !victim) return null;
  const spot = c.ui.push[m.id];
  const dir = spot ? { x: spot.x - victim.x, y: spot.y - victim.y } : undefined;
  const to = knockbackTo(c.st, m, victim, knockbackInches(kb), dir);
  const pushing = c.aim?.kind === "push";
  return (
    <p className={muted}>
      {kb}: {victim.name} → {Math.hypot(to.x - victim.x, to.y - victim.y).toFixed(1)}″ {spot ? c.t("pushSpot") : c.t("pushAway")}.{" "}
      <Button type="button" size="sm" variant={pushing ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => c.setAim(pushing ? null : { kind: "push" })}>
        {pushing ? c.t("clickTable") : c.t("chooseDirection")}
      </Button>{" "}
      {spot && <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs"
        onClick={() => c.patch((u) => { const push = { ...u.push }; delete push[m.id]; return { ...u, push }; })}>{c.t("pushAwayButton")}</Button>}
    </p>
  );
}

/** Treasure Hunt and Shrouded figures: what the activated figure can do with the tokens near it. */
function TokenButtons({ c, m, ran }: { c: PanelCtx; m: Model; ran: boolean }) {
  const st = c.st;
  const stats = modelStats(m);
  const out: React.ReactNode[] = [];
  if (!ran) {
    for (const e of st.models) {
      if (e.side === m.side || !e.states.includes("Shrouded") || gap(m, e) > stats.ag + 0.005) continue;
      const tracker = hasSkill(m, "Tracking") || profileOf(m).traits.includes("Tracking");
      const target = stats.int + (tracker ? 3 : 0);
      out.push(
        <Button key={`p-${e.id}`} type="button" size="sm" variant="outline"
          onClick={() => c.rollGate({ title: `${m.name}: Perceive`, sub: "Shrouded", dice: 1, target, attr: "INT" }, { type: "ACTION", action: "perceive", target: e.id })}>
          Perceive: Shrouded (INT {target}, {gap(m, e).toFixed(1)}″)
        </Button>,
      );
    }
  }
  for (const k of st.markers) {
    if (!k.kind || k.kind === "token" || ran) continue;
    const touching = touchesToken(m, m, k);
    const away = Math.max(0, Math.hypot(m.x - k.x, m.y - k.y) - baseRadius(m.size) - MARKER_RADIUS);
    if (k.kind === "intrigue" && away <= stats.ag + 0.06) {
      out.push(
        <Button key={`i-${k.id}`} type="button" size="sm" variant="outline"
          onClick={() => c.rollGate({ title: `${m.name}: Perceive ${k.name}`, sub: "Perceive", dice: 1, target: stats.int, attr: "INT" }, { type: "ACTION", action: "perceive", marker: k.id })}>
          Perceive {k.name} (INT {stats.int}, {away.toFixed(1)}″)
        </Button>,
      );
    }
    if (!touching) continue;
    if (k.kind === "treasure") out.push(<Button key={`t-${k.id}`} type="button" size="sm" onClick={() => c.send({ type: "ACTION", action: "interact", marker: k.id })}>{c.t("pickTreasure")}</Button>);
    if (k.kind === "cache" || k.kind === "sigil") {
      const bonus = ["Rogue", "Ranger", "Alchemist"].some((x) => profileOf(m).classes.includes(x)) ? 3 : 0;
      out.push(
        <Button key={`c-${k.id}`} type="button" size="sm" disabled={st.round < 2} title={st.round < 2 ? c.t("notRound1") : undefined}
          onClick={() => c.rollGate({ title: `${m.name}: Interact`, sub: k.name, dice: 1, target: stats.ag + bonus, attr: "AG" }, { type: "ACTION", action: "interact", marker: k.id })}>
          Interact: {k.kind === "sigil" ? "Cache (Sigil)" : k.name} (AG {stats.ag + bonus})
        </Button>,
      );
    }
  }
  if (m.treasure && st.round >= 4 && st.activation?.action === null) {
    out.push(<Button key="leave" type="button" size="sm" variant="outline" onClick={() => c.send({ type: "LEAVE_FIELD", id: m.id })}>{c.t("leaveField")}</Button>);
  }
  return <>{out}</>;
}

/** Ritual: summon a creature with a Conjuration Spell (no roll, Mana Cost). */
function RitualPanel({ c, m }: { c: PanelCtx; m: Model }) {
  const st = c.st;
  const known = spellsOf(profileOf(m)).filter((x) => x.kind === "Conjuration");
  if (known.length === 0) return null;
  const spell = known.find((x) => x.name === c.ui.ritual[m.id]) ?? known[0]!;
  const cost = conjureCost(m, spell);
  const sta = modelStats(m).sta;
  const load = summonLoad(st, m);
  const problem = cost > (m.mana ?? 0) ? `${cost} Mana – ${m.name}: ${m.mana ?? 0}` : load >= sta ? `Summoning Limit ${load} / STA ${sta}` : "";
  let body: React.ReactNode;
  if (spell.name === "Raise the Undead") {
    const dead = st.models.filter((o) => o.states.includes("Dead") && gap(m, o) <= modelStats(m).ag + 0.005);
    const deadId = dead.some((o) => o.id === c.ui.raiseDead) ? c.ui.raiseDead : (dead[0]?.id ?? "");
    const undead = PROFILES.filter((p) => p.faction === "Undead" && p.tier <= 2);
    const picks = c.ui.raise[m.id] ?? [undead[0]?.id ?? ""];
    const secondOk = profileById(picks[0] ?? "")?.tier === 1;
    const setPick = (i: number, v: string) => c.patch((u) => {
      const next = [...picks];
      if (v) next[i] = v;
      else next.splice(i, 1);
      return { ...u, raise: { ...u.raise, [m.id]: next } };
    });
    body = (
      <div className="flex flex-wrap gap-1.5">
        <NativeSelect className={sel} aria-label="Dead model" value={deadId} onChange={(e) => c.patch((u) => ({ ...u, raiseDead: e.target.value }))}>
          {dead.length ? dead.map((o) => <option key={o.id} value={o.id}>{o.name}</option>) : <option value="">{c.t("noDead")}</option>}
        </NativeSelect>
        <NativeSelect className={sel} aria-label="Undead 1" value={picks[0] ?? ""} onChange={(e) => setPick(0, e.target.value)}>
          {undead.map((p) => <option key={p.id} value={p.id}>{p.name} (Tier {p.tier})</option>)}
        </NativeSelect>
        {secondOk && (
          <NativeSelect className={sel} aria-label="Undead 2" value={picks[1] ?? ""} onChange={(e) => setPick(1, e.target.value)}>
            <option value="">–</option>
            {undead.filter((p) => p.tier === 1).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        )}
        <Button type="button" size="sm" disabled={!!problem || !deadId}
          onClick={() => c.send({ type: "ACTION", action: "ritual", spell: spell.name, dead: deadId, picks: picks.filter(Boolean).slice(0, secondOk ? 2 : 1) })}>Raise</Button>
      </div>
    );
  } else {
    const card = profileById(SUMMONS[spell.name] ?? "");
    const aiming = c.aim?.kind === "summon" && !c.aim.start;
    body = card
      ? <Button type="button" size="sm" disabled={!!problem} variant={aiming ? "default" : "outline"}
          onClick={() => c.setAim(aiming ? null : { kind: "summon", caster: m.id, spell: spell.name, profile: card.id, start: false })}>
          {aiming ? c.t("clickTable") : `Summon: ${card.name}`}
        </Button>
      : <p className={warn}>{c.t("noCreatureCard")}</p>;
  }
  return (
    <div className="grid gap-1.5 border-t pt-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ritual (Conjuration)</h4>
      <NativeSelect className={sel} aria-label="Conjuration Spell" value={spell.name} onChange={(e) => c.patch((u) => ({ ...u, ritual: { ...u.ritual, [m.id]: e.target.value } }))}>
        {known.map((x) => <option key={x.name} value={x.name}>{x.name} ({conjureCost(m, x)} Mana)</option>)}
      </NativeSelect>
      <p className={muted}>{spell.text} Summoning Limit {load} / STA {sta}; Mana {m.mana ?? 0}.</p>
      {problem && <p className={warn}>{problem}</p>}
      {body}
    </div>
  );
}

/** Transmutation Spells: cast around the caster or on a spot of the table. */
function ZonePanel({ c, m }: { c: PanelCtx; m: Model }) {
  const known = spellsOf(profileOf(m)).filter((x) => x.name in ZONES);
  if (known.length === 0) return null;
  return (
    <div className="grid gap-1.5 border-t pt-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Area Spells</h4>
      <ExtraRow c={c} m={m} />
      {known.map((x) => {
        const z = ZONES[x.name]!;
        const poor = (x.mana ?? 0) > (m.mana ?? 0);
        const aiming = c.aim?.kind === "zone" && c.aim.spell === x.name;
        const roll = castAttr(c.st, m, x);
        return (
          <p key={x.name} className={muted}>
            <Button type="button" size="sm" variant={aiming ? "default" : "outline"} className="h-7 px-2 text-xs" disabled={poor} title={x.text}
              onClick={() => (z.reach > 0
                ? c.setAim(aiming ? null : { kind: "zone", spell: x.name })
                : c.rollGate({ title: `${m.name}: ${x.name}`, sub: x.kind, dice: 1, target: roll.attr, attr: roll.name, notes: roll.notes }, { type: "ACTION", action: "cast", spell: x.name, ...mageMods(c) }, () => resetMods(c)))}>
              {aiming ? c.t("clickTable") : `Cast ${x.name}${x.mana ? ` (${x.mana} Mana)` : ""}`}
            </Button>{" "}
            {z.reach > 0 ? `Reach ${z.reach}", ` : ""}Circular L. {x.text}
          </p>
        );
      })}
    </div>
  );
}

/** Cast Action: an Enchantment or Healing Spell on one or more figures. */
function CastPanel({ c, m }: { c: PanelCtx; m: Model }) {
  const st = c.st;
  const known = spellsOf(profileOf(m)).filter((x) => x.cast);
  if (known.length === 0) return null;
  const spell = known.find((x) => x.name === c.ui.cast[m.id]) ?? known[0]!;
  const max = castTargets(m, spell);
  const others = st.models.filter((o) => !o.states.includes("Dead")).sort((x, y) => Number(x.side !== m.side) - Number(y.side !== m.side) || gap(m, x) - gap(m, y));
  const why = new Map(others.map((o) => [o.id, castProblem(st, m, spell, o)]));
  const chosen = (c.ui.castOn[m.id] ?? []).filter((id) => why.has(id)).slice(0, max);
  const setAt = (i: number, id: string) => c.patch((u) => {
    const next = [...chosen];
    if (id) next[i] = id;
    else next.splice(i, 1);
    return { ...u, castOn: { ...u.castOn, [m.id]: [...new Set(next.filter(Boolean))] } };
  });
  const slots = Math.min(max, chosen.length + 1);
  const roll = castAttr(st, m, spell);
  const problem = chosen.map((id) => why.get(id)).find(Boolean) ?? ((spell.mana ?? 0) > (m.mana ?? 0) ? `${spell.name}: ${spell.mana} Mana – ${m.name}: ${m.mana ?? 0}` : "");
  const free = (o: Model) => o.side === m.side && ((spell.kind === "Enchantment" && hasClass(m, "Enchanter")) || (spell.kind === "Healing" && hasClass(m, "Vitalist") && !o.states.includes("Incapacitated")));
  const rolled = chosen.map((id) => others.find((o) => o.id === id)!).filter((o) => !free(o)).length;
  return (
    <div className="grid gap-1.5 border-t pt-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{c.t("castOnFigure")}</h4>
      <NativeSelect className={sel} aria-label="Spell" value={spell.name}
        onChange={(e) => c.patch((u) => { const castOn = { ...u.castOn }; delete castOn[m.id]; return { ...u, cast: { ...u.cast, [m.id]: e.target.value }, castOn }; })}>
        {known.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.kind}{x.mana ? `, ${x.mana} Mana` : ""})</option>)}
      </NativeSelect>
      {Array.from({ length: slots }, (_, i) => (
        <NativeSelect key={i} className={sel} aria-label={`Cast on ${i + 1}`} value={chosen[i] ?? ""} onChange={(e) => setAt(i, e.target.value)}>
          <option value="">{i === 0 ? c.t("castOn") : c.t("andOn")}</option>
          {others.filter((o) => o.id === chosen[i] || !chosen.includes(o.id)).map((o) => (
            <option key={o.id} value={o.id}>{why.get(o.id) ? "✕ " : ""}{o.id === m.id ? c.t("itself") : o.name}{o.side !== m.side ? ` (${c.t("enemy")})` : ""}{o.id === m.id ? "" : ` · ${gap(m, o).toFixed(1)}″`}</option>
          ))}
        </NativeSelect>
      ))}
      <p className={muted}>{spell.text}</p>
      <p className={problem ? warn : small}>
        {problem || (chosen.length === 0 ? c.t("chooseCastTarget") : rolled === 0 ? c.t("noRoll") : `${rolled}d20 vs ${roll.name} ${roll.attr}${roll.notes.length ? ` (${roll.notes.join(", ")})` : ""}.`)}
        {!problem && spell.cast && !spell.cast.fx ? ` ${c.t("effectByHand")}` : ""}
      </p>
      <ExtraRow c={c} m={m} />
      <Button type="button" size="sm" disabled={chosen.length === 0 || !!problem}
        onClick={() => c.rollGate({ title: `${m.name}: ${spell.name}`, sub: spell.kind, dice: chosen.length, target: roll.attr, attr: roll.name, notes: roll.notes },
          { type: "ACTION", action: "cast", spell: spell.name, targets: chosen, ...mageMods(c) },
          () => c.patch((u) => { const castOn = { ...u.castOn }; delete castOn[m.id]; return { ...u, castOn, luck: false, mage: false }; }))}>
        Cast {spell.name}
      </Button>
    </div>
  );
}

/** Taunt (during Movement): enemies that see it or have it in Awareness roll INT or must react. */
function TauntRow({ c, m }: { c: PanelCtx; m: Model }) {
  const a = c.st.activation;
  if (!a || !hasSkill(m, "Taunt")) return null;
  const names = (a.taunted ?? []).map((id) => c.st.models.find((o) => o.id === id)?.name ?? "?");
  if (a.tauntUsed) return <p className={muted}>Taunt: {names.length ? names.join(", ") : "–"}</p>;
  return <Button type="button" size="sm" variant="outline" title="Every enemy with line of sight to it, or with it in Awareness, rolls INT; on a failure it must react against this figure" onClick={() => {
    // Every enemy that sees it or has it in Awareness rolls INT: through the dice window.
    const foes = c.st.models.filter((o) => o.side !== m.side && !o.states.includes("Dead") && !o.states.includes("Incapacitated") && (sight(c.st, o, m).los || gap(o, m) <= modelStats(o).ag + CONTACT));
    if (foes.length === 0) c.send({ type: "TAUNT" });
    else c.rollGate({ title: `${m.name}: Taunt`, sub: "INT", dice: foes.length, target: intOf(c.st, foes[0]!), attr: "INT", notes: foes.map((o) => `${o.name}: INT ${intOf(c.st, o)}`) }, { type: "TAUNT" });
  }}>Taunt</Button>;
}

/** Action Step of the activated figure: attack a target, dodge, or nothing. */
export function ActionPanel({ c, m, onAttack }: { c: PanelCtx; m: Model; onAttack: () => void }) {
  const st = c.st;
  const a = st.activation!;
  const t = c.t;
  if (a.pending) return <p className={small}>{t("attackDeclaredProtector")}</p>;
  if (a.action !== null) {
    return (
      <div className="grid gap-2">
        <p className={small}>
          {t("actionDeclared", { action: a.action === "deathblow" ? "Death Blow" : cap(a.action) })}
          {a.action === "dodge" ? ` ${t("mayMoveHalf", { n: Math.ceil(modelStats(m).spd / 2) })}` : ""}
        </p>
        <Button type="button" size="sm" onClick={() => c.send({ type: "END_ACTIVATION" })}>{t("endActivation")}</Button>
      </div>
    );
  }
  const s = attackSetup(st, c.ui, m);
  const { plan, targetId, item, area } = s;
  const reaction = targetId ? a.reactions[targetId] : undefined;
  const answer = reaction ? (reaction.intent === "attack" ? ` ${t("strikesBack")}` : reaction.intent === "dodge" ? ` ${t("willDodge")}` : "") : "";
  const friends = s.under.filter((v) => v.side === m.side);
  const aimingSpot = c.aim?.kind === "spot";
  const setSplit = (id: string, n: number) => c.patch((u) => {
    const mine = { ...(u.split[m.id] ?? {}) };
    if (n > 0) mine[id] = n;
    else delete mine[id];
    return { ...u, split: { ...u.split, [m.id]: mine } };
  });
  const dodgeTarget = Math.max(0, modelStats(m).ag + (c.ui.mods.hit || 0));
  return (
    <div className="grid gap-2">
      <MoveChooser c={c} m={m} />
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("action")}</h4>
      {s.ran && !s.canDash && <p className={warn}>{a.special ? t("specialOnlyNothing") : t("ranOnlyNothing")}</p>}
      {s.canAttack && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-0.5 text-xs text-muted-foreground">{t("attackWith")}<WeaponSelect c={c} m={m} wi={s.wi} /></label>
            <label className="grid gap-0.5 text-xs text-muted-foreground">{t("target")}
              <NativeSelect className={sel} value={targetId ?? ""} onChange={(e) => c.patch((u) => ({ ...u, target: { ...u.target, [m.id]: e.target.value } }))}>
                {s.enemies.map((e) => <option key={e.id} value={e.id}>{s.plans.get(e.id)!.ok ? "" : "✕ "}{e.name} · {gap(m, e).toFixed(1)}″</option>)}
                {s.spot && <option value={AOE_POINT}>{s.plans.get(AOE_POINT)!.ok ? "" : "✕ "}{t("spotOnTable")} ({s.spot.x.toFixed(1)}, {s.spot.y.toFixed(1)})</option>}
              </NativeSelect>
            </label>
          </div>
          <ArtSelect c={c} m={m} wi={s.wi} />
          <ModsRow c={c} />
          <ExtraRow c={c} m={m} />
          {plan && (
            <p className={plan.ok ? small : warn}>
              {plan.ok ? `${plan.stk}d20 vs ${plan.attrName} ${plan.attr} · PW ${plan.pw}.${plan.notes.length ? ` ${plan.notes.join("; ")}.` : ""}${answer}` : plan.reason}
            </p>
          )}
          {s.others.length > 0 && plan && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={muted}>{t("splitStrikes", { total: plan.stk, left: plan.stk - s.given })}</span>
              {s.others.map((e) => (
                <NativeSelect key={e.id} className={`${sel} w-auto`} aria-label={`Strikes: ${e.name}`} value={String(s.picks[e.id] ?? 0)} onChange={(ev) => setSplit(e.id, Number(ev.target.value))}>
                  {Array.from({ length: Math.max(1, plan.stk - s.given + (s.picks[e.id] ?? 0)) }, (_, n) => <option key={n} value={n}>{e.name}: {n}</option>)}
                </NativeSelect>
              ))}
            </div>
          )}
          {item && isRanged(item) && hasSkill(m, "Snipe") && (
            <label className="flex items-center gap-2 text-xs" title="Strike 1 that cannot be modified; ignores Cover and Ranged Friendly Fire">
              <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={!!c.ui.snipe[m.id]}
                onChange={(e) => c.patch((u) => ({ ...u, snipe: { ...u.snipe, [m.id]: e.target.checked } }))} /> Snipe
            </label>
          )}
          {plan?.ok && <KnockbackRow c={c} m={m} traits={plan.traits} targetId={targetId} />}
          {plan?.ok && plan.traits.some((x) => x.startsWith("Sweep")) && <p className={muted}>{plan.traits.find((x) => x.startsWith("Sweep"))}: {t("sweepNote")}</p>}
          {area && (
            <p className={friends.length ? warn : muted}>
              <strong>{area.label}</strong>{" – "}
              {s.centre ? (s.under.length ? s.under.map((v) => v.name + (v.side === m.side ? ` (${t("yours")})` : "")).join(", ") : t("nobodyUnder")) : t("chooseTarget")}
              {". "}{t("templateNote")}{" "}
              {s.spotOk && (
                <Button type="button" size="sm" variant={aimingSpot ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => c.setAim(aimingSpot ? null : { kind: "spot" })}>
                  {aimingSpot ? t("clickTable") : s.spot ? t("aimElsewhere") : t("aimAtSpot")}
                </Button>
              )}
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
        {s.canAttack && <Button type="button" size="sm" disabled={!plan?.ok} title={t("attackHint")} onClick={onAttack}>{t("attack")}</Button>}
        {!s.ran && (
          <Button type="button" size="sm" variant="outline" title={t("dodgeHint")}
            onClick={() => c.rollGate({ title: `${m.name}: Dodge`, sub: t("oneRollEach"), dice: 1, target: dodgeTarget, attr: "AG" },
              { type: "ACTION", action: "dodge", mods: readMods(st, c.ui) }, () => resetMods(c))}>Dodge</Button>
        )}
        <Button type="button" size="sm" variant="outline" title={t("nothingHint")} onClick={() => c.send({ type: "ACTION", hold: true, action: "nothing" })}>Nothing</Button>
      </div>
      <TauntRow c={c} m={m} />
      {!s.ran && <ZonePanel c={c} m={m} />}
      {!s.ran && <CastPanel c={c} m={m} />}
      {!s.ran && <RitualPanel c={c} m={m} />}
      {!s.ran && m.mount && !m.mount.on && (
        <Button type="button" size="sm" variant="outline" onClick={() => c.send({ type: "ACTION", action: "mount" })}>Mount: {mountById(m.mount.id)?.name ?? "Mount"} (Assist)</Button>
      )}
      <div className="flex flex-wrap gap-1.5">
        <TokenButtons c={c} m={m} ran={s.ran} />
        {s.enemies.filter((e) => !s.ran && e.states.includes("Incapacitated") && gap(m, e) <= CONTACT).map((e) => (
          <Button key={e.id} type="button" size="sm" variant="destructive" title="An Incapacitated enemy in Base Contact becomes Dead. No roll."
            onClick={() => c.send({ type: "ACTION", action: "deathblow", target: e.id })}>Death Blow: {e.name}</Button>
        ))}
      </div>
    </div>
  );
}

/** Reaction Step for a figure of the Reactive Player. */
export function ReactionPanel({ c, m }: { c: PanelCtx; m: Model }) {
  const st = c.st;
  const t = c.t;
  const a = st.activation;
  if (!a) return null;
  const mine = a.reactions[m.id];
  const active = st.models.find((x) => x.id === a.id);
  if (mine) {
    const what = mine.intent === "attack"
      ? `${mine.at ? "Attack of Opportunity" : "Attack"}: ${attackOptions(m).find((o) => o.index === mine.weapon)?.weapon.name ?? "weapon"}`
      : mine.intent === "dodge" ? `Dodge – ${t("mayMoveHalf", { n: Math.ceil(modelStats(m).spd / 2) })}` : "Reaction";
    return <p className={small}>{t("reacting")}: {what}.</p>;
  }
  if (a.action !== null || !active || a.pending) return null;
  const options = attackOptions(m);
  const wi = options.some((o) => o.index === c.ui.weapon[m.id]) ? c.ui.weapon[m.id]! : options[0]!.index;
  const mods = readMods(st, c.ui, m, wi);
  const plan = planAttack(st, m, active, wi, mods, { reactive: true });
  const charm = hasSkill(active, "Charm II") ? "II" : hasSkill(active, "Charm I") ? "I" : "";
  // Attack of Opportunity: the first point of the route where the activated model was within Reach.
  const route = a.path ?? [];
  const chance = route.find((p) => planAttack(st, m, { ...active, x: p.x, y: p.y }, wi, mods, { reactive: true }).ok);
  const aooPlan = chance ? planAttack(st, m, { ...active, x: chance.x, y: chance.y }, wi, mods, { reactive: true }) : null;
  const check = reactCheck(st, m);
  const anyway = c.ui.reactAnyway;
  const blocked = (intent: "attack" | "dodge" | "other") => !anyway && (!check.ok || (check.dodgeOnly && intent !== "dodge"));
  const react = (intent: "attack" | "dodge" | "other", opportunity = false) => () => {
    const cmd: Command = { type: "REACT", id: m.id, intent, weapon: wi, mods, ...(opportunity ? { opportunity: true } : {}), ...(anyway ? { anyway: true } : {}) };
    const done = () => c.patch((u) => ({ ...u, reactAnyway: false, mods: { hit: 0, stk: 0, pw: 0 }, luck: false, mage: false }));
    // Rolls that come with declaring the Reaction go through the dice window: Morale of a Panicked model, INT against Charm.
    const mor = moraleOf(st, m);
    if (m.states.includes("Panicked")) c.rollGate({ title: `${m.name}: Panicked`, sub: "Morale", dice: 1, target: mor.m, attr: "M", notes: mor.notes }, cmd, done);
    else if (charm && intent !== "other") c.rollGate({ title: `${m.name}: Charm ${charm}`, sub: active.name, dice: 1, target: intOf(st, m), attr: "INT" }, cmd, done);
    else {
      c.send(cmd);
      done();
    }
  };
  const noAp = m.ap < 1;
  return (
    <div className="grid gap-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{noAp ? t("reactNoAp") : t("reactTo", { name: active.name })}</h4>
      {(a.taunted ?? []).includes(m.id) && <p className={warn}>Taunt: {t("mustReact", { name: active.name })}</p>}
      {charm && <p className={muted}>Charm {charm}: INT {modelStats(m).int} – {t("charmNote")}</p>}
      <label className="grid gap-0.5 text-xs text-muted-foreground">{t("attackWith")}<WeaponSelect c={c} m={m} wi={wi} /></label>
      <ArtSelect c={c} m={m} wi={wi} />
      <ModsRow c={c} />
      <ExtraRow c={c} m={m} />
      <p className={plan.ok ? small : warn}>
        {plan.ok ? `Attack: ${plan.stk}d20 vs ${plan.attrName} ${plan.attr} · PW ${plan.pw}.${plan.notes.length ? ` ${plan.notes.join("; ")}.` : ""}` : `Attack: ${plan.reason}`}
      </p>
      {chance && aooPlan && (
        <p className={small}>
          {t("cameIntoReach", { name: active.name })}: {aooPlan.stk}d20 vs {aooPlan.attrName} {aooPlan.attr} · PW {aooPlan.pw}
          {hasSkill(m, "Impede") && !aooPlan.ranged && !active.states.includes("Engaged") ? " · Impede" : ""}.{" "}
          <Button type="button" size="sm" className="h-6 px-2 text-xs" disabled={noAp || blocked("attack")} onClick={react("attack", true)}>Attack of Opportunity</Button>
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" disabled={noAp || blocked("attack")} title={t("reactAttackHint")} onClick={react("attack")}>{t("attack")}</Button>
        <Button type="button" size="sm" variant="outline" disabled={noAp || blocked("dodge")} title={t("reactDodgeHint")} onClick={react("dodge")}>Dodge</Button>
        <Button type="button" size="sm" variant="outline" disabled={noAp || blocked("other")} title={t("reactOtherHint")} onClick={react("other")}>{t("otherReaction")}</Button>
      </div>
      {(!check.ok || check.dodgeOnly) && <p className={warn}>{check.ok ? check.note : check.reason}</p>}
      {(!check.ok || check.dodgeOnly) && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={anyway} onChange={(e) => c.patch((u) => ({ ...u, reactAnyway: e.target.checked }))} />
          {t("reactAnyway")}
        </label>
      )}
    </div>
  );
}
