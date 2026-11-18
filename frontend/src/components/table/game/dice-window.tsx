"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dices, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DiceResult } from "@/lib/eld/types.ts";
import { SIDE_HEX } from "./colors";

// The dice window: what is rolled and for what, how many dice, the number to roll (this or lower), a Roll
// button, and the dice tumbling to the result the server rolled. Both players see the same window.

/** An Action being put together: Roll declares it. */
export type ComposeSpec = {
  title: string;
  sub: string;
  dice: number;
  target: number;
  attr: string;
  notes: string[];
  /** No − / + (a roll whose dice and number are fixed by the rules). */
  fixed?: boolean;
  onDice?: (delta: number) => void;
  onTarget?: (delta: number) => void;
  onRoll: () => void;
  onCancel: () => void;
};

export type PendingRow = {
  who: string;
  what: string;
  dice: number;
  target: number | null;
  side: 0 | 1;
  ready: boolean;
  /** The viewer may still change this roll: more or fewer dice, a higher or lower number. */
  adjust?: (what: "dice" | "target", delta: number) => void;
};

/** A declared Action that waits for the dice of both sides. */
export type PendingSpec = {
  title: string;
  rows: PendingRow[];
  canRoll: boolean;
  canCancel: boolean;
  onRoll: () => void;
  onCancel: () => void;
};

export type ResultRow = { text: string; dice: DiceResult };

/** Rolls the server made. `id` changes with every new batch; rows added to a batch animate from `fresh`. */
export type ResultsSpec = { id: number; rows: ResultRow[]; fresh: number };

const STEP_KEY = "wb.dice.step";

function readAllAtOnce(): boolean {
  try {
    return localStorage.getItem(STEP_KEY) !== "1";
  } catch {
    return true;
  }
}

const isCrit = (d: number, target: number | null): boolean => target !== 0 && (d === 1 || (target !== null && target > 20 && d === 20));
type Verdict = "crit" | "plain" | "hit" | "miss" | "idle" | "rolling";
const verdict = (d: number, target: number | null): Verdict => (isCrit(d, target) ? "crit" : target === null ? "plain" : d <= target ? "hit" : "miss");

const FACE: Record<Verdict, string> = {
  crit: "bg-amber-400 text-black",
  hit: "bg-emerald-500 text-black",
  miss: "bg-zinc-600 text-zinc-200",
  plain: "bg-sky-300 text-black",
  idle: "bg-transparent text-muted-foreground",
  rolling: "bg-zinc-300 text-black",
};

const HEX = "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)";

/** One d20: blank, tumbling for `delay` ms, or lying on its number. */
function Die({ value, target, delay, side }: { value?: number; target?: number | null; delay?: number; side?: 0 | 1 }) {
  const [face, setFace] = useState<number | null>(delay ? null : (value ?? null));
  const [landed, setLanded] = useState(!delay);
  useEffect(() => {
    if (!delay || value === undefined) return;
    const spin = window.setInterval(() => setFace(1 + Math.floor(Math.random() * 20)), 70);
    const land = window.setTimeout(() => {
      window.clearInterval(spin);
      setFace(value);
      setLanded(true);
    }, delay);
    return () => {
      window.clearInterval(spin);
      window.clearTimeout(land);
    };
  }, [delay, value]);
  const kind: Verdict = value === undefined ? "idle" : landed ? verdict(value, target ?? null) : "rolling";
  return (
    <span className="relative inline-flex size-9 items-center justify-center" title={kind === "crit" ? "Critical" : undefined}>
      <span className={`absolute inset-0 ${kind === "idle" ? "bg-border" : FACE[kind]} ${kind === "rolling" ? "animate-pulse" : ""}`}
        style={{ clipPath: HEX, ...(kind === "idle" && side !== undefined ? { background: SIDE_HEX[side], opacity: 0.55 } : {}) }} />
      <b className={`relative text-sm tabular-nums ${kind === "idle" ? "text-foreground/70" : FACE[kind].split(" ")[1]}`}>
        {value === undefined ? "20" : (face ?? "?")}
      </b>
    </span>
  );
}

function Stepper({ label, onStep }: { label: string; onStep: (d: number) => void }) {
  return (
    <span className="inline-flex gap-1">
      <Button type="button" size="icon" variant="outline" className="size-7" aria-label={`− ${label}`} onClick={() => onStep(-1)}><Minus aria-hidden /></Button>
      <Button type="button" size="icon" variant="outline" className="size-7" aria-label={`+ ${label}`} onClick={() => onStep(1)}><Plus aria-hidden /></Button>
    </span>
  );
}

/** A line of the log without its outcome ("… – 1 Wound"), for a roll that has not been made yet. */
const withoutOutcome = (text: string): string => (text.includes(" – ") ? text.slice(0, text.lastIndexOf(" – ")) : text);

function ModeBox({ allAtOnce, onChange }: { allAtOnce: boolean; onChange: (on: boolean) => void }) {
  const t = useTranslations("gameTable.dice");
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground" title={t("allAtOnceHint")}>
      <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={allAtOnce} onChange={(e) => onChange(e.target.checked)} />
      {t("allAtOnce")}
    </label>
  );
}

function Results({ spec, allAtOnce, setAllAtOnce, onDone, onClose }: {
  spec: ResultsSpec; allAtOnce: boolean; setAllAtOnce: (on: boolean) => void; onDone: (id: number) => void; onClose: () => void;
}) {
  const t = useTranslations("gameTable.dice");
  // Step by step: how many rows have been rolled so far.
  const [revealed, setRevealed] = useState(0);
  const [hover, setHover] = useState(false);
  const upTo = allAtOnce ? spec.rows.length : revealed;
  const done = useRef(onDone);
  const close = useRef(onClose);
  useEffect(() => {
    done.current = onDone;
    close.current = onClose;
  });
  const all = upTo >= spec.rows.length;
  // Everything is rolled: the outcome may follow as soon as the last die has landed.
  useEffect(() => {
    if (!all) return;
    const fresh = Math.max(0, spec.rows.length - spec.fresh);
    const timer = window.setTimeout(() => done.current(spec.id), fresh > 0 ? 650 + 350 * (fresh - 1) + 450 : 0);
    return () => window.clearTimeout(timer);
  }, [all, spec.id, spec.rows.length, spec.fresh]);
  useEffect(() => {
    if (!all || hover) return;
    const timer = window.setTimeout(() => close.current(), 9000 + 350 * spec.rows.length);
    return () => window.clearTimeout(timer);
  }, [all, hover, spec.id, spec.rows.length]);

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="grid gap-3">
      <div className="flex items-center gap-2">
        <Dices className="size-4 text-primary" aria-hidden />
        <span className="font-display text-base font-bold">{t("title")}</span>
        <Button type="button" size="icon" variant="ghost" className="ml-auto size-7" aria-label={t("close")} onClick={onClose}><X aria-hidden /></Button>
      </div>
      <div className="grid max-h-[50vh] gap-2 overflow-auto">
        {spec.rows.map((r, i) => {
          // Rolls further down the list would give away how the earlier ones went (a Damage roll means a Hit).
          if (i > upTo) return null;
          if (i === upTo) {
            return (
              <div key={i} className="grid gap-1 rounded-md border border-primary/60 bg-background p-2">
                <span className="text-xs">{withoutOutcome(r.text)}</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.dice.dice.map((_, k) => <Die key={k} />)}
                  <Button type="button" size="sm" className="ml-auto" onClick={() => setRevealed(i + 1)}>{t("roll")}</Button>
                </div>
              </div>
            );
          }
          // In "all at once" the new rows tumble one after another; step by step each row tumbles when its button is pressed.
          const order = allAtOnce ? i - spec.fresh : 0;
          const animate = allAtOnce ? i >= spec.fresh : true;
          return (
            <div key={i} className="grid gap-1 rounded-md border bg-background p-2">
              <span className="text-xs">{r.text}</span>
              <div className="flex flex-wrap gap-1.5">
                {r.dice.dice.map((d, k) => <Die key={`v${k}`} value={d} target={r.dice.target} delay={animate ? 650 + 350 * Math.max(0, order) : 0} />)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <ModeBox allAtOnce={allAtOnce} onChange={(on) => { setAllAtOnce(on); if (on) setRevealed(spec.rows.length); }} />
        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={onClose}>{t("close")}</Button>
      </div>
    </div>
  );
}

/**
 * One window, three uses: results of rolls (they come first), a declared Action waiting for both sides' dice,
 * and an Action being put together.
 */
export function DiceWindow({ compose, pending, results, onResultsDone, onResultsClose }: {
  compose: ComposeSpec | null;
  pending: PendingSpec | null;
  results: ResultsSpec | null;
  onResultsDone: (id: number) => void;
  onResultsClose: () => void;
}) {
  const t = useTranslations("gameTable.dice");
  const [allAtOnce, setAll] = useState(readAllAtOnce);
  const setAllAtOnce = (on: boolean) => {
    setAll(on);
    try {
      localStorage.setItem(STEP_KEY, on ? "0" : "1");
    } catch {
      /* not remembered */
    }
  };
  if (!compose && !pending && !results) return null;
  return (
    <div role="dialog" aria-label={t("title")}
      className="absolute left-1/2 top-3 z-30 w-[min(30rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-xl border border-primary bg-card p-4 text-sm shadow-2xl">
      {results ? (
        <Results key={results.id} spec={results} allAtOnce={allAtOnce} setAllAtOnce={setAllAtOnce} onDone={onResultsDone} onClose={onResultsClose} />
      ) : pending ? (
        <div className="grid gap-3">
          <span className="font-display text-base font-bold">{pending.title}</span>
          {pending.rows.map((r, i) => (
            <div key={i} className="grid gap-1.5 rounded-md border bg-background p-2" style={{ borderLeftColor: SIDE_HEX[r.side], borderLeftWidth: 3 }}>
              <span className="text-xs"><strong>{r.who}</strong> – {r.what}{r.target !== null ? ` · ${t("orLower", { n: r.target })}` : ""}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {Array.from({ length: Math.max(1, Math.min(r.dice, 12)) }, (_, k) => <Die key={k} side={r.side} />)}
                <span className={`ml-auto text-xs ${r.ready ? "text-emerald-400" : "text-amber-400"}`}>{r.ready ? t("ready") : t("waiting")}</span>
              </div>
              {r.adjust && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {t("diceCount")} <Stepper label={t("diceCount")} onStep={(d) => r.adjust!("dice", d)} />
                  {t("number")} <Stepper label={t("number")} onStep={(d) => r.adjust!("target", d)} />
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            {pending.canRoll
              ? <Button type="button" onClick={pending.onRoll}><Dices aria-hidden /> {t("roll")}</Button>
              : <span className="text-xs text-muted-foreground">{t("waitingOther")}</span>}
            {pending.canCancel && <Button type="button" variant="outline" onClick={pending.onCancel}>{t("callBack")}</Button>}
          </div>
        </div>
      ) : compose ? (
        <div className="grid gap-3 text-center">
          <div className="grid gap-0.5">
            <span className="font-display text-base font-bold">{compose.title}</span>
            <span className="text-xs text-muted-foreground">{compose.sub}</span>
          </div>
          <div className="grid justify-items-center gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("rollOrLower", { attr: compose.attr })}</span>
            <div className="flex items-center gap-3">
              {!compose.fixed && compose.onTarget && <Stepper label={t("number")} onStep={compose.onTarget} />}
              <strong className="font-display text-4xl tabular-nums">{compose.target}</strong>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: Math.max(1, Math.min(compose.dice, 12)) }, (_, k) => <Die key={k} />)}
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
            {!compose.fixed && compose.onDice && <Stepper label={t("diceCount")} onStep={compose.onDice} />}
            <span>{t("dice", { n: compose.dice })}</span>
          </div>
          {compose.notes.length > 0 && <p className="text-xs text-muted-foreground">{compose.notes.join(" · ")}</p>}
          <div className="flex justify-center gap-2">
            <Button type="button" onClick={compose.onRoll}><Dices aria-hidden /> {t("roll")}</Button>
            <Button type="button" variant="outline" onClick={compose.onCancel}>{t("cancel")}</Button>
          </div>
          <div className="flex justify-center"><ModeBox allAtOnce={allAtOnce} onChange={setAllAtOnce} /></div>
        </div>
      ) : null}
    </div>
  );
}

/** The dice of one roll as small chips (log, last roll). */
export function DiceChips({ dice }: { dice: DiceResult }) {
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {dice.dice.map((d, i) => {
        const v = verdict(d, dice.target);
        return <span key={i} className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-bold tabular-nums ${FACE[v]}`}>{d}</span>;
      })}
    </span>
  );
}
