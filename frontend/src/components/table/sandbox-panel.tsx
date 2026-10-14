"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Move, Plus, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { api } from "@/lib/api";
import {
  TERRAIN_CATEGORIES, imageUrl, type Background, type ProfileView, type TableCommand, type TableView, type TerrainPiece,
} from "@/lib/table/api";
import { MAX_SCALE, MIN_SCALE } from "@/lib/table/terrain.ts";

export type SandboxTab = "MAT" | "TERRAIN" | "MODELS";

/** What can be dragged from the panel onto the board. */
export type PanelDrop = { kind: "TERRAIN"; ref: string; name: string } | { kind: "MODEL"; ref: string; name: string; side: 0 | 1 };

/** What the next click on the board does in a free game. */
export type Placing =
  | { kind: "TERRAIN"; ref: string; name: string; scale: number; rotation: number }
  | { kind: "MODEL"; ref: string; name: string; side: 0 | 1 }
  | { kind: "MOVE_TERRAIN"; id: string; name: string };

const clampScale = (k: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(k * 100) / 100));
const norm = (d: number) => ((d % 360) + 360) % 360;

/**
 * Free game: pick the mat, drop terrain pieces from the library and models from the profiles onto the table
 * (as many as you like), turn, scale, move or remove the pieces.
 */
export function SandboxPanel({ view, busy, run, tab, setTab, placing, setPlacing, selectedPiece, setSelectedPiece, dragStart, wasDragging }: {
  view: TableView;
  busy: boolean;
  run: (cmd: TableCommand, asSide?: 0 | 1) => Promise<boolean>;
  tab: SandboxTab;
  setTab: (t: SandboxTab) => void;
  placing: Placing | null;
  setPlacing: (p: Placing | null) => void;
  selectedPiece: string | null;
  setSelectedPiece: (id: string | null) => void;
  /** Starts dragging an item onto the board (mouse at once, touch after a short hold). */
  dragStart: (e: React.PointerEvent, payload: PanelDrop, imageId: string | null, label: string) => void;
  /** True right after a drop – the click that ends a drag is ignored. */
  wasDragging: () => boolean;
}) {
  const t = useTranslations("table");
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [library, setLibrary] = useState<TerrainPiece[]>([]);
  const [profiles, setProfiles] = useState<ProfileView[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [side, setSide] = useState<0 | 1>(view.you === 1 ? 1 : 0);

  useEffect(() => {
    api<Background[]>("GET", "/api/table/backgrounds").then(setBackgrounds).catch(() => setBackgrounds([]));
    api<TerrainPiece[]>("GET", "/api/table/terrain").then(setLibrary).catch(() => setLibrary([]));
    api<ProfileView[]>("GET", "/api/tables/profiles").then(setProfiles).catch(() => setProfiles([]));
  }, []);

  const sides: (0 | 1)[] = view.solo ? [0, 1] : view.you === 0 || view.you === 1 ? [view.you] : [];
  const shownTerrain = library.filter((p) => p.active && (!category || p.category === category));
  const shownProfiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles.filter((p) => !q || p.name.toLowerCase().includes(q) || p.factions.some((f) => f.toLowerCase().includes(q)));
  }, [profiles, query]);
  const piece = view.placements.find((p) => p.id === selectedPiece) ?? null;
  const movePiece = (changes: { rotation?: number; scale?: number }) => piece && run({
    type: "MOVE_TERRAIN", id: piece.id, x: piece.x, y: piece.y,
    facing: norm(changes.rotation ?? piece.rotation), scale: clampScale(changes.scale ?? piece.scale),
  });
  const sideName = (s: 0 | 1) => view.players.find((p) => p.side === s)?.name ?? t("sideB");

  return (
    <CollapsibleCard title={t("sandboxTitle")} defaultOpen contentClassName="grid gap-3 text-sm">
      <div className="flex flex-wrap gap-1" role="tablist">
        {(["MAT", "TERRAIN", "MODELS"] as const).map((k) => (
          <Button key={k} size="sm" role="tab" aria-selected={tab === k} variant={tab === k ? "default" : "outline"}
            onClick={() => { setTab(k); setPlacing(null); }}>{t(`sandboxTab.${k}`)}</Button>
        ))}
      </div>

      {placing && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/60 bg-primary/10 p-2 text-xs">
          <span className="min-w-0 flex-1">{t(`placingHelp.${placing.kind}`, { name: placing.name })}</span>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPlacing(null)}>{t("cancel")}</Button>
        </div>
      )}

      {tab === "MAT" && (
        <label className="grid gap-1">{t("background")}
          <NativeSelect value={view.backgroundId ?? ""} disabled={busy}
            onChange={(e) => e.target.value && void run({ type: "SET_BACKGROUND", ref: e.target.value })}>
            <option value="">{t("chooseBackground")}</option>
            {backgrounds.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.widthIn}″×{b.heightIn}″)</option>)}
          </NativeSelect>
          <span className="text-xs text-muted-foreground">{t("matHelp")}</span>
        </label>
      )}

      {tab === "TERRAIN" && (
        <>
          {piece ? (
            <div className="grid gap-2 rounded-md border p-2">
              <span className="font-medium">{piece.name ?? t("terrainPiece")}</span>
              <div className="flex flex-wrap items-center gap-1">
                <Button size="icon" variant="outline" className="size-8" aria-label={t("rotateLeft")} disabled={busy} onClick={() => void movePiece({ rotation: piece.rotation - 15 })}><RotateCcw aria-hidden /></Button>
                <Button size="icon" variant="outline" className="size-8" aria-label={t("rotateRight")} disabled={busy} onClick={() => void movePiece({ rotation: piece.rotation + 15 })}><RotateCw aria-hidden /></Button>
                <Button size="icon" variant="outline" className="size-8" aria-label={t("scaleDown")} disabled={busy} onClick={() => void movePiece({ scale: piece.scale / 1.1 })}><Minus aria-hidden /></Button>
                <Button size="icon" variant="outline" className="size-8" aria-label={t("scaleUp")} disabled={busy} onClick={() => void movePiece({ scale: piece.scale * 1.1 })}><Plus aria-hidden /></Button>
                <span className="text-xs text-muted-foreground">{Math.round(piece.rotation)}° · {Math.round(piece.scale * 100)}%</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setPlacing({ kind: "MOVE_TERRAIN", id: piece.id, name: piece.name ?? "" })}>
                  <Move aria-hidden /> {t("movePiece")}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (await run({ type: "REMOVE_TERRAIN", id: piece.id })) setSelectedPiece(null); }}>
                  <Trash2 aria-hidden /> {t("remove")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("pickPieceHelp")}</p>
          )}
          <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("category")}>
            <option value="">{t("allCategories")}</option>
            {TERRAIN_CATEGORIES.map((c) => <option key={c} value={c}>{t(`categoryName.${c}`)}</option>)}
          </NativeSelect>
          {shownTerrain.length === 0 && <p className="text-xs text-muted-foreground">{t("emptyLibrary")}</p>}
          <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-auto">
            {shownTerrain.map((p) => (
              <li key={p.id}>
                <button type="button" title={`${p.name} – ${t("dragToBoard")}`}
                  onPointerDown={(e) => dragStart(e, { kind: "TERRAIN", ref: p.id, name: p.name }, p.imageId, p.name)}
                  onClick={() => {
                    if (wasDragging()) return;
                    setSelectedPiece(null);
                    setPlacing({ kind: "TERRAIN", ref: p.id, name: p.name, scale: 1, rotation: 0 });
                  }}
                  className={`grid w-full cursor-grab touch-pan-y select-none gap-1 rounded-md border p-1 text-left text-[11px] hover:border-primary ${placing?.kind === "TERRAIN" && placing.ref === p.id ? "border-primary" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl(p.imageId)} alt="" className="aspect-square w-full rounded bg-muted object-contain" />
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "MODELS" && (
        <>
          {sides.length > 1 && (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t("side")}>
              {sides.map((s) => (
                <Button key={s} size="sm" variant={side === s ? "default" : "outline"} onClick={() => { setSide(s); setPlacing(null); }}>
                  <span style={{ color: s === 0 ? "#d9b45a" : "#c84646" }}>●</span> {sideName(s)}
                </Button>
              ))}
            </div>
          )}
          <Input value={query} placeholder={t("profileSearch")} onChange={(e) => setQuery(e.target.value)} />
          <ul className="grid max-h-80 gap-1 overflow-auto">
            {shownProfiles.map((p) => {
              const s = sides.includes(side) ? side : sides[0];
              const active = placing?.kind === "MODEL" && placing.ref === p.code && placing.side === s;
              return (
                <li key={p.code}>
                  <button type="button" disabled={s == null} title={t("dragToBoard")}
                    onPointerDown={(e) => s != null && dragStart(e, { kind: "MODEL", ref: p.code, name: p.name, side: s }, null, p.name)}
                    onClick={() => s != null && !wasDragging() && setPlacing({ kind: "MODEL", ref: p.code, name: p.name, side: s })}
                    className={`flex w-full cursor-grab touch-pan-y select-none items-center gap-2 rounded-md border px-2 py-1 text-left text-xs hover:border-primary ${active ? "border-primary bg-primary/10" : ""}`}>
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className="shrink-0 text-muted-foreground">{t(`size.${p.size}`)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">{t("modelsHelp")}</p>
        </>
      )}
    </CollapsibleCard>
  );
}
