"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { EloChart } from "@/components/players/elo-chart";
import { PlayStatsSection } from "@/components/players/play-stats";
import { Badges } from "@/components/players/badges";
import { StatusBadge } from "@/components/tournaments/status-badge";
import { api } from "@/lib/api";
import type { Versus, PlayerProfile } from "@/lib/players";
import { factionName, useArmies } from "@/lib/warbands";
import { cn } from "@/lib/utils";

export function PlayerProfileView({ id }: { id: string }) {
  const t = useTranslations("players");
  const tl = useTranslations("leagues");
  const tf = useTranslations("tournaments.format");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const armies = useArmies();
  const { me } = useAuth();
  const [p, setP] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Head-to-head of the signed-in player against this one.
  const [versus, setVersus] = useState<Versus | null>(null);
  const meId = me?.id;
  useEffect(() => {
    if (!meId || meId === id) return;
    let active = true;
    api<Versus>("GET", `/api/players/${meId}/versus/${id}`)
      .then((v) => active && setVersus(v))
      .catch(() => active && setVersus(null));
    return () => {
      active = false;
    };
  }, [meId, id]);

  useEffect(() => {
    let active = true;
    api<PlayerProfile>("GET", `/api/players/${id}`)
      .then((x) => active && setP(x))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [id, errorMessage]);

  if (!p) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-10">{error && <Alert variant="destructive">{error}</Alert>}</div>;
  }
  const s = p.stats;
  const tiles: [string, string][] = [
    [t("elo"), String(s.elo)],
    [t("rank"), s.rank ? `#${s.rank}` : "–"],
    [t("games"), String(s.games)],
    [t("wdl"), `${s.wins}/${s.draws}/${s.losses}`],
  ];

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-display text-3xl sm:text-4xl">{p.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {[p.club, p.city].filter(Boolean).join(" · ")}
            {(p.club || p.city) && " · "}
            {t("memberSince", { date: format.dateTime(new Date(p.memberSince), { dateStyle: "medium" }) })}
          </p>
        </div>
        {me?.id === p.id && (
          <Button variant="outline" asChild>
            <Link href="/account"><Settings aria-hidden /> {t("editAccount")}</Link>
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-display text-2xl tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {p.history.length >= 2 && (
        <Card>
          <CardHeader><CardTitle className="text-xl">{t("eloHistory")}</CardTitle></CardHeader>
          <CardContent><EloChart points={p.history} /></CardContent>
        </Card>
      )}

      {versus && meId && versus.player.id === meId && versus.opponent.id === p.id && (
        <Card>
          <CardHeader><CardTitle className="text-xl">{t("versus.title", { name: p.displayName })}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {versus.games === 0 ? <p className="text-sm text-muted-foreground">{t("versus.none")}</p> : (
              <>
                <p className="text-sm">
                  <span className="font-display text-2xl tabular-nums">{versus.wins}–{versus.draws}–{versus.losses}</span>
                  <span className="ml-2 text-muted-foreground">{t("versus.summary", { games: versus.games })}</span>
                </p>
                <ul className="grid gap-1 text-sm">
                  {versus.recent.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex size-6 items-center justify-center rounded text-xs font-semibold",
                        g.result === "W" ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300"
                          : g.result === "L" ? "bg-destructive/15 text-destructive" : "bg-muted")}
                        aria-label={t(`result.${g.result}`)}>{t(`resultShort.${g.result}`)}</span>
                      <span className="tabular-nums">{g.myScore}:{g.opponentScore}</span>
                      <span className="text-muted-foreground">
                        {g.tournamentId ? <Link href={`/tournaments/${g.tournamentId}`} className="hover:underline">{g.tournamentName}</Link> : t("ownGame")}
                        {g.playedAt && ` · ${format.dateTime(new Date(g.playedAt), { dateStyle: "medium" })}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {p.badges && p.badges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("badges.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("badges.count", { n: p.badges.filter((b) => b.earned).length, of: p.badges.length })}</p>
          </CardHeader>
          <CardContent><Badges badges={p.badges} /></CardContent>
        </Card>
      )}

      {p.playStats && <PlayStatsSection stats={p.playStats} armies={armies} />}

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle className="text-xl">{t("tournaments")}</CardTitle></CardHeader>
          <CardContent>
            {p.tournaments.length === 0 ? <p className="text-sm text-muted-foreground">{t("noTournaments")}</p> : (
              <ul className="grid gap-2">
                {p.tournaments.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <Link href={`/tournaments/${x.id}`} className="font-medium hover:underline">{x.name}</Link>
                    <span className="text-muted-foreground">{format.dateTime(new Date(x.startsAt), { dateStyle: "medium" })} · {tf(x.format)}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {x.position != null && <span className="tabular-nums">{t("place", { pos: x.position, of: x.players })}</span>}
                      <StatusBadge status={x.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">{t("leagues")}</CardTitle></CardHeader>
          <CardContent>
            {p.leagues.length === 0 ? <p className="text-sm text-muted-foreground">{t("noLeagues")}</p> : (
              <ul className="grid gap-2">
                {p.leagues.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Link href={`/leagues/${l.id}`} className="font-medium hover:underline">{l.name}</Link>
                    {l.active && <Badge variant="success">{tl("active")}</Badge>}
                    <span className="ml-auto tabular-nums">
                      {t("place", { pos: l.row.position, of: l.of })} · {format.number(l.row.points)} {l.scoringMode === "ELO" ? "ELO" : t("pts")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">{t("recent")}</CardTitle></CardHeader>
          <CardContent>
            {p.recentGames.length === 0 ? <p className="text-sm text-muted-foreground">{t("noGames")}</p> : (
              <ul className="grid gap-2">
                {p.recentGames.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={cn("inline-flex size-6 items-center justify-center rounded text-xs font-semibold",
                      g.result === "W" ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300"
                        : g.result === "L" ? "bg-destructive/15 text-destructive" : "bg-muted")}
                      aria-label={t(`result.${g.result}`)}>
                      {t(`resultShort.${g.result}`)}
                    </span>
                    <Link href={`/players/${g.opponent.id}`} className="font-medium hover:underline">{g.opponent.displayName}</Link>
                    <span className="tabular-nums">{g.myScore}:{g.opponentScore}</span>
                    <span className="text-muted-foreground">
                      {g.tournamentId ? <Link href={`/tournaments/${g.tournamentId}`} className="hover:underline">{g.tournamentName}</Link> : t("ownGame")}
                    </span>
                    <span className={cn("ml-auto tabular-nums", g.eloChange > 0 ? "text-emerald-700 dark:text-emerald-300" : g.eloChange < 0 ? "text-destructive" : "text-muted-foreground")}>
                      {g.eloChange > 0 ? "+" : ""}{g.eloChange}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {p.opponents && p.opponents.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-xl">{t("opponents.title")}</CardTitle></CardHeader>
            <CardContent>
              <ul className="grid gap-1 text-sm">
                {p.opponents.map((o) => (
                  <li key={o.opponent.id} className="flex items-center justify-between gap-2">
                    <Link href={`/players/${o.opponent.id}`} className="font-medium hover:underline">{o.opponent.displayName}</Link>
                    <span className="tabular-nums text-muted-foreground">
                      {t("opponents.games", { n: o.games })} · {o.wins}–{o.draws}–{o.losses}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-xl">{t("factions")}</CardTitle></CardHeader>
          <CardContent>
            {p.factions.length === 0 ? <p className="text-sm text-muted-foreground">{t("noFactions")}</p> : (
              <ul className="grid gap-1 text-sm">
                {p.factions.map((f) => (
                  <li key={f.faction} className="flex justify-between">
                    <span>{factionName(armies, f.faction)}</span>
                    <span className="tabular-nums text-muted-foreground">{t("lists", { n: f.count })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
