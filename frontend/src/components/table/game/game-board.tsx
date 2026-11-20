"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { baseRadius, SHELF, shelfRect } from "@/lib/eld/geometry.ts";
import { MARKER_RADIUS } from "@/lib/eld/quests.ts";
import type { Marker, Model, Pt, TableState } from "@/lib/eld/types.ts";
import { ASSETS } from "@/lib/eld3d/assets";
import { imageUrl } from "@/lib/table/api";
import { deploymentZones } from "@/lib/table/deployment.ts";
import type { GameMeta } from "@/lib/table/game-api";
import { concealed, mayControl, type Preview, type RangeRing, type SightLine, type TemplateShape, type Viewer } from "@/lib/table/game-logic";
import { SIDE_HEX } from "./colors";

export type BoardMode = "select" | "measure" | "aim" | "token";

export type GameBoardProps = {
  /** The table as the viewer may see it (Shrouded figures masked, the hidden shelf end left out). */
  st: TableState;
  meta: GameMeta;
  viewer: Viewer;
  selected: string | null;
  selectedToken: string | null;
  mode: BoardMode;
  freeMove: boolean;
  showZones: boolean;
  showTerrain: boolean;
  rings: RangeRing[];
  sight: { lines: SightLine[]; arc: { id: string; full: boolean } | null } | null;
  template: TemplateShape | null;
  ariaLabel: string;
  shelfLabel: (side: 0 | 1) => string;
  /** Text of the bar shown while the pictures of the map are on their way (2D board). */
  loadingLabel?: (done: number, total: number) => string;
  previewMove: (m: Model, x: number, y: number) => Preview;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onTurn: (id: string, degrees: number) => void;
  onAim: (x: number, y: number) => void;
  onAimMove: (x: number, y: number) => void;
  onTokenSelect: (id: string | null) => void;
  onTokenPlace: (x: number, y: number) => void;
  onTokenMove: (id: string, x: number, y: number) => void;
};

const images = new Map<string, HTMLImageElement>();

/** Pictures by their address: library images of a 2D map, or the ground and the elements of a 3D map seen from above. */
function useImages(urls: (string | null | undefined)[]) {
  const [, setTick] = useState(0);
  const key = [...new Set(urls.filter(Boolean))].sort().join("\n");
  useEffect(() => {
    for (const url of key.split("\n")) {
      if (!url || images.has(url)) continue;
      const img = new Image();
      img.onload = () => setTick((n) => n + 1);
      img.onerror = () => {
        failed.add(url);
        setTick((n) => n + 1);
      };
      img.src = url;
      images.set(url, img);
    }
  }, [key]);
  // How many of the pictures have arrived (or failed): the board shows a bar until all of them have.
  const wanted = key ? key.split("\n") : [];
  const done = wanted.filter((url) => failed.has(url) || images.get(url)?.complete).length;
  return { images, total: wanted.length, done };
}

const failed = new Set<string>();

const libraryUrl = (id: string | null): string | null => (id ? imageUrl(id) : null);
/** A model of a 3D map from above: the picture shows 1.1 times the model's width. */
const TOP_SPAN = 1.1;
const topUrl = (file: string): string => `${ASSETS}/tops/${file.replace(/\.glb$/, ".webp")}`;
const PLAIN_FILL: Record<string, string> = { building: "#8a6f52", ruin: "#9a9486", rock: "#7d7f7c", forest: "rgba(46,110,60,.75)", water: "rgba(60,140,200,.7)", magic: "rgba(170,120,220,.4)" };

const round2 = (n: number): number => Math.round(n * 100) / 100;
const TOKEN_R = 0.55;
const TOKEN_LETTER: Record<string, string> = { intrigue: "?", sigil: "S", cache: "C", opened: "c", treasure: "T" };

type Drag = { id: string; dx: number; dy: number; from: Pt; preview: Preview | null; moved: boolean };
type TokenDrag = { id: string; at: Pt; moved: boolean };
type Measure = { a: Pt; b: Pt; aId: string | null; bId: string | null };

/**
 * The table of a game-engine table, drawn from above on a canvas, in inches. During deployment the shelves beyond
 * both table edges are part of the picture. Figures are dragged (the engine says what is allowed), the wheel
 * turns them.
 */
export function GameBoard(props: GameBoardProps) {
  const { st, meta, viewer } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fit, setFit] = useState({ w: 600, h: 600 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [tokenDrag, setTokenDrag] = useState<TokenDrag | null>(null);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [measuring, setMeasuring] = useState(false);
  // A map of the game seen in 2D: it is in the state (painted ground, elements with models), not in the library.
  const gameMap = !!meta.gameMap;
  const groundUrl = gameMap && st.ground ? `${ASSETS}/grounds/${st.ground}` : null;
  const { images: imgs, total: picturesTotal, done: picturesDone } = useImages([
    libraryUrl(meta.background.imageId), ...meta.placements.map((p) => libraryUrl(p.imageId)),
    groundUrl, ...(gameMap ? st.terrain.map((t) => (t.model ? topUrl(t.model.file) : null)) : []),
  ]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setFit({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, []);

  // The shelves are shown while figures may stand on them.
  const shelves = st.phase === "setup" || st.models.some((m) => m.y < 0 || m.y > st.height);
  const pad = shelves ? SHELF.gap + SHELF.depth + 0.3 : 0;
  const y0 = -pad;
  const spanY = st.height + 2 * pad;
  const scale = Math.max(4, Math.min(fit.w / st.width, fit.h / spanY));
  const cssW = Math.floor(st.width * scale);
  const cssH = Math.floor(spanY * scale);

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): Pt => {
      const r = canvas.current!.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * st.width, y: y0 + ((e.clientY - r.top) / r.height) * spanY };
    },
    [st.width, y0, spanY],
  );

  const modelAt = (p: Pt): Model | undefined => {
    let best: Model | undefined;
    let bestD = Infinity;
    for (const m of st.models) {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d <= baseRadius(m.size) + 0.12 && d < bestD) {
        best = m;
        bestD = d;
      }
    }
    return best;
  };
  const tokenAt = (p: Pt): Marker | undefined => st.markers.find((k) => k.kind === "token" && Math.hypot(k.x - p.x, k.y - p.y) <= TOKEN_R + 0.1);
  const draggable = (m: Model): boolean => viewer.canAct && !concealed(viewer, m) && (props.freeMove || mayControl(viewer, m.side));

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const k = scale * dpr;
    const X = (x: number) => x * k;
    const Y = (y: number) => (y - y0) * k;
    const L = (n: number) => n * k;
    const path = (pts: Pt[], close = true) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      if (close) ctx.closePath();
    };
    const text = (s: string, x: number, y: number, size = 0.38, color = "#fff", weight = 600) => {
      ctx.font = `${weight} ${Math.max(10 * dpr, L(size))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = "rgba(0,0,0,.75)";
      ctx.strokeText(s, X(x), Y(y));
      ctx.fillStyle = color;
      ctx.fillText(s, X(x), Y(y));
      ctx.textAlign = "start";
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#12141c";
    ctx.fillRect(0, 0, c.width, c.height);

    // ---- shelves: where a party stands before it is deployed; the dark end is hidden from the other player
    if (shelves) {
      for (const side of [0, 1] as const) {
        const r = shelfRect(st, side);
        ctx.fillStyle = "#2a2118";
        ctx.fillRect(X(r.x0), Y(r.y0), L(r.x1 - r.x0), L(r.y1 - r.y0));
        const hx0 = side === 0 ? st.width * (1 - SHELF.hidden) : 0;
        ctx.fillStyle = "rgba(0,0,0,.45)";
        ctx.fillRect(X(hx0), Y(r.y0), L(st.width * SHELF.hidden), L(r.y1 - r.y0));
        ctx.strokeStyle = SIDE_HEX[side];
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(X(r.x0), Y(r.y0), L(r.x1 - r.x0), L(r.y1 - r.y0));
        ctx.font = `600 ${Math.max(10 * dpr, L(0.45))}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,.4)";
        ctx.fillText(props.shelfLabel(side), X(r.x0 + 0.3), Y(side === 0 ? r.y1 - 0.3 : r.y0 + 0.7));
      }
    }

    // ---- the mat
    ctx.fillStyle = "#2b2a22";
    ctx.fillRect(X(0), Y(0), L(st.width), L(st.height));
    const picture = (url: string | null, x: number, y: number, w: number, h: number, rot: number) => {
      const img = url ? imgs.get(url) : undefined;
      if (!img || !img.complete || !img.naturalWidth) return;
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(img, -L(w) / 2, -L(h) / 2, L(w), L(h));
      ctx.restore();
    };
    picture(libraryUrl(meta.background.imageId), st.width / 2, st.height / 2, meta.background.widthIn, meta.background.heightIn, 0);
    picture(groundUrl, st.width / 2, st.height / 2, st.width, st.height, 0);
    ctx.lineWidth = dpr;
    for (let i = 0; i <= Math.max(st.width, st.height); i++) {
      ctx.strokeStyle = i % 6 === 0 ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)";
      if (i <= st.width) { ctx.beginPath(); ctx.moveTo(X(i), Y(0)); ctx.lineTo(X(i), Y(st.height)); ctx.stroke(); }
      if (i <= st.height) { ctx.beginPath(); ctx.moveTo(X(0), Y(i)); ctx.lineTo(X(st.width), Y(i)); ctx.stroke(); }
    }
    for (const p of meta.placements) picture(libraryUrl(p.imageId), p.x, p.y, p.widthIn, p.heightIn, p.rotation);
    if (gameMap) {
      // Plain scenery of the map (no model): drawn from its shape – areas first, then what stands on them.
      const plain = st.terrain.filter((t) => !t.model && !t.unseen && !t.painted && t.caster === undefined && t.until === undefined);
      for (const t of [...plain.filter((x) => x.kind === "area"), ...plain.filter((x) => x.kind === "obstacle")]) {
        path(t.shape);
        ctx.fillStyle = PLAIN_FILL[t.env] ?? "#8a8a8a";
        ctx.fill();
        if (t.kind === "obstacle") {
          ctx.strokeStyle = "rgba(0,0,0,.55)";
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();
        }
      }
      // Sculpted scenery: the model seen from above.
      for (const t of st.terrain) {
        if (t.model) picture(topUrl(t.model.file), t.model.x, t.model.y, t.model.size * TOP_SPAN, t.model.size * TOP_SPAN, t.model.turn);
      }
    }

    // ---- Deployment Zones
    if (props.showZones && st.phase === "setup") {
      for (const z of deploymentZones(st.width, st.height, st.deploy === "corner" ? "CORNER" : "STANDARD", st.deployDepth, st.deployDepth)) {
        const rgb = z.side === 0 ? "217,180,90" : "200,70,70";
        path(z.points);
        ctx.fillStyle = `rgba(${rgb},.13)`;
        ctx.fill();
        ctx.setLineDash([L(0.25), L(0.25)]);
        ctx.strokeStyle = `rgba(${rgb},.55)`;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ---- terrain as the rules see it (always for areas a Spell made)
    for (const t of st.terrain) {
      const spell = t.caster !== undefined || t.until !== undefined;
      if (!props.showTerrain && !spell) continue;
      path(t.shape);
      if (t.kind === "obstacle") {
        ctx.fillStyle = "rgba(20,16,12,.55)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,210,150,.9)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
        const cx = t.shape.reduce((n, p) => n + p.x, 0) / t.shape.length;
        const cy = t.shape.reduce((n, p) => n + p.y, 0) / t.shape.length;
        text(`${t.height}″`, cx, cy + 0.15, 0.36, "rgba(255,225,180,.95)");
      } else {
        ctx.fillStyle = t.env === "water" ? "rgba(60,140,200,.35)" : t.env === "forest" ? "rgba(60,150,80,.35)" : "rgba(170,120,220,.3)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.35)";
        ctx.lineWidth = dpr;
        ctx.stroke();
      }
    }
    if (props.showTerrain) {
      // Environments of the map the engine has no rules for: shown so the players can apply them.
      for (const t of meta.terrain) {
        if (t.kind !== "AREA" || t.envs.every((e) => e === "FOREST" || e === "AQUATIC_SHALLOW")) continue;
        path(t.points);
        ctx.setLineDash([L(0.2), L(0.2)]);
        ctx.strokeStyle = "rgba(255,255,255,.5)";
        ctx.lineWidth = dpr;
        ctx.stroke();
        ctx.setLineDash([]);
        const cx = t.points.reduce((n, p) => n + p.x, 0) / t.points.length;
        const cy = t.points.reduce((n, p) => n + p.y, 0) / t.points.length;
        text(t.envs.filter((e) => e !== "FOREST" && e !== "AQUATIC_SHALLOW").join(", ").toLowerCase().replace(/_/g, " "), cx, cy, 0.32, "rgba(255,255,255,.75)", 500);
      }
    }

    // ---- objective markers and tokens
    for (const mk of st.markers) {
      const moved = tokenDrag?.id === mk.id ? tokenDrag.at : mk;
      if (!mk.kind) {
        if (mk.radius > 0) {
          ctx.setLineDash([L(0.3), L(0.3)]);
          ctx.strokeStyle = "rgba(51,211,224,.6)";
          ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath(); ctx.arc(X(mk.x), Y(mk.y), L(mk.radius + MARKER_RADIUS), 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = "#33d3e0";
        ctx.strokeStyle = "#0d1322";
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(X(mk.x), Y(mk.y - MARKER_RADIUS)); ctx.lineTo(X(mk.x + MARKER_RADIUS), Y(mk.y));
        ctx.lineTo(X(mk.x), Y(mk.y + MARKER_RADIUS)); ctx.lineTo(X(mk.x - MARKER_RADIUS), Y(mk.y));
        ctx.closePath(); ctx.fill(); ctx.stroke();
        text(mk.name, mk.x, mk.y + MARKER_RADIUS + 0.5, 0.36);
        continue;
      }
      const sel = mk.id === props.selectedToken;
      ctx.fillStyle = mk.kind === "treasure" ? "#f2c14e" : mk.kind === "sigil" ? "#b98cf0" : mk.kind === "token" ? "#8bd3dd" : mk.kind === "opened" ? "#8c8577" : "#e8e2d2";
      ctx.strokeStyle = sel ? "#33d3e0" : "#0d1322";
      ctx.lineWidth = (sel ? 3 : 1.5) * dpr;
      ctx.beginPath(); ctx.arc(X(moved.x), Y(moved.y), L(mk.kind === "token" ? TOKEN_R : MARKER_RADIUS), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#0d1322";
      ctx.font = `700 ${Math.max(10 * dpr, L(0.45))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(mk.kind === "token" ? mk.name.slice(0, 2) : (TOKEN_LETTER[mk.kind] ?? "•"), X(moved.x), Y(moved.y + 0.16));
      ctx.textAlign = "start";
      text(mk.name, moved.x, moved.y + 1.05, 0.32, "rgba(255,255,255,.85)", 500);
    }

    // ---- template of an Attack or a Spell being aimed
    const tpl = props.template;
    if (tpl) {
      ctx.fillStyle = tpl.ok ? "rgba(255,138,61,.22)" : "rgba(240,80,80,.2)";
      ctx.strokeStyle = tpl.ok ? "rgba(255,138,61,.95)" : "rgba(240,80,80,.95)";
      ctx.lineWidth = 2 * dpr;
      if (tpl.circle) { ctx.beginPath(); ctx.arc(X(tpl.circle.at.x), Y(tpl.circle.at.y), L(tpl.circle.r), 0, Math.PI * 2); }
      else if (tpl.poly) path(tpl.poly);
      ctx.fill();
      ctx.stroke();
    }

    const byId = new Map(st.models.map((m) => [m.id, m]));

    // ---- what is left of Walk / Run, Awareness
    for (const ring of props.rings) {
      const m = byId.get(ring.id);
      if (!m) continue;
      if (ring.dashed) ctx.setLineDash([6 * dpr, 6 * dpr]);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), L(ring.radius), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- line of sight of the selected figure
    if (props.sight?.arc) {
      const m = byId.get(props.sight.arc.id);
      if (m) {
        const f = ((m.facing - 90) * Math.PI) / 180;
        ctx.fillStyle = "rgba(79,217,138,.10)";
        ctx.beginPath();
        ctx.moveTo(X(m.x), Y(m.y));
        if (props.sight.arc.full) ctx.arc(X(m.x), Y(m.y), L(9), 0, Math.PI * 2);
        else ctx.arc(X(m.x), Y(m.y), L(9), f - Math.PI / 2, f + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
      }
      for (const line of props.sight.lines) {
        const a = byId.get(line.from);
        const b = byId.get(line.to);
        if (!a || !b) continue;
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
      }
    }

    // ---- the route of this Activation
    const act = st.activation;
    if (act?.path && act.path.length > 1) {
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeStyle = "rgba(255,255,255,.45)";
      ctx.lineWidth = 1.5 * dpr;
      path(act.path, false);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- figures
    for (const m of st.models) {
      const hidden = concealed(viewer, m);
      const at = drag?.id === m.id && drag.moved && drag.preview?.at ? null : m;
      const r = baseRadius(m.size);
      const out = m.states.includes("Dead") || m.states.includes("Incapacitated");
      const cx = X(m.x), cy = Y(m.y), rr = L(r);
      ctx.globalAlpha = at ? (out ? 0.6 : 1) : 0.35;
      if (act?.id === m.id || act?.reactions[m.id]) {
        ctx.strokeStyle = act.id === m.id ? "#33d3e0" : "#ff8a3d";
        ctx.lineWidth = Math.max(3 * dpr, L(0.09));
        ctx.beginPath(); ctx.arc(cx, cy, rr + L(0.14), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = hidden ? "#555c6b" : "#0d1322";
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
      if (!hidden) {
        const f = ((m.facing - 90) * Math.PI) / 180;
        ctx.fillStyle = SIDE_HEX[m.side];
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rr, f - Math.PI / 2, f + Math.PI / 2); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = m.id === props.selected ? "#ffffff" : hidden ? SIDE_HEX[m.side] : "#000";
      ctx.lineWidth = (m.id === props.selected ? 3 : 1.5) * dpr;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      if (m.states.includes("Crouched") && !hidden) {
        ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.strokeStyle = "#fff"; ctx.lineWidth = dpr;
        ctx.beginPath(); ctx.arc(cx, cy, rr * 0.62, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      if (out) {
        ctx.strokeStyle = m.states.includes("Dead") ? "#f26d6d" : "#f2b84b"; ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.moveTo(cx - rr * 0.6, cy - rr * 0.6); ctx.lineTo(cx + rr * 0.6, cy + rr * 0.6);
        ctx.moveTo(cx + rr * 0.6, cy - rr * 0.6); ctx.lineTo(cx - rr * 0.6, cy + rr * 0.6); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (hidden) {
        text("?", m.x, m.y + 0.17, 0.5);
        continue;
      }
      if (m.leader) text("★", m.x, m.y + 0.15, 0.42, "#fff");
      const high = (m.z ?? 0) > 0.01 ? ` ▲${m.z}″` : "";
      const carry = m.treasure ? " ◆" : "";
      text(`${m.name.split(/[ ,]/)[0]}${carry}${high}`, m.x, m.y + r + 0.48, 0.36);
      // Activation Points left, as dots above the base
      if (st.phase === "playing" && !out && m.ap > 0) {
        ctx.fillStyle = "#fff";
        const n = Math.min(m.ap, 6);
        for (let i = 0; i < n; i++) {
          ctx.beginPath(); ctx.arc(cx + (i - (n - 1) / 2) * L(0.22), cy - rr - L(0.2), L(0.07), 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // ---- a figure being dragged: where it would stand and what the rules say
    if (drag?.moved && drag.preview) {
      const m = byId.get(drag.id);
      const at = drag.preview.at;
      if (m && at) {
        const ok = drag.preview.ok;
        ctx.strokeStyle = ok ? "rgba(255,255,255,.7)" : "rgba(240,80,80,.9)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([5 * dpr, 4 * dpr]);
        ctx.beginPath(); ctx.moveTo(X(drag.from.x), Y(drag.from.y)); ctx.lineTo(X(at.x), Y(at.y)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ok ? "rgba(79,217,138,.35)" : "rgba(240,80,80,.35)";
        ctx.strokeStyle = ok ? "#4fd98a" : "#f05050";
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.arc(X(at.x), Y(at.y), L(baseRadius(m.size)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (drag.preview.label) text(drag.preview.label, Math.min(st.width - 3, Math.max(3, at.x)), at.y - baseRadius(m.size) - 0.35, 0.36, ok ? "#fff" : "#ffb0b0");
      }
    }

    // ---- the ruler
    if (measure) {
      const d = Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y);
      const ra = measure.aId ? baseRadius(byId.get(measure.aId)?.size ?? "medium") : 0;
      const rb = measure.bId ? baseRadius(byId.get(measure.bId)?.size ?? "medium") : 0;
      ctx.strokeStyle = "#33d3e0";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.moveTo(X(measure.a.x), Y(measure.a.y)); ctx.lineTo(X(measure.b.x), Y(measure.b.y)); ctx.stroke();
      text(`${Math.max(0, d - ra - rb).toFixed(1)}″`, (measure.a.x + measure.b.x) / 2, (measure.a.y + measure.b.y) / 2 - 0.3, 0.45, "#33d3e0", 700);
    }
  }, [cssW, cssH, scale, y0, shelves, st, meta, viewer, imgs, props, drag, tokenDrag, measure, gameMap, groundUrl]);

  useEffect(() => {
    draw();
  }, [draw]);

  // The wheel turns the figure under the pointer (15° a notch). Only then is the page kept from scrolling.
  const onTurn = props.onTurn;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const h = (e: WheelEvent) => {
      const m = modelAt(toWorld(e));
      if (!m || !draggable(m)) return;
      e.preventDefault();
      onTurn(m.id, e.deltaY > 0 ? 15 : -15);
    };
    c.addEventListener("wheel", h, { passive: false });
    return () => c.removeEventListener("wheel", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTurn, toWorld, st, viewer, props.freeMove]);

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = toWorld(e);
    canvas.current?.setPointerCapture(e.pointerId);
    if (props.mode === "aim") return props.onAim(round2(p.x), round2(p.y));
    if (props.mode === "measure") {
      const m = modelAt(p);
      const a = m ? { x: m.x, y: m.y } : p;
      setMeasure({ a, b: a, aId: m?.id ?? null, bId: null });
      setMeasuring(true);
      return;
    }
    const token = viewer.canAct ? tokenAt(p) : undefined;
    if (props.mode === "token") {
      if (token) {
        props.onTokenSelect(token.id);
        setTokenDrag({ id: token.id, at: { x: token.x, y: token.y }, moved: false });
      } else if (p.x >= 0 && p.x <= st.width && p.y >= 0 && p.y <= st.height) props.onTokenPlace(round2(p.x), round2(p.y));
      return;
    }
    const m = modelAt(p);
    if (m) {
      props.onSelect(m.id);
      if (draggable(m)) setDrag({ id: m.id, dx: p.x - m.x, dy: p.y - m.y, from: { x: m.x, y: m.y }, preview: null, moved: false });
      return;
    }
    if (token) {
      props.onTokenSelect(token.id);
      setTokenDrag({ id: token.id, at: { x: token.x, y: token.y }, moved: false });
      return;
    }
    props.onSelect(null);
    props.onTokenSelect(null);
  };

  const move = (e: React.PointerEvent) => {
    const p = toWorld(e);
    if (props.mode === "aim") return props.onAimMove(round2(p.x), round2(p.y));
    if (measuring && measure) {
      const m = modelAt(p);
      setMeasure({ ...measure, b: m && m.id !== measure.aId ? { x: m.x, y: m.y } : p, bId: m && m.id !== measure.aId ? m.id : null });
      return;
    }
    if (tokenDrag) {
      const at = { x: round2(Math.max(0, Math.min(st.width, p.x))), y: round2(Math.max(0, Math.min(st.height, p.y))) };
      const k = st.markers.find((x) => x.id === tokenDrag.id);
      setTokenDrag({ ...tokenDrag, at, moved: tokenDrag.moved || (!!k && Math.hypot(at.x - k.x, at.y - k.y) > 0.15) });
      return;
    }
    if (!drag) return;
    const m = st.models.find((x) => x.id === drag.id);
    if (!m) return setDrag(null);
    const x = round2(p.x - drag.dx);
    const y = round2(p.y - drag.dy);
    if (!drag.moved && Math.hypot(x - m.x, y - m.y) < 0.15) return;
    setDrag({ ...drag, moved: true, preview: props.previewMove(m, x, y) });
  };

  const up = () => {
    if (measuring) return setMeasuring(false);
    if (tokenDrag) {
      if (tokenDrag.moved) props.onTokenMove(tokenDrag.id, tokenDrag.at.x, tokenDrag.at.y);
      return setTokenDrag(null);
    }
    if (drag) {
      const at = drag.preview?.at;
      if (drag.moved && drag.preview?.ok && at) props.onMove(drag.id, at.x, at.y);
      setDrag(null);
    }
  };

  const clearRuler = props.mode !== "measure" && measure !== null;
  useEffect(() => {
    if (!clearRuler) return;
    const timer = window.setTimeout(() => setMeasure(null), 0);
    return () => window.clearTimeout(timer);
  }, [clearRuler]);

  const loadingLabel = props.loadingLabel?.(picturesDone, picturesTotal);
  return (
    <div ref={wrap} className="relative flex size-full items-center justify-center overflow-hidden">
      {picturesDone < picturesTotal && loadingLabel && (
        <div role="status" className="absolute left-1/2 top-1/2 z-10 grid w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 gap-2 rounded-xl border border-primary bg-card/95 p-4 text-sm shadow-2xl">
          <span className="font-medium">{loadingLabel}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={picturesTotal} aria-valuenow={picturesDone}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(3, Math.round((picturesDone / picturesTotal) * 100))}%` }} />
          </div>
        </div>
      )}
      <canvas
        ref={canvas}
        role="img"
        aria-label={props.ariaLabel}
        style={{ width: cssW, height: cssH, touchAction: "none", cursor: props.mode === "select" ? (drag?.moved ? "grabbing" : "default") : "crosshair" }}
        className="block rounded-md"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
    </div>
  );
}
