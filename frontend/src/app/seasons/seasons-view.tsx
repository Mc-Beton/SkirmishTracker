"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { RankBadge } from "@/components/tournaments/status-badge";
import { api } from "@/lib/api";
import { reportRoles } from "@/lib/reports";
import type { SeasonSummary, SeasonView } from "@/lib/seasons";

export function SeasonsView() {
  const t = useTranslations("seasons");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const { me } = useAuth();
  const [list, setList] = useState<SeasonSummary[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [view, setView] = useState<SeasonView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<SeasonSummary[]>("GET", "/api/seasons")
      .then((l) => active && setList(l))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [errorMessage]);

  const selected = list?.find((s) => s.id === chosen) ?? list?.find((s) => s.current) ?? list?.[0];
  const selectedId = selected?.id ?? "";

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    api<SeasonView>("GET", `/api/seasons/${selectedId}`)
      .then((v) => active && setView(v))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [selectedId, errorMessage]);

  const shown = view && view.season.id === selectedId ? view : null;
  const tournamentName = (id: string) => shown?.tournaments.find((x) => x.id === id)?.name ?? "?";
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-display text-3xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("lead")}</p>
        </div>
        {reportRoles(me?.roles) && (
          <Button variant="outline" size="sm" asChild><Link href="/admin/seasons">{t("manage")}</Link></Button>
        )}
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {list && list.length === 0 && <Alert>{t("none")}</Alert>}
      {list && list.length > 0 && (
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="season" className="text-xs">{t("season")}</Label>
          <NativeSelect id="season" value={selectedId} onChange={(e) => setChosen(e.target.value)}>
            {list.map((s) => <option key={s.id} value={s.id}>{s.name}{s.current ? ` · ${t("current")}` : ""}</option>)}
          </NativeSelect>
        </div>
      )}
      {shown && (
        <>
          <p className="text-sm text-muted-foreground">
            {t("rules", {
              from: shown.season.startsOn, to: shown.season.endsOn, local: shown.settings.pointsLocal,
              master: shown.settings.pointsMaster, international: shown.settings.pointsInternational, best: shown.settings.bestResults,
            })}
          </p>
          <Card>
            <CardHeader><CardTitle className="text-xl">{t("ranking")}</CardTitle></CardHeader>
            <CardContent>
              {shown.ranking.length === 0 ? <p className="text-sm text-muted-foreground">{t("noResults")}</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">#</th>
                        <th className="py-2 pr-2 font-medium">{t("player")}</th>
                        <th className="py-2 pr-2 text-right font-medium">{t("events")}</th>
                        <th className="py-2 pr-2 text-right font-medium">{t("points")}</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {shown.ranking.map((r) => (
                        <Fragment key={r.userId}>
                          <tr className="border-b last:border-0">
                            <td className="py-2 pr-2 tabular-nums">{r.position}</td>
                            <td className="py-2 pr-2">
                              <Link href={`/players/${r.userId}`} className="font-medium hover:text-primary">{r.displayName}</Link>
                              {r.club && <span className="block text-xs text-muted-foreground">{r.club}</span>}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">{r.events}</td>
                            <td className="py-2 pr-2 text-right font-display text-base tabular-nums">{r.points}</td>
                            <td className="py-2 text-right">
                              <Button variant="ghost" size="icon" className="size-7" aria-expanded={open === r.userId}
                                aria-label={t("details")} onClick={() => setOpen(open === r.userId ? null : r.userId)}>
                                <ChevronDown aria-hidden className={open === r.userId ? "size-4 rotate-180" : "size-4"} />
                              </Button>
                            </td>
                          </tr>
                          {open === r.userId && (
                            <tr className="border-b bg-muted/30">
                              <td />
                              <td colSpan={4} className="py-2 pr-2">
                                <ul className="grid gap-1 text-xs">
                                  {r.results.map((x) => (
                                    <li key={x.tournamentId} className={x.counted ? undefined : "text-muted-foreground line-through"}>
                                      <Link href={`/tournaments/${x.tournamentId}`} className="hover:text-primary">{tournamentName(x.tournamentId)}</Link>
                                      {" · "}{t("place", { place: x.place, players: x.players })} · {x.points} {t("pts")}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader><CardTitle className="text-xl">{t("tournaments")}</CardTitle></CardHeader>
              <CardContent>
                {shown.tournaments.length === 0 ? <p className="text-sm text-muted-foreground">{t("noTournaments")}</p> : (
                  <ul className="grid gap-3">
                    {shown.tournaments.map((x) => (
                      <li key={x.id} className="grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <RankBadge rank={x.rank} />
                          <Link href={`/tournaments/${x.id}`} className="font-medium hover:text-primary">{x.name}</Link>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {date(x.startsAt)} · {x.city}, {x.country} · {t("playersN", { n: x.players })} · {t("winnerGets", { n: x.basePoints })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{t("organizers")}</CardTitle>
                <p className="text-sm text-muted-foreground">{t("organizersLead")}</p>
              </CardHeader>
              <CardContent>
                {shown.organizers.length === 0 ? <p className="text-sm text-muted-foreground">{t("noTournaments")}</p> : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">{t("organizer")}</th>
                        <th className="py-2 pr-2 text-right font-medium">{t("events")}</th>
                        <th className="py-2 text-right font-medium">{t("players")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.organizers.map((o) => (
                        <tr key={o.userId} className="border-b last:border-0">
                          <td className="py-2 pr-2">{o.displayName}<span className="block text-xs text-muted-foreground">{o.countries.join(", ")}</span></td>
                          <td className="py-2 pr-2 text-right tabular-nums">{o.events}</td>
                          <td className="py-2 text-right tabular-nums">{o.players}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
