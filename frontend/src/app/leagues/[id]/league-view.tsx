"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { LeagueForm } from "@/components/leagues/league-form";
import { RankBadge } from "@/components/tournaments/status-badge";
import { api } from "@/lib/api";
import type { LeagueDetail, LeagueSettings } from "@/lib/leagues";
import { cn } from "@/lib/utils";

export function LeagueView({ id }: { id: string }) {
  const t = useTranslations("leagues");
  const tt = useTranslations("tournaments");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { me } = useAuth();
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => setLeague(await api<LeagueDetail>("GET", `/api/leagues/${id}`)), [id]);

  useEffect(() => {
    let active = true;
    api<LeagueDetail>("GET", `/api/leagues/${id}`)
      .then((l) => active && setLeague(l))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [id, me?.id, errorMessage]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!league) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-10">{error && <Alert variant="destructive">{error}</Alert>}</div>;
  }
  const s = league.settings;
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00`), { dateStyle: "medium" });
  const elo = s.scoringMode === "ELO";
  const pending = league.tournaments.filter((x) => x.status === "PENDING");

  async function save(settings: LeagueSettings) {
    await api("PUT", `/api/leagues/${id}`, settings);
    setEditing(false);
    await load();
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <header className="grid gap-2">
        <Link href="/leagues" className="text-sm text-muted-foreground hover:text-foreground">← {t("title")}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-3xl sm:text-4xl">{s.name}</h1>
          <div className="flex flex-wrap gap-2">
            {me && !league.member && <Button onClick={() => run(() => api("POST", `/api/leagues/${id}/members`))}>{t("join")}</Button>}
            {me && league.member && me.id !== league.owner.id && (
              <Button variant="outline" onClick={() => run(() => api("DELETE", `/api/leagues/${id}/members/${me.id}`))}>{t("leave")}</Button>
            )}
            {league.canManage && (
              <Button variant="outline" onClick={() => setEditing((e) => !e)}><Pencil aria-hidden /> {t("edit")}</Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {date(s.startsOn)} – {date(s.endsOn)}{s.city && ` · ${s.city}`} · {t(`mode.${s.scoringMode}`)} · {t("owner", { name: league.owner.displayName })}
        </p>
        <p className="text-sm">{t(`rules.${s.scoringMode}`, {
          multiplier: s.bigPointsMultiplier, places: s.placePoints.join("/"), participation: s.participationPoints,
          local: s.multiplierLocal, master: s.multiplierMaster, international: s.multiplierInternational,
        })}{s.ownGamesAllowed ? ` ${s.scoringMode === "BIG_POINTS"
          ? t("rules.ownGamesBig", { win: s.gameWinPoints, draw: s.gameDrawPoints, loss: s.gameLossPoints, multiplier: s.bigPointsMultiplier })
          : t("rules.ownGames")}` : ""}</p>
        {s.description && <p className="whitespace-pre-wrap text-sm">{s.description}</p>}
      </header>

      {error && <Alert variant="destructive">{error}</Alert>}

      {editing && (
        <Card>
          <CardContent className="grid gap-6">
            <LeagueForm initial={s} submitLabel={t("form.save")} onSubmit={save} />
            <Button variant="destructive" className="justify-self-start"
              onClick={() => window.confirm(t("confirmDelete")) && run(async () => {
                await api("DELETE", `/api/leagues/${id}`);
                router.push("/leagues");
              })}>
              <Trash2 aria-hidden /> {t("delete")}
            </Button>
          </CardContent>
        </Card>
      )}

      {league.canManage && pending.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-xl">{t("pending")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {pending.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/tournaments/${x.id}`} className="font-medium hover:underline">{x.name}</Link>
                  <span className="text-sm text-muted-foreground">{format.dateTime(new Date(x.startsAt), { dateStyle: "medium" })}</span>
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" onClick={() => run(() => api("PUT", `/api/leagues/${id}/tournaments/${x.id}`, { status: "ACCEPTED" }))}>
                      <Check aria-hidden /> {t("accept")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => run(() => api("PUT", `/api/leagues/${id}/tournaments/${x.id}`, { status: "REJECTED" }))}>
                      <X aria-hidden /> {t("reject")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-xl">{t("table")}</CardTitle></CardHeader>
        <CardContent>
          {league.standings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tableEmpty")}</p>
          ) : (
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">#</th>
                    <th className="py-2 pr-2 font-medium">{t("col.player")}</th>
                    <th className="py-2 pr-2 text-right font-medium">{elo ? t("col.rating") : t("col.points")}</th>
                    <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t("col.tournaments")}</th>
                    <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t("col.games")}</th>
                    <th className="py-2 text-right font-medium">{t("col.wdl")}</th>
                  </tr>
                </thead>
                <tbody>
                  {league.standings.map((r) => (
                    <tr key={r.userId} className={cn("border-b last:border-0", r.userId === me?.id && "bg-accent/60")}>
                      <td className="py-2 pr-2">{r.position}</td>
                      <td className="py-2 pr-2 font-medium">
                        <Link href={`/players/${r.userId}`} className="hover:underline">{r.displayName}</Link>
                      </td>
                      <td className="py-2 pr-2 text-right font-semibold tabular-nums">{format.number(r.points)}</td>
                      <td className="hidden py-2 pr-2 text-right tabular-nums sm:table-cell">{r.tournaments}</td>
                      <td className="hidden py-2 pr-2 text-right tabular-nums sm:table-cell">{r.games}</td>
                      <td className="py-2 text-right tabular-nums">{r.wins}/{r.draws}/{r.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader><CardTitle className="text-xl">{t("tournaments")}</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {league.tournaments.filter((x) => x.status !== "PENDING").length === 0 && (
              <p className="text-sm text-muted-foreground">{t("noTournaments")}</p>
            )}
            <ul className="grid gap-2">
              {league.tournaments.filter((x) => x.status !== "PENDING").map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <RankBadge rank={x.rank} />
                  <Link href={`/tournaments/${x.id}`} className="font-medium hover:underline">{x.name}</Link>
                  <span className="text-muted-foreground">{format.dateTime(new Date(x.startsAt), { dateStyle: "medium" })}</span>
                  {x.status === "REJECTED" ? <Badge variant="destructive">{t("rejected")}</Badge>
                    : x.counted ? <Badge variant="success">{t("counted")}</Badge>
                    : <Badge variant="outline">{tt(`status.${x.tournamentStatus}`)}</Badge>}
                  {league.canManage && (
                    <Button size="sm" variant="ghost" className="ml-auto"
                      onClick={() => window.confirm(t("confirmRemoveTournament")) && run(() => api("DELETE", `/api/leagues/${id}/tournaments/${x.id}`))}>
                      <Trash2 aria-hidden /><span className="sr-only">{t("removeTournament")}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("tournamentsHint")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xl">{t("members", { n: league.members.length })}</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {league.members.map((m) => (
                <li key={m.id} className="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-sm">
                  <Link href={`/players/${m.id}`} className="hover:underline">{m.displayName}</Link>
                  {league.canManage && m.id !== league.owner.id && (
                    <button type="button" aria-label={t("removeMember", { name: m.displayName })}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => window.confirm(t("confirmRemoveMember", { name: m.displayName }))
                        && run(() => api("DELETE", `/api/leagues/${id}/members/${m.id}`))}>
                      <X className="size-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {s.ownGamesAllowed && <p className="mt-3 text-xs text-muted-foreground">{t("membersHint")}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
