"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { DEFAULT_LEAGUE, LEAGUE_SCORING_MODES, type LeagueScoringMode, type LeagueSettings } from "@/lib/leagues";

type Props = { initial?: LeagueSettings; submitLabel: string; onSubmit: (s: LeagueSettings) => Promise<void> };

/** Create / edit a league season. Numbers are kept as strings while typing. */
export function LeagueForm({ initial, submitLabel, onSubmit }: Props) {
  const t = useTranslations("leagues.form");
  const tm = useTranslations("leagues.mode");
  const errorMessage = useErrorMessage();
  const start = initial ?? DEFAULT_LEAGUE;
  const [name, setName] = useState(start.name);
  const [description, setDescription] = useState(start.description ?? "");
  const [city, setCity] = useState(start.city ?? "");
  const [startsOn, setStartsOn] = useState(start.startsOn);
  const [endsOn, setEndsOn] = useState(start.endsOn);
  const [mode, setMode] = useState<LeagueScoringMode>(start.scoringMode);
  const [ownGames, setOwnGames] = useState(start.ownGamesAllowed);
  const [placePoints, setPlacePoints] = useState(start.placePoints.join(", "));
  const [num, setNum] = useState({
    participationPoints: String(start.participationPoints),
    multiplierLocal: String(start.multiplierLocal),
    multiplierMaster: String(start.multiplierMaster),
    multiplierInternational: String(start.multiplierInternational),
    bigPointsMultiplier: String(start.bigPointsMultiplier),
    gameWinPoints: String(start.gameWinPoints),
    gameDrawPoints: String(start.gameDrawPoints),
    gameLossPoints: String(start.gameLossPoints),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (key: keyof typeof num, label: string, step = "1") => (
    <div className="grid content-start gap-2">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} type="number" min={0} max={key.startsWith("multiplier") || key === "bigPointsMultiplier" ? 100 : 1000}
        step={step} value={num[key]} onChange={(e) => setNum((n) => ({ ...n, [key]: e.target.value }))} />
    </div>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = placePoints.split(/[,;\s]+/).filter(Boolean).map((x) => Number.parseInt(x, 10));
    if (parsed.length === 0 || parsed.some((x) => !Number.isFinite(x) || x < 0)) {
      setError(t("placePointsInvalid"));
      return;
    }
    const n = (k: keyof typeof num) => Number(num[k] || "0");
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        city: city.trim() || null,
        startsOn,
        endsOn,
        scoringMode: mode,
        ownGamesAllowed: mode !== "PLACE_POINTS" && ownGames,
        placePoints: parsed,
        participationPoints: n("participationPoints"),
        multiplierLocal: n("multiplierLocal"),
        multiplierMaster: n("multiplierMaster"),
        multiplierInternational: n("multiplierInternational"),
        bigPointsMultiplier: n("bigPointsMultiplier"),
        gameWinPoints: n("gameWinPoints"),
        gameDrawPoints: n("gameDrawPoints"),
        gameLossPoints: n("gameLossPoints"),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="grid gap-6">
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" required minLength={3} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="city">{t("city")}</Label>
          <Input id="city" maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="startsOn">{t("startsOn")}</Label>
            <Input id="startsOn" type="date" required value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="endsOn">{t("endsOn")}</Label>
            <Input id="endsOn" type="date" required min={startsOn || undefined} value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="description">{t("description")}</Label>
          <Textarea id="description" maxLength={4000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <fieldset className="grid gap-4">
        <legend className="mb-2 font-display text-lg">{t("scoring")}</legend>
        <div className="grid gap-2">
          <Label htmlFor="mode">{t("mode")}</Label>
          <NativeSelect id="mode" value={mode} onChange={(e) => setMode(e.target.value as LeagueScoringMode)}>
            {LEAGUE_SCORING_MODES.map((m) => <option key={m} value={m}>{tm(m)}</option>)}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t(`modeHint.${mode}`)}</p>
        </div>
        {mode === "PLACE_POINTS" && (
          <div className="grid gap-2">
            <Label htmlFor="placePoints">{t("placePoints")}</Label>
            <Input id="placePoints" value={placePoints} onChange={(e) => setPlacePoints(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("placePointsHint")}</p>
          </div>
        )}
        {mode !== "ELO" && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">{t("rankMultipliers")}</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {mode === "PLACE_POINTS" && field("participationPoints", t("participationPoints"))}
              {field("multiplierLocal", t("multiplierLocal"), "0.01")}
              {field("multiplierMaster", t("multiplierMaster"), "0.01")}
              {field("multiplierInternational", t("multiplierInternational"), "0.01")}
            </div>
            <p className="text-xs text-muted-foreground">{t(`rankMultipliersHint.${mode}`)}</p>
          </div>
        )}
        {mode === "BIG_POINTS" && ownGames && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {field("bigPointsMultiplier", t("bigPointsMultiplier"), "0.01")}
            {field("gameWinPoints", t("gameWinPoints"))}
            {field("gameDrawPoints", t("gameDrawPoints"))}
            {field("gameLossPoints", t("gameLossPoints"))}
          </div>
        )}
        {mode !== "PLACE_POINTS" && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={ownGames} onChange={(e) => setOwnGames(e.target.checked)} />
            <span>
              {t("ownGames")}
              <span className="block text-xs text-muted-foreground">{t("ownGamesHint")}</span>
            </span>
          </label>
        )}
      </fieldset>

      <Button type="submit" disabled={busy} className="justify-self-start">{submitLabel}</Button>
    </form>
  );
}
