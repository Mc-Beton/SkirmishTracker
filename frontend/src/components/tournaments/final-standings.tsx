"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Medal, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StandingsTable } from "@/components/tournaments/standings-table";
import type { StandingRow, StandingsData, TeamsData, TeamStandingRow } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

const PODIUM = ["text-amber-500", "text-slate-400", "text-orange-700"];

/**
 * Final classification of a finished tournament. Singles: podium + full table. Teams: every team in final order
 * with its players and what each of them scored individually.
 */
export function FinalStandings({ standings, teamStandings, teams, meId, myTeamId }: {
  standings: StandingsData;
  teamStandings: TeamStandingRow[] | null;
  teams: TeamsData | null;
  meId?: string;
  myTeamId?: string | null;
}) {
  const t = useTranslations("tournaments.final");
  const ts = useTranslations("tournaments.standings");
  const teamEvent = !!teamStandings && !!teams?.teamSize;
  const byUser = new Map(standings.rows.map((r) => [r.userId, r]));
  const podium = teamEvent
    ? teamStandings!.slice(0, 3).map((r) => ({ id: r.teamId, name: r.name, position: r.position, href: null as string | null }))
    : standings.rows.slice(0, 3).map((r) => ({ id: r.userId, name: r.displayName, position: r.position, href: `/players/${r.userId}` }));

  const line = (r: StandingRow | undefined) => r
    ? `${ts("wdlShort", { w: r.wins, d: r.draws, l: r.losses })} · ${r.totalBigPoints} ${t("bigShort")} · ${r.smallPoints} ${t("smallShort")}`
    : "—";

  return (
    <Card className="border-primary/40">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-xl"><Trophy className="size-5 text-primary" aria-hidden /> {t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 px-4 sm:px-6">
        <ol className="grid gap-2 sm:grid-cols-3">
          {podium.map((p, i) => (
            <li key={p.id} className={cn("flex items-center gap-3 rounded-lg border p-3",
              (p.id === meId || p.id === myTeamId) && "border-primary/50 bg-accent/40")}>
              <Medal className={cn("size-7 shrink-0", PODIUM[i])} aria-hidden />
              <span className="grid min-w-0">
                <span className="text-xs text-muted-foreground">{t("place", { n: p.position })}</span>
                {p.href ? <Link href={p.href} className="truncate font-medium hover:underline">{p.name}</Link>
                  : <span className="truncate font-medium">{p.name}</span>}
              </span>
            </li>
          ))}
        </ol>

        {teamEvent ? (
          <ol className="grid gap-3">
            {teamStandings!.map((row) => {
              const team = teams!.teams.find((x) => x.id === row.teamId);
              const members = (team?.members ?? []).filter((m) => m.status === "ACCEPTED")
                .sort((a, b) => a.position - b.position);
              return (
                <li key={row.teamId} className={cn("grid gap-2 rounded-lg border p-3",
                  row.teamId === myTeamId && "border-primary/50 bg-accent/30")}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display text-lg tabular-nums">{row.position}.</span>
                    <span className="font-medium">{row.name}</span>
                    <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                      {ts("wdlShort", { w: row.wins, d: row.draws, l: row.losses })} · {row.totalBigPoints} {t("bigShort")}
                      {" "}· {row.smallPoints} {t("smallShort")}
                    </span>
                  </div>
                  <ul className="grid gap-1 border-t pt-2 text-sm">
                    {members.map((m) => (
                      <li key={m.userId} className="flex flex-wrap items-baseline gap-x-3">
                        <Link href={`/players/${m.userId}`}
                          className={cn("min-w-0 flex-1 truncate hover:underline", m.userId === meId && "font-semibold")}>
                          {m.displayName}
                        </Link>
                        <span className="tabular-nums text-muted-foreground">{line(byUser.get(m.userId))}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        ) : (
          <StandingsTable data={standings} highlight={meId} />
        )}
      </CardContent>
    </Card>
  );
}
