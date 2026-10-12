"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ImageUp, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { Board, tracePath } from "@/components/table/board";
import { api } from "@/lib/api";
import {
  AREA_ENVS, imageUrl, TERRAIN_CATEGORIES, uploadImage, type Background, type TerrainCategory, type TerrainPiece,
} from "@/lib/table/api";
import type { Env, Vec } from "@/lib/table/geometry.ts";
import { wallPolygons, type Shape, type ShapeType } from "@/lib/table/terrain.ts";

type Kind = "terrain" | "background";

type Draft = {
  id: string | null;
  kind: Kind;
  name: string;
  category: TerrainCategory;
  imageId: string | null;
  aspect: number; // picture height / width
  widthIn: number;
  heightIn: number;
  shapes: Shape[]; // terrain: around the picture centre; background: absolute (areas only)
};

const emptyDraft = (kind: Kind): Draft => ({
  id: null, kind, name: "", category: "RUIN", imageId: null, aspect: 1,
  widthIn: kind === "background" ? 36 : 6, heightIn: kind === "background" ? 36 : 6, shapes: [],
});

const round = (v: number) => Math.round(v * 20) / 20; // 0.05″ grid

/**
 * Admin: the terrain library and map backgrounds. Upload a picture, give its real size, then draw what the
 * rules need on top of it: walls (polyline + thickness + height), solid obstacles and Environment areas.
 */
export function LibraryEditor() {
  const t = useTranslations("table");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { me, loading } = useAuth();
  const [pieces, setPieces] = useState<TerrainPiece[]>([]);
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tool, setTool] = useState<ShapeType>("WALL");
  const [drawing, setDrawing] = useState<Vec[]>([]);
  const [thickness, setThickness] = useState(0.25);
  const [height, setHeight] = useState(3);
  const [envs, setEnvs] = useState<Env[]>(["FOREST"]);
  const [selectedShape, setSelectedShape] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me?.roles.includes("ADMIN")) router.replace("/");
  }, [loading, me, router]);

  const reload = () => {
    api<TerrainPiece[]>("GET", "/api/table/terrain").then(setPieces).catch((e) => setError(errorMessage(e)));
    api<Background[]>("GET", "/api/table/backgrounds").then(setBackgrounds).catch((e) => setError(errorMessage(e)));
  };
  useEffect(() => {
    if (me?.roles.includes("ADMIN")) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const centre = draft?.kind === "terrain";
  const off = useMemo(() => (draft && centre ? { x: draft.widthIn / 2, y: draft.heightIn / 2 } : { x: 0, y: 0 }), [draft, centre]);
  const toLocal = (p: Vec): Vec => ({ x: round(p.x - off.x), y: round(p.y - off.y) });
  const toBoard = (p: Vec): Vec => ({ x: p.x + off.x, y: p.y + off.y });

  const finishShape = () => {
    if (!draft) return;
    const need = tool === "WALL" ? 2 : 3;
    if (drawing.length < need) {
      setDrawing([]);
      return;
    }
    const shape: Shape = tool === "WALL"
      ? { type: "WALL", points: drawing, thickness, height }
      : tool === "OBSTACLE" ? { type: "OBSTACLE", points: drawing, height }
        : { type: "AREA", points: drawing, height: envs.includes("FOREST") ? height : 0, envs };
    setDraft({ ...draft, shapes: [...draft.shapes, shape] });
    setDrawing([]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Enter") finishShape();
      if (e.key === "Escape") setDrawing([]);
      if (e.key === "Backspace") setDrawing((d) => d.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onFile = async (file: File | undefined) => {
    if (!file || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const img = await uploadImage(file);
      const aspect = img.heightPx / img.widthPx;
      setDraft({ ...draft, imageId: img.id, aspect, heightIn: round(draft.widthIn * aspect) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      if (draft.kind === "terrain") {
        const body = { name: draft.name, category: draft.category, imageId: draft.imageId, widthIn: draft.widthIn, heightIn: draft.heightIn, shapes: draft.shapes };
        const res = draft.id ? await api<TerrainPiece>("PUT", `/api/admin/table/terrain/${draft.id}`, body)
          : await api<TerrainPiece>("POST", "/api/admin/table/terrain", body);
        setDraft({ ...draft, id: res.id });
      } else {
        const areas = draft.shapes.map((s) => ({ points: s.points, height: s.height, envs: s.envs ?? [] }));
        const body = { name: draft.name, imageId: draft.imageId, widthIn: draft.widthIn, heightIn: draft.heightIn, areas };
        const res = draft.id ? await api<Background>("PUT", `/api/admin/table/backgrounds/${draft.id}`, body)
          : await api<Background>("POST", "/api/admin/table/backgrounds", body);
        setDraft({ ...draft, id: res.id });
      }
      setInfo(t("librarySaved"));
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    if (!draft?.id) return;
    setBusy(true);
    try {
      await api("DELETE", draft.kind === "terrain" ? `/api/admin/table/terrain/${draft.id}` : `/api/admin/table/backgrounds/${draft.id}`);
      setDraft(null);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const open = (kind: Kind, item: TerrainPiece | Background) => {
    setSelectedShape(null);
    setDrawing([]);
    setInfo(null);
    if (kind === "terrain") {
      const p = item as TerrainPiece;
      setDraft({ id: p.id, kind, name: p.name, category: p.category, imageId: p.imageId, aspect: p.heightIn / p.widthIn, widthIn: p.widthIn, heightIn: p.heightIn, shapes: p.shapes });
    } else {
      const b = item as Background;
      setDraft({ id: b.id, kind, name: b.name, category: "OTHER", imageId: b.imageId, aspect: b.heightIn / b.widthIn, widthIn: b.widthIn, heightIn: b.heightIn,
        shapes: b.areas.map((a) => ({ type: "AREA", points: a.points, height: a.height, envs: a.envs })) });
    }
  };

  if (!me?.roles.includes("ADMIN")) return null;

  const tools: ShapeType[] = draft?.kind === "background" ? ["AREA"] : ["WALL", "OBSTACLE", "AREA"];

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
      <div className="grid content-start gap-3">
        <h1 className="font-display text-xl">{t("libraryTitle")}</h1>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { setDraft(emptyDraft("terrain")); setTool("WALL"); setInfo(null); }}><Plus aria-hidden /> {t("newPiece")}</Button>
          <Button size="sm" variant="outline" onClick={() => { setDraft(emptyDraft("background")); setTool("AREA"); setInfo(null); }}><Plus aria-hidden /> {t("newBackground")}</Button>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("pieces")}</CardTitle></CardHeader>
          <CardContent className="grid max-h-80 gap-1 overflow-auto text-sm">
            {pieces.map((p) => (
              <button key={p.id} type="button" onClick={() => open("terrain", p)} className="flex items-center gap-2 rounded px-1 py-1 text-left hover:bg-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(p.imageId)} alt="" className="size-8 rounded bg-muted object-contain" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <Badge variant="outline" className="text-[10px]">{t(`categoryName.${p.category}`)}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("backgrounds")}</CardTitle></CardHeader>
          <CardContent className="grid max-h-60 gap-1 overflow-auto text-sm">
            {backgrounds.map((b) => (
              <button key={b.id} type="button" onClick={() => open("background", b)} className="flex items-center gap-2 rounded px-1 py-1 text-left hover:bg-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(b.imageId)} alt="" className="size-8 rounded object-cover" />
                <span className="truncate">{b.name}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid min-w-0 content-start gap-3">
        {error && <Alert variant="destructive">{error}</Alert>}
        {info && <Alert variant="success">{info}</Alert>}
        {!draft ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("libraryHelp")}</CardContent></Card>
        ) : !draft.imageId ? (
          <Card>
            <CardContent className="grid gap-2 p-4 text-sm">
              <p>{t("uploadFirst")}</p>
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent">
                <ImageUp className="size-4" aria-hidden /> {t("chooseImage")}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy}
                  onChange={(e) => void onFile(e.target.files?.[0])} />
              </label>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="grid gap-2 p-2">
              <Board
                widthIn={draft.widthIn}
                heightIn={draft.heightIn}
                background={{ imageId: draft.imageId, x: draft.widthIn / 2, y: draft.heightIn / 2, widthIn: draft.widthIn, heightIn: draft.heightIn, rotation: 0 }}
                ariaLabel={t("editorBoard")}
                under={(ctx, px) => {
                  draft.shapes.forEach((s, i) => {
                    const pts = s.points.map(toBoard);
                    const sel = i === selectedShape;
                    if (s.type === "WALL") {
                      for (const rect of wallPolygons(pts, s.thickness ?? 0.25)) {
                        tracePath(ctx, px, rect, true);
                        ctx.fillStyle = sel ? "rgba(51,211,224,.55)" : "rgba(255,170,80,.55)";
                        ctx.fill();
                      }
                    } else {
                      tracePath(ctx, px, pts, true);
                      ctx.fillStyle = s.type === "OBSTACLE" ? (sel ? "rgba(51,211,224,.45)" : "rgba(255,120,60,.4)") : (sel ? "rgba(51,211,224,.3)" : "rgba(80,200,120,.3)");
                      ctx.fill();
                      ctx.strokeStyle = sel ? "#33d3e0" : "rgba(255,255,255,.7)";
                      ctx.lineWidth = 1.5;
                      ctx.stroke();
                    }
                  });
                  if (drawing.length) {
                    const pts = drawing.map(toBoard);
                    ctx.strokeStyle = "#33d3e0";
                    ctx.lineWidth = tool === "WALL" ? Math.max(2, px(thickness)) : 2;
                    tracePath(ctx, px, pts, false);
                    ctx.stroke();
                    for (const p of pts) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px(p.x), px(p.y), 3, 0, Math.PI * 2); ctx.fill(); }
                  }
                }}
                onPointerUp={(p) => setDrawing((d) => [...d, toLocal(p)])}
              />
              <p className="text-xs text-muted-foreground">{t("drawHelp")}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {draft && (
        <div className="grid content-start gap-3">
          <Card>
            <CardHeader><CardTitle className="text-base">{draft.kind === "terrain" ? t("piece") : t("background")}</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <label className="grid gap-1">{t("name")}
                <Input value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              {draft.kind === "terrain" && (
                <label className="grid gap-1">{t("category")}
                  <NativeSelect value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as TerrainCategory })}>
                    {TERRAIN_CATEGORIES.map((c) => <option key={c} value={c}>{t(`categoryName.${c}`)}</option>)}
                  </NativeSelect>
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">{t("widthIn")}
                  <Input type="number" min={0.25} max={72} step={0.25} value={draft.widthIn}
                    onChange={(e) => { const w = Number(e.target.value); setDraft({ ...draft, widthIn: w, heightIn: round(w * draft.aspect) }); }} />
                </label>
                <label className="grid gap-1">{t("heightIn")}
                  <Input type="number" value={draft.heightIn} readOnly aria-readonly />
                </label>
              </div>
              {draft.imageId && (
                <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-xs underline">
                  {t("replaceImage")}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
                </label>
              )}
            </CardContent>
          </Card>

          {draft.imageId && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("shapes")}</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <div className="flex flex-wrap gap-1" role="group" aria-label={t("tool")}>
                  {tools.map((x) => (
                    <Button key={x} size="sm" variant={tool === x ? "default" : "outline"} onClick={() => { setTool(x); setDrawing([]); }}>{t(`shapeType.${x}`)}</Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t(`toolHelp.${tool}`)}</p>
                {tool === "WALL" && (
                  <label className="grid gap-1">{t("thickness")}
                    <Input type="number" min={0.05} max={3} step={0.05} value={thickness} onChange={(e) => setThickness(Number(e.target.value))} />
                  </label>
                )}
                {(tool !== "AREA" || envs.includes("FOREST")) && (
                  <label className="grid gap-1">{t("terrainHeight")}
                    <Input type="number" min={0} max={20} step={0.25} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
                  </label>
                )}
                {tool === "AREA" && (
                  <fieldset className="grid grid-cols-2 gap-1">
                    <legend className="mb-1 text-xs text-muted-foreground">{t("environments")}</legend>
                    {AREA_ENVS.map((env) => (
                      <label key={env} className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={envs.includes(env)}
                          onChange={(e) => setEnvs((v) => (e.target.checked ? [...v, env] : v.filter((x) => x !== env)))} />
                        {t(`env.${env}`)}
                      </label>
                    ))}
                  </fieldset>
                )}
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" disabled={drawing.length < (tool === "WALL" ? 2 : 3) || (tool === "AREA" && envs.length === 0)} onClick={finishShape}>
                    <Check aria-hidden /> {t("finishShape")} <kbd className="text-xs opacity-70">Enter</kbd>
                  </Button>
                  <Button size="sm" variant="outline" disabled={!drawing.length} onClick={() => setDrawing((d) => d.slice(0, -1))}><Undo2 aria-hidden /> {t("removePoint")}</Button>
                </div>
                <ol className="grid gap-1">
                  {draft.shapes.map((s, i) => (
                    <li key={i} className={`flex items-center gap-2 rounded px-1 ${i === selectedShape ? "bg-accent" : ""}`}>
                      <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSelectedShape(i === selectedShape ? null : i)}>
                        {t(`shapeType.${s.type}`)}
                        {s.type === "WALL" ? ` · ${s.thickness}″ · ${s.height}″` : s.type === "OBSTACLE" ? ` · ${s.height}″` : ` · ${(s.envs ?? []).map((e) => t(`env.${e}`)).join(", ")}`}
                      </button>
                      <Button size="icon" variant="ghost" className="size-7" aria-label={t("remove")}
                        onClick={() => { setDraft({ ...draft, shapes: draft.shapes.filter((_, k) => k !== i) }); setSelectedShape(null); }}>
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !draft.name.trim() || !draft.imageId || (draft.kind === "terrain" && draft.shapes.length === 0)} onClick={() => void save()}>
              <Save aria-hidden /> {t("save")}
            </Button>
            {draft.id && <Button variant="outline" disabled={busy} onClick={() => void retire()}>{t("retire")}</Button>}
          </div>
          <p className="text-xs text-muted-foreground">{t("retireHelp")}</p>
        </div>
      )}
    </div>
  );
}
