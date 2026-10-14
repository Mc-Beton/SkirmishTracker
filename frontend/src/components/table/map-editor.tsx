"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Layers, Lock, LockOpen, Minus, Plus, RotateCcw, RotateCw, Save, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { Board, type BoardApi } from "@/components/table/board";
import { useBoardDrag } from "@/components/table/use-board-drag";
import { api } from "@/lib/api";
import { imageUrl, TERRAIN_CATEGORIES, type Background, type MapInput, type MapView, type TerrainPiece } from "@/lib/table/api";
import { buildTerrain, MAX_SCALE, MIN_SCALE, rotate, scaleOf, type Placement } from "@/lib/table/terrain.ts";
import type { Vec } from "@/lib/table/geometry.ts";
import { deploymentZones } from "@/lib/table/deployment.ts";
import {
  drawFrame, drawTooltip, grabRadius, hitHandle, rotationToward, scaleToward, terrainInfoAt, type Frame,
} from "@/lib/table/handles.ts";

const MAX_PIECES = 80;

const fmtIn = (x: number) => (Math.round(x * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

/** Point inside a placed picture (rotated, scaled rectangle)? */
function hitPlacement(p: Vec, pl: Placement, piece: TerrainPiece | undefined) {
  if (!piece) return false;
  const local = rotate({ x: p.x - pl.x, y: p.y - pl.y }, -pl.rotation);
  const k = scaleOf(pl);
  return Math.abs(local.x) <= (piece.widthIn * k) / 2 && Math.abs(local.y) <= (piece.heightIn * k) / 2;
}

const clampScale = (k: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(k * 100) / 100));
const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** The selection frame of a placed piece (size × scale). */
const frameOf = (pl: Placement, piece: TerrainPiece): Frame =>
  ({ x: pl.x, y: pl.y, widthIn: piece.widthIn * scaleOf(pl), heightIn: piece.heightIn * scaleOf(pl), rotation: pl.rotation });

type Drag =
  | { mode: "move"; index: number; dx: number; dy: number }
  | { mode: "scale"; index: number; startScale: number; start: Vec }
  | { mode: "rotate"; index: number };

/** Build a map: background + terrain pieces placed by hand. New (`mapId` null) or an existing one. */
export function MapEditor({ mapId }: { mapId: string | null }) {
  const t = useTranslations("table");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { me, loading } = useAuth();
  const isAdmin = !!me?.roles.includes("ADMIN");
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [library, setLibrary] = useState<TerrainPiece[]>([]);
  const [input, setInput] = useState<MapInput>({ name: "", backgroundId: "", placements: [], deploymentDepth: 8, isPublic: false, official: false });
  const [owned, setOwned] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [category, setCategory] = useState<string>("");
  const [showTerrain, setShowTerrain] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Locked: pieces can no longer be grabbed, turned or scaled on the board (avoids moving them by accident). */
  const [locked, setLocked] = useState(false);
  const [hover, setHover] = useState<Vec | null>(null);
  const boardApi = useRef<BoardApi | null>(null);
  const setBoardApi = useCallback((a: BoardApi) => { boardApi.current = a; }, []);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => {
    if (!me) return;
    Promise.all([api<Background[]>("GET", "/api/table/backgrounds"), api<TerrainPiece[]>("GET", "/api/table/terrain")])
      .then(([b, p]) => {
        setBackgrounds(b);
        setLibrary(p);
        setInput((i) => (i.backgroundId || !b[0] ? i : { ...i, backgroundId: b[0].id }));
      })
      .catch((e) => setError(errorMessage(e)));
    if (mapId) {
      api<MapView>("GET", `/api/table/maps/${mapId}`)
        .then((m) => {
          setOwned(m.mine || isAdmin);
          setInput({ name: m.name, backgroundId: m.background.id, placements: m.placements, deploymentDepth: m.deploymentDepth, isPublic: m.isPublic, official: m.official });
          // a retired background or piece is still drawn for an existing map
          setBackgrounds((b) => (b.some((x) => x.id === m.background.id) ? b : [...b, m.background]));
          setLibrary((l) => [...l, ...m.terrain.filter((x) => !l.some((y) => y.id === x.id))]);
        })
        .catch((e) => setError(errorMessage(e)));
    }
  }, [me, mapId, isAdmin, errorMessage]);

  const bg = backgrounds.find((b) => b.id === input.backgroundId) ?? null;
  const pieces = useMemo(() => Object.fromEntries(library.map((p) => [p.id, p])), [library]);
  const world = useMemo(() => {
    if (!bg) return [];
    try {
      return buildTerrain(bg.areas, input.placements.filter((p) => pieces[p.assetId]), pieces);
    } catch {
      return [];
    }
  }, [bg, input.placements, pieces]);

  const setPlacements = (f: (p: Placement[]) => Placement[]) => {
    setSaved(false);
    setInput((i) => ({ ...i, placements: f(i.placements) }));
  };
  const add = (piece: TerrainPiece, at?: Vec) => {
    if (!bg || input.placements.length >= MAX_PIECES) return;
    setPlacements((p) => [...p, { assetId: piece.id, x: Math.round((at?.x ?? bg.widthIn / 2) * 20) / 20,
      y: Math.round((at?.y ?? bg.heightIn / 2) * 20) / 20, rotation: 0, scale: 1 }]);
    setSelected(input.placements.length);
    setLocked(false);
  };
  const libraryDrag = useBoardDrag<TerrainPiece>(boardApi, (piece, at) => add(piece, at));
  const turn = (d: number) => selected != null &&
    setPlacements((p) => p.map((x, i) => (i === selected ? { ...x, rotation: norm360(x.rotation + d) } : x)));
  const setScale = (index: number, k: number) =>
    setPlacements((p) => p.map((x, i) => (i === index ? { ...x, scale: clampScale(k) } : x)));
  const grow = (f: number) => selected != null && setScale(selected, scaleOf(input.placements[selected]) * f);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "q" || e.key === "Q") turn(-15);
      if (e.key === "e" || e.key === "E") turn(15);
      if (e.key === "+" || e.key === "=") grow(1.1);
      if (e.key === "-" || e.key === "_") grow(1 / 1.1);
      if ((e.key === "Delete" || e.key === "Backspace") && selected != null) {
        setPlacements((p) => p.filter((_, i) => i !== selected));
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const save = async (asCopy = false) => {
    setBusy(true);
    setError(null);
    try {
      const body = { ...input, official: isAdmin && input.official };
      const res = mapId && owned && !asCopy
        ? await api<MapView>("PUT", `/api/table/maps/${mapId}`, body)
        : await api<MapView>("POST", "/api/table/maps", body);
      setSaved(true);
      if (res.id !== mapId) router.replace(`/maps/${res.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = library.filter((p) => p.active && (!category || p.category === category));
  const sel = selected != null ? input.placements[selected] : null;
  const terrainLabel = (info: NonNullable<ReturnType<typeof terrainInfoAt>>) =>
    t(info.obstacle ? "terrainInfoObstacle" : "terrainInfoArea", { h: fmtIn(info.height) })
    + (info.envs.length ? " · " + info.envs.map((e) => t(`env.${e}`)).join(", ") : "");

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {libraryDrag.ghost}
      <div className="grid min-w-0 content-start gap-3">
        <h1 className="font-display text-2xl">{mapId ? input.name || t("map") : t("newMap")}</h1>
        {error && <Alert variant="destructive">{error}</Alert>}
        {saved && <Alert variant="success">{t("mapSaved")}</Alert>}
        {!bg ? (
          <Alert>{t("noBackgrounds")}</Alert>
        ) : (
          <Card>
            <CardContent className="p-2">
              <Board
                widthIn={bg.widthIn}
                heightIn={bg.heightIn}
                background={{ imageId: bg.imageId, x: bg.widthIn / 2, y: bg.heightIn / 2, widthIn: bg.widthIn, heightIn: bg.heightIn, rotation: 0 }}
                pictures={input.placements.map((p) => ({ imageId: pieces[p.assetId]?.imageId ?? null, x: p.x, y: p.y,
                  widthIn: (pieces[p.assetId]?.widthIn ?? 1) * scaleOf(p), heightIn: (pieces[p.assetId]?.heightIn ?? 1) * scaleOf(p),
                  rotation: p.rotation }))}
                terrain={world}
                showTerrain={showTerrain}
                zones={deploymentZones(bg.widthIn, bg.heightIn, "STANDARD", input.deploymentDepth)}
                ariaLabel={t("boardLabel")}
                onApi={setBoardApi}
                cursor={locked || !owned ? "default" : dragging ? "grabbing" : "grab"}
                onPointerLeave={() => setHover(null)}
                over={(ctx, px) => {
                  const piece = sel ? pieces[sel.assetId] : undefined;
                  if (sel && piece) drawFrame(ctx, px, frameOf(sel, piece), owned && !locked, Math.max(7, px(0.2)));
                  const info = hover && !dragging ? terrainInfoAt(hover, world) : null;
                  if (hover && info) drawTooltip(ctx, px, hover, terrainLabel(info));
                }}
                onPointerDown={(p, e) => {
                  if (!owned || locked) return;
                  const selPiece = sel ? pieces[sel.assetId] : undefined;
                  if (sel && selPiece && selected != null) {
                    const mode = hitHandle(p, frameOf(sel, selPiece), grabRadius(boardApi.current?.pxPerInch() ?? 20));
                    if (mode) {
                      drag.current = mode === "rotate"
                        ? { mode, index: selected }
                        : { mode, index: selected, startScale: scaleOf(sel), start: p };
                      setDragging(true);
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      return;
                    }
                  }
                  for (let i = input.placements.length - 1; i >= 0; i--) {
                    const pl = input.placements[i];
                    if (hitPlacement(p, pl, pieces[pl.assetId])) {
                      setSelected(i);
                      drag.current = { mode: "move", index: i, dx: p.x - pl.x, dy: p.y - pl.y };
                      setDragging(true);
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      return;
                    }
                  }
                  setSelected(null);
                }}
                onPointerMove={(p, e) => {
                  setHover(p);
                  const d = drag.current;
                  if (!d) return;
                  if (d.mode === "move") {
                    const x = Math.max(0, Math.min(bg.widthIn, p.x - d.dx)), y = Math.max(0, Math.min(bg.heightIn, p.y - d.dy));
                    setPlacements((ps) => ps.map((pl, i) => (i === d.index ? { ...pl, x: Math.round(x * 20) / 20, y: Math.round(y * 20) / 20 } : pl)));
                  } else if (d.mode === "scale") {
                    const pl = input.placements[d.index];
                    const piece = pl ? pieces[pl.assetId] : undefined;
                    if (!pl || !piece) return;
                    const k = scaleToward(frameOf(pl, piece), d.startScale, d.start, p);
                    // Shift: steps of 5 %
                    setScale(d.index, e.shiftKey ? Math.round(k * 20) / 20 : k);
                  } else {
                    const pl = input.placements[d.index];
                    const piece = pl ? pieces[pl.assetId] : undefined;
                    if (!pl || !piece) return;
                    const rotation = rotationToward(frameOf(pl, piece), p, e.shiftKey ? 15 : 1);
                    setPlacements((ps) => ps.map((x, i) => (i === d.index ? { ...x, rotation } : x)));
                  }
                }}
                onPointerUp={() => { drag.current = null; setDragging(false); }}
                onWheel={(p, e) => {
                  if (!owned || locked) return;
                  // the piece under the pointer (the selected one first): wheel turns, Shift + wheel scales
                  let index = selected != null && sel && hitPlacement(p, sel, pieces[sel.assetId]) ? selected : -1;
                  for (let i = input.placements.length - 1; index < 0 && i >= 0; i--) {
                    if (hitPlacement(p, input.placements[i], pieces[input.placements[i].assetId])) index = i;
                  }
                  if (index < 0) return;
                  e.preventDefault();
                  setSelected(index);
                  const up = e.deltaY < 0;
                  setPlacements((ps) => ps.map((x, i) => (i !== index ? x : e.shiftKey
                    ? { ...x, scale: clampScale(scaleOf(x) * (up ? 1.1 : 1 / 1.1)) }
                    : { ...x, rotation: norm360(x.rotation + (up ? -15 : 15)) })));
                }}
              />
              <div className="flex flex-wrap items-center gap-2 p-2 text-sm">
                <Button size="sm" variant={showTerrain ? "default" : "outline"} onClick={() => setShowTerrain((s) => !s)}><Layers aria-hidden /> {t("terrainOverlay")}</Button>
                {owned && (
                  <Button size="sm" variant={locked ? "default" : "outline"} aria-pressed={locked} onClick={() => setLocked((l) => !l)}>
                    {locked ? <Lock aria-hidden /> : <LockOpen aria-hidden />} {locked ? t("terrainLocked") : t("lockTerrain")}
                  </Button>
                )}
                {sel && owned && !locked && (
                  <>
                    <span className="text-muted-foreground">{pieces[sel.assetId]?.name}</span>
                    <Button size="icon" variant="outline" className="size-8" aria-label={t("rotateLeft")} onClick={() => turn(-15)}><RotateCcw aria-hidden /></Button>
                    <Button size="icon" variant="outline" className="size-8" aria-label={t("rotateRight")} onClick={() => turn(15)}><RotateCw aria-hidden /></Button>
                    <label className="flex items-center gap-1">{t("rotation")}
                      <Input type="number" className="h-8 w-20" value={Math.round(sel.rotation)} min={0} max={359}
                        onChange={(e) => setPlacements((p) => p.map((x, i) => (i === selected ? { ...x, rotation: norm360(Number(e.target.value)) } : x)))} />
                    </label>
                    <Button size="icon" variant="outline" className="size-8" aria-label={t("scaleDown")} onClick={() => grow(1 / 1.1)}><Minus aria-hidden /></Button>
                    <Button size="icon" variant="outline" className="size-8" aria-label={t("scaleUp")} onClick={() => grow(1.1)}><Plus aria-hidden /></Button>
                    <label className="flex items-center gap-1">{t("scale")}
                      <Input type="number" className="h-8 w-20" value={Math.round(scaleOf(sel) * 100)} min={MIN_SCALE * 100} max={MAX_SCALE * 100} step={5}
                        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0 && selected != null) setScale(selected, n / 100); }} />
                    </label>
                    {pieces[sel.assetId] && (
                      <span className="text-xs text-muted-foreground">
                        {fmtIn(pieces[sel.assetId].widthIn * scaleOf(sel))}″×{fmtIn(pieces[sel.assetId].heightIn * scaleOf(sel))}″
                      </span>
                    )}
                    <Button size="icon" variant="outline" className="size-8" aria-label={t("duplicate")}
                      onClick={() => setPlacements((p) => [...p, { ...sel, x: Math.min(bg.widthIn, sel.x + 1), y: Math.min(bg.heightIn, sel.y + 1) }])}><Copy aria-hidden /></Button>
                    <Button size="icon" variant="outline" className="size-8" aria-label={t("remove")}
                      onClick={() => { setPlacements((p) => p.filter((_, i) => i !== selected)); setSelected(null); }}><Trash2 aria-hidden /></Button>
                  </>
                )}
              </div>
              <p className="px-2 pb-2 text-xs text-muted-foreground">{t("mapEditorHelp")}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid min-w-0 content-start gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("mapSettings")}</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <label className="grid gap-1">{t("mapName")}
              <Input value={input.name} maxLength={80} disabled={!owned} onChange={(e) => { setSaved(false); setInput((i) => ({ ...i, name: e.target.value })); }} />
            </label>
            <label className="grid gap-1">{t("background")}
              <NativeSelect value={input.backgroundId} disabled={!owned} onChange={(e) => { setSaved(false); setInput((i) => ({ ...i, backgroundId: e.target.value })); }}>
                {backgrounds.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.widthIn}″×{b.heightIn}″)</option>)}
              </NativeSelect>
            </label>
            <label className="grid gap-1">{t("deploymentDepth")}
              <Input type="number" min={2} max={14} step={0.5} value={input.deploymentDepth} disabled={!owned}
                onChange={(e) => { setSaved(false); setInput((i) => ({ ...i, deploymentDepth: Number(e.target.value) })); }} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={input.isPublic || input.official} disabled={!owned || input.official}
                onChange={(e) => { setSaved(false); setInput((i) => ({ ...i, isPublic: e.target.checked })); }} />
              {t("makePublic")}
            </label>
            {isAdmin && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={input.official} onChange={(e) => { setSaved(false); setInput((i) => ({ ...i, official: e.target.checked })); }} />
                {t("makeOfficial")}
              </label>
            )}
            <p className="text-xs text-muted-foreground">{t("piecesCount", { n: input.placements.length })} / {MAX_PIECES}</p>
            {owned ? (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !input.name.trim() || !bg} onClick={() => void save()}><Save aria-hidden /> {t("save")}</Button>
                {mapId && <Button variant="outline" disabled={busy || !input.name.trim()} onClick={() => void save(true)}>{t("saveCopy")}</Button>}
              </div>
            ) : (
              <Button disabled={busy || !input.name.trim()} onClick={() => { setOwned(true); void save(true); }}>{t("saveCopy")}</Button>
            )}
          </CardContent>
        </Card>

        {owned && (
          <Card>
            <CardHeader><CardTitle className="text-base">{t("library")}</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("category")}>
                <option value="">{t("allCategories")}</option>
                {TERRAIN_CATEGORIES.map((c) => <option key={c} value={c}>{t(`categoryName.${c}`)}</option>)}
              </NativeSelect>
              {shown.length === 0 && <p className="text-sm text-muted-foreground">{t("emptyLibrary")}</p>}
              <ul className="grid max-h-[28rem] grid-cols-2 gap-2 overflow-auto">
                {shown.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => { if (!libraryDrag.wasDragging()) add(p); }}
                      onPointerDown={(e) => libraryDrag.start(e, p, p.imageId, p.name)} title={t("dragToBoard")}
                      className="grid w-full cursor-grab touch-pan-y select-none gap-1 rounded-md border p-1 text-left text-xs hover:border-primary">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl(p.imageId)} alt="" className="aspect-square w-full rounded object-contain bg-muted" />
                      <span className="truncate">{p.name}</span>
                      <span className="text-muted-foreground">{p.widthIn}″×{p.heightIn}″</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
