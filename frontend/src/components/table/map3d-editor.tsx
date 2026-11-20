"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box, Plus, Save, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { ApiError } from "@/lib/api";
import { BASES, buildItems, KITS, MAPS, MAX_ITEMS, type Placement } from "@/lib/eld/maps.ts";
import { ASSETS } from "@/lib/eld3d/assets";
import { deleteGameMap, fetchGameMaps, MAX_MODELS, saveGameMap, type StoredGameMap } from "@/lib/table/game-maps";

// The 3D preview brings three.js: loaded only when the admin asks for it.
const Map3dPreview = dynamic(() => import("./map3d-preview").then((m) => m.Map3dPreview), { ssr: false });

type Draft = { id: string | null; name: string; base: string; items: Placement[]; published: boolean };
const SIZE = 36;
const TOP_SPAN = 1.1;
const blank = (): Draft => ({ id: null, name: "", base: BASES[1]?.id ?? BASES[0]!.id, items: [], published: false });
const kitOf = (id: string) => KITS.find((k) => k.id === id);
const topUrl = (file: string): string => `${ASSETS}/tops/${file.replace(/\.glb$/, ".webp")}`;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const PLAIN_FILL: Record<string, string> = { building: "#8a6f52", ruin: "#9a9486", rock: "#7d7f7c", forest: "rgba(46,110,60,.75)", water: "rgba(60,140,200,.7)", magic: "rgba(170,120,220,.4)" };

const pictures = new Map<string, HTMLImageElement>();

/**
 * The map creator for 3D tables (admins only). A map is a ground of the game and terrain elements of the game placed
 * on it; it is laid out on a plan from above – which is also exactly its 2D version – and can be looked at in 3D.
 * Players get the published maps in the "new table" form, for 3D and for 2D tables.
 */
export function Map3dEditor() {
  const t = useTranslations("maps3d");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { me, loading } = useAuth();
  const admin = !!me?.roles.includes("ADMIN");
  const [maps, setMaps] = useState<StoredGameMap[] | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [picked, setPicked] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [, setTick] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ i: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!loading && !admin) router.replace("/tables");
  }, [loading, admin, router]);

  const explain = useCallback((e: unknown): string => (e instanceof ApiError && e.code === "TABLE_RULE" && e.detail ? e.detail : errorMessage(e)), [errorMessage]);
  useEffect(() => {
    if (admin) fetchGameMaps(true).then(setMaps).catch((e) => setError(explain(e)));
  }, [admin, explain]);

  const base = BASES.find((b) => b.id === draft.base) ?? BASES[0]!;
  const models = draft.items.filter((i) => kitOf(i.kit)?.model).length;
  const change = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setItem = (i: number, patch: Partial<Placement>) => change({ items: draft.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });

  // ---- the plan
  const picture = (url: string): HTMLImageElement | null => {
    let img = pictures.get(url);
    if (!img) {
      img = new Image();
      img.onload = () => setTick((n) => n + 1);
      img.src = url;
      pictures.set(url, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const css = c.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(css * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const k = (css * dpr) / SIZE;
    ctx.fillStyle = "#4f6f33";
    ctx.fillRect(0, 0, c.width, c.height);
    const ground = base.ground ? picture(`${ASSETS}/grounds/${base.ground}`) : null;
    if (ground) ctx.drawImage(ground, 0, 0, c.width, c.height);
    const path = (pts: { x: number; y: number }[]) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k)));
      ctx.closePath();
    };
    ctx.lineWidth = dpr;
    for (let i = 0; i <= SIZE; i += 6) {
      ctx.strokeStyle = "rgba(255,255,255,.14)";
      ctx.beginPath(); ctx.moveTo(i * k, 0); ctx.lineTo(i * k, c.height); ctx.moveTo(0, i * k); ctx.lineTo(c.width, i * k); ctx.stroke();
    }
    // Deployment belts (8"): a reminder of where the parties start.
    ctx.fillStyle = "rgba(200,70,70,.10)";
    ctx.fillRect(0, 0, c.width, 8 * k);
    ctx.fillStyle = "rgba(59,130,246,.10)";
    ctx.fillRect(0, c.height - 8 * k, c.width, 8 * k);
    // Water that belongs to the ground (a painted stream).
    for (const w of base.fixed) {
      path(w.shape);
      ctx.fillStyle = "rgba(60,140,200,.28)";
      ctx.fill();
    }
    draft.items.forEach((it, i) => {
      const kit = kitOf(it.kit);
      if (!kit) return;
      const shapes = buildItems([it]);
      if (kit.model) {
        const img = picture(topUrl(kit.model));
        if (img) {
          ctx.save();
          ctx.translate(it.x * k, it.y * k);
          ctx.rotate((it.turn * Math.PI) / 180);
          const w = it.size * TOP_SPAN * k;
          ctx.drawImage(img, -w / 2, -w / 2, w, w);
          ctx.restore();
        }
      } else {
        for (const s of shapes) {
          path(s.shape);
          ctx.fillStyle = PLAIN_FILL[s.env] ?? "#8a8a8a";
          ctx.fill();
        }
      }
      // The rules shapes: what blocks (orange), what can be walked onto (green), areas (white).
      for (const s of shapes) {
        path(s.shape);
        ctx.strokeStyle = s.kind === "area" ? "rgba(255,255,255,.8)" : s.height > 1.8 ? "rgba(255,150,60,.95)" : "rgba(110,230,120,.95)";
        ctx.lineWidth = (i === picked ? 2.5 : 1.2) * dpr;
        ctx.stroke();
      }
      if (i === picked) {
        ctx.strokeStyle = "#33d3e0";
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.beginPath(); ctx.arc(it.x * k, it.y * k, (it.size * (kit.model ? TOP_SPAN : 1) * k) / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  });

  const at = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };
  const hit = (p: { x: number; y: number }): number | null => {
    let best: number | null = null;
    let bestD = Infinity;
    draft.items.forEach((it, i) => {
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d <= it.size / 2 && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  };
  const down = (e: React.PointerEvent) => {
    const p = at(e);
    const i = hit(p);
    setPicked(i);
    if (i === null) return;
    canvas.current?.setPointerCapture(e.pointerId);
    drag.current = { i, dx: draft.items[i]!.x - p.x, dy: draft.items[i]!.y - p.y };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    setItem(d.i, { x: round2(Math.min(SIZE, Math.max(0, p.x + d.dx))), y: round2(Math.min(SIZE, Math.max(0, p.y + d.dy))) });
  };
  const up = () => {
    drag.current = null;
  };
  // The wheel turns the picked element (15° a notch); with Shift it changes its size.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const h = (e: WheelEvent) => {
      if (picked === null) return;
      const it = draft.items[picked];
      const kit = it && kitOf(it.kit);
      if (!it || !kit) return;
      e.preventDefault();
      const step = e.deltaY > 0 ? 1 : -1;
      if (e.shiftKey) setItem(picked, { size: round2(Math.min(kit.size[2], Math.max(kit.size[0], it.size + step * 0.5))) });
      else setItem(picked, { turn: (((it.turn + step * 15) % 360) + 360) % 360 });
    };
    c.addEventListener("wheel", h, { passive: false });
    return () => c.removeEventListener("wheel", h);
  });

  const add = (kitId: string) => {
    const kit = kitOf(kitId);
    if (!kit || draft.items.length >= MAX_ITEMS || (kit.model && models >= MAX_MODELS)) return;
    change({ items: [...draft.items, { kit: kitId, x: 18, y: 18, size: kit.size[1], turn: 0 }] });
    setPicked(draft.items.length);
  };
  const remove = (i: number) => {
    change({ items: draft.items.filter((_, k) => k !== i) });
    setPicked(null);
  };
  const open = (m: { id: string | null; name: string; base: string; items: Placement[]; published: boolean }) => {
    setDraft({ id: m.id, name: m.name, base: m.base, items: m.items.map((i) => ({ ...i })), published: m.published });
    setPicked(null);
    setSaved(false);
    setError(null);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveGameMap(draft.id, { name: draft.name.trim(), base: draft.base, items: draft.items, published: draft.published });
      setMaps((list) => [...(list ?? []).filter((m) => m.id !== res.id), res].sort((a, b) => a.name.localeCompare(b.name)));
      open(res);
      setSaved(true);
    } catch (e) {
      setError(explain(e));
    }
    setBusy(false);
  };
  const destroy = async () => {
    if (!draft.id || !window.confirm(t("confirmDelete", { name: draft.name }))) return;
    setBusy(true);
    try {
      await deleteGameMap(draft.id);
      setMaps((list) => (list ?? []).filter((m) => m.id !== draft.id));
      open(blank());
    } catch (e) {
      setError(explain(e));
    }
    setBusy(false);
  };

  if (!admin) return null;
  const it = picked !== null ? draft.items[picked] : undefined;
  const itKit = it ? kitOf(it.kit) : undefined;
  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4">
      <h1 className="font-display text-2xl">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {saved && <Alert variant="success">{t("saved")}</Alert>}

      <Card>
        <CardHeader><CardTitle>{t("maps")}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={draft.id === null ? "default" : "outline"} onClick={() => open(blank())}><Plus aria-hidden /> {t("newMap")}</Button>
          {(maps ?? []).map((m) => (
            <Button key={m.id} size="sm" variant={draft.id === m.id ? "default" : "outline"} onClick={() => open(m)}>
              {m.name} {!m.published && <Badge variant="secondary">{t("draft")}</Badge>}
            </Button>
          ))}
          <span className="mx-1 text-xs text-muted-foreground">{t("startFrom")}</span>
          {MAPS.filter((m) => !m.terrain).map((m) => (
            <Button key={m.id} size="sm" variant="ghost" onClick={() => open({ id: null, name: `${m.name} 2`, base: m.base, items: m.items, published: false })}>{m.name}</Button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-3">
          <canvas ref={canvas} className="aspect-square w-full max-w-[44rem] cursor-pointer rounded-md border" style={{ touchAction: "none" }}
            role="img" aria-label={t("planLabel")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          <p className="text-xs text-muted-foreground">{t("planHelp")}</p>
          <div>
            <Button variant="outline" onClick={() => setPreview((x) => !x)} aria-pressed={preview}><Box aria-hidden /> {t(preview ? "hidePreview" : "showPreview")}</Button>
          </div>
          {preview && <div className="max-w-[44rem]"><Map3dPreview base={draft.base} items={draft.items} noWebgl={t("noWebgl")} /></div>}
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardContent className="grid gap-3 pt-4 text-sm">
              <label className="grid gap-1">{t("name")}
                <Input value={draft.name} maxLength={40} onChange={(e) => change({ name: e.target.value })} />
              </label>
              <label className="grid gap-1">{t("ground")}
                <NativeSelect value={draft.base} onChange={(e) => change({ base: e.target.value })}>
                  {BASES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </NativeSelect>
              </label>
              <p className="text-xs text-muted-foreground">
                {t("counts", { items: draft.items.length, maxItems: MAX_ITEMS, models, maxModels: MAX_MODELS })}
              </p>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={draft.published} onChange={(e) => change({ published: e.target.checked })} />
                <span>{t("published")}<span className="block text-xs text-muted-foreground">{t("publishedHelp")}</span></span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !draft.name.trim()} onClick={() => void save()}><Save aria-hidden /> {t("save")}</Button>
                {draft.id && <Button variant="outline" disabled={busy} onClick={() => void destroy()}><Trash2 aria-hidden /> {t("delete")}</Button>}
              </div>
            </CardContent>
          </Card>

          {it && itKit && picked !== null && (
            <Card className="border-primary/60">
              <CardHeader><CardTitle className="text-base">{itKit.name}</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <label className="grid gap-1">{t("size", { n: it.size })}
                  <input type="range" min={itKit.size[0]} max={itKit.size[2]} step={0.5} value={it.size} onChange={(e) => setItem(picked, { size: Number(e.target.value) })} />
                </label>
                <label className="grid gap-1">{t("turn", { n: it.turn })}
                  <input type="range" min={0} max={345} step={15} value={it.turn} onChange={(e) => setItem(picked, { turn: Number(e.target.value) })} />
                </label>
                <Button variant="outline" size="sm" onClick={() => remove(picked)}><Trash2 aria-hidden /> {t("removeElement")}</Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">{t("elements")}</CardTitle></CardHeader>
            <CardContent className="grid max-h-[28rem] grid-cols-2 gap-1.5 overflow-auto">
              {KITS.map((kit) => (
                <Button key={kit.id} size="sm" variant="outline" className="h-auto justify-start whitespace-normal py-1.5 text-left text-xs"
                  disabled={draft.items.length >= MAX_ITEMS || (!!kit.model && models >= MAX_MODELS)} onClick={() => add(kit.id)}>
                  {kit.name}{!kit.model && <span className="ml-1 text-muted-foreground">· {t("plain")}</span>}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
