"use client";

// Beside the table: both parties with their Stratagems, the Quest with what counts right now, and the Schemes.

import { stratagemFits, stratagemLeader } from "@/lib/eld/engine.ts";
import { baseRadius, onShelf } from "@/lib/eld/geometry.ts";
import { profileById } from "@/lib/eld/profiles.ts";
import { MARKER_RADIUS, questByCode, schemeByCode } from "@/lib/eld/quests.ts";
import { spellsOf } from "@/lib/eld/spells.ts";
import { profileOf } from "@/lib/eld/stats.ts";
import { stratagemFor } from "@/lib/eld/stratagems.ts";
import type { Side } from "@/lib/eld/types.ts";
import { upgradesCost } from "@/lib/eld/upgrades.ts";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import type { Hands } from "@/lib/table/game-api";
import { concealed, mayControl, unseen } from "@/lib/table/game-logic";
import type { PanelCtx } from "./action-panels";
import { SIDE_HEX, SIDE_TEXT } from "./colors";

const sel = "h-8 px-2 text-xs";
const mini = "h-6 px-2 text-xs";
type Names = (side: Side) => string;

/** Stratagems: what is in effect for this side, and – in its Strategic Phase – the Leader's list to declare from. */
function StratagemBox({ c, side, sideName }: { c: PanelCtx; side: Side; sideName: Names }) {
  const st = c.st;
  const t = c.t;
  if (st.phase !== "playing") return null;
  const live = (st.strats ?? []).filter((x) => x.seat === side);
  const { leader, why } = stratagemLeader(st, side);
  const names = leader ? profileOf(leader).stratagems : [];
  const open = mayControl(c.viewer, side) && st.active === side && !st.activation && !st.acted && names.length > 0;
  if (live.length === 0 && !open) return null;
  const used = st.stratUsed ?? [];
  const row = (name: string) => {
    const sg = stratagemFor(leader!.profileId ?? undefined, name);
    if (!sg) return null;
    const pool = st.models.filter((m) => stratagemFits(st, leader!, sg, m));
    const picks = (c.ui.strat[name] ?? []).filter((id) => pool.some((m) => m.id === id));
    const max = sg.max ?? 1;
    const choose = sg.who === "pick";
    const setPick = (i: number, id: string) => c.patch((u) => {
      const next = [...picks];
      if (id) next[i] = id;
      else next.splice(i, 1);
      return { ...u, strat: { ...u.strat, [name]: [...new Set(next)] } };
    });
    const charms = sg.enchant ? spellsOf(profileOf(leader!)).filter((x) => x.kind === "Enchantment") : [];
    const spell = sg.enchant ? (charms.find((x) => x.name === c.ui.stratSpell[name]) ?? charms[0]) : undefined;
    const blocked = why || (used.includes(name) ? t("stratDeclared") : "") || (sg.enchant && !spell ? t("stratNoEnchant") : "");
    const reach = sg.who === "party" || sg.who === "enemies" ? t("stratModels", { n: pool.length }) : sg.who === "self" ? t("stratLeader") : "";
    return (
      <div key={name} className={`grid gap-1 rounded-md border bg-background p-2 text-xs ${used.includes(name) ? "opacity-60" : ""}`}>
        <p><b>{name}</b> <span className="text-muted-foreground">{sg.kind}{sg.byHand ? ` · ${t("byHand")}` : ""}{reach ? ` · ${reach}` : ""}</span></p>
        <p>{sg.text}</p>
        {choose && Array.from({ length: Math.min(max, picks.length + 1) }, (_, i) => (
          <NativeSelect key={i} className={sel} aria-label={`${name}: ${i + 1}`} value={picks[i] ?? ""} onChange={(e) => setPick(i, e.target.value)}>
            <option value="">{i === 0 ? (pool.length ? t("choose") : t("stratNobody")) : t("andOn")}</option>
            {pool.filter((m) => m.id === picks[i] || !picks.includes(m.id)).map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.states.includes("Dead") ? " (Dead)" : m.states.includes("Incapacitated") ? " (Incapacitated)" : ""}</option>
            ))}
          </NativeSelect>
        ))}
        {sg.enchant && charms.length > 0 && (
          <NativeSelect className={sel} aria-label={`${name}: Enchantment`} value={spell?.name ?? ""} onChange={(e) => c.patch((u) => ({ ...u, stratSpell: { ...u.stratSpell, [name]: e.target.value } }))}>
            {charms.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
          </NativeSelect>
        )}
        <Button type="button" size="sm" className={`${mini} justify-self-start`} disabled={!!blocked || (choose && picks.length === 0)} title={blocked || undefined}
          onClick={() => {
            c.send({ type: "STRATAGEM", side, name, ...(choose ? { targets: picks } : {}), ...(spell ? { spell: spell.name } : {}) });
            c.patch((u) => { const strat = { ...u.strat }; delete strat[name]; return { ...u, strat }; });
          }}>{used.includes(name) ? t("stratDeclaredShort") : t("stratDeclare")}</Button>
      </div>
    );
  };
  return (
    <div className="grid gap-1.5">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stratagems</h4>
      {live.map((x, i) => (
        <p key={i} className="text-xs" title={x.text}>
          <strong>✪ {x.name}</strong>
          <span className="text-muted-foreground"> {t("untilStrategic", { name: sideName(side) })}{x.on.length ? ` · ${t("stratModels", { n: x.on.length })}` : ""}</span>
        </p>
      ))}
      {open && why && <p className="text-xs text-amber-400">{why}</p>}
      {open && !why && <p className="text-xs text-muted-foreground">{t("stratPhase", { name: leader!.name, two: profileOf(leader!).traits.includes("Strategist") ? "yes" : "no" })}</p>}
      {open && !why && names.map(row)}
    </div>
  );
}

/** Both parties: who is on the table, how they are doing, and a click to select. */
export function Roster({ c, selected, onSelect, sideName }: { c: PanelCtx; selected: string | null; onSelect: (id: string) => void; sideName: Names }) {
  const st = c.st;
  const t = c.t;
  return (
    <>
      {([0, 1] as const).map((side) => {
        const models = st.models.filter((m) => m.side === side && !unseen(st, c.viewer, m));
        const waiting = models.filter((m) => onShelf(st, m) !== null).length;
        const points = models.reduce((sum, m) => sum + profileOf(m).cost + upgradesCost(profileById(m.profileId) ?? profileOf(m), m.upgrades ?? []), 0);
        return (
          <section key={side} className="grid gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: SIDE_HEX[side] }} />
              <span className="font-bold">{sideName(side)}</span>
              {models.length > 0 && <span className="truncate text-xs text-muted-foreground">{st.factions[side] ?? models[0]!.faction} · {points} pts</span>}
            </div>
            {models.length === 0 && <span className="text-xs text-muted-foreground">{t("noFigures")}</span>}
            {st.phase === "setup" && waiting > 0 && mayControl(c.viewer, side) && <p className="text-xs text-muted-foreground">{t("onShelf", { n: waiting })}</p>}
            <StratagemBox c={c} side={side} sideName={sideName} />
            {models.map((m) => {
              if (concealed(c.viewer, m)) {
                return (
                  <button key={m.id} type="button" onClick={() => onSelect(m.id)} aria-pressed={m.id === selected}
                    className={`rounded-md border px-2 py-1.5 text-left hover:border-primary ${m.id === selected ? "border-primary bg-accent" : "bg-background"}`}>❓ {t("shroudedToken")}</button>
                );
              }
              const out = m.states.includes("Dead") || m.states.includes("Incapacitated");
              const marks = m.states.filter((x) => x !== "Dead");
              const tag = st.activation?.id === m.id ? t("tagActive") : m.leader ? t("tagLeader") : null;
              return (
                <button key={m.id} type="button" onClick={() => onSelect(m.id)} aria-pressed={m.id === selected}
                  className={`grid gap-0.5 rounded-md border px-2 py-1.5 text-left hover:border-primary ${m.id === selected ? "border-primary bg-accent" : "bg-background"} ${out ? "opacity-55" : ""} ${st.activation?.id === m.id ? "ring-1 ring-primary" : ""}`}>
                  <span className="flex justify-between gap-2">
                    <span className="truncate font-semibold">{m.name}</span>
                    {tag && <span className="shrink-0 text-xs text-primary">{tag}</span>}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">{m.states.includes("Dead") ? "✝" : `HP ${m.hp}/${m.maxHp}`}</span>
                    {st.phase === "playing" && <span className="tabular-nums">AP {m.ap}</span>}
                    {marks.length > 0 && <span className="text-amber-400">{marks.join(", ")}</span>}
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

/** One player's Scheme: drawing, keeping one in secret, revealing it. */
function SchemeBlock({ c, side, hands, sideName }: { c: PanelCtx; side: Side; hands: Hands; sideName: Names }) {
  const st = c.st;
  const t = c.t;
  const seat = st.schemes[side];
  const hand = hands[side];
  const mine = mayControl(c.viewer, side);
  const who = <strong style={{ color: SIDE_TEXT[side] }}>{sideName(side)}</strong>;
  const card = (code: string, extra?: React.ReactNode) => {
    const sc = schemeByCode(code);
    return (
      <div key={code} className="grid gap-1 rounded-md border bg-background p-2 text-xs">
        <b>{sc?.name ?? code}{sc ? ` · ${sc.maxVp} VP` : ""}</b>
        <span>{sc?.text ?? ""}</span>
        {extra}
      </div>
    );
  };
  if (seat.revealed) return <div className="grid gap-1 text-xs"><p>{who} – {t("schemeRevealed")}</p>{card(seat.revealed)}</div>;
  if (hand?.kept) {
    return (
      <div className="grid gap-1 text-xs">
        <p>{who} <span className="text-muted-foreground">– {t("schemeHidden")}</span></p>
        {card(hand.kept, mine && <Button type="button" size="sm" variant="outline" className={`${mini} justify-self-start`} onClick={() => c.send({ type: "REVEAL_SCHEME", side })}>{t("schemeReveal")}</Button>)}
      </div>
    );
  }
  if (hand && hand.options.length > 0) {
    return (
      <div className="grid gap-1 text-xs">
        <p>{who} <span className="text-muted-foreground">– {t("schemeKeepOne")}</span></p>
        {hand.options.map((code) => card(code, mine && <Button type="button" size="sm" className={`${mini} justify-self-start`} onClick={() => c.send({ type: "KEEP_SCHEME", code, side })}>{t("schemeKeep")}</Button>))}
      </div>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs">
      {who}
      <span className="text-muted-foreground">{seat.kept ? t("schemeChosen") : seat.drawn > 0 ? t("schemeChoosing", { n: seat.drawn }) : t("schemeNone")}</span>
      {mine && seat.drawn === 0 && st.phase === "setup" && <Button type="button" size="sm" className={mini} onClick={() => c.send({ type: "DRAW_SCHEMES", side })}>{t("schemeDraw")}</Button>}
    </p>
  );
}

export function SchemesBox({ c, hands, sideName }: { c: PanelCtx; hands: Hands; sideName: Names }) {
  return (
    <section className="grid gap-2 rounded-xl border bg-card p-3">
      <h3 className="font-display text-base">Schemes</h3>
      <SchemeBlock c={c} side={0} hands={hands} sideName={sideName} />
      <SchemeBlock c={c} side={1} hands={hands} sideName={sideName} />
    </section>
  );
}

/** What the engine itself runs of the Quest: scoring lines, what stands at the objective, tokens, Broken Morale. */
export function EngineQuestBox({ c, sideName }: { c: PanelCtx; sideName: Names }) {
  const st = c.st;
  const t = c.t;
  const quest = questByCode(st.quest);
  const broken = ([0, 1] as const).filter((x) => st.broken[x]);
  if (!quest) return broken.length ? <p className="text-xs text-amber-400">Broken Morale: {broken.map(sideName).join(", ")}</p> : null;
  const obelisk = st.markers.find((k) => k.id === "obelisk");
  const near = obelisk
    ? ([0, 1] as const).map((side) => st.models.filter((m) => m.side === side && !m.states.includes("Dead") && !m.states.includes("Incapacitated")
      && Math.hypot(m.x - obelisk.x, m.y - obelisk.y) - baseRadius(m.size) - MARKER_RADIUS <= obelisk.radius + 0.06))
    : null;
  const carried = st.models.filter((m) => m.treasure);
  const tokens = st.markers.filter((k) => k.kind && k.kind !== "token").map((k) => k.name);
  return (
    <section className="grid gap-2 rounded-xl border bg-card p-3 text-xs">
      <h3 className="font-display text-base">{t("questAuto", { name: quest.name })}</h3>
      <ul className="grid list-disc gap-1 pl-4">{quest.scoring.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <ul className="grid list-disc gap-1 pl-4 text-muted-foreground">{quest.rules.map((x, i) => <li key={i}>{x}</li>)}</ul>
      {near && (
        <p>{t("atObelisk")}: {([0, 1] as const).map((side) => (
          <span key={side} style={{ color: SIDE_TEXT[side] }}>{side ? " · " : ""}{sideName(side)} {near[side]!.length} ({near[side]!.reduce((sum, m) => sum + (profileById(m.profileId)?.cost ?? 0), 0)} pts)</span>
        ))}</p>
      )}
      {st.quest === "treasure-hunt" && (
        <p>
          {t("tokensOnTable")}: {tokens.join(" · ") || "—"}
          {carried.length > 0 && ` · ${t("carriedBy", { names: carried.map((m) => m.name).join(", ") })}`}
          {st.escaped[0] + st.escaped[1] > 0 && ` · ${t("carriedOff")}: ${sideName(0)} ${st.escaped[0]}, ${sideName(1)} ${st.escaped[1]}`}
        </p>
      )}
      {broken.length > 0 && <p className="text-amber-400">Broken Morale: {broken.map(sideName).join(", ")}</p>}
    </section>
  );
}
