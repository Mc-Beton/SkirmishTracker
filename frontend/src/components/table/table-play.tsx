"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Dices, Eye, Flag, Flame, Footprints, Gavel, History, Layers, Lock, LockOpen, MapPin, Minus, MousePointer2, Plus, RotateCcw, RotateCw, Ruler, SquareDashed, Target, Trash2, Undo2, UserPlus, Zap } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { QuestCard, SchemesCard, VpCard } from "@/components/table/quest-panel";
import { TableSharing } from "@/components/table/table-sharing";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { Board, tracePath, type BoardApi, type BoardModel } from "@/components/table/board";
import { useBoardDrag } from "@/components/table/use-board-drag";
import {
  drawFrame, drawTooltip, grabRadius, hitHandle, insideFrame, rotationToward, scaleToward, terrainInfoAt, type Frame,
} from "@/lib/table/handles.ts";
import { api } from "@/lib/api";
import {
  ATTRIBUTES, CARD_STATS, JUDGE_SIDE, MODEL_STATES, TOKEN_KINDS, sendCommand, type LogEntry, type ModelState, type TableCommand,
  type TableModel, type TableView, type TokenKind,
} from "@/lib/table/api";
import {
  COVER_MODIFIER, TEMPLATE_KINDS, awarenessRadius, coverAgainst, isSpray, measure, sprayFrom, templateHits,
  templatePolygon, type TemplateKind,
} from "@/lib/table/aoe.ts";
import {
  hitbox, lineOfSight, planMove, visibilityPolygon, type MovePlan, type Piece, type Table, type Vec,
} from "@/lib/table/geometry.ts";
import { useTableLive } from "@/lib/table/live";
import { useGameContent } from "@/lib/content";
import { deploymentZones } from "@/lib/table/deployment.ts";
import { MAX_SCALE, MIN_SCALE } from "@/lib/table/terrain.ts";
import { SandboxPanel, type PanelDrop, type Placing, type SandboxTab } from "@/components/table/sandbox-panel";
import { canMeasure, rulerAllowed, showsAwareness, showsRouteLength } from "@/lib/table/measuring.ts";

const SIDE = ["A", "B"] as const;

function toPiece(m: TableModel): Piece {
  return {
    id: m.id, side: SIDE[m.side], pos: { x: m.x ?? -50, y: m.y ?? -50 }, facing: m.facing, size: m.size,
    spd: m.stats.SPD, ag: m.stats.AG, faction: m.faction ?? "", keywords: m.keywords, states: m.states,
  };
}

function toTable(v: TableView): Table {
  return {
    width: v.field.widthIn, height: v.field.heightIn,
    terrain: v.terrain.map((t) => ({ id: t.id, kind: t.kind, points: t.points, height: t.height, envs: t.envs })),
    pieces: v.models.filter((m) => m.deployed).map(toPiece),
  };
}

type Tool = "NONE" | "TOKEN" | "TEMPLATE" | "RULER";
type RightTab = "model" | "quest" | "log" | "share";

/** Quest tokens are drawn 30 mm across. */
const TOKEN_R = 15 / 25.4;
const TOKEN_COLORS: Record<TokenKind, string> = {
  INTRIGUE: "#9085e9", CACHE: "#c98500", SIGIL: "#33d3e0", OBJECTIVE: "#e66767", TREASURE: "#f2d36b", MARKER: "#cfd8e6",
};

const fmt = (x: number) => (Math.round(x * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
const norm360 = (d: number) => ((d % 360) + 360) % 360;
const clampScale = (k: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(k * 100) / 100));
/** Length of the facing handle beyond the base, in inches. */
const FACING_STALK = 0.9;

type Piece2 = { x: number; y: number; rotation: number; scale: number };
/** A terrain piece being changed on the board (free game): shown at once, sent when the gesture ends. */
type PieceEdit = { id: string; mode: "move" | "scale" | "rotate"; dx: number; dy: number; startScale: number; start: Vec; preview: Piece2 };

/** The online table for its two players, the judge and observers (read-only). */
export function TablePlay({ tableId }: { tableId: string }) {
  const t = useTranslations("table");
  const tErr = useErrorMessage();
  const router = useRouter();
  const { me, loading } = useAuth();
  const [view, setView] = useState<TableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Vec[]>([]);
  const [mode, setMode] = useState<"WALK" | "RUN">("WALK");
  const [freeMove, setFreeMove] = useState(false);
  const [showLos, setShowLos] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);
  const [dice, setDice] = useState({ count: 1, target: "", label: "" });
  const [confirmConcede, setConfirmConcede] = useState(false);
  const [tool, setTool] = useState<Tool>("NONE");
  const [tokenKind, setTokenKind] = useState<TokenKind>("INTRIGUE");
  const [tokenLabel, setTokenLabel] = useState("");
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [templateKind, setTemplateKind] = useState<TemplateKind>("CIRCLE_L");
  const [ruler, setRuler] = useState<{ p: Vec; id: string | null }[]>([]);
  const [showAwareness, setShowAwareness] = useState(false);
  const [showZones, setShowZones] = useState(true);
  // free game: what the next click places, the selected terrain piece and the panel tab
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [sandboxTab, setSandboxTab] = useState<SandboxTab>("MAT");
  const boardApi = useRef<BoardApi | null>(null);
  const setBoardApi = useCallback((a: BoardApi) => { boardApi.current = a; }, []);
  const [hover, setHover] = useState<Vec | null>(null);
  /** Free game: terrain locked against grabbing (null = automatic: unlocked only before the game starts). */
  const [terrainLock, setTerrainLock] = useState<boolean | null>(null);
  const [pieceEdit, setPieceEdit] = useState<PieceEdit | null>(null);
  /** Wheel on a piece or a model: previewed, sent after a short pause. */
  const [wheelPiece, setWheelPiece] = useState<{ id: string } & Piece2 | null>(null);
  const [facingPreview, setFacingPreview] = useState<{ id: string; facing: number; drag: boolean } | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoTo, setUndoTo] = useState<number | null>(null);
  // desktop HUD: panel tabs and the space the board may take (it keeps the field's proportions)
  const content = useGameContent();
  const [rightTab, setRightTab] = useState<RightTab>("model");
  const [leftTab, setLeftTab] = useState<"roster" | "table" | null>(null);
  const [fitEl, setFitEl] = useState<HTMLDivElement | null>(null);
  const [fit, setFit] = useState({ w: 600, h: 600 });
  useEffect(() => {
    if (!fitEl) return;
    const measure = () => setFit({ w: fitEl.clientWidth, h: fitEl.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(fitEl);
    measure();
    return () => ro.disconnect();
  }, [fitEl]);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  const load = useCallback(async () => {
    try {
      setView(await api<TableView>("GET", `/api/tables/${tableId}`));
    } catch (e) {
      setError(tErr(e));
    }
  }, [tableId, tErr]);

  useEffect(() => {
    if (!me) return;
    let active = true;
    api<TableView>("GET", `/api/tables/${tableId}`)
      .then((v) => active && setView(v))
      .catch((e) => active && setError(tErr(e)));
    return () => {
      active = false;
    };
  }, [me, tableId, tErr]);

  useTableLive(me ? tableId : null, () => void load());

  /**
   * Sends a command. In a free game played alone you act for both sides: the side is the one of the model the
   * command is about, else the given one, else the active player's.
   */
  const run = useCallback(async (cmd: TableCommand, asSide?: 0 | 1) => {
    setBusy(true);
    setError(null);
    try {
      let side = asSide;
      if (view?.solo && side == null) {
        const ref = "id" in cmd ? view.models.find((m) => m.id === cmd.id) : undefined;
        side = (ref?.side ?? ("side" in cmd && (cmd.type === "ADD_MODEL" || cmd.type === "PICK_SCHEME") ? cmd.side
          : view.game.status === "PLAYING" ? view.game.active : 0)) as 0 | 1;
      }
      setView(await sendCommand(tableId, cmd, view?.solo ? side : undefined));
      return true;
    } catch (e) {
      setError(tErr(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [tableId, tErr, view]);

  const table = useMemo(() => (view ? toTable(view) : null), [view]);
  const zones = useMemo(() => (view ? deploymentZones(view.field.widthIn, view.field.heightIn, view.field.deployment ?? "STANDARD",
    view.field.deploymentDepth, view.field.cornerRadius || undefined) : []), [view]);

  const report = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api("POST", `/api/tables/${tableId}/report`);
      setView(await api<TableView>("GET", `/api/tables/${tableId}`));
    } catch (e) {
      setError(tErr(e));
    } finally {
      setBusy(false);
    }
  }, [tableId, tErr]);
  const model = view?.models.find((m) => m.id === selected) ?? null;
  const you = view?.you ?? -1;
  const playing = view?.game.status === "PLAYING";
  const setup = view?.game.status === "SETUP";
  const activeSide = view?.game.active;
  const sandbox = view?.mode === "SANDBOX";
  /** A free game with no opponent: you play both sides. */
  const solo = !!view?.solo;
  const myTurn = playing && (solo || activeSide === you);
  const activation = view?.game.activation ?? null;
  const activatedHere = !!activation && model?.id === activation.id;
  const mine = !!model && (solo || model.side === you);
  const role = view?.role ?? "OBSERVER";
  const judge = role === "JUDGE";
  const readOnly = role === "OBSERVER" || role === "ADMIN";
  /** The judge may place, turn and mark every model. */
  const canEdit = mine || judge;
  const measureMode = view?.measureMode ?? "ASSISTED";
  const routeLength = showsRouteLength(measureMode, role);
  const names = useMemo(() => new Map(view?.models.map((m) => [m.id, m.name]) ?? []), [view]);

  // --- movement preview with the same engine the server uses
  // the route so far plus the point under the pointer: the model goes as far as the rules allow
  const route = useMemo(() => (activatedHere && myTurn && hover && !freeMove && tool === "NONE" ? [...waypoints, hover] : waypoints),
    [activatedHere, myTurn, hover, freeMove, tool, waypoints]);
  const plan: MovePlan | null = useMemo(() => {
    if (!table || !model || !activatedHere || !myTurn || route.length === 0 || freeMove || !routeLength) return null;
    const m = activation?.mode ?? mode;
    try {
      return planMove(table, model.id, route, m, activation?.spent ?? 0);
    } catch {
      return null;
    }
  }, [table, model, activatedHere, myTurn, route, freeMove, activation, mode, routeLength]);
  const moving = activatedHere && waypoints.length > 0;
  const myPieces = useMemo(() => table?.pieces.filter((p) => solo || p.side === SIDE[you as 0 | 1]) ?? [], [table, you, solo]);
  const measurable = (a: Piece | Vec, b: Piece | Vec) => canMeasure(measureMode, role, myPieces, a, b, moving);

  const los = useMemo(() => {
    if (!showLos || !table || !model?.deployed) return null;
    const res = new Map(table.pieces.filter((p) => p.id !== model.id).map((p) => [p.id, lineOfSight(table, model.id, p.id)]));
    return { res, poly: visibilityPolygon(table, model.id, {}, 1) };
  }, [showLos, table, model]);

  const hits = useMemo(() => {
    if (!table || !view) return new Map<string, ReturnType<typeof templateHits>>();
    return new Map(view.templates.map((tp) => [tp.id, templateHits(table, tp)]));
  }, [table, view]);
  const affected = useMemo(() => {
    const ids = new Set<string>();
    hits.forEach((h) => h.forEach((x) => x.los && ids.add(x.id)));
    return ids;
  }, [hits]);

  const rulerDistance = (() => {
    if (ruler.length < 2 || !table) return null;
    const end = (r: { p: Vec; id: string | null }) => table.pieces.find((x) => x.id === r.id) ?? r.p;
    const a = end(ruler[0]), b = end(ruler[1]);
    return measurable(a, b) ? measure(a, b) : NaN;
  })();

  const boardModels: BoardModel[] = (view?.models ?? []).filter((m) => m.deployed && m.x != null).map((m) => {
    const r = los?.res.get(m.id);
    return {
      id: m.id, side: m.side, x: m.x!, y: m.y!, facing: facingPreview?.id === m.id ? facingPreview.facing : m.facing, radiusIn: hitbox(m.size).r,
      label: m.name.split(/[ ,]/)[0], selected: m.id === selected, states: m.states,
      ring: r?.visible ? (model && m.side === model.side ? "#4fd98a" : "#f26d6d")
        : affected.has(m.id) ? "#ff8a3d" : activation?.id === m.id ? "#33d3e0" : null,
      dim: !!los && m.id !== selected && !r?.visible,
    };
  });

  const pickModelAt = (p: Vec) =>
    view?.models.find((m) => m.deployed && m.x != null && Math.hypot(m.x - p.x, m.y! - p.y) <= hitbox(m.size).r + 0.1);

  // ---- free game: terrain on the board (drag, handles, wheel), with a live preview
  const terrainLocked = terrainLock ?? !setup;
  const canShapeTerrain = sandbox && role === "PLAYER" && view?.status !== "FINISHED" && !terrainLocked;
  /** A piece as drawn now: the server state, or the preview of a gesture in progress. */
  const pieceNow = (pl: TableView["placements"][number]): Piece2 =>
    pieceEdit?.id === pl.id ? pieceEdit.preview : wheelPiece?.id === pl.id ? wheelPiece : pl;
  const frameOf = (pl: TableView["placements"][number]): Frame => {
    const n = pieceNow(pl), k = n.scale / (pl.scale || 1);
    return { x: n.x, y: n.y, rotation: n.rotation, widthIn: pl.widthIn * k, heightIn: pl.heightIn * k };
  };
  const pickPieceAt = (p: Vec) => {
    if (!view) return undefined;
    for (let i = view.placements.length - 1; i >= 0; i--) {
      if (insideFrame(p, frameOf(view.placements[i]))) return view.placements[i];
    }
    return undefined;
  };
  const grab = () => grabRadius(boardApi.current?.pxPerInch() ?? 20);
  const sendPiece = (id: string, n: Piece2) =>
    run({ type: "MOVE_TERRAIN", id, x: n.x, y: n.y, facing: norm360(n.rotation), scale: clampScale(n.scale) });

  // ---- models: the facing handle of the selected model and the wheel
  const facingEditable = !!model && canEdit && !readOnly && !!model.deployed && view?.status !== "FINISHED";
  const facingKnob = (m: TableModel, facing: number) => {
    const r = hitbox(m.size).r + FACING_STALK, a = (facing * Math.PI) / 180;
    return { x: m.x! + Math.cos(a) * r, y: m.y! + Math.sin(a) * r };
  };
  /** Shows the new facing at once and sends ROTATE after a short pause (several wheel steps = one command). */
  const queueFacing = (m: TableModel, facing: number) => {
    setFacingPreview({ id: m.id, facing, drag: false });
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(async () => {
      await run({ type: "ROTATE", id: m.id, facing: norm360(facing) });
      setFacingPreview(null);
    }, 450);
  };
  const queuePiece = (id: string, n: Piece2) => {
    setWheelPiece({ id, ...n });
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(async () => {
      await sendPiece(id, n);
      setWheelPiece(null);
    }, 450);
  };

  const onBoardDown = (p: Vec, e: React.PointerEvent) => {
    if (!view || busy) return;
    // the facing knob of the selected model: drag to turn it only
    if (facingEditable && model && Math.hypot(p.x - facingKnob(model, model.facing).x, p.y - facingKnob(model, model.facing).y) <= grab()) {
      setFacingPreview({ id: model.id, facing: model.facing, drag: true });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (!canShapeTerrain || placing || tool !== "NONE" || freeMove || activatedHere) return;
    const sel = view.placements.find((x) => x.id === selectedPiece);
    if (sel) {
      const f = frameOf(sel), mode = hitHandle(p, f, grab());
      if (mode) {
        setPieceEdit({ id: sel.id, mode, dx: 0, dy: 0, startScale: pieceNow(sel).scale, start: p, preview: pieceNow(sel) });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
    }
    if (pickModelAt(p)) return;
    const piece = pickPieceAt(p);
    setSelectedPiece(piece?.id ?? null);
    if (piece) {
      const n = pieceNow(piece);
      setPieceEdit({ id: piece.id, mode: "move", dx: p.x - n.x, dy: p.y - n.y, startScale: n.scale, start: p, preview: n });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onBoardMove = (p: Vec, e: React.PointerEvent) => {
    setHover(p);
    if (facingPreview?.drag && model) {
      const deg = (Math.atan2(p.y - model.y!, p.x - model.x!) * 180) / Math.PI;
      setFacingPreview({ id: model.id, facing: norm360(e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg)), drag: true });
      return;
    }
    if (!pieceEdit || !view) return;
    const pl = view.placements.find((x) => x.id === pieceEdit.id);
    if (!pl) return;
    const f = frameOf(pl), w = view.field.widthIn, h = view.field.heightIn;
    const preview = pieceEdit.mode === "move"
      ? { ...pieceEdit.preview, x: Math.round(Math.max(0, Math.min(w, p.x - pieceEdit.dx)) * 20) / 20,
        y: Math.round(Math.max(0, Math.min(h, p.y - pieceEdit.dy)) * 20) / 20 }
      : pieceEdit.mode === "rotate"
        ? { ...pieceEdit.preview, rotation: rotationToward(f, p, e.shiftKey ? 15 : 1) }
        : { ...pieceEdit.preview, scale: clampScale(scaleToward(f, pieceEdit.startScale, pieceEdit.start, p)) };
    setPieceEdit({ ...pieceEdit, preview });
  };

  const onBoardUp = async (p: Vec, e: React.PointerEvent) => {
    if (facingPreview?.drag && model) {
      const facing = facingPreview.facing;
      if (Math.abs(facing - model.facing) > 0.5) await run({ type: "ROTATE", id: model.id, facing });
      setFacingPreview(null);
      return;
    }
    if (pieceEdit && view) {
      const pl = view.placements.find((x) => x.id === pieceEdit.id);
      const n = pieceEdit.preview;
      const changed = pl && (Math.abs(n.x - pl.x) > 0.02 || Math.abs(n.y - pl.y) > 0.02 || Math.abs(n.rotation - pl.rotation) > 0.2
        || Math.abs(n.scale - pl.scale) > 0.005);
      setPieceEdit(null);
      if (changed) {
        await sendPiece(pieceEdit.id, n);
        return;
      }
      // a plain click on a piece: select it – but still deploy the chosen model there during setup
      if (!(setup && model && mine)) return;
    }
    await onBoardClick(p, e.shiftKey);
  };

  const onBoardWheel = (p: Vec, e: WheelEvent) => {
    if (!view) return;
    const up = e.deltaY < 0;
    const hitModel = pickModelAt(p);
    // terrain of a free game (when not locked and no model under the pointer): wheel turns, Shift + wheel scales
    if (canShapeTerrain && !hitModel) {
      const piece = view.placements.find((x) => x.id === selectedPiece && insideFrame(p, frameOf(x))) ?? pickPieceAt(p);
      if (piece) {
        e.preventDefault();
        setSelectedPiece(piece.id);
        const n = pieceNow(piece);
        queuePiece(piece.id, e.shiftKey ? { ...n, scale: clampScale(n.scale * (up ? 1.1 : 1 / 1.1)) }
          : { ...n, rotation: norm360(n.rotation + (up ? -15 : 15)) });
        return;
      }
    }
    // a model you may turn: the one under the pointer, or the selected one when the pointer is at it (the page
    // keeps scrolling elsewhere)
    const nearSelected = facingEditable && model
      && Math.hypot(p.x - model.x!, p.y - model.y!) <= hitbox(model.size).r + FACING_STALK + 0.3;
    const m = (hitModel && view.models.find((x) => x.id === hitModel.id)) || (nearSelected ? model : null);
    if (!m || !m.deployed || readOnly || !(solo || judge || m.side === you)) return;
    e.preventDefault();
    if (m.id !== selected) setSelected(m.id);
    const current = facingPreview?.id === m.id ? facingPreview.facing : m.facing;
    queueFacing(m, norm360(current + (up ? -15 : 15)));
  };

  // ---- drag from the free game panel onto the board
  const panelDrag = useBoardDrag<PanelDrop>(boardApi, (d, at) => {
    if (d.kind === "TERRAIN") void run({ type: "PLACE_TERRAIN", ref: d.ref, x: at.x, y: at.y, facing: 0, scale: 1 });
    else void run({ type: "ADD_MODEL", ref: d.ref, side: d.side, x: at.x, y: at.y, facing: d.side === 0 ? 270 : 90 }, d.side);
  });

  const onBoardClick = async (p: Vec, shift = false) => {
    if (!view || busy) return;
    if (sandbox && placing) {
      if (placing.kind === "TERRAIN") {
        await run({ type: "PLACE_TERRAIN", ref: placing.ref, x: p.x, y: p.y, facing: placing.rotation, scale: placing.scale });
      } else if (placing.kind === "MODEL") {
        await run({ type: "ADD_MODEL", ref: placing.ref, side: placing.side, x: p.x, y: p.y, facing: placing.side === 0 ? 270 : 90 }, placing.side);
      } else {
        const piece = view.placements.find((x) => x.id === placing.id);
        if (piece && await run({ type: "MOVE_TERRAIN", id: piece.id, x: p.x, y: p.y, facing: piece.rotation, scale: piece.scale })) setPlacing(null);
      }
      return;
    }
    if (tool === "TOKEN") {
      const hitToken = view.tokens.find((k) => Math.hypot(k.x - p.x, k.y - p.y) <= TOKEN_R + 0.1);
      if (hitToken) {
        setSelectedToken(hitToken.id === selectedToken ? null : hitToken.id);
        return;
      }
      if (selectedToken) {
        if (await run({ type: "MOVE_TOKEN", id: selectedToken, x: p.x, y: p.y })) setSelectedToken(null);
        return;
      }
      await run({ type: "PLACE_TOKEN", kind: tokenKind, x: p.x, y: p.y, label: tokenKind === "MARKER" && tokenLabel ? tokenLabel : undefined });
      return;
    }
    if (tool === "TEMPLATE") {
      const user = model?.deployed ? table?.pieces.find((x) => x.id === model.id) : undefined;
      if (isSpray(templateKind)) {
        if (!user) {
          setError(t("sprayNeedsModel"));
          return;
        }
        const s = sprayFrom(user, p);
        await run({ type: "PLACE_TEMPLATE", kind: templateKind, x: s.x, y: s.y, facing: s.rotation, id: user.id });
      } else {
        await run({ type: "PLACE_TEMPLATE", kind: templateKind, x: p.x, y: p.y, facing: 0, id: user?.id });
      }
      return;
    }
    if (tool === "RULER") {
      const at = pickModelAt(p);
      const point = { p: at ? { x: at.x!, y: at.y! } : p, id: at?.id ?? null };
      setRuler((r) => (r.length >= 2 ? [point] : [...r, point]));
      return;
    }
    const hit = pickModelAt(p);
    // setup: place the selected own model
    if (setup && model && mine && !hit) {
      await run({ type: "DEPLOY", id: model.id, x: p.x, y: p.y, facing: you === 0 ? 270 : 90 });
      return;
    }
    if (freeMove && model && canEdit && !hit) {
      if (await run({ type: "FREE_MOVE", id: model.id, x: p.x, y: p.y, facing: model.facing })) setFreeMove(false);
      return;
    }
    // the activated model: a click moves it toward the point (an enemy: into base contact) as far as the rules
    // allow; Shift + click only adds a waypoint (then "Move" or a plain click)
    const moveNow = activatedHere && myTurn && model && !freeMove;
    const target = hit && moveNow && hit.side !== model.side ? { x: hit.x!, y: hit.y! } : null;
    if (hit && !target && !(activatedHere && waypoints.length > 0)) {
      if (hit.id !== selected) setWaypoints([]);
      setSelected(hit.id);
      return;
    }
    if (moveNow) {
      const point = target ?? p;
      if (shift) {
        setWaypoints((w) => [...w, point]);
        return;
      }
      if (await run({ type: "MOVE", id: model.id, mode: activation?.mode ?? mode, waypoints: [...waypoints, point] })) setWaypoints([]);
      return;
    }
    if (!hit && !setup && !freeMove) setSelectedPiece(null);
  };

  const rotate = (d: number) => model && canEdit && model.deployed && run({ type: "ROTATE", id: model.id, facing: (model.facing + d + 360) % 360 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "q" || e.key === "Q") void rotate(-15);
      if (e.key === "e" || e.key === "E") void rotate(15);
      if (e.key === "Escape") { setWaypoints([]); setPlacing(null); }
      if (e.key === "l" || e.key === "L") setShowLos((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!view) {
    return <div className="mx-auto max-w-6xl p-4">{error ? <Alert variant="destructive">{error}</Alert> : t("loading")}</div>;
  }

  const playerName = (side: number) => solo && side === JUDGE_SIDE ? view.players[0]?.name ?? "?"
    : solo && side === 1 ? t("sideB")
    : side === JUDGE_SIDE ? t("judgeWho", { name: view.judge?.name ?? "?" })
    : view.players.find((p) => p.side === side)?.name ?? "?";
  const terrainLabel = (info: NonNullable<ReturnType<typeof terrainInfoAt>>) =>
    t(info.obstacle ? "terrainInfoObstacle" : "terrainInfoArea", { h: fmt(info.height) })
    + (info.envs.length ? " · " + info.envs.map((e) => t(`env.${e}`)).join(", ") : "");
  const lastRolls = view.log.filter((e) => e.type === "ROLLED" && !e.undone).slice(-3).reverse();
  const myUndeployed = view.models.filter((m) => (solo || m.side === you) && !m.deployed);
  const meReady = solo ? view.game.ready[0] && view.game.ready[1] : you >= 0 && view.game.ready[you as 0 | 1];
  /** Alone: pick the first player if nobody did, then "Ready" for both sides. */
  const startSolo = async () => {
    if (view.game.firstPlayer == null && !(await run({ type: "FIRST_PLAYER", side: 0 }, 0))) return;
    for (const s of [0, 1] as const) {
      if (!view.game.ready[s] && !(await run({ type: "READY" }, s))) return;
    }
  };

  const questName = content?.quests.find((q) => q.code === view.questCode)?.name ?? null;
  const canBuild = sandbox && role === "PLAYER" && view.status !== "FINISHED";
  const leftShown = canBuild ? leftTab ?? (setup ? "table" : "roster") : "roster";
  const fieldRatio = view.field.widthIn / view.field.heightIn;
  const boardWidth = Math.max(200, Math.floor(Math.min(fit.w, fit.h * fieldRatio)));
  const pickFromRoster = (id: string) => {
    if (id !== selected) setWaypoints([]);
    setSelected(id);
    setRightTab("model");
  };
  const rail = (label: string, icon: React.ReactNode, on: boolean, onClick: () => void, disabled = false) => (
    <Button size="icon" variant={on ? "default" : "outline"} className="size-11" title={label} aria-label={label} aria-pressed={on}
      disabled={disabled} onClick={onClick}>{icon}</Button>
  );
  const tabs = <K extends string>(items: [K, string][], current: K, pick: (k: K) => void) => (
    <div className="flex shrink-0 border-b" role="tablist">
      {items.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={current === k} onClick={() => pick(k)}
          className={`h-11 flex-1 border-b-2 px-2 text-sm font-semibold ${current === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {label}
        </button>
      ))}
    </div>
  );
  const hint = view.status === "WAITING" ? t("waitingForOpponent")
    : setup ? t("hud.hintSetup")
    : view.status === "FINISHED" ? (view.game.winner != null ? t("winner", { name: playerName(view.game.winner) }) : t("finished"))
    : activatedHere && myTurn ? t("moveHelp")
    : activation ? t("activated", { name: names.get(activation.id) ?? "" })
    : myTurn ? t("hud.hintYourTurn") : t("opponentTurn", { name: playerName(activeSide!) });

  return (
    <>
    <div className="mx-auto grid max-w-md gap-3 p-6 text-center lg:hidden">
      <h1 className="font-display text-xl">{t("hud.desktopOnlyTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("hud.desktopOnly")}</p>
      <Button asChild variant="outline"><Link href="/tables">{t("hud.back")}</Link></Button>
    </div>
    <div className="fixed inset-0 z-50 hidden flex-col bg-background text-sm lg:flex">
      {panelDrag.ghost}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-primary bg-card px-3">
        <Button asChild size="icon" variant="ghost" className="size-9" title={t("hud.back")} aria-label={t("hud.back")}>
          <Link href="/tables"><ArrowLeft aria-hidden /></Link>
        </Button>
        <div className="grid min-w-0">
          <span className="truncate font-semibold">{sandbox ? t("freeGame") : view.mapName}{questName ? ` · ${questName}` : ""}</span>
          <span className="truncate text-xs text-muted-foreground" title={t(`measureHelp.${measureMode}`)}>
            {t(`deploymentKind.${view.field.deployment ?? "STANDARD"}`)} · {t(`measure.${measureMode}`)}
            {view.judge && <> · <Gavel className="inline size-3.5" aria-hidden /> {view.judge.name}</>}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center gap-4">
          {playing ? (
            <span className="flex items-center gap-1.5">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("roundShort")}</span>
              <span className="font-display text-xl font-bold tabular-nums">{view.game.round}</span>
              {sandbox && !readOnly && (
                <span className="flex items-center gap-1" role="group" aria-label={t("setRound")}>
                  <Button size="icon" variant="outline" className="size-7" disabled={busy || view.game.round <= 1} aria-label={t("roundDown")}
                    onClick={() => void run({ type: "SET_ROUND", round: view.game.round - 1 })}><Minus aria-hidden /></Button>
                  <Button size="icon" variant="outline" className="size-7" disabled={busy || view.game.round >= 10} aria-label={t("roundUp")}
                    onClick={() => void run({ type: "SET_ROUND", round: view.game.round + 1 })}><Plus aria-hidden /></Button>
                </span>
              )}
            </span>
          ) : (
            <Badge variant="outline">{t(`status.${view.status}`)}</Badge>
          )}
          <button type="button" title={t("hud.scoreHint")} onClick={() => setRightTab("quest")}
            className="flex h-10 items-center gap-3 rounded-lg border bg-background px-4 hover:border-primary">
            <span className="font-semibold" style={{ color: "#d9b45a" }}>{playerName(0)}</span>
            <span className="font-display text-xl font-bold tabular-nums">{view.vpTotal[0]} : {view.vpTotal[1]}</span>
            <span className="font-semibold" style={{ color: "#e07070" }}>{playerName(1)}</span>
          </button>
          {playing && (
            <Badge variant={myTurn ? "default" : "secondary"}>
              {solo ? t("hud.turnOf", { name: playerName(activeSide!) }) : myTurn ? t("yourTurn") : t("opponentTurn", { name: playerName(activeSide!) })}
            </Badge>
          )}
          {solo && <Badge variant="secondary">{t("soloBadge")}</Badge>}
          {role !== "PLAYER" && <Badge variant="secondary">{t(`role.${role}`)}</Badge>}
        </div>
        {!readOnly && (
          <Button size="sm" variant="outline" disabled={!view.canUndo || busy} title={!view.canUndo ? t("undoHint") : undefined}
            onClick={() => { setWaypoints([]); void run({ type: "UNDO" }); }}>
            <Undo2 aria-hidden /> {judge ? t("judgeUndo") : t("undo")}
          </Button>
        )}
        {view.creator && view.status !== "FINISHED" && (
          <Button size="sm" variant={rightTab === "share" ? "default" : "outline"} onClick={() => setRightTab("share")}>
            <UserPlus aria-hidden /> {t("hud.invite")}
          </Button>
        )}
        {view.status !== "FINISHED" && you >= 0 && view.status !== "WAITING" && !solo && (
          confirmConcede ? (
            <span className="flex gap-1">
              <Button size="sm" variant="destructive" onClick={() => void run({ type: "CONCEDE" })}><Flag aria-hidden /> {t("concedeConfirm")}</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmConcede(false)}>{t("cancel")}</Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmConcede(true)}><Flag aria-hidden /> {t("concede")}</Button>
          )
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-card">
          {canBuild && tabs([["roster", t("hud.tabRoster")], ["table", t("hud.tabTable")]], leftShown, setLeftTab)}
          <div className="grid min-h-0 flex-1 content-start gap-4 overflow-auto p-3">
            {leftShown === "table" ? (
              <>
                <SandboxPanel view={view} busy={busy} run={run} tab={sandboxTab} setTab={setSandboxTab} placing={placing}
                  setPlacing={setPlacing} selectedPiece={selectedPiece} setSelectedPiece={setSelectedPiece}
                  dragStart={panelDrag.start} wasDragging={panelDrag.wasDragging} />
              </>
            ) : (
              ([0, 1] as const).map((side) => {
                const party = view.parties.find((p) => p.side === side);
                const models = view.models.filter((m) => m.side === side);
                const faction = party?.faction ? content?.factions.find((f) => f.code === party.faction)?.name ?? party.faction : null;
                const scheme = party?.kept ? content?.schemes.find((x) => x.code === party.kept)?.name ?? party.kept : null;
                return (
                  <section key={side} className="grid gap-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: side === 0 ? "#d9b45a" : "#c84646" }} />
                      <span className="font-bold">{playerName(side)}</span>
                      {faction && <span className="truncate text-xs text-muted-foreground">{faction}</span>}
                    </div>
                    {view.status !== "WAITING" && (
                      <span className="text-xs text-muted-foreground">{t("schemes")}: {scheme ?? (party?.hidden ? t("schemeSecret") : "—")}</span>
                    )}
                    {models.length === 0 && <span className="text-xs text-muted-foreground">{t("hud.noModels")}</span>}
                    {models.map((m) => {
                      const out = m.states.includes("DEAD") || m.states.includes("INCAPACITATED");
                      const tag = activation?.id === m.id ? t("hud.tagActive") : !m.deployed ? t("hud.tagNotDeployed")
                        : party?.leaderId === m.id ? t("hud.tagLeader") : null;
                      return (
                        <button key={m.id} type="button" onClick={() => pickFromRoster(m.id)} aria-pressed={m.id === selected}
                          className={`grid gap-0.5 rounded-md border px-2 py-1.5 text-left hover:border-primary ${m.id === selected ? "border-primary bg-accent" : "bg-background"} ${out ? "opacity-55" : ""}`}>
                          <span className="flex justify-between gap-2">
                            <span className="truncate font-semibold">{m.name}</span>
                            {tag && <span className="shrink-0 text-xs text-primary">{tag}</span>}
                          </span>
                          <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            <span className="tabular-nums">{t("hp")} {m.hp}/{m.maxHp}</span>
                            <span className="tabular-nums">{t("ap")} {m.ap}</span>
                            {m.states.length > 0 && <span className="text-amber-400">{m.states.map((x) => t(`state.${x}`)).join(", ")}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </section>
                );
              })
            )}
          </div>
        </aside>

        <nav aria-label={t("hud.tools")} className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r bg-muted/40 py-2.5">
          {rail(t("hud.toolSelect"), <MousePointer2 aria-hidden />, tool === "NONE", () => { setTool("NONE"); setRuler([]); })}
          {rail(`${t("los")} (L)`, <Eye aria-hidden />, showLos, () => setShowLos((x) => !x), !model?.deployed)}
          {rail(t("ruler"), <Ruler aria-hidden />, tool === "RULER", () => { setTool((x) => (x === "RULER" ? "NONE" : "RULER")); setRuler([]); }, !rulerAllowed(measureMode, role))}
          {rail(t("awareness"), <Target aria-hidden />, showAwareness, () => setShowAwareness((x) => !x), !model?.deployed || !showsAwareness(measureMode, role))}
          <span className="h-2" />
          {rail(t("tokens"), <MapPin aria-hidden />, tool === "TOKEN", () => { setTool((x) => (x === "TOKEN" ? "NONE" : "TOKEN")); setSelectedToken(null); setRightTab("model"); },
            readOnly || view.status === "WAITING" || view.status === "FINISHED")}
          {rail(t("templates"), <Flame aria-hidden />, tool === "TEMPLATE", () => { setTool((x) => (x === "TEMPLATE" ? "NONE" : "TEMPLATE")); setRightTab("model"); }, readOnly || !playing)}
          <span className="h-2" />
          {rail(t("deploymentZones"), <SquareDashed aria-hidden />, showZones, () => setShowZones((x) => !x))}
          {rail(t("terrainOverlay"), <Layers aria-hidden />, showTerrain, () => setShowTerrain((x) => !x))}
          {canBuild && rail(terrainLocked ? t("terrainLocked") : t("lockTerrain"), terrainLocked ? <Lock aria-hidden /> : <LockOpen aria-hidden />,
            terrainLocked, () => { setTerrainLock(!terrainLocked); setPieceEdit(null); })}
        </nav>

        <main className="flex min-w-0 flex-1 flex-col gap-2 p-2">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div ref={setFitEl} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            <div style={{ width: boardWidth }}>
  <Board
                widthIn={view.field.widthIn}
                heightIn={view.field.heightIn}
                background={{ imageId: view.background.imageId, x: view.field.widthIn / 2, y: view.field.heightIn / 2,
                  widthIn: view.background.widthIn, heightIn: view.background.heightIn, rotation: 0 }}
                pictures={view.placements.map((p) => ({ imageId: p.imageId, ...frameOf(p) }))}
                onApi={setBoardApi}
                terrain={view.terrain}
                showTerrain={showTerrain}
                zones={showZones ? zones : null}
                models={boardModels}
                ariaLabel={t("boardLabel")}
                under={(ctx, px) => {
                  for (const tp of view.templates) {
                    ctx.fillStyle = "rgba(255,138,61,.22)";
                    ctx.strokeStyle = "rgba(255,138,61,.9)";
                    ctx.lineWidth = 1.5;
                    tracePath(ctx, px, templatePolygon(tp), true);
                    ctx.fill();
                    ctx.stroke();
                  }
                  for (const k of view.tokens) {
                    ctx.fillStyle = TOKEN_COLORS[k.kind];
                    ctx.strokeStyle = k.id === selectedToken ? "#33d3e0" : "#0d1322";
                    ctx.lineWidth = k.id === selectedToken ? 3 : 1.5;
                    ctx.beginPath(); ctx.arc(px(k.x), px(k.y), px(TOKEN_R), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                    ctx.fillStyle = "#0d1322";
                    ctx.font = `700 ${Math.max(10, px(0.42))}px ui-sans-serif, system-ui, sans-serif`;
                    ctx.textAlign = "center";
                    ctx.fillText(k.kind === "MARKER" ? (k.label ?? "?").slice(0, 2) : t(`tokenLetter.${k.kind}`), px(k.x), px(k.y) + px(0.15));
                    ctx.textAlign = "start";
                  }
                  if (showAwareness && showsAwareness(measureMode, role) && model?.deployed && table) {
                    const pc = table.pieces.find((x) => x.id === model.id);
                    if (pc) {
                      ctx.setLineDash([6, 6]);
                      ctx.strokeStyle = "rgba(51,211,224,.7)";
                      ctx.lineWidth = 1.5;
                      ctx.beginPath(); ctx.arc(px(pc.pos.x), px(pc.pos.y), px(awarenessRadius(pc)), 0, Math.PI * 2); ctx.stroke();
                      ctx.setLineDash([]);
                    }
                  }
                  if (los) {
                    ctx.fillStyle = "rgba(79,217,138,.14)";
                    tracePath(ctx, px, los.poly, true);
                    ctx.fill();
                  }
                  if (model && activatedHere && waypoints.length) {
                    ctx.setLineDash([5, 5]);
                    ctx.strokeStyle = "rgba(242,109,109,.8)";
                    ctx.lineWidth = 2;
                    tracePath(ctx, px, [{ x: model.x!, y: model.y! }, ...waypoints], false);
                    ctx.stroke();
                    ctx.setLineDash([]);
                  }
                  if (plan) {
                    ctx.strokeStyle = "rgba(51,211,224,.25)";
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    ctx.lineWidth = px(hitbox(model!.size).r * 2);
                    tracePath(ctx, px, plan.path, false);
                    ctx.stroke();
                    ctx.strokeStyle = "#33d3e0";
                    ctx.lineWidth = 2.5;
                    tracePath(ctx, px, plan.path, false);
                    ctx.stroke();
                  }
                }}
                over={(ctx, px) => {
                  const sel = sandbox ? view.placements.find((x) => x.id === selectedPiece) : undefined;
                  if (sel) drawFrame(ctx, px, frameOf(sel), canShapeTerrain, Math.max(7, px(0.2)));
                  // facing handle of the selected model: a vector from its front with a knob to drag
                  if (facingEditable && model) {
                    const f = facingPreview?.id === model.id ? facingPreview.facing : model.facing;
                    const a = (f * Math.PI) / 180, r = hitbox(model.size).r;
                    const knob = facingKnob(model, f);
                    ctx.save();
                    ctx.strokeStyle = "#33d3e0";
                    ctx.fillStyle = "#0d1322";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(px(model.x! + Math.cos(a) * r), px(model.y! + Math.sin(a) * r));
                    ctx.lineTo(px(knob.x), px(knob.y));
                    ctx.stroke();
                    ctx.beginPath(); ctx.arc(px(knob.x), px(knob.y), Math.max(7, px(0.18)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                    ctx.restore();
                  }
                  if (ruler.length) {
                    ctx.strokeStyle = "#f2d36b";
                    ctx.fillStyle = "#f2d36b";
                    ctx.lineWidth = 2;
                    tracePath(ctx, px, ruler.map((r) => r.p), false);
                    ctx.stroke();
                    ruler.forEach((r) => { ctx.beginPath(); ctx.arc(px(r.p.x), px(r.p.y), 3, 0, Math.PI * 2); ctx.fill(); });
                    if (rulerDistance != null) {
                      const m = { x: (ruler[0].p.x + ruler[1].p.x) / 2, y: (ruler[0].p.y + ruler[1].p.y) / 2 };
                      const label = Number.isNaN(rulerDistance) ? t("notMeasurable") : `${fmt(rulerDistance)}″`;
                      ctx.font = `600 ${Math.max(11, px(0.42))}px ui-monospace, monospace`;
                      const w = ctx.measureText(label).width + 10;
                      ctx.fillRect(px(m.x) - w / 2, px(m.y) - px(0.75), w, px(0.6));
                      ctx.fillStyle = "#061320";
                      ctx.textAlign = "center";
                      ctx.fillText(label, px(m.x), px(m.y) - px(0.3));
                      ctx.textAlign = "start";
                    }
                  }
                  // what the rules see under the pointer: the highest terrain there
                  const info = hover && !pieceEdit && !facingPreview?.drag ? terrainInfoAt(hover, view.terrain) : null;
                  if (hover && info && !plan) drawTooltip(ctx, px, hover, terrainLabel(info));
                  if (!plan) return;
                  const end = plan.path[plan.path.length - 1];
                  const total = (activation?.mode ?? mode) === "RUN" ? activation?.run ?? 0 : activation?.walk ?? 0;
                  const label = `${fmt(plan.cost + (activation?.spent ?? 0))} / ${fmt(total)}″`;
                  ctx.font = `600 ${Math.max(11, px(0.4))}px ui-monospace, monospace`;
                  const w = ctx.measureText(label).width + 10;
                  ctx.fillStyle = plan.endsOnAlly ? "#f2b84b" : "#33d3e0";
                  ctx.fillRect(px(end.x) + 12, px(end.y) - px(0.8), w, px(0.65));
                  ctx.fillStyle = "#061320";
                  ctx.fillText(label, px(end.x) + 17, px(end.y) - px(0.33));
                }}
                onPointerDown={onBoardDown}
                onPointerMove={onBoardMove}
                onPointerUp={(p, e) => void onBoardUp(p, e)}
                onPointerLeave={() => setHover(null)}
                onWheel={onBoardWheel}
                cursor={pieceEdit ? "grabbing" : freeMove || setup || tool !== "NONE" || placing ? "copy" : "crosshair"}
              />
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-5xl shrink-0 items-center gap-3">
            <p className="min-w-0 flex-1 text-muted-foreground">{hint}</p>
            {setup && role === "PLAYER" && (
              <>
                <span className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{t("firstPlayer")}:</span>
                  {[0, 1].map((s) => (
                    <Button key={s} size="sm" variant={view.game.firstPlayer === s ? "default" : "outline"} disabled={busy}
                      onClick={() => void run({ type: "FIRST_PLAYER", side: s as 0 | 1 })}>{playerName(s)}</Button>
                  ))}
                </span>
                {solo ? (
                  <Button disabled={busy || myUndeployed.length > 0 || view.models.length === 0} onClick={() => void startSolo()}>{t("startSolo")}</Button>
                ) : (
                  <Button disabled={busy || myUndeployed.length > 0 || meReady} onClick={() => void run({ type: "READY" })}>
                    {meReady ? t("readyWaiting") : t("ready")}
                  </Button>
                )}
              </>
            )}
            {playing && !readOnly && myTurn && activation && (
              <Button variant="outline" disabled={busy} onClick={() => { setWaypoints([]); void run({ type: "END_ACTIVATION" }); }}>{t("endActivation")}</Button>
            )}
            {playing && !readOnly && myTurn && (
              <Button disabled={busy} onClick={() => { setWaypoints([]); void run({ type: "END_TURN" }); }}>{t("endTurn")}</Button>
            )}
          </div>
        </main>

        <aside className="flex w-[348px] shrink-0 flex-col border-l bg-card">
          {tabs<RightTab>([["model", t("hud.tabModel")], ["quest", t("hud.tabQuest")], ["log", t("log")],
            ...(view.creator && view.status !== "FINISHED" ? [["share", t("hud.tabShare")] as [RightTab, string]] : [])], rightTab, setRightTab)}
          <div className="grid min-h-0 flex-1 content-start gap-3 overflow-auto p-3">
            {rightTab === "model" && (
              <>
              {!readOnly && view.status !== "WAITING" && view.status !== "FINISHED" && (tool === "TOKEN" || tool === "TEMPLATE" || view.templates.length > 0) && (
                <Card>
                  <CardHeader><CardTitle className="text-base">{t("tools")}</CardTitle></CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    {tool === "TOKEN" && (
                      <div className="grid gap-2">
                        <div className="flex gap-2">
                          <NativeSelect value={tokenKind} onChange={(e) => setTokenKind(e.target.value as TokenKind)} aria-label={t("tokenKind")}>
                            {TOKEN_KINDS.map((k) => <option key={k} value={k}>{t(`token.${k}`)}</option>)}
                          </NativeSelect>
                          {tokenKind === "MARKER" && <Input value={tokenLabel} maxLength={40} placeholder={t("tokenLabel")} onChange={(e) => setTokenLabel(e.target.value)} />}
                        </div>
                        <p className="text-xs text-muted-foreground">{selectedToken ? t("tokenMoveHelp") : t("tokenHelp")}</p>
                        {selectedToken && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (await run({ type: "REMOVE_TOKEN", id: selectedToken })) setSelectedToken(null); }}>
                            <Trash2 aria-hidden /> {t("removeToken")}
                          </Button>
                        )}
                      </div>
                    )}
                    {tool === "TEMPLATE" && (
                      <div className="grid gap-2">
                        <NativeSelect value={templateKind} onChange={(e) => setTemplateKind(e.target.value as TemplateKind)} aria-label={t("templateKind")}>
                          {TEMPLATE_KINDS.map((k) => <option key={k} value={k}>{t(`template.${k}`)}</option>)}
                        </NativeSelect>
                        <p className="text-xs text-muted-foreground">{isSpray(templateKind) ? t("sprayHelp") : t("circleHelp")}</p>
                      </div>
                    )}
                    {view.templates.map((tp) => (
                      <div key={tp.id} className="grid gap-1 rounded-md border p-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{t(`template.${tp.kind}`)}</span>
                          {tp.modelId && <span className="text-xs text-muted-foreground">{names.get(tp.modelId)}</span>}
                          <Button size="icon" variant="ghost" className="ml-auto size-7" aria-label={t("removeTemplate")} disabled={busy}
                            onClick={() => void run({ type: "REMOVE_TEMPLATE", id: tp.id })}><Trash2 aria-hidden /></Button>
                        </div>
                        <ul className="text-xs">
                          {(hits.get(tp.id) ?? []).map((h) => (
                            <li key={h.id} className={h.los ? "" : "text-muted-foreground line-through"}>
                              {names.get(h.id)} · {h.covered === "FULL" ? t("coveredFull") : t("coveredPartial")}{h.los ? "" : ` · ${t("noLosFromTemplate")}`}
                            </li>
                          ))}
                          {(hits.get(tp.id) ?? []).length === 0 && <li className="text-muted-foreground">{t("templateEmpty")}</li>}
                        </ul>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {model ? (
                <ModelCard
                  model={model}
                  mine={canEdit}
                  readOnly={readOnly}
                  busy={busy}
                  onHp={(d) => void run({ type: "HP", id: model.id, delta: d })}
                  onAp={(ap) => void run({ type: "AP", id: model.id, ap })}
                  onState={(s, on) => void run({ type: "STATE", id: model.id, state: s, on })}
                  onRotate={(d) => void rotate(d)}
                  onStat={(k, v) => setDice((d) => ({ ...d, target: String(v), label: `${model.name.split(/[ ,]/)[0]} ${k}` }))}
                  onRemove={sandbox && canEdit && !readOnly ? async () => { if (await run({ type: "REMOVE_MODEL", id: model.id })) setSelected(null); } : undefined}
                />
              ) : (
                <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("pickModel")}</CardContent></Card>
              )}
              {!readOnly && playing && model && mine && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">{t("actions")}</CardTitle></CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    {myTurn && model && mine && !activatedHere && model.side === activeSide && (
                      <Button disabled={busy || model.ap < 1} onClick={async () => { setWaypoints([]); await run({ type: "ACTIVATE", id: model.id }); }}>
                        <Zap aria-hidden /> {t("activate", { ap: model.ap })}
                      </Button>
                    )}
                    {myTurn && activatedHere && activation && (
                      <>
                        <div className="flex gap-1" role="group" aria-label={t("moveMode")}>
                          {(["WALK", "RUN"] as const).map((m) => (
                            <Button key={m} size="sm" variant={(activation.mode ?? mode) === m ? "default" : "outline"}
                              disabled={!!activation.mode && activation.mode !== m}
                              onClick={() => setMode(m)}>{t(`mode.${m}`)}</Button>
                          ))}
                        </div>
                        <p className="text-muted-foreground">
                          {t("movementLeft", {
                            left: fmt(Math.max(0, ((activation.mode ?? mode) === "RUN" ? activation.run : activation.walk) - activation.spent)),
                            total: fmt((activation.mode ?? mode) === "RUN" ? activation.run : activation.walk),
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">{t("moveHelp")}</p>
                        {!routeLength && <p className="text-xs text-muted-foreground">{t("realismMove")}</p>}
                        {plan?.stoppedBy && <p className="text-amber-400">{t(`stopped.${plan.stoppedBy.kind}`)}</p>}
                        {plan?.endsOnAlly && <p className="text-amber-400">{t("endsOnAlly")}</p>}
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" disabled={busy || (routeLength ? !plan || plan.length < 0.01 || !!plan.endsOnAlly : waypoints.length === 0)}
                            onClick={async () => {
                              if (await run({ type: "MOVE", id: model!.id, mode: activation.mode ?? mode, waypoints })) setWaypoints([]);
                            }}>
                            <Footprints aria-hidden /> {t("move")}
                          </Button>
                          <Button size="sm" variant="outline" disabled={!waypoints.length} onClick={() => setWaypoints((w) => w.slice(0, -1))}>{t("removePoint")}</Button>
                          <Button size="sm" variant="outline" disabled={!waypoints.length} onClick={() => setWaypoints([])}>{t("clearRoute")}</Button>
                        </div>
                      </>
                    )}
                    {activation && model && mine && model.side !== activeSide && (
                      <Button disabled={busy || model.ap < 1} onClick={() => void run({ type: "REACT", id: model.id })}>
                        <Zap aria-hidden /> {t("react", { name: names.get(activation.id) ?? "" })}
                      </Button>
                    )}
                    {playing && model && canEdit && model.deployed && (
                      <Button size="sm" variant={freeMove ? "default" : "outline"} onClick={() => setFreeMove((f) => !f)}>
                        {freeMove ? t("freeMoveOn") : t("freeMove")}
                      </Button>
                    )}
                    {activation && <p className="text-xs text-muted-foreground">{t("activated", { name: names.get(activation.id) ?? "" })}</p>}
                  </CardContent>
                </Card>
              )}
              {los && model && (
                <Card>
                  <CardHeader><CardTitle className="text-base">{t("losOf", { name: model.name })}</CardTitle></CardHeader>
                  <CardContent className="grid gap-1 text-sm">
                    {view.models.filter((m) => m.id !== model.id && m.deployed && !m.states.includes("DEAD")).map((m) => {
                      const r = los.res.get(m.id);
                      const cls = !r?.visible ? "text-muted-foreground" : m.side === model.side ? "text-emerald-400" : "text-red-400";
                      const cover = r?.visible && m.side !== model.side && table ? coverAgainst(table, model.id, m.id).cover : "NONE";
                      const from = table!.pieces.find((x) => x.id === model.id)!, to = table!.pieces.find((x) => x.id === m.id)!;
                      return (
                        <div key={m.id} className={`flex justify-between gap-2 ${cls}`}>
                          <span>{m.name}{measurable(from, to) && <span className="text-muted-foreground"> · {fmt(measure(from, to))}″</span>}</span>
                          <span>
                            {r?.visible ? t("sees") : t(`losReason.${r?.reason ?? "BLOCKED"}`)}
                            {cover !== "NONE" && <Badge variant="warning" className="ml-2">{t(`cover.${cover}`, { mod: COVER_MODIFIER[cover] })}</Badge>}
                          </span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
              </>
            )}
            {rightTab === "quest" && view.status !== "WAITING" && (
              <>
                <VpCard view={view} busy={busy} run={run} onReport={report} />
                <QuestCard view={view} busy={busy} run={run} />
                <SchemesCard view={view} busy={busy} run={run} />
              </>
            )}
            {rightTab === "quest" && view.status === "WAITING" && <p className="text-muted-foreground">{t("waitingForOpponent")}</p>}
            {rightTab === "log" && (
              <Card>
                <CardHeader><CardTitle className="text-base">{t("log")}</CardTitle></CardHeader>
                <CardContent>
                  <ol className="grid max-h-72 gap-1 overflow-auto text-xs">
                    {[...view.log].reverse().filter((e) => e.side >= 0 || (e.type !== "MODEL_ADDED" && e.type !== "PARTY_INFO" && e.type !== "QUEST_SET")).map((e) => (
                      <li key={e.seq} className={`flex items-start gap-1 ${e.undone ? "text-muted-foreground line-through"
                        : e.type === "FREE_MOVED" || e.side === JUDGE_SIDE ? "text-amber-300" : ""}`}>
                        <span className="min-w-0 flex-1"><span className="text-muted-foreground">#{e.seq}</span> {describe(t as unknown as T, e, names, playerName)}</span>
                        {judge && !e.undone && e.type !== "UNDONE" && e.seq < view.seq && (
                          undoTo === e.seq ? (
                            <span className="flex shrink-0 gap-1">
                              <Button size="sm" variant="destructive" className="h-6 px-2 text-xs" disabled={busy}
                                onClick={async () => { if (await run({ type: "UNDO", toSeq: e.seq })) setUndoTo(null); }}>{t("judgeUndoToConfirm")}</Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setUndoTo(null)}>{t("cancel")}</Button>
                            </span>
                          ) : (
                            <Button size="icon" variant="ghost" className="size-6 shrink-0" title={t("judgeUndoTo")} aria-label={t("judgeUndoTo")}
                              onClick={() => setUndoTo(e.seq)}><History aria-hidden /></Button>
                          )
                        )}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}
            {rightTab === "share" && view.creator && view.status !== "FINISHED" && <TableSharing view={view} onChanged={() => void load()} />}
          </div>
          <section aria-label={t("dice")} className="grid shrink-0 gap-2 border-t bg-muted/40 p-3">
            <div className="flex items-end gap-2">
              <label className="grid gap-0.5 text-xs text-muted-foreground">{t("diceCount")}
                <Input type="number" min={1} max={20} className="h-9 w-14 text-center text-foreground" value={dice.count}
                  onChange={(e) => setDice((d) => ({ ...d, count: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }))} />
              </label>
              <label className="grid gap-0.5 text-xs text-muted-foreground">{t("diceTarget")}
                <Input type="number" min={0} max={40} className="h-9 w-14 text-center text-foreground" value={dice.target} placeholder="—"
                  onChange={(e) => setDice((d) => ({ ...d, target: e.target.value }))} />
              </label>
              <label className="grid min-w-0 flex-1 gap-0.5 text-xs text-muted-foreground">{t("diceLabel")}
                <Input className="h-9 text-foreground" value={dice.label} maxLength={60} onChange={(e) => setDice((d) => ({ ...d, label: e.target.value }))} />
              </label>
              <Button className="h-9" disabled={busy || readOnly} onClick={() => void run({
                type: "ROLL", count: dice.count, target: dice.target === "" ? undefined : Number(dice.target),
                label: dice.label || undefined, id: model?.id,
              })}>
                <Dices aria-hidden /> {t("roll")}
              </Button>
            </div>
            {lastRolls.slice(0, 1).map((e) => <RollLine key={e.seq} entry={e} who={playerName(e.side)} />)}
          </section>
        </aside>
      </div>
    </div>
    </>
  );
}

function ModelCard(props: {
  model: TableModel;
  /** May change AP and turn the model (its owner or the judge). */
  mine: boolean;
  readOnly: boolean;
  busy: boolean;
  onHp: (delta: number) => void;
  onAp: (ap: number) => void;
  onState: (s: ModelState, on: boolean) => void;
  onRotate: (d: number) => void;
  /** Free game: take the model off the table. */
  onRemove?: () => void;
  /** A click on a stat sets it as the dice target. */
  onStat?: (stat: string, value: number) => void;
}) {
  const t = useTranslations("table");
  const { model: m, mine, readOnly } = props;
  const busy = props.busy || readOnly;
  const stat = (s: keyof TableModel["stats"]) => {
    const changed = m.stats[s] !== m.base[s];
    return (
      <button key={s} type="button" onClick={() => props.onStat?.(s, m.stats[s])}
        className={`rounded-md px-1 py-1 text-center hover:ring-1 hover:ring-primary ${changed ? "bg-amber-500/20 ring-1 ring-amber-400/60" : "bg-muted"}`}
        title={changed ? t("statChanged", { base: m.base[s] }) : t("hud.rollOn", { stat: s })}>
        <div className="text-[10px] tracking-wider text-muted-foreground">{s}</div>
        <div className="font-mono text-base tabular-nums">{m.stats[s]}</div>
      </button>
    );
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg">{m.name}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {m.classes.join(" · ")} · {t(`size.${m.size}`)}{m.mount ? ` · ${t("mounted", { mount: m.mount })}` : ""}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-4 gap-1">{CARD_STATS.map(stat)}</div>
        <div className="grid grid-cols-7 gap-1">{ATTRIBUTES.map(stat)}</div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-1">
            {t("hp")}
            <Button size="icon" variant="outline" className="size-7" disabled={busy || !m.deployed} aria-label={t("wound")} onClick={() => props.onHp(-1)}><Minus aria-hidden /></Button>
            <span className="min-w-12 text-center font-mono tabular-nums">{m.hp} / {m.maxHp}</span>
            <Button size="icon" variant="outline" className="size-7" disabled={busy || !m.deployed || m.hp >= m.maxHp} aria-label={t("heal")} onClick={() => props.onHp(1)}><Plus aria-hidden /></Button>
          </span>
          <span className="flex items-center gap-1">
            {t("ap")}
            {mine && <Button size="icon" variant="outline" className="size-7" disabled={busy || m.ap <= 0} aria-label={t("apLess")} onClick={() => props.onAp(m.ap - 1)}><Minus aria-hidden /></Button>}
            <span className="min-w-6 text-center font-mono tabular-nums">{m.ap}</span>
            {mine && <Button size="icon" variant="outline" className="size-7" disabled={busy} aria-label={t("apMore")} onClick={() => props.onAp(m.ap + 1)}><Plus aria-hidden /></Button>}
          </span>
          {mine && m.deployed && (
            <span className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="size-7" aria-label={t("rotateLeft")} onClick={() => props.onRotate(-15)}><RotateCcw aria-hidden /></Button>
              <Button size="icon" variant="outline" className="size-7" aria-label={t("rotateRight")} onClick={() => props.onRotate(15)}><RotateCw aria-hidden /></Button>
            </span>
          )}
          {props.onRemove && (
            <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={props.onRemove}>
              <Trash2 aria-hidden /> {t("removeModel")}
            </Button>
          )}
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t("states")}</div>
          <div className="flex flex-wrap gap-1">
            {MODEL_STATES.map((s) => {
              const on = m.states.includes(s);
              return (
                <button key={s} type="button" disabled={busy}
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${on ? "border-primary bg-primary/20 text-primary" : "text-muted-foreground hover:border-primary/60"}`}
                  title={t(`stateHelp.${s}`)} aria-pressed={on} onClick={() => props.onState(s, !on)}>
                  {t(`state.${s}`)}
                </button>
              );
            })}
          </div>
        </div>
        {m.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.keywords.map((k) => <Badge key={k} variant="outline" className="text-[10px]">{k.replace(/_/g, " ").toLowerCase()}</Badge>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RollLine({ entry, who }: { entry: LogEntry; who: string }) {
  const t = useTranslations("table");
  const d = entry.data as { results: number[]; target: number | null; label: string | null };
  const target = d.target;
  const ok = target != null ? d.results.filter((r) => r <= target).length : null;
  return (
    <div className="grid gap-1">
      <div className="text-xs text-muted-foreground">{who}{d.label ? ` · ${d.label}` : ""}{target != null ? ` · ≤ ${target}` : ""}</div>
      <div className="flex flex-wrap gap-1">
        {d.results.map((r, i) => {
          const crit = target != null && target > 0 && (r === 1 || (target > 20 && r === 20));
          const success = target != null && target > 0 && r <= target;
          return (
            <span key={i} className={`grid size-8 place-items-center rounded-md border font-mono text-sm tabular-nums ${crit ? "border-primary bg-primary text-primary-foreground" : success ? "border-emerald-400 text-emerald-400" : "text-muted-foreground"}`}>
              {r}
            </span>
          );
        })}
      </div>
      {ok != null && <div className="text-xs">{t("successes", { ok, count: d.results.length })}</div>}
    </div>
  );
}

type T = (key: string, values?: Record<string, string | number>) => string;

function describe(t: T, e: LogEntry, names: Map<string, string>, player: (side: number) => string): string {
  const d = e.data as Record<string, unknown>;
  const name = (id: unknown) => names.get(String(id)) ?? String(id);
  const who = e.side >= 0 ? player(e.side) : t("system");
  switch (e.type) {
    case "FIRST_PLAYER": return t("logLine.FIRST_PLAYER", { who, name: player(Number(d.side)) });
    case "DEPLOYED": return t("logLine.DEPLOYED", { who, model: name(d.id) });
    case "READY": return t("logLine.READY", { who });
    case "ACTIVATED": return t("logLine.ACTIVATED", { who, model: name(d.id) });
    case "MOVED": return t("logLine.MOVED", { who, model: name(d.id), mode: t(`mode.${String(d.mode)}`), cost: fmt(Number(d.cost)) })
      + (d.engagedWith ? " " + t("logLine.engaged", { model: name(d.engagedWith) }) : "");
    case "FREE_MOVED": return t("logLine.FREE_MOVED", { who, model: name(d.id) });
    case "ROTATED": return t("logLine.ROTATED", { who, model: name(d.id) });
    case "REACTED": return t("logLine.REACTED", { who, model: name(d.id) });
    case "ROLLED": return t("logLine.ROLLED", { who, results: (d.results as number[]).join(", "), label: d.label ? String(d.label) : "k20" })
      + (d.target != null ? ` (≤ ${d.target})` : "");
    case "HP_CHANGED": return t(Number(d.delta) < 0 ? "logLine.WOUND" : "logLine.HEAL", { who, model: name(d.id), n: Math.abs(Number(d.delta)) });
    case "STATE_SET": return t(d.on ? "logLine.STATE_ON" : "logLine.STATE_OFF", { who, model: name(d.id), state: t(`state.${String(d.state)}`) });
    case "AP_SET": return t("logLine.AP_SET", { who, model: name(d.id), ap: Number(d.ap) });
    case "ACTIVATION_ENDED": return t("logLine.ACTIVATION_ENDED", { who });
    case "TURN_ENDED": return t("logLine.TURN_ENDED", { who });
    case "GAME_ENDED": return t("logLine.GAME_ENDED", { who });
    case "UNDONE": return t("logLine.UNDONE", { who, n: (d.seqs as number[]).length });
    case "PARTY_INFO": return t("logLine.PARTY_INFO", { who: player(Number(d.side)) });
    case "SCHEMES_DRAWN": return t("logLine.SCHEMES_DRAWN", { who, n: (d.cards as unknown[]).length });
    case "SCHEME_KEPT": return t("logLine.SCHEME_KEPT", { who });
    case "SCHEME_REVEALED": return t("logLine.SCHEME_REVEALED", { who });
    case "TOKEN_PLACED": return t("logLine.TOKEN_PLACED", { who, token: t(`token.${String(d.kind)}`) });
    case "TOKEN_MOVED": return t("logLine.TOKEN_MOVED", { who });
    case "TOKEN_REMOVED": return t("logLine.TOKEN_REMOVED", { who });
    case "VP_SET": return t("logLine.VP_SET", { who, name: player(Number(d.side)), round: Number(d.round), scenario: Number(d.scenario), scheme: Number(d.scheme) });
    case "TEMPLATE_PLACED": return t("logLine.TEMPLATE_PLACED", { who, template: t(`template.${String(d.kind)}`) });
    case "TEMPLATE_REMOVED": return t("logLine.TEMPLATE_REMOVED", { who });
    case "END_PROPOSED": return Number(d.side) < 0 ? t("logLine.END_WITHDRAWN", { who }) : t("logLine.END_PROPOSED", { who });
    case "MODEL_ADDED": return t("logLine.MODEL_ADDED", { who, model: name(d.id) });
    case "MODEL_REMOVED": return t("logLine.MODEL_REMOVED", { who, model: String(d.id) });
    case "BACKGROUND_SET": return t("logLine.BACKGROUND_SET", { who });
    case "TERRAIN_PLACED": return t("logLine.TERRAIN_PLACED", { who, name: String(d.name ?? "") });
    case "TERRAIN_MOVED": return t("logLine.TERRAIN_MOVED", { who });
    case "TERRAIN_REMOVED": return t("logLine.TERRAIN_REMOVED", { who });
    case "ROUND_SET": return t("logLine.ROUND_SET", { who, round: Number(d.round) });
    case "QUEST_SET": return t("logLine.QUEST_SET", { who });
    default: return e.type;
  }
}
