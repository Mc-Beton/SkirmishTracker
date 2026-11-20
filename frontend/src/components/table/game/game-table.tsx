"use client";

// The panel of a table that plays by the game engine (frontend/src/lib/eld): the same 2D look as the first
// online table, with the mechanics of the game – activation, movement by dragging, Reactions, Actions with
// the dice window, Stratagems, Spells, Schemes. The server decides and rolls; this page shows and asks.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Box, Dices, Eye, Flag, Hand, Layers, MapPin, Minus, MousePointer2, Plus, Ruler, Send, SquareDashed, Target, Trash2, Undo2, UserPlus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { QuestView } from "@/components/game/quest-view";
import { TableSharing } from "@/components/table/table-sharing";
import { api, ApiError } from "@/lib/api";
import { useGameContent } from "@/lib/content";
import { AOE_POINT, areaOf, attackOptions, fallRolls, planAttack, weaponAt } from "@/lib/eld/combat.ts";
import { checkMove, leaderMorale, moveRolls, summonSpotProblem, ZONES } from "@/lib/eld/engine.ts";
import { baseRadius, normDeg } from "@/lib/eld/geometry.ts";
import { profileById } from "@/lib/eld/profiles.ts";
import { questByCode } from "@/lib/eld/quests.ts";
import { modelStats } from "@/lib/eld/stats.ts";
import { MAX_ROUNDS, type Command, type GameEvent, type Model, type Side, type TableState } from "@/lib/eld/types.ts";
import {
  attackSetup, canRetreat, concealed, initialUi, masked, mayControl, preparedTemplate, previewMove, rangeRings, readMods, sightLines,
  templateShape, withNames, type TemplateShape, type Ui, type Viewer,
} from "@/lib/table/game-logic";
import { useGame } from "@/lib/table/use-game";
import { keepView3dSettings, presetOf, readView3dSettings, VIEW3D_PRESETS, type View3dSettings } from "@/lib/table/view3d-settings";
import type { Aim, PanelCtx, RollGate } from "./action-panels";
import { SIDE_TEXT } from "./colors";
import { DiceChips, DiceWindow, type ComposeSpec, type PendingRow, type PendingSpec, type ResultRow, type ResultsSpec } from "./dice-window";
import { GameBoard, type BoardMode, type GameBoardProps } from "./game-board";
import { ModelCard } from "./model-card";
import { EngineQuestBox, Roster, SchemesBox } from "./side-panels";

// The 3D board brings three.js: loaded only when a 3D table is opened, never on the server.
const GameBoard3D = dynamic(() => import("./game-board-3d").then((m) => m.GameBoard3D), { ssr: false, loading: () => <Board3dLoading /> });

/** While the 3D code itself is on its way (before the scene can show its own progress bar). */
function Board3dLoading() {
  const t = useTranslations("table.view3d");
  return <p role="status" className="m-auto animate-pulse rounded-lg border bg-card px-4 py-3 text-sm">{t("loading")}</p>;
}

type T = (key: string, values?: Record<string, string | number>) => string;
type Tool = "select" | "measure" | "token";
type RightTab = "model" | "quest" | "log" | "share";

const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
/** Rolls of the game itself that tumble in the dice window for both players. */
const ROLLED = ["ACTION_RESOLVED", "EFFECT", "TAUNTED", "MODEL_REACTED", "MODEL_MOVED", "MODEL_ACTIVATED", "STRATEGIC", "GAME_STARTED"];
/** How long an announcement (the game begins, whose turn it is) stays on the table. */
const BANNER_MS = 3200;
/** What is announced across the table. */
type Banner = { kind: "start" } | { kind: "turn"; side: Side; round: number; first: boolean };
const FRESH_MS = 15000;
const ZONE_R = 120 / 25.4 / 2;

export function GameTable({ tableId }: { tableId: string }) {
  const t = useTranslations("gameTable") as unknown as T;
  const tt = useTranslations("table");
  const errorMessage = useErrorMessage();
  const content = useGameContent();

  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [aim, setAimState] = useState<Aim>(null);
  const [aimShape, setAimShape] = useState<TemplateShape | null>(null);
  const [freeMove, setFreeMove] = useState(false);
  const [showLos, setShowLos] = useState(false);
  const [showAwareness, setShowAwareness] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [showTerrain, setShowTerrain] = useState(false);
  // A 3D table can be looked at in 3D or from above in 2D: every player picks for themselves, per table and
  // browser. null: not picked yet (asked when the table opens). A 2D table has no choice.
  const [view, setView] = useState<"2D" | "3D" | null>(() => {
    try {
      const kept = typeof window === "undefined" ? null : window.localStorage.getItem(`wb.table.view.${tableId}`);
      return kept === "2D" || kept === "3D" ? kept : null;
    } catch {
      return null;
    }
  });
  // How the 3D picture is drawn (models, shadows, surroundings): asked with the view, kept when the player says so.
  const [settings, setSettings] = useState<View3dSettings>(() => readView3dSettings() ?? VIEW3D_PRESETS.medium);
  const [remember, setRemember] = useState(() => readView3dSettings() !== null);
  const [configuring, setConfiguring] = useState(false);
  const chooseView = (v: "2D" | "3D") => {
    setConfiguring(false);
    if (v === "3D") keepView3dSettings(remember ? settings : null);
    setView(v);
    try {
      window.localStorage.setItem(`wb.table.view.${tableId}`, v);
    } catch {
      // private mode: asked again next time
    }
  };
  const [ui, setUi] = useState<Ui>(initialUi);
  const [rightTab, setRightTab] = useState<RightTab>("model");
  const [results, setResults] = useState<ResultsSpec | null>(null);
  const [gateSpec, setGateSpec] = useState<ComposeSpec | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [dice, setDice] = useState({ count: 1, target: "", label: "" });
  const [dmg, setDmg] = useState({ hits: 1, pw: "", arm: "" });
  const [tokenLabel, setTokenLabel] = useState("");
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [confirmConcede, setConfirmConcede] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  /** The event that started the game: the turn that follows it is the one the Initiative Check gave. */
  const startedAt = useRef(-1);
  const [reporting, setReporting] = useState(false);

  // ---- the dice come first: an Attack's rolls are shown, and only then does the table take in what they did ----
  const batch = useRef(0);
  const gated = useRef(-1);
  const waiting = useRef<{ id: number; done: () => void } | null>(null);
  const release = useCallback((id?: number) => {
    const w = waiting.current;
    if (!w || (id !== undefined && w.id !== id)) return;
    waiting.current = null;
    w.done();
  }, []);
  const closeResults = useCallback(() => {
    release();
    setResults(null);
  }, [release]);

  const gate = (ev: GameEvent): Promise<void> | null => {
    if ((ev.type !== "ACTION_RESOLVED" && ev.type !== "EFFECT" && ev.type !== "STRATEGIC") || Date.now() - ev.ts >= FRESH_MS) return null;
    // The window is only on the wide layout; a hidden tab would hold the table back for nothing.
    if (document.hidden || !window.matchMedia("(min-width: 1024px)").matches) return null;
    const rows: ResultRow[] = ev.lines.filter((l) => l.dice && l.dice.dice.length > 0).map((l) => ({ text: l.text, dice: l.dice! }));
    if (rows.length === 0) return null;
    release();
    gated.current = ev.seq;
    const id = ++batch.current;
    setGateSpec(null);
    setResults({ id, rows, fresh: 0 });
    return new Promise<void>((done) => {
      waiting.current = { id, done };
    });
  };
  const onEvent = (ev: GameEvent, state: TableState): void => {
    const rolled = state.log.filter((l) => l.seq === ev.seq && l.dice && l.dice.dice.length > 0);
    if (rolled.length > 0 && ev.seq !== gated.current && ROLLED.includes(ev.type) && Date.now() - ev.ts < FRESH_MS) {
      const rows: ResultRow[] = rolled.map((l) => ({ text: l.text, dice: l.dice! }));
      const id = ++batch.current;
      setResults((r) => (r ? { id: r.id, rows: [...r.rows, ...rows], fresh: r.rows.length } : { id, rows, fresh: 0 }));
    }
    if (ev.type === "ROLL_PENDING") closeResults();
    // Announcements: the game begins, whose turn starts.
    if (Date.now() - ev.ts < FRESH_MS) {
      if (ev.type === "INITIATIVE_PENDING") setBanner({ kind: "start" });
      if (ev.type === "GAME_STARTED") startedAt.current = ev.seq;
      if (ev.type === "TURN_STARTED") {
        setConfirmEnd(false);
        setBanner({ kind: "turn", side: ev.active, round: ev.round, first: startedAt.current >= 0 && ev.seq - startedAt.current <= 6 });
      }
    }
    // Follow the action: select whatever was just activated.
    if (ev.type === "MODEL_ACTIVATED") {
      setSelected(ev.id);
      setRightTab("model");
      setUi((u) => ({ ...u, moveHow: "walk", snipe: {}, push: {}, luck: false, mage: false, composing: false }));
    }
  };

  const game = useGame(tableId, { gate, onEvent });
  const engineState = game.state;
  const meta = game.meta;

  const names = useMemo<[string | null, string | null]>(() => {
    const of = (side: number) => meta?.players.find((p) => p.side === side)?.name ?? engineState?.players[side as Side] ?? null;
    return [of(0), of(1)];
  }, [meta, engineState?.players]);
  // A model both sides have carries its side in its name ("Citadel Guard (Red)"): shown with the player's name.
  const st = useMemo<TableState | null>(() => {
    if (!engineState || !engineState.models.some((m) => / \((?:Blue|Red)\)$/.test(m.name))) return engineState;
    const owner = (name: string): string => name.replace(/ \((Blue|Red)\)$/, (_, c: string) => ` (${names[c === "Blue" ? 0 : 1] ?? (c === "Blue" ? "Player 1" : "Player 2")})`);
    return { ...engineState, models: engineState.models.map((m) => ({ ...m, name: owner(m.name) })) };
  }, [engineState, names]);
  const sideName = useCallback((side: Side) => names[side] ?? t("openSeat"), [names, t]);
  const nm = useCallback((text: string) => withNames(text, names), [names]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [banner]);
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const gameSend = game.send;
  const send = useCallback((cmd: Command) => {
    gameSend(cmd).catch((e: unknown) => {
      setFlash(e instanceof ApiError && e.code === "TABLE_RULE" && e.detail ? withNames(e.detail, names) : errorMessage(e));
    });
  }, [gameSend, names, errorMessage]);

  const patch = useCallback((fn: (u: Ui) => Ui) => setUi(fn), []);
  const setAim = useCallback((a: Aim) => {
    setAimState(a);
    setAimShape(null);
    if (a) setTool("select");
  }, []);

  const viewer = useMemo<Viewer>(() => {
    const side: Side = meta?.you === 1 ? 1 : 0;
    return {
      side,
      solo: !!st && st.players[side === 0 ? 1 : 0] === null,
      canAct: !!meta && meta.you >= 0 && meta.role === "PLAYER" && !meta.reportedGameId,
    };
  }, [meta, st]);

  const rollGate = useCallback((o: RollGate, cmd: Command, then?: () => void) => {
    setUi((u) => ({ ...u, composing: false }));
    closeResults();
    setGateSpec({
      ...o, notes: o.notes ?? [], fixed: true,
      onRoll: () => {
        setGateSpec(null);
        send({ ...cmd, hold: true } as Command);
        then?.();
      },
      onCancel: () => setGateSpec(null),
    });
  }, [closeResults, send]);

  const wheelTurn = useRef<{ id: string; facing: number; at: number } | null>(null);
  const turnBy = useCallback((m: Model, degrees: number) => {
    // Several notches may come before the server answers: count on from the last facing asked for.
    const w = wheelTurn.current;
    const from = w && w.id === m.id && Date.now() - w.at < 1500 ? w.facing : m.facing;
    wheelTurn.current = { id: m.id, facing: normDeg(from + degrees), at: Date.now() };
    send({ type: "ROTATE_MODEL", id: m.id, facing: wheelTurn.current.facing });
  }, [send]);

  // ---- keyboard ----
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keys.current = (e) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !st) return;
      const key = e.key.toLowerCase();
      const m = st.models.find((x) => x.id === selected);
      if ((key === "q" || key === "e") && m && mayControl(viewer, m.side)) turnBy(m, key === "q" ? -15 : 15);
      else if (key === "m") {
        setAim(null);
        setTool((x) => (x === "measure" ? "select" : "measure"));
      } else if (key === "f" && viewer.canAct) setFreeMove((x) => !x);
      else if (key === "w") setShowAwareness((x) => !x);
      else if (key === "l") setShowLos((x) => !x);
      else if (key === "escape") {
        if (aim) setAim(null);
        else if (tool !== "select") setTool("select");
        else if (gateSpec) setGateSpec(null);
        else if (ui.composing) setUi((u) => ({ ...u, composing: false }));
        else setSelected(null);
      }
    };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  if (game.error && (!st || !meta)) {
    return (
      <div className="mx-auto grid max-w-md gap-3 p-6">
        <Alert variant="destructive">{errorMessage(game.error)}</Alert>
        <Button asChild variant="outline"><Link href="/tables">{tt("hud.back")}</Link></Button>
      </div>
    );
  }
  if (!st || !meta) return <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>;

  const shown = masked(st, viewer);
  const current = st.models.find((m) => m.id === selected);
  const a = st.activation;
  const activated = a ? st.models.find((m) => m.id === a.id) : undefined;
  const myTurn = mayControl(viewer, st.active);
  const setup = st.phase === "setup";
  const playing = st.phase === "playing";
  const finished = st.phase === "finished";
  const waitingSeat = meta.status === "WAITING";
  const engineQuest = questByCode(st.quest);
  const wbQuest = content?.quests.find((q) => q.code === meta.questCode) ?? null;

  const c: PanelCtx = { st, viewer, ui, patch, send, rollGate, aim, setAim, t };

  // ---- the Attack being put together: the dice window before it is declared ----
  let compose: ComposeSpec | null = gateSpec;
  if (!compose && ui.composing && activated && current?.id === activated.id && a && a.action === null && !a.pending && mayControl(viewer, activated.side)) {
    const s = attackSetup(st, ui, activated);
    const { plan, targetId, item, wi } = s;
    if (plan?.ok && targetId && item) {
      const bump = (key: "hit" | "stk", d: number) => setUi((u) => ({ ...u, mods: { ...u.mods, [key]: Math.max(-20, Math.min(20, u.mods[key] + d)) } }));
      const victim = targetId === AOE_POINT ? t("spotOnTable") : (st.models.find((o) => o.id === targetId)?.name ?? "?");
      compose = {
        title: `${activated.name} → ${victim}`,
        sub: `${item.name} · Power ${plan.pw}`,
        dice: plan.stk,
        target: plan.attr,
        attr: plan.attrName,
        notes: plan.notes,
        onDice: (d) => bump("stk", d),
        onTarget: (d) => bump("hit", d),
        onRoll: () => {
          const mods = readMods(st, ui, activated, wi);
          const split = Object.entries(s.picks).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n }));
          if (targetId === AOE_POINT && s.spot) send({ type: "ACTION", hold: true, action: "attack", weapon: wi, at: s.spot, mods });
          else send({ type: "ACTION", hold: true, action: "attack", weapon: wi, target: targetId, mods, ...(s.canSplit && split.length ? { split } : {}) });
          setUi((u) => {
            const next = { ...u.split };
            delete next[activated.id];
            return { ...u, composing: false, split: next, mods: { hit: 0, stk: 0, pw: 0 } };
          });
        },
        onCancel: () => setUi((u) => ({ ...u, composing: false })),
      };
    }
  }

  // ---- a declared Action that waits for dice: both players see who still has to roll ----
  let pending: PendingSpec | null = null;
  if (a?.roll && activated) {
    const r = a.roll;
    const cmd = r.cmd.type === "ACTION" ? r.cmd : null;
    const target = cmd?.target ? st.models.find((o) => o.id === cmd.target) : undefined;
    const mine = cmd && cmd.action === "attack" && target
      ? planAttack(st, activated, target, cmd.weapon ?? 0, { hit: 0, stk: 0, pw: 0, ...(cmd.mods ?? {}) }, { reactive: false, idle: a.moved === 0 }) : null;
    const rows: PendingRow[] = [
      { who: activated.name, what: mine?.ok ? `Attack: ${mine.weapon?.name ?? "weapon"}` : `Action: ${cmd?.action ?? "?"}`, dice: mine?.ok ? mine.stk : 1, target: mine?.ok ? mine.attr : null, side: activated.side, ready: true },
    ];
    for (const [id, x] of Object.entries(a.reactions)) {
      const o = st.models.find((q) => q.id === id);
      if (!o || x.intent === "other") continue;
      const own = viewer.canAct && r.wait.includes(o.side) && (viewer.solo || viewer.side === o.side);
      const adjust = own
        ? (what: "dice" | "target", d: number) => send({ type: "REACT_MODS", id: o.id, hit: x.mods.hit + (what === "target" ? d : 0), stk: x.mods.stk + (what === "dice" ? d : 0) })
        : undefined;
      if (x.intent === "dodge") {
        rows.push({ who: o.name, what: "Dodge", dice: 1, target: Math.max(0, modelStats(o).ag + x.mods.hit), side: o.side, ready: !r.wait.includes(o.side),
          ...(adjust ? { adjust: (what: "dice" | "target", d: number) => { if (what === "target") adjust(what, d); } } : {}) });
        continue;
      }
      const back = planAttack(st, o, x.at ? { ...activated, x: x.at.x, y: x.at.y } : activated, x.weapon, x.mods, { reactive: true });
      rows.push({ who: o.name, what: `Attack: ${weaponAt(o, x.weapon)?.name ?? "weapon"}`, dice: back.ok ? back.stk : 1, target: back.ok ? back.attr : null, side: o.side,
        ready: !r.wait.includes(o.side), ...(adjust ? { adjust } : {}) });
    }
    pending = {
      title: `${activated.name}${target ? ` → ${target.name}` : ""}`,
      rows,
      canRoll: viewer.canAct && r.wait.some((x) => viewer.solo || viewer.side === x),
      canCancel: mayControl(viewer, r.from),
      onRoll: () => send({ type: "ROLL_DICE" }),
      onCancel: () => send({ type: "CANCEL_ROLL" }),
    };
  }
  // Both players are ready: the game begins with the Initiative Check, each rolls their own die.
  if (!pending && st.initiative) {
    const ini = st.initiative;
    pending = {
      title: `${t("gameBegins")} – ${t("initiativeCheck")}`,
      rows: ([0, 1] as const).map((s) => ({ who: sideName(s), what: t("initiativeRoll", { m: leaderMorale(st, s) }), dice: 1, target: null, side: s, ready: ini.rolls[s] !== null })),
      canRoll: viewer.canAct && (viewer.solo ? ini.rolls.includes(null) : ini.rolls[viewer.side] === null),
      canCancel: false,
      onRoll: () => send({ type: "ROLL_INITIATIVE" }),
      onCancel: () => undefined,
    };
  }
  // The turn has ended: the dice of the next player's Strategic Phase wait for that player.
  if (!pending && st.pendingTurn) {
    const p = st.pendingTurn;
    pending = {
      title: t("strategicOf", { name: sideName(p.side) }),
      rows: p.rolls.map((r) => ({ who: nm(r.who), what: r.what, dice: 1, target: r.target, side: p.side, ready: false })),
      canRoll: viewer.canAct && (viewer.solo || viewer.side === p.side),
      canCancel: false,
      onRoll: () => send({ type: "ROLL_STRATEGIC" }),
      onCancel: () => undefined,
    };
  }
  // AP the Active Player has not used: ending the turn asks first.
  const unusedAp = st.models.filter((m) => m.side === st.active && !m.states.includes("Dead") && !m.states.includes("Incapacitated")).reduce((n, m) => n + m.ap, 0);
  const endTurn = () => (unusedAp > 0 ? setConfirmEnd(true) : send({ type: "END_TURN" }));
  // Whose roll a line is. Most lines start with the model that rolls ("Citadel Guard attacks …", "Helrin: Dodge …");
  // Damage is rolled by the other side ("Damage on Helrin (…)"). Two models of one name on both sides: nobody's.
  const sideOfLine = (text: string): 0 | 1 | undefined => {
    const on = /^(?:Damage|Burn \(\d+\)|Trample) on /.exec(text);
    const rest = on ? text.slice(on[0].length) : text;
    let best = 0;
    const sides = new Set<Side>();
    // The lines carry the engine's names ("… (Red)"), not the ones shown.
    for (const m of engineState?.models ?? []) {
      if (!m.name || !rest.startsWith(m.name) || /[\p{L}\p{N}]/u.test(rest.charAt(m.name.length))) continue;
      if (m.name.length > best) {
        best = m.name.length;
        sides.clear();
      }
      if (m.name.length === best) sides.add(m.side);
    }
    if (sides.size !== 1) return undefined;
    const side = [...sides][0]!;
    return on ? (side === 0 ? 1 : 0) : side;
  };
  const shownResults: ResultsSpec | null = results
    ? { ...results, rows: results.rows.map((r) => { const side = sideOfLine(r.text); return { ...r, text: nm(r.text), ...(side !== undefined ? { side } : {}) }; }) }
    : null;

  // ---- the table ----
  const mode: BoardMode = aim ? "aim" : tool === "measure" ? "measure" : tool === "token" ? "token" : "select";
  const howOf = (id: string): "climb" | "jump" | undefined => (ui.moveHow !== "walk" && a?.id === id && !freeMove ? ui.moveHow : undefined);
  const visibleCurrent = current && !concealed(viewer, current) ? current : undefined;
  const template = aim ? aimShape : preparedTemplate(st, viewer, ui, selected);

  const onAimMove = (x: number, y: number): void => {
    if (!aim) return;
    if (aim.kind === "summon") {
      const caster = st.models.find((o) => o.id === aim.caster);
      const p = profileById(aim.profile);
      if (caster && p) setAimShape({ circle: { at: { x, y }, r: baseRadius(p.size) }, ok: !summonSpotProblem(st, caster, p, { x, y }, aim.start) });
      return;
    }
    if (aim.kind === "zone") {
      const reach = ZONES[aim.spell]?.reach ?? 0;
      setAimShape({ circle: { at: { x, y }, r: ZONE_R }, ok: !!activated && Math.hypot(activated.x - x, activated.y - y) - baseRadius(activated.size) <= reach + 0.005 });
      return;
    }
    if (aim.kind === "push") {
      setAimShape({ circle: { at: { x, y }, r: 0.3 }, ok: true });
      return;
    }
    const wp = activated ? weaponAt(activated, ui.weapon[activated.id] ?? attackOptions(activated)[0]!.index) : undefined;
    const area = wp ? areaOf(wp) : null;
    if (activated && area) setAimShape(templateShape(activated, area, { x, y }, true));
  };
  const onAim = (x: number, y: number): void => {
    if (!aim) return;
    const at = { x, y };
    if (aim.kind === "summon") {
      const caster = st.models.find((o) => o.id === aim.caster);
      const card = profileById(aim.profile);
      // A spot the rules refuse: keep aiming.
      if (caster && card && summonSpotProblem(st, caster, card, at, aim.start)) return;
      if (aim.start) send({ type: "SUMMON", id: aim.caster, spell: aim.spell, at });
      else send({ type: "ACTION", action: "ritual", spell: aim.spell, at });
    } else if (aim.kind === "zone") send({ type: "ACTION", hold: true, action: "cast", spell: aim.spell, at, ...(ui.mage ? { mods: { mage: true } } : {}) });
    else if (aim.kind === "push") {
      if (a) setUi((u) => ({ ...u, push: { ...u.push, [a.id]: at } }));
    } else if (a) setUi((u) => ({ ...u, spot: { ...u.spot, [a.id]: at }, target: { ...u.target, [a.id]: AOE_POINT } }));
    setAim(null);
  };

  const select = (id: string | null): void => {
    setSelected(id);
    if (id !== selected) setUi((u) => (u.composing ? { ...u, composing: false } : u));
    if (id) setRightTab("model");
  };

  const report = async (): Promise<void> => {
    setReporting(true);
    try {
      await api("POST", `/api/tables/${tableId}/report`);
      game.reload();
    } catch (e) {
      setFlash(errorMessage(e));
    } finally {
      setReporting(false);
    }
  };

  // ---- words under the table ----
  const hint = !viewer.canAct ? t("hintWatching")
    : mode === "measure" ? t("hintMeasure")
    : aim ? (aim.kind === "summon" ? t("hintAimSummon") : aim.kind === "push" ? t("hintAimPush") : t("hintAim"))
    : mode === "token" ? t("hintToken")
    : freeMove ? t("hintFree")
    : waitingSeat ? t("hintWaitingSeat")
    : setup ? (([0, 1] as const).some((x) => mayControl(viewer, x) && !st.schemes[x].kept) ? t("hintSetupSchemes") : t("hintSetup"))
    : playing ? (a ? (a.action === null ? (myTurn ? t("hintMove") : t("hintReact")) : t("hintResolved")) : myTurn ? t("hintSelect") : t("hintWaitActive"))
    : t("hintOver");

  let status: React.ReactNode = null;
  if (playing && a && activated) {
    const spd = modelStats(activated).spd;
    const reacting = Object.entries(a.reactions).map(([rid, r]) => `${st.models.find((m) => m.id === rid)?.name ?? "?"} (${r.intent === "other" ? "reaction" : r.intent})`);
    if (a.pending) {
      const ward = st.models.find((m) => m.id === a.pending!.target);
      const mine = mayControl(viewer, st.active === 0 ? 1 : 0);
      status = (
        <span className="flex flex-wrap items-center gap-2">
          <strong>{t("protectorAttack", { a: activated.name, b: ward?.name ?? "?" })}</strong>
          {mine ? (
            <>
              <span>Protector:</span>
              {a.pending.protectors.map((id) => (
                <Button key={id} type="button" size="sm" title={t("protectorHint")} onClick={() => send({ type: "PROTECT", id })}>
                  {t("protectorStep", { name: st.models.find((m) => m.id === id)?.name ?? "?" })}
                </Button>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => send({ type: "PROTECT" })}>{t("protectorNobody")}</Button>
            </>
          ) : <span className="text-muted-foreground">{t("protectorWaiting")}</span>}
        </span>
      );
    } else {
      status = (
        <span>
          <strong>{activated.name}</strong>
          {a.action === null ? ` · ${t("statusMoved", { moved: a.moved.toFixed(1), walk: spd, run: spd * 2 })}` : ` · ${t("statusAction", { action: a.action === "deathblow" ? "Death Blow" : cap(a.action) })}`}
          {canRetreat(st, activated) && ` · Hit and Retreat: ${Math.max(0, spd - (a.retreated ?? 0)).toFixed(1)}″`}
          {reacting.length > 0 && <span className="text-muted-foreground"> · {t("statusReacting")}: {reacting.join(", ")}</span>}
          {a.panic === "flee" && a.action === null && <span className="text-amber-400"> · {t("panicFlee")}</span>}
          {a.panic === "hold" && a.action === null && <span className="text-amber-400"> · {t("panicHold")}</span>}
        </span>
      );
    }
  }

  const rail = (label: string, icon: React.ReactNode, on: boolean, onClick: () => void, disabled = false) => (
    <Button size="icon" variant={on ? "default" : "outline"} className="size-11" title={label} aria-label={label} aria-pressed={on} disabled={disabled} onClick={onClick}>{icon}</Button>
  );
  const tabItems: [RightTab, string][] = [["model", tt("hud.tabModel")], ["quest", tt("hud.tabQuest")], ["log", tt("log")],
    ...(meta.creator && !finished ? [["share", tt("hud.tabShare")] as [RightTab, string]] : [])];
  const iAmReady = meta.you >= 0 && st.ready[viewer.side];
  const lastRoll = [...st.log].reverse().find((l) => l.dice);
  const undoable = !!st.lastMove && mayControl(viewer, st.models.find((o) => o.id === st.lastMove!.id)?.side ?? 0);
  const vpButton = (side: Side, delta: number) => (
    <Button type="button" size="icon" variant="outline" className="size-7" disabled={setup} aria-label={t(delta > 0 ? "vpMore" : "vpLess", { name: sideName(side) })}
      onClick={() => send({ type: "ADD_VP", side, delta })}>{delta > 0 ? <Plus aria-hidden /> : <Minus aria-hidden />}</Button>
  );

  const boardProps: GameBoardProps = {
    st: shown,
    meta: meta,
    viewer: viewer,
    selected: selected,
    selectedToken: selectedToken,
    mode: mode,
    freeMove: freeMove,
    showZones: showZones,
    showTerrain: showTerrain,
    rings: rangeRings(st, visibleCurrent, showAwareness),
    sight: showLos ? sightLines(st, visibleCurrent) : null,
    template: template,
    ariaLabel: tt("boardLabel"),
    shelfLabel: (side) => t("shelfOf", { name: sideName(side) }),
    loadingLabel: (done, total) => tt("mapLoading", { done, total }),
    previewMove: (m, x, y) => previewMove(st, viewer, m, x, y, freeMove, howOf(m.id)),
    onSelect: select,
    onMove: (id, x, y) => {
      const how = howOf(id);
      const cmd: Command = { type: "MOVE_MODEL", id, x, y, ...(freeMove ? { free: true } : {}), ...(how ? { how } : {}) };
      // A Jump that falls short: the Fall Damage rolls go through the dice window.
      const m = st.models.find((o) => o.id === id);
      const check = m ? checkMove(st, viewer, m, { x, y }, freeMove, how) : null;
      const falls = m && how === "jump" && check?.ok && check.fall ? fallRolls(m, check.fall) : 0;
      // Trample and the Quest tokens (the Sigil's die, the Dodges against its Spell) wait for the player as well.
      const extra = m && check?.ok ? moveRolls(st, m, { x, y }, check.mode) : null;
      if (m && falls > 0) rollGate({ title: `${m.name}: Fall Damage`, sub: `${check!.ok && check!.fall ? check!.fall.toFixed(1) : ""}″`, dice: falls, target: modelStats(m).ag, attr: "AG" }, cmd);
      else if (m && extra) rollGate({ title: extra.kind === "trample" ? `${m.name}: Trample` : extra.name, sub: extra.kind === "trample" ? "Dodge" : extra.kind === "intrigue" ? "Sigil" : "Sigil · Dodge", dice: extra.dice, target: extra.target, attr: extra.attr, notes: extra.notes }, cmd);
      else send(cmd);
    },
    onTurn: (id, degrees) => {
      const m = st.models.find((x) => x.id === id);
      if (m) turnBy(m, degrees);
    },
    onAim: onAim,
    onAimMove: onAimMove,
    onTokenSelect: setSelectedToken,
    onTokenPlace: (x, y) => send({ type: "ADD_MARKER", x, y, ...(tokenLabel.trim() ? { name: tokenLabel.trim() } : {}) }),
    onTokenMove: (id, x, y) => send({ type: "MOVE_MARKER", id, x, y }),
  };

  return (
    <>
      <div className="mx-auto grid max-w-md gap-3 p-6 text-center lg:hidden">
        <h1 className="font-display text-xl">{tt("hud.desktopOnlyTitle")}</h1>
        <p className="text-sm text-muted-foreground">{tt("hud.desktopOnly")}</p>
        <Button asChild variant="outline"><Link href="/tables">{tt("hud.back")}</Link></Button>
      </div>
      <div className="fixed inset-0 z-50 hidden flex-col bg-background text-sm lg:flex">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-primary bg-card px-3">
          <Button asChild size="icon" variant="ghost" className="size-9" title={tt("hud.back")} aria-label={tt("hud.back")}>
            <Link href="/tables"><ArrowLeft aria-hidden /></Link>
          </Button>
          <div className="grid min-w-0">
            <span className="truncate font-semibold">{meta.mapName}{wbQuest ? ` · ${wbQuest.name}` : engineQuest ? ` · ${engineQuest.name}` : ""}</span>
            <span className="truncate text-xs text-muted-foreground">{tt(`deploymentKind.${meta.deployment}`)} · {t("engineBadge")}</span>
          </div>
          <div className="flex flex-1 items-center justify-center gap-4">
            {playing ? (
              <span className="flex items-center gap-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">{tt("roundShort")}</span>
                <span className="font-display text-xl font-bold tabular-nums">{st.round}<span className="text-sm text-muted-foreground"> / {MAX_ROUNDS}</span></span>
              </span>
            ) : (
              <Badge variant="outline">{tt(`status.${meta.status}`)}</Badge>
            )}
            <button type="button" title={tt("hud.scoreHint")} onClick={() => setRightTab("quest")}
              className="flex h-10 items-center gap-3 rounded-lg border bg-background px-4 hover:border-primary">
              <span className="font-semibold" style={{ color: SIDE_TEXT[0] }}>{sideName(0)}</span>
              <span className="font-display text-xl font-bold tabular-nums">{st.vp[0]} : {st.vp[1]}</span>
              <span className="font-semibold" style={{ color: SIDE_TEXT[1] }}>{sideName(1)}</span>
            </button>
            {playing && (
              <Badge variant={myTurn && viewer.canAct ? "default" : "secondary"}>
                {viewer.solo || !viewer.canAct ? tt("hud.turnOf", { name: sideName(st.active) }) : myTurn ? tt("yourTurn") : tt("opponentTurn", { name: sideName(st.active) })}
              </Badge>
            )}
            {finished && <Badge>{st.winner === "draw" || st.winner === null ? t("draw") : t("winner", { name: sideName(st.winner) })}</Badge>}
            {meta.role !== "PLAYER" && <Badge variant="secondary">{tt(`role.${meta.role}`)}</Badge>}
          </div>
          {viewer.canAct && playing && (
            <Button size="sm" variant="outline" disabled={!undoable} title={t("undoMoveHint")} onClick={() => send({ type: "UNDO_MOVE" })}>
              <Undo2 aria-hidden /> {t("undoMove")}
            </Button>
          )}
          {meta.creator && !finished && (
            <Button size="sm" variant={rightTab === "share" ? "default" : "outline"} onClick={() => setRightTab("share")}>
              <UserPlus aria-hidden /> {tt("hud.invite")}
            </Button>
          )}
          {viewer.canAct && !finished && !waitingSeat && !viewer.solo && (
            confirmConcede ? (
              <span className="flex gap-1">
                <Button size="sm" variant="destructive" onClick={() => { setConfirmConcede(false); send({ type: "CONCEDE" }); }}><Flag aria-hidden /> {tt("concedeConfirm")}</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmConcede(false)}>{tt("cancel")}</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmConcede(true)}><Flag aria-hidden /> {tt("concede")}</Button>
            )
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-72 shrink-0 flex-col border-r bg-card">
            <div className="grid min-h-0 flex-1 content-start gap-4 overflow-auto p-3">
              <Roster c={c} selected={selected} onSelect={select} sideName={sideName} />
            </div>
          </aside>

          <nav aria-label={tt("hud.tools")} className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r bg-muted/40 py-2.5">
            {rail(tt("hud.toolSelect"), <MousePointer2 aria-hidden />, tool === "select" && !aim, () => { setTool("select"); setAim(null); })}
            {rail(`${tt("los")} (L)`, <Eye aria-hidden />, showLos, () => setShowLos((x) => !x))}
            {rail(`${tt("ruler")} (M)`, <Ruler aria-hidden />, tool === "measure", () => { setAim(null); setTool((x) => (x === "measure" ? "select" : "measure")); })}
            {rail(`${tt("awareness")} (W)`, <Target aria-hidden />, showAwareness, () => setShowAwareness((x) => !x))}
            {viewer.canAct && rail(`${t("freeMove")} (F)`, <Hand aria-hidden />, freeMove, () => setFreeMove((x) => !x))}
            <span className="h-2" />
            {rail(tt("tokens"), <MapPin aria-hidden />, tool === "token", () => { setAim(null); setTool((x) => (x === "token" ? "select" : "token")); setSelectedToken(null); setRightTab("model"); },
              !viewer.canAct || finished)}
            <span className="h-2" />
            {rail(tt("deploymentZones"), <SquareDashed aria-hidden />, showZones, () => setShowZones((x) => !x))}
            {rail(tt("terrainOverlay"), <Layers aria-hidden />, showTerrain, () => setShowTerrain((x) => !x))}
            {meta.viewMode === "3D" && view !== null && (<>
              <span className="h-2" />
              {rail(tt(view === "3D" ? "view3d.to2d" : "view3d.to3d"), <Box aria-hidden />, view === "3D", () => chooseView(view === "3D" ? "2D" : "3D"))}
            </>)}
          </nav>

          <main className="flex min-w-0 flex-1 flex-col gap-2 p-2">
            {(status || flash) && (
              <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-1.5">
                {status}
                {flash && <span role="alert" className="ml-auto text-amber-400">{flash}</span>}
              </div>
            )}
            <div className="relative flex min-h-0 flex-1">
              {meta.viewMode === "3D" && (view === null || configuring) ? (
                <div className="m-auto grid max-h-full w-full max-w-2xl gap-4 overflow-auto rounded-lg border bg-card p-5">
                  <div className="grid gap-1 text-center">
                    <h2 className="font-display text-lg">{tt("view3d.chooseTitle")}</h2>
                    <p className="text-sm text-muted-foreground">{tt("view3d.chooseHelp")}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto_14rem]">
                    <div className="grid content-start gap-3 text-sm">
                      <h3 className="font-medium">{tt("view3d.choice.3D")}</h3>
                      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={tt("view3d.quality")}>
                        {(["low", "medium", "high"] as const).map((p) => (
                          <Button key={p} size="sm" variant={presetOf(settings) === p ? "default" : "outline"} role="radio" aria-checked={presetOf(settings) === p}
                            onClick={() => setSettings(VIEW3D_PRESETS[p])}>{tt(`view3d.preset.${p}`)}</Button>
                        ))}
                      </div>
                      <label className="grid gap-1">{tt("view3d.models")}
                        <NativeSelect value={settings.models} onChange={(e) => setSettings({ ...settings, models: e.target.value === "full" ? "full" : "light" })}>
                          <option value="light">{tt("view3d.modelsLight")}</option>
                          <option value="full">{tt("view3d.modelsFull")}</option>
                        </NativeSelect>
                      </label>
                      <label className="grid gap-1">{tt("view3d.shadows")}
                        <NativeSelect value={settings.shadows} onChange={(e) => setSettings({ ...settings, shadows: e.target.value === "off" ? "off" : e.target.value === "high" ? "high" : "low" })}>
                          <option value="off">{tt("view3d.shadowsOff")}</option>
                          <option value="low">{tt("view3d.shadowsLow")}</option>
                          <option value="high">{tt("view3d.shadowsHigh")}</option>
                        </NativeSelect>
                      </label>
                      {(["sharp", "surroundings", "grass"] as const).map((k) => (
                        <label key={k} className="flex items-start gap-2">
                          <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: e.target.checked })} />
                          <span>{tt(`view3d.option.${k}`)}</span>
                        </label>
                      ))}
                      <label className="flex items-start gap-2 border-t pt-3">
                        <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                        <span>{tt("view3d.remember")}</span>
                      </label>
                      <Button onClick={() => chooseView("3D")}>{tt("view3d.play3d")}</Button>
                    </div>
                    <span className="hidden w-px bg-border sm:block" />
                    <div className="grid content-start gap-3 text-sm">
                      <h3 className="font-medium">{tt("view3d.choice.2D")}</h3>
                      <p className="text-muted-foreground">{tt("view3d.choiceHelp.2D")}</p>
                      <Button variant="outline" onClick={() => chooseView("2D")}>{tt("view3d.play2d")}</Button>
                    </div>
                  </div>
                </div>
              ) : meta.viewMode === "3D" && view === "3D"
                ? <GameBoard3D {...boardProps} settings={settings} onSwitch2d={() => chooseView("2D")} onSettings={() => setConfiguring(true)} />
                : <GameBoard {...boardProps} />}
              <DiceWindow names={[sideName(0), sideName(1)]} compose={compose} pending={pending} results={shownResults} onResultsDone={release} onResultsClose={closeResults} />
              {banner && (
                <div className="pointer-events-none absolute inset-x-0 top-[38%] z-40 flex justify-center px-4" role="status" aria-live="polite">
                  <div className="rounded-2xl border-2 bg-card/95 px-10 py-5 text-center shadow-2xl" style={{ borderColor: banner.kind === "turn" ? SIDE_TEXT[banner.side] : "var(--primary)" }}>
                    <p className="font-display text-3xl font-bold" style={banner.kind === "turn" ? { color: SIDE_TEXT[banner.side] } : undefined}>
                      {banner.kind === "start" ? t("gameBegins") : t("turnOf", { name: sideName(banner.side) })}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {banner.kind === "start" ? t("initiativeHint") : banner.first ? t("wonInitiative", { name: sideName(banner.side) }) : t("roundN", { n: banner.round })}
                    </p>
                  </div>
                </div>
              )}
              {confirmEnd && playing && myTurn && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60 p-4" role="alertdialog" aria-label={t("endTurn")}>
                  <div className="grid max-w-sm gap-3 rounded-xl border border-primary bg-card p-5 text-center text-sm shadow-2xl">
                    <p className="font-display text-lg font-bold">{t("endTurn")}?</p>
                    <p className="text-muted-foreground">{t("endTurnConfirm", { n: unusedAp })}</p>
                    <div className="flex justify-center gap-2">
                      <Button onClick={() => { setConfirmEnd(false); send({ type: "END_TURN" }); }}>{t("yes")}</Button>
                      <Button variant="outline" onClick={() => setConfirmEnd(false)}>{t("no")}</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="mx-auto flex w-full max-w-5xl shrink-0 items-center gap-3">
              <p className="min-w-0 flex-1 text-muted-foreground">{hint}</p>
              {setup && ([0, 1] as const).map((side) => (
                <Badge key={side} variant="outline" style={{ color: SIDE_TEXT[side] }}>{sideName(side)}: {st.ready[side] ? t("ready") : t("deploying")}</Badge>
              ))}
              {setup && viewer.canAct && (
                <Button disabled={waitingSeat || (iAmReady && !viewer.solo)} onClick={() => send({ type: "READY" })}>
                  {viewer.solo ? t("startGame") : iAmReady ? t("readyWaiting") : t("readyButton")}
                </Button>
              )}
              {playing && viewer.canAct && myTurn && a && !a.pending && !a.roll && (
                <Button variant="outline" onClick={() => send({ type: "END_ACTIVATION" })}>{t("endActivation")}</Button>
              )}
              {playing && viewer.canAct && myTurn && !a?.pending && !a?.roll && !st.pendingTurn && <Button onClick={endTurn}>{t("endTurn")}</Button>}
            </div>
          </main>

          <aside className="flex w-[372px] shrink-0 flex-col border-l bg-card">
            <div className="flex shrink-0 border-b" role="tablist">
              {tabItems.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={rightTab === k} onClick={() => setRightTab(k)}
                  className={`h-11 flex-1 border-b-2 px-2 text-sm font-semibold ${rightTab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 content-start gap-3 overflow-auto p-3">
              {rightTab === "model" && (
                <>
                  {tool === "token" && viewer.canAct && (
                    <section className="grid gap-2 rounded-xl border bg-card p-3">
                      <h3 className="font-display text-base">{tt("tokens")}</h3>
                      <Input value={tokenLabel} maxLength={24} placeholder={t("tokenName")} aria-label={t("tokenName")} onChange={(e) => setTokenLabel(e.target.value)} />
                      <p className="text-xs text-muted-foreground">{selectedToken ? t("tokenMoveHelp") : t("tokenHelp")}</p>
                      {selectedToken && (
                        <Button size="sm" variant="outline" onClick={() => { send({ type: "REMOVE_MARKER", id: selectedToken }); setSelectedToken(null); }}>
                          <Trash2 aria-hidden /> {t("tokenRemove")}
                        </Button>
                      )}
                    </section>
                  )}
                  {current ? (
                    <ModelCard c={c} m={current} showLos={showLos} sideName={sideName}
                      fillDice={(count, target, label) => setDice({ count, target: String(target), label: label.slice(0, 60) })}
                      fillPower={(pw) => setDmg((d) => ({ ...d, pw: String(pw) }))}
                      onAttack={() => { closeResults(); setGateSpec(null); setUi((u) => ({ ...u, composing: true })); }} />
                  ) : (
                    <p className="rounded-xl border bg-card p-4 text-muted-foreground">{t("pickFigure")}</p>
                  )}
                </>
              )}
              {rightTab === "quest" && (
                <>
                  <section className="grid gap-2 rounded-xl border bg-card p-3">
                    <h3 className="font-display text-base">{t("victoryPoints")}</h3>
                    {([0, 1] as const).map((side) => (
                      <div key={side} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: SIDE_TEXT[side] }}>{sideName(side)}</span>
                        {viewer.canAct && vpButton(side, -1)}
                        <span className="min-w-8 text-center font-mono text-base tabular-nums">{st.vp[side]}</span>
                        {viewer.canAct && vpButton(side, 1)}
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">{engineQuest ? t("vpAuto") : t("vpByHand")}</p>
                    {finished && meta.you >= 0 && (
                      meta.reportedGameId ? (
                        <p className="text-xs">{tt.rich("reported", { link: (chunks) => <Link className="underline" href="/games">{chunks}</Link> })}</p>
                      ) : (
                        <>
                          <Button size="sm" disabled={reporting} onClick={() => void report()}><Send aria-hidden /> {tt("reportResult")}</Button>
                          <p className="text-xs text-muted-foreground">{tt("reportHelp")}</p>
                        </>
                      )
                    )}
                  </section>
                  <EngineQuestBox c={c} sideName={sideName} />
                  {wbQuest && (
                    <details className="rounded-xl border bg-card p-3" open={!engineQuest}>
                      <summary className="cursor-pointer font-display text-base">{wbQuest.name}</summary>
                      <div className="mt-3"><QuestView quest={wbQuest} compact /></div>
                    </details>
                  )}
                  <SchemesBox c={c} hands={game.hands} sideName={sideName} />
                </>
              )}
              {rightTab === "log" && (
                <ol className="grid gap-1 text-xs">
                  {[...st.log].slice(-150).reverse().map((l, i) => (
                    <li key={`${l.seq}-${i}`} className={l.kind === "turn" ? "mt-1 font-semibold text-primary" : ""}>
                      {l.kind !== "turn" && l.kind !== "combat" && <span style={l.side !== null ? { color: SIDE_TEXT[l.side] } : undefined} className="font-semibold">{l.by} </span>}
                      {nm(l.text)} {l.dice && <DiceChips dice={l.dice} />}
                    </li>
                  ))}
                </ol>
              )}
              {rightTab === "share" && meta.creator && !finished && (
                <TableSharing judgeLink={false} onChanged={game.reload}
                  view={{ id: meta.id, status: meta.status, solo: false, invited: meta.invited, judge: null, observersAllowed: meta.observersAllowed }} />
              )}
            </div>
            {viewer.canAct && (
              <section aria-label={tt("dice")} className="grid shrink-0 gap-2 border-t bg-muted/40 p-3">
                <div className="flex items-end gap-2">
                  <label className="grid gap-0.5 text-xs text-muted-foreground">{t("dice.diceCount")}
                    <Input type="number" min={1} max={20} className="h-9 w-14 text-center text-foreground" value={dice.count}
                      onChange={(e) => setDice((d) => ({ ...d, count: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }))} />
                  </label>
                  <label className="grid gap-0.5 text-xs text-muted-foreground">{t("orLower")}
                    <Input type="number" min={0} max={40} className="h-9 w-14 text-center text-foreground" value={dice.target} placeholder="—"
                      onChange={(e) => setDice((d) => ({ ...d, target: e.target.value }))} />
                  </label>
                  <label className="grid min-w-0 flex-1 gap-0.5 text-xs text-muted-foreground">{t("note")}
                    <Input className="h-9 text-foreground" value={dice.label} maxLength={60} onChange={(e) => setDice((d) => ({ ...d, label: e.target.value }))} />
                  </label>
                  <Button className="h-9" onClick={() => send({ type: "ROLL", count: dice.count, target: dice.target.trim() === "" ? null : Number(dice.target), label: dice.label })}>
                    <Dices aria-hidden /> {t("roll")}
                  </Button>
                </div>
                <div className="flex items-end gap-2" title={t("damageHint")}>
                  <label className="grid gap-0.5 text-xs text-muted-foreground">{t("hits")}
                    <Input type="number" min={1} max={20} className="h-9 w-14 text-center text-foreground" value={dmg.hits}
                      onChange={(e) => setDmg((d) => ({ ...d, hits: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }))} />
                  </label>
                  <label className="grid gap-0.5 text-xs text-muted-foreground">PW
                    <Input type="number" min={0} max={40} className="h-9 w-14 text-center text-foreground" value={dmg.pw} onChange={(e) => setDmg((d) => ({ ...d, pw: e.target.value }))} />
                  </label>
                  <label className="grid gap-0.5 text-xs text-muted-foreground">ARM
                    <Input type="number" min={0} max={20} className="h-9 w-14 text-center text-foreground" value={dmg.arm} onChange={(e) => setDmg((d) => ({ ...d, arm: e.target.value }))} />
                  </label>
                  <Button variant="outline" className="h-9" disabled={dmg.pw.trim() === ""}
                    onClick={() => {
                      const pw = Number(dmg.pw);
                      const arm = Number(dmg.arm || 0);
                      send({ type: "ROLL", count: dmg.hits, target: Math.max(0, pw - arm), label: `Damage: PW ${pw} − ARM ${arm}` });
                    }}>{t("damage")}</Button>
                </div>
                {lastRoll?.dice && (
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground">{lastRoll.by}: {nm(lastRoll.text)}</span>
                    <DiceChips dice={lastRoll.dice} />
                  </div>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
