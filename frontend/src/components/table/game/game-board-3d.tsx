"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CloudRain, Rotate3d, ScanEye, Settings2, Snowflake, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Model } from "@/lib/eld/types.ts";
import { setModelSet } from "@/lib/eld3d/assets";
import { loadReset, loadState, onLoadChange, type LoadState } from "@/lib/eld3d/loading";
import { TableScene } from "@/lib/eld3d/scene";
import { WEATHERS, type Weather } from "@/lib/eld3d/world";
import { concealed, mayControl } from "@/lib/table/game-logic";
import type { View3dSettings } from "@/lib/table/view3d-settings";
import type { GameBoardProps } from "./game-board";

const WEATHER_ICON = { sunny: Sun, rain: CloudRain, snow: Snowflake } as const;
const WEATHER_KEY = "wb.table3d.weather";
/** After this long the player is asked whether to go on waiting or play in 2D. */
const SLOW_MS = 30_000;
const mb = (bytes: number): string => (bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0);

export type GameBoard3DProps = GameBoardProps & {
  /** Quality of the picture; changing it builds the scene anew. */
  settings: View3dSettings;
  /** The player gives up on 3D for this table (loading takes too long). */
  onSwitch2d: () => void;
  /** Open the view and quality choice again. */
  onSettings: () => void;
};

/**
 * The table of a 3D game-engine table: the same state and the same handlers as the 2D board, drawn by the scene
 * ported from the game (lib/eld3d). Loaded only for 3D tables (three.js stays out of every other page).
 */
export function GameBoard3D(props: GameBoard3DProps) {
  const t = useTranslations("table.view3d");
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TableScene | null>(null);
  const latest = useRef(props);
  const [failed, setFailed] = useState(false);
  const [topDown, setTopDown] = useState(false);
  const [weather, setWeather] = useState<Weather>("sunny");
  const [load, setLoad] = useState<LoadState>(loadState);
  const [slow, setSlow] = useState<"no" | "ask" | "wait">("no");

  // First of the effects: the scene's hooks always see the props of this render.
  useEffect(() => {
    latest.current = props;
  });

  const seat = props.viewer.side === 1 ? 1 : 0;
  const settingsKey = JSON.stringify(props.settings);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const settings = latest.current.settings;
    setModelSet(settings.models);
    loadReset();
    const model = (id: string): Model | undefined => latest.current.st.models.find((m) => m.id === id);
    let made: TableScene;
    try {
      made = new TableScene(el, {
        canAct: () => latest.current.viewer.canAct,
        canDrag: (id) => {
          const p = latest.current;
          const m = model(id);
          return !!m && p.viewer.canAct && !concealed(p.viewer, m) && (p.freeMove || mayControl(p.viewer, m.side));
        },
        hidden: (id) => {
          const m = model(id);
          return !!m && concealed(latest.current.viewer, m);
        },
        onSelect: (id) => latest.current.onSelect(id),
        onMove: (id, x, y) => latest.current.onMove(id, x, y),
        previewMove: (id, x, y) => {
          const m = model(id);
          return m ? latest.current.previewMove(m, x, y) : { ok: false, label: "" };
        },
        previewAim: (x, y) => latest.current.onAimMove(x, y),
        onAim: (x, y) => latest.current.onAim(x, y),
        onTurn: (id, degrees) => latest.current.onTurn(id, degrees),
        onTokenSelect: (id) => latest.current.onTokenSelect(id),
        onTokenPlace: (x, y) => latest.current.onTokenPlace(x, y),
        onTokenMove: (id, x, y) => latest.current.onTokenMove(id, x, y),
      }, seat, settings);
    } catch {
      // No WebGL (an old device, a blocked graphics driver): say so instead of an empty box.
      const timer = window.setTimeout(() => setFailed(true), 0);
      return () => window.clearTimeout(timer);
    }
    scene.current = made;
    let kept: Weather | null = null;
    try {
      kept = window.localStorage.getItem(WEATHER_KEY) as Weather | null;
    } catch {
      // private mode: the weather is simply not remembered
    }
    if (kept && WEATHERS.includes(kept)) {
      made.setWeather(kept);
      const w = kept;
      window.setTimeout(() => setWeather(w), 0);
    }
    const p = latest.current;
    made.setShowZones(p.showZones);
    made.setShowTerrain(p.showTerrain);
    made.setState(p.st);
    made.setSelected(p.selected);
    made.setSelectedToken(p.selectedToken);
    made.setMode(p.mode);
    made.setRanges(p.rings);
    made.setSight(p.sight?.lines ?? [], p.sight?.arc ?? null);
    made.setTemplate(p.template);
    return () => {
      scene.current = null;
      made.dispose();
    };
  }, [seat, settingsKey]);

  // What is still being fetched; after half a minute of it the player is asked about 2D (once).
  useEffect(() => onLoadChange(() => setLoad(loadState())), []);
  const busy = load.busy;
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setSlow((s) => (s === "no" ? "ask" : s)), SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [busy, settingsKey]);
  const percent = load.total > 0 ? Math.min(100, Math.round((load.loaded / load.total) * 100)) : load.files > 0 ? Math.round((load.done / load.files) * 100) : 0;

  const { st, viewer } = props;
  useEffect(() => {
    scene.current?.setState(st);
  }, [st, viewer.canAct, viewer.solo, viewer.side]);
  useEffect(() => {
    scene.current?.setSelected(props.selected);
  }, [props.selected]);
  useEffect(() => {
    scene.current?.setSelectedToken(props.selectedToken);
  }, [props.selectedToken]);
  useEffect(() => {
    scene.current?.setMode(props.mode);
  }, [props.mode]);
  useEffect(() => {
    scene.current?.setShowZones(props.showZones);
  }, [props.showZones]);
  useEffect(() => {
    scene.current?.setShowTerrain(props.showTerrain);
  }, [props.showTerrain]);
  // Rings, sight lines and the template are new objects on every render: compare what they say.
  const ringsKey = JSON.stringify(props.rings);
  useEffect(() => {
    scene.current?.setRanges(latest.current.rings);
  }, [ringsKey]);
  const sightKey = JSON.stringify(props.sight);
  useEffect(() => {
    const s = latest.current.sight;
    scene.current?.setSight(s?.lines ?? [], s?.arc ?? null);
  }, [sightKey]);
  const templateKey = JSON.stringify(props.template);
  useEffect(() => {
    scene.current?.setTemplate(latest.current.template);
  }, [templateKey]);

  const flip = () => {
    const next = !topDown;
    scene.current?.setTopDown(next);
    setTopDown(next);
  };
  const nextWeather = () => {
    const next = WEATHERS[(WEATHERS.indexOf(weather) + 1) % WEATHERS.length]!;
    scene.current?.setWeather(next);
    setWeather(next);
    try {
      window.localStorage.setItem(WEATHER_KEY, next);
    } catch {
      // not remembered
    }
  };
  const WeatherIcon = WEATHER_ICON[weather];

  if (failed) {
    return <p role="alert" className="m-auto max-w-md rounded-lg border bg-card p-4 text-center text-sm">{t("noWebgl")}</p>;
  }
  return (
    <div className="relative size-full overflow-hidden rounded-md bg-[#12141c]">
      <div ref={host} role="img" aria-label={props.ariaLabel} className="absolute inset-0" />
      <div className="absolute right-2 top-2 flex gap-1.5">
        <Button type="button" size="sm" variant="secondary" onClick={flip} aria-pressed={topDown} title={t(topDown ? "perspective" : "topDown")}>
          {topDown ? <Rotate3d aria-hidden /> : <ScanEye aria-hidden />}
          <span className="hidden sm:inline">{t(topDown ? "perspective" : "topDown")}</span>
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={nextWeather} title={t("weatherTitle")}>
          <WeatherIcon aria-hidden />
          <span className="hidden sm:inline">{t(`weather.${weather}`)}</span>
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={props.onSettings} title={t("settings")} aria-label={t("settings")}>
          <Settings2 aria-hidden />
        </Button>
      </div>
      {busy && (
        <div role="status" className="absolute left-1/2 top-1/2 grid w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 gap-2 rounded-xl border border-primary bg-card/95 p-4 text-sm shadow-2xl">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{t("loading")}</span>
            <span className="tabular-nums text-muted-foreground">
              {percent}%{load.total > 0 ? ` · ${mb(load.loaded)} / ${mb(load.total)} MB` : ` · ${t("loadingFiles", { done: load.done, files: load.files })}`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(3, percent)}%` }} />
          </div>
          {slow === "ask" ? (
            <div className="grid gap-2 border-t pt-2">
              <p>{t("slowAsk")}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={props.onSwitch2d}>{t("slowSwitch")}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSlow("wait")}>{t("slowWait")}</Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("loadingHelp")}</p>
          )}
        </div>
      )}
      {!busy && load.failed > 0 && (
        <p role="alert" className="absolute left-2 top-2 max-w-xs rounded-md border bg-card/95 px-3 py-1.5 text-xs text-amber-400">{t("loadFailed", { n: load.failed })}</p>
      )}
      <p className="pointer-events-none absolute bottom-2 left-1/2 max-w-[92%] -translate-x-1/2 rounded-full border bg-background/80 px-3 py-1 text-center text-xs text-muted-foreground">
        {t("controls")}
      </p>
    </div>
  );
}
