"use client";

// The card of the selected figure: numbers as they stand right now (States, Enchantments and Stratagems counted
// in), what it can do at this moment, and everything printed on its card.

import { useState } from "react";
import { Minus, Plus, RotateCcw, RotateCw, Zap } from "lucide-react";
import { gap, moraleOf } from "@/lib/eld/combat.ts";
import { SUMMONS, ZONES } from "@/lib/eld/engine.ts";
import { normDeg } from "@/lib/eld/geometry.ts";
import { sight } from "@/lib/eld/los.ts";
import { mountById } from "@/lib/eld/mounts.ts";
import { profileById, type Weapon } from "@/lib/eld/profiles.ts";
import { roman, spellsOf, spellText, spellWeapons } from "@/lib/eld/spells.ts";
import { baseStats, hasClass, hasSkill, modelStats, profileOf, STAT_LABEL, STATE_HINT, weaponNumbers, type StatKey } from "@/lib/eld/stats.ts";
import { STATES, type Model, type StateName } from "@/lib/eld/types.ts";
import { upgradeById } from "@/lib/eld/upgrades.ts";
import { Button } from "@/components/ui/button";
import { boonText, concealed, mayControl } from "@/lib/table/game-logic";
import { ActionPanel, ReactionPanel, type PanelCtx } from "./action-panels";
import { SIDE_TEXT } from "./colors";

const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
const mini = "h-6 px-2 text-xs";

type CardProps = {
  c: PanelCtx;
  m: Model;
  showLos: boolean;
  /** Name of the player on a side (the engine says Blue and Red). */
  sideName: (side: 0 | 1) => string;
  /** Puts a roll into the free dice roller. */
  fillDice: (count: number, target: number, label: string) => void;
  /** Sets the Power in the Damage roller. */
  fillPower: (pw: number) => void;
  onAttack: () => void;
};

function WeaponRow({ c, m, weapon, fillPower }: { c: PanelCtx; m: Model; weapon: Weapon; fillPower: (pw: number) => void }) {
  const st = c.st;
  const stats = modelStats(m);
  const reactive = st.phase === "playing" && m.side !== st.active;
  const { pw, stk } = weaponNumbers(weapon, stats, m.states, reactive);
  const ranged = weapon.type.startsWith("Ranged");
  const key: StatKey = ranged ? "acc" : reactive ? "def" : "off";
  return (
    <li className="grid gap-0.5 rounded-md border bg-background p-2">
      <div className="flex items-baseline gap-2">
        <strong>{weapon.name}</strong>
        <span className="text-xs text-muted-foreground">{weapon.type}</span>
        {c.viewer.canAct && stk !== null && (
          <Button type="button" size="sm" variant="outline" className={`ml-auto ${mini}`} title={c.t("justRoll", { n: stk, attr: STAT_LABEL[key], value: stats[key] })}
            onClick={() => {
              c.send({ type: "ROLL", count: stk, target: stats[key], label: `${m.name}: ${weapon.name} (${STAT_LABEL[key]} ${stats[key]})` });
              if (pw !== null) fillPower(pw);
            }}>{c.t("roll")}</Button>
        )}
      </div>
      <div className="flex gap-4 text-xs tabular-nums text-muted-foreground">
        <span>PW <b className="text-foreground">{pw ?? weapon.pw}</b></span>
        <span>RCH <b className="text-foreground">{/^\d+$/.test(weapon.rch) ? `${weapon.rch}″` : weapon.rch}</b></span>
        <span>STK <b className="text-foreground">{stk ?? weapon.stk}</b></span>
      </div>
      {weapon.effect && <div className="text-xs text-muted-foreground">{weapon.effect}</div>}
    </li>
  );
}

/** Mana and the Spells the figure knows: the ones the table can cast, and the rest as a reminder. */
function SpellBox({ c, m }: { c: PanelCtx; m: Model }) {
  const st = c.st;
  const p = profileOf(m);
  const known = spellsOf(p);
  const mage = p.classes.includes("Mage");
  if (known.length === 0 && !mage && !m.mana) return null;
  const act = mayControl(c.viewer, m.side);
  const castable = spellWeapons(p);
  return (
    <div className="grid gap-1.5">
      {(mage || !!m.mana) && (
        <p className="flex items-center gap-2 text-xs">
          <strong>Mana {m.mana ?? 0}</strong>
          {mage && act && st.phase === "playing" && (
            <Button type="button" size="sm" variant="outline" className={mini} disabled={m.side !== st.active || m.ap < 1} title={c.t("convertManaHint")}
              onClick={() => c.send({ type: "CONVERT_MANA", id: m.id, count: 1 })}>1 AP → 1 Mana</Button>
          )}
        </p>
      )}
      {known.length > 0 && <p className="text-xs text-muted-foreground">{c.t("spellsCastWith", { attr: p.classes.includes("Mystic") ? "M" : "INT" })}</p>}
      {known.length > 0 && (
        <ul className="grid gap-1">
          {known.map((sp) => {
            const w = castable.find((x) => x.spell === sp)?.weapon;
            const zone = sp.name in ZONES;
            const live = !!w || !!sp.cast || !!SUMMONS[sp.name] || zone;
            const how = w ? "" : zone ? (sp.name === "Primordial Word" ? ` · Cast, ${c.t("lastingByHand")}` : " · Cast")
              : sp.cast ? (sp.cast.fx ? " · Cast" : ` · Cast, ${c.t("byHand")}`)
              : sp.kind === "Conjuration" && (SUMMONS[sp.name] || sp.name === "Raise the Undead") ? " · Ritual" : ` · ${c.t("byHand")}`;
            return (
              <li key={sp.name} className={`rounded-md border bg-background p-2 text-xs ${live ? "" : "text-muted-foreground"}`}>
                <strong>{live ? "✦ " : ""}{sp.name}</strong>
                <span className="text-muted-foreground"> {sp.element} {roman(sp.level)} · {sp.kind}{sp.mana ? ` · ${sp.mana} Mana` : ""}{how}</span>
                <div>{sp.text}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Mount, summoned creatures, a Summoner's starting creature, Stealth II. */
function CompanionBox({ c, m, sideName }: { c: PanelCtx; m: Model; sideName: (side: 0 | 1) => string }) {
  void sideName;
  const st = c.st;
  const mine = mayControl(c.viewer, m.side);
  const open = st.phase === "setup" || (st.phase === "playing" && st.active === m.side && !st.activation && !st.acted);
  const steed = m.mount ? mountById(m.mount.id) : undefined;
  const parts: React.ReactNode[] = [];
  if (m.mount && steed) {
    const own = st.activation?.id === m.id;
    parts.push(
      <p key="mount" className="flex flex-wrap items-center gap-2 text-xs">
        <strong>🐾 {steed.name}</strong>
        <span className="text-muted-foreground">
          {m.mount.on ? c.t("mountedLine", { size: cap(steed.size) }) : c.t("onFootLine", { hp: m.mount.hp, max: steed.hp })}
        </span>
        {mine && !m.mount.on && open && <Button type="button" size="sm" variant="outline" className={mini} title={c.t("mountHint")} onClick={() => c.send({ type: "MOUNT", id: m.id })}>Mount</Button>}
        {mine && m.mount.on && (open || own) && <Button type="button" size="sm" variant="outline" className={mini} onClick={() => c.send({ type: "DISMOUNT", id: m.id })}>Dismount</Button>}
      </p>,
    );
  }
  if (m.summonedBy) {
    const caster = st.models.find((o) => o.id === m.summonedBy);
    parts.push(
      <p key="summoned" className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          {c.t("summonedBy", { name: caster?.name ?? "?" })} · Summoning Limit {m.boons?.some((b) => b.fx.unbound) ? "0 (Temporary Bind)" : (profileById(m.profileId)?.tier ?? 1)}
        </span>
        {mine && open && <Button type="button" size="sm" variant="outline" className={mini} title={c.t("dismissHint")} onClick={() => c.send({ type: "DISMISS", id: m.id })}>Dismiss</Button>}
      </p>,
    );
  }
  if (st.phase === "setup" && mine && hasClass(m, "Summoner") && !st.models.some((o) => o.summonedBy === m.id)) {
    const start = spellsOf(profileOf(m)).filter((x) => x.kind === "Conjuration" && (profileById(SUMMONS[x.name] ?? "")?.tier ?? 9) <= 2);
    if (start.length) {
      parts.push(
        <p key="start" className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">{c.t("summonerStart")}</span>
          {start.map((x) => (
            <Button key={x.name} type="button" size="sm" variant="outline" className={mini}
              onClick={() => c.setAim({ kind: "summon", caster: m.id, spell: x.name, profile: SUMMONS[x.name]!, start: true })}>{profileById(SUMMONS[x.name]!)!.name}</Button>
          ))}
        </p>,
      );
    }
  }
  if (mine && open && hasSkill(m, "Stealth II") && !m.states.includes("Shrouded") && !m.states.includes("Dead") && !m.states.includes("Incapacitated")) {
    parts.push(<p key="shroud"><Button type="button" size="sm" variant="outline" className={mini} title={c.t("shroudHint")} onClick={() => c.send({ type: "SHROUD", id: m.id })}>{c.t("becomeShrouded")}</Button></p>);
  }
  return parts.length ? <div className="grid gap-1.5">{parts}</div> : null;
}

/** Enchantments on the figure, and an Artificer enchanting itself in the Strategic Phase. */
function EnchantBox({ c, m, sideName }: { c: PanelCtx; m: Model; sideName: (side: 0 | 1) => string }) {
  const st = c.st;
  const own = hasClass(m, "Artificer") && st.phase === "playing" && st.active === m.side && !st.activation && mayControl(c.viewer, m.side)
    && !(st.used[m.id] ?? []).includes("Artificer") && !m.states.includes("Dead") && !m.states.includes("Incapacitated")
    ? spellsOf(profileOf(m)).filter((x) => x.kind === "Enchantment" && x.cast) : [];
  if (!m.enchants?.length && own.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      {(m.enchants ?? []).map((e) => (
        <p key={e.name} className="flex flex-wrap items-center gap-2 text-xs" title={spellText(e.name)}>
          <strong>✦ {e.name}</strong>
          <span className="text-muted-foreground">{c.t("untilStrategic", { name: sideName(e.until === "blue" ? 0 : 1) })} · {spellText(e.name)}</span>
          {c.viewer.canAct && <Button type="button" size="sm" variant="ghost" className={mini} aria-label={c.t("removeEnchant", { name: e.name })} title={c.t("removeEnchant", { name: e.name })}
            onClick={() => c.send({ type: "DISENCHANT", id: m.id, name: e.name })}>×</Button>}
        </p>
      ))}
      {own.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">{c.t("artificerEnchant")}</span>
          {own.map((x) => <Button key={x.name} type="button" size="sm" variant="outline" className={mini} title={x.text} onClick={() => c.send({ type: "ENCHANT", id: m.id, name: x.name })}>{x.name}</Button>)}
        </p>
      )}
    </div>
  );
}

export function ModelCard({ c, m, showLos, sideName, fillDice, fillPower, onAttack }: CardProps) {
  const t = c.t;
  const st = c.st;
  const [statesOpen, setStatesOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  if (concealed(c.viewer, m)) {
    return (
      <section className="grid gap-2 rounded-xl border bg-card p-3">
        <h3 className="font-display text-lg">❓ {t("shroudedToken")}</h3>
        <p className="text-xs text-muted-foreground">{t("shroudedHelp")}</p>
      </section>
    );
  }
  const p = profileOf(m);
  const act = c.viewer.canAct;
  const mine = mayControl(c.viewer, m.side);
  const stats = modelStats(m);
  const base = baseStats(p);
  const out = m.states.includes("Dead") || m.states.includes("Incapacitated");
  const a = st.activation;
  const turn = (delta: number) => () => c.send({ type: "ROTATE_MODEL", id: m.id, facing: normDeg(m.facing + delta) });

  let main: React.ReactNode = null;
  let panel: React.ReactNode = null;
  if (st.phase === "playing" && mine && !out) {
    if (m.side === st.active) {
      if (a?.id === m.id) panel = <ActionPanel c={c} m={m} onAttack={onAttack} />;
      else main = (
        <Button type="button" size="sm" disabled={m.ap < 1 || !!a?.pending || !!a?.roll} onClick={() => c.send({ type: "ACTIVATE", id: m.id })}>
          <Zap aria-hidden /> {m.ap < 1 ? t("noAp") : t("activate")}
        </Button>
      );
    } else panel = <ReactionPanel c={c} m={m} />;
  }
  const seen = showLos
    ? st.models
      .filter((e) => e.side !== m.side && !e.states.includes("Dead"))
      .map((e) => ({ e, v: sight(st, m, e) }))
      .filter((x) => x.v.los)
      .map((x) => `${x.e.name} ${gap(m, x.e).toFixed(1)}″${x.v.cover === -4 ? " (Heavy Cover)" : x.v.cover === -2 ? " (Light Cover)" : ""}${x.v.forest ? " (Forest)" : ""}`)
    : null;
  const mor = moraleOf(st, m);

  const stat = (key: StatKey, rollable: boolean) => {
    const changed = stats[key] !== base[key];
    const cls = `rounded-md px-1 py-1 text-center ${changed ? "bg-amber-500/20 ring-1 ring-amber-400/60" : "bg-muted"}`;
    const inner = (
      <>
        <div className="text-[10px] tracking-wider text-muted-foreground">{STAT_LABEL[key]}</div>
        <div className={`font-mono text-base tabular-nums ${changed ? (stats[key] < base[key] ? "text-red-400" : "text-emerald-400") : ""}`}>{stats[key]}</div>
      </>
    );
    return rollable && act
      ? <button key={key} type="button" className={`${cls} hover:ring-1 hover:ring-primary`} title={t("statToDice", { attr: STAT_LABEL[key], value: stats[key] })}
          onClick={() => fillDice(1, stats[key], `${m.name}: ${STAT_LABEL[key]}`)}>{inner}</button>
      : <div key={key} className={cls} title={changed ? t("cardValue", { n: base[key] }) : undefined}>{inner}</div>;
  };

  const stateChip = (name: StateName) => {
    const on = m.states.includes(name);
    const until = m.temp?.[name];
    const ends = until === "turn" ? ` · ${t("endsTurn")}` : until === "strategic" ? ` · ${t("endsStrategic")}` : until ? ` · ${t("untilStrategic", { name: sideName(until === "blue" ? 0 : 1) })}` : "";
    return (
      <button key={name} type="button" disabled={!act} aria-pressed={on} title={STATE_HINT[name] + ends}
        className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${on ? "border-primary bg-primary/20 text-primary" : "text-muted-foreground hover:border-primary/60"} ${until ? "border-dashed" : ""}`}
        onClick={() => c.send({ type: "SET_STATE", id: m.id, state: name, on: !on })}>{name}</button>
    );
  };
  const lines = (label: string, items: string[]) => items.length > 0 && (
    <p className="text-xs"><span className="text-muted-foreground">{label} </span>{items.join(" · ")}</p>
  );
  const removing = confirmRemove === m.id;

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-3">
      <div>
        <h3 className="font-display text-lg leading-tight" style={{ color: SIDE_TEXT[m.side] }}>{m.leader ? "★ " : ""}{m.name}</h3>
        <p className="text-xs text-muted-foreground">
          {[p.faction, p.classes.join(", "), cap(m.size), p.tier ? `Tier ${roman(p.tier)}` : "", p.cost ? `${p.cost} pts` : ""].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {main}
        <span className="ml-auto flex items-center gap-1 text-sm">
          HP
          {act && <Button type="button" size="icon" variant="outline" className="size-7" disabled={m.states.includes("Dead")} aria-label={t("wound")} title={t("woundHint")} onClick={() => c.send({ type: "WOUND", id: m.id })}><Minus aria-hidden /></Button>}
          <span className={`min-w-12 text-center font-mono tabular-nums ${m.hp < m.maxHp ? "text-red-400" : ""}`}>{m.hp} / {m.maxHp}</span>
          {act && <Button type="button" size="icon" variant="outline" className="size-7" disabled={m.states.includes("Dead") || m.hp >= m.maxHp} aria-label={t("heal")} onClick={() => c.send({ type: "HEAL", id: m.id })}><Plus aria-hidden /></Button>}
        </span>
        <span className="flex items-center gap-1 text-sm">
          AP
          {act && <Button type="button" size="icon" variant="outline" className="size-7" disabled={m.ap <= 0} aria-label={t("apLess")} onClick={() => c.send({ type: "SET_AP", id: m.id, ap: m.ap - 1 })}><Minus aria-hidden /></Button>}
          <span className="min-w-6 text-center font-mono tabular-nums">{m.ap}</span>
          {act && <Button type="button" size="icon" variant="outline" className="size-7" disabled={m.ap >= 9} aria-label={t("apMore")} onClick={() => c.send({ type: "SET_AP", id: m.id, ap: m.ap + 1 })}><Plus aria-hidden /></Button>}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1">{(["sta", "spd", "arm"] as const).map((k) => stat(k, false))}</div>
      <div className="grid grid-cols-7 gap-1">{(["off", "def", "acc", "int", "ag", "t", "m"] as const).map((k) => stat(k, true))}</div>
      {mor.notes.length > 0 && <p className="text-xs text-muted-foreground">{t("moraleAt", { m: mor.m })}: {mor.notes.join(", ")}</p>}
      {panel && <div className="rounded-lg border border-primary/50 bg-background p-2.5">{panel}</div>}
      {seen && <p className="text-xs"><span className="text-muted-foreground">{t("sees")} </span>{seen.length ? seen.join(" · ") : t("seesNobody")}</p>}
      <details open={statesOpen} onToggle={(e) => setStatesOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-xs">{t("states")}: {m.states.length ? <span className="text-amber-400">{m.states.join(", ")}</span> : "—"}</summary>
        <div className="mt-2 flex flex-wrap gap-1">{STATES.map(stateChip)}</div>
      </details>
      <CompanionBox c={c} m={m} sideName={sideName} />
      <EnchantBox c={c} m={m} sideName={sideName} />
      {(m.boons ?? []).map((b, i) => (
        <p key={i} className="text-xs">
          <strong style={{ color: SIDE_TEXT[b.from] }}>✪ {b.name}</strong>
          <span className="text-muted-foreground"> ({t("stratagemOf", { name: sideName(b.from) })}) · {boonText(b.fx)}</span>
        </p>
      ))}
      {p.weapons.length > 0 && <ul className="grid gap-1">{p.weapons.map((wp, i) => <WeaponRow key={i} c={c} m={m} weapon={wp} fillPower={fillPower} />)}</ul>}
      <SpellBox c={c} m={m} />
      {(m.upgrades?.length ?? 0) > 0 && (
        <div className="grid gap-0.5 text-xs">
          <p><span className="text-muted-foreground">{t("upgrades")} </span>{m.upgrades!.map((id) => upgradeById(id)?.name ?? id).join(" · ")}</p>
          {m.upgrades!.map(upgradeById).map((u) => u && <p key={u.id} className="text-muted-foreground">{u.name}: {u.text}</p>)}
        </div>
      )}
      {m.treasure ? <p className="text-xs text-amber-400">◆ {t("carriesTreasure", { n: m.treasure })}</p> : null}
      {lines("Traits", p.traits)}
      {lines("Skills", p.skills)}
      {lines("Arts", p.arts)}
      {lines("Stratagems", m.leader ? p.stratagems : [])}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">{t("facing", { deg: Math.round(m.facing) })}</span>
        {mine && <Button type="button" size="icon" variant="outline" className="size-7" aria-label={t("rotateLeft")} title="Q" onClick={turn(-15)}><RotateCcw aria-hidden /></Button>}
        {mine && <Button type="button" size="icon" variant="outline" className="size-7" aria-label={t("rotateRight")} title="E" onClick={turn(15)}><RotateCw aria-hidden /></Button>}
        <span className="flex-1" />
        {mine && !m.leader && st.phase === "setup" && <Button type="button" size="sm" variant="ghost" className={mini} onClick={() => c.send({ type: "SET_LEADER", id: m.id })}>{t("makeLeader")}</Button>}
        {mine && (
          <Button type="button" size="sm" variant={removing ? "destructive" : "ghost"} className={mini}
            onClick={() => {
              if (!removing) return setConfirmRemove(m.id);
              setConfirmRemove(null);
              c.send({ type: "REMOVE_MODEL", id: m.id });
            }}>{removing ? t("removeConfirm") : t("remove")}</Button>
        )}
      </div>
    </section>
  );
}
