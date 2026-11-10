"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarPlus, Settings } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { OfficialBadge, RankBadge, StatusBadge } from "@/components/tournaments/status-badge";
import { api } from "@/lib/api";
import { useLiveRefresh } from "@/lib/live";
import { sendOrQueue, type OutboxItem } from "@/lib/offline-queue";
import type { Challenge, Match, Participant, Round, StandingsData, TeamsData, TeamStandingRow, TournamentDetail } from "@/lib/tournaments";
import { RoundTimer } from "@/components/tournaments/round-timer";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { FinalStandings } from "@/components/tournaments/final-standings";
import { TeamsPanel } from "@/components/tournaments/teams-panel";
import { TeamMatchCard } from "@/components/tournaments/team-match-card";
import { TeamStandingsTable } from "@/components/tournaments/team-standings-table";
import { ChallengesPanel } from "@/components/tournaments/challenges-panel";
import { MatchRow } from "@/components/tournaments/match-row";
import { StandingsTable } from "@/components/tournaments/standings-table";
import { Bracket } from "@/components/tournaments/bracket";
import { roundTitle } from "@/components/tournaments/round-title";
import { cn } from "@/lib/utils";
import { useScenarios } from "@/components/use-scenarios";
import { MyBaListCard } from "@/components/ba-lists/my-ba-list-card";
import { BaListTable } from "@/components/ba-lists/ba-list-table";
import type { BaListSummary } from "@/lib/ba-lists";
import type { WarbandSummary } from "@/lib/warbands";
import type { LeagueSummary } from "@/lib/leagues";
import { MyWarbandCard } from "@/components/warbands/my-warband-card";
import { WarbandList } from "@/components/warbands/warband-list";

export function TournamentView({ id }: { id: string }) {
  const t = useTranslations("tournaments");
  const tr = useTranslations("tournaments.rounds");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const { me } = useAuth();
  const tb = useTranslations("baLists");
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const scenarios = useScenarios(tournament?.gameSystem ?? "ELDFALL");
  const [baLists, setBaLists] = useState<BaListSummary[] | null>(null);
  const [players, setPlayers] = useState<Participant[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [standings, setStandings] = useState<StandingsData | null>(null);
  const [warbands, setWarbands] = useState<WarbandSummary[] | null>(null);
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [teams, setTeams] = useState<TeamsData | null>(null);
  const [teamStandings, setTeamStandings] = useState<TeamStandingRow[] | null>(null);
  const [tab, setTab] = useState<"info" | "rounds" | "standings" | "warbands">("info");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const to = useTranslations("offline");

  const fetchAll = useCallback(async () => {
    const detail = await api<TournamentDetail>("GET", `/api/tournaments/${id}`);
    const ba = detail.gameSystem === "BOLT_ACTION";
    const [list, ch, rs, st, wb, bl, lg, tm, ts] = await Promise.all([
      api<Participant[]>("GET", `/api/tournaments/${id}/participants`),
      api<Challenge[]>("GET", `/api/tournaments/${id}/challenges`),
      api<Round[]>("GET", `/api/tournaments/${id}/rounds`),
      api<StandingsData>("GET", `/api/tournaments/${id}/standings`),
      // Lists stay hidden (403) from other players until the deadline passes.
      ba ? Promise.resolve(null) : api<WarbandSummary[]>("GET", `/api/tournaments/${id}/warbands`).catch(() => null),
      // Bolt Action lists: visibility follows the organizer's setting (403 while hidden).
      ba ? api<BaListSummary[]>("GET", `/api/tournaments/${id}/ba-lists`).catch(() => null) : Promise.resolve(null),
      api<LeagueSummary[]>("GET", `/api/tournaments/${id}/leagues`).catch(() => []),
      api<TeamsData>("GET", `/api/tournaments/${id}/teams`).catch(() => null),
      // 409 NOT_TEAM_TOURNAMENT for individual events.
      api<TeamStandingRow[]>("GET", `/api/tournaments/${id}/team-standings`).catch(() => null),
    ]);
    return { detail, list, ch, rs, st, wb, bl, lg, tm, ts };
  }, [id]);

  const apply = useCallback((d: Awaited<ReturnType<typeof fetchAll>>) => {
    setTournament(d.detail);
    setPlayers(d.list);
    setChallenges(d.ch);
    setRounds(d.rs);
    setStandings(d.st);
    setWarbands(d.wb);
    setBaLists(d.bl);
    setLeagues(d.lg);
    setTeams(d.tm);
    setTeamStandings(d.ts);
  }, []);

  const load = useCallback(async () => apply(await fetchAll()), [apply, fetchAll]);

  // Results, rounds and the timer change while players look at the page: refresh on live hints.
  useLiveRefresh(id, () => void load().catch(() => undefined));

  useEffect(() => {
    let active = true;
    fetchAll()
      .then((d) => {
        if (!active) return;
        apply(d);
        if (d.rs.length > 0) setTab("rounds");
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
    // Reload when the signed-in user changes (myStatus / canManage depend on it).
  }, [id, me?.id, errorMessage, fetchAll, apply]);

  async function call(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) {
    setError(null);
    try {
      await api(method, `/api/tournaments/${id}/${path}`, body);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  /** Result actions work offline too: stored on the device and sent when the connection is back. */
  async function callOrQueue(method: "POST" | "PUT", path: string, label: OutboxItem["label"],
                             table: number | null, body?: unknown) {
    if (!me) return call(method, path, body);
    setError(null);
    setNotice(null);
    try {
      const res = await sendOrQueue({
        key: `${label}:${path.split("/")[1]}`, userId: me.id, method, path: `/api/tournaments/${id}/${path}`, body,
        label, labelParams: { table: table ?? "–" },
      });
      if (res.queued) setNotice(to("savedOffline"));
      else await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function act(method: "POST" | "DELETE") {
    if (method === "DELETE" && !window.confirm(t("confirmLeave"))) return;
    setBusy(true);
    setError(null);
    try {
      await api(method, `/api/tournaments/${id}/registration`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!tournament) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-10">{error && <Alert variant="destructive">{error}</Alert>}</div>;
  }

  const teamEvent = tournament.settings.teamSize != null;
  const ba = tournament.gameSystem === "BOLT_ACTION";
  const secondary = tournament.settings.secondarySlot;
  const lists = ba ? baLists : warbands;
  const myTeamId = teams?.myTeamId ?? null;
  const matchRow = (r: Round, m: Match) => (
    <MatchRow key={m.id} match={m} meId={me?.id}
      // Bolt Action: only the final score at the end of the game (no turn-by-turn page).
      gameHref={ba ? undefined : `/tournaments/${id}/matches/${m.id}`}
      secondarySlot={secondary} maxPrimary={tournament.settings.maxPrimaryPoints}
      maxSecondary={tournament.settings.maxSecondaryPoints}
      onReport={(a, b, xa, xb) => callOrQueue("POST", `matches/${m.id}/report`, "report", m.table,
        { smallA: a, smallB: b, secondaryA: xa ?? null, secondaryB: xb ?? null })}
      onConfirm={() => callOrQueue("POST", `matches/${m.id}/confirm`, "decision", m.table)}
      onDispute={() => callOrQueue("POST", `matches/${m.id}/dispute`, "decision", m.table)}
      onCallJudge={r.status === "IN_PROGRESS" ? () => call("POST", `matches/${m.id}/judge`, {}) : undefined}
      // The organizer enters or corrects any result right here (same as in the organizer panel).
      onSetResult={tournament.canManage && r.status !== "PAIRED"
        ? (type, a, b, xa, xb) => callOrQueue("PUT", `matches/${m.id}/result`, "result", m.table,
          { type, smallA: a, smallB: b, secondaryA: xa ?? null, secondaryB: xb ?? null })
        : undefined}
      allowSplit={r.phase !== "KNOCKOUT" || tournament.settings.teamSize != null} />
  );
  const finalCard = tournament.status === "FINISHED" && standings ? (
    <FinalStandings standings={standings} teamStandings={teamEvent ? teamStandings : null} teams={teams}
      meId={me?.id} myTeamId={myTeamId} pointsFirst={ba} secondary={secondary} />
  ) : null;
  const dt = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "full", timeStyle: "short" });
  const registered = players.filter((p) => p.status === "REGISTERED");
  const waitlist = players.filter((p) => p.status === "WAITLIST");
  const fee =
    tournament.entryFeeAmount != null
      ? format.number(tournament.entryFeeAmount, { style: "currency", currency: tournament.entryFeeCurrency ?? "PLN" })
      : t("details.free");

  const facts: [string, string][] = [
    [t("details.when"), tournament.endsAt ? `${dt(tournament.startsAt)} – ${dt(tournament.endsAt)}` : dt(tournament.startsAt)],
    [t("details.where"), [tournament.venueName, tournament.address, tournament.city].filter(Boolean).join(", ")],
    [t("details.fee"), fee],
    [t("details.format"), t(`format.${tournament.format}`)],
    ...(tournament.listFormat === "ROSTER"
      ? [[t("details.listFormat"), t("details.rosterFormat", { roster: tournament.pointsLimit ?? "–", party: tournament.partyLimit ?? "–" })
          + (tournament.hiddenRosters ? ` · ${t("details.hiddenRosters")}` : "")] as [string, string]]
      : tournament.pointsLimit ? [[t("details.pointsLimit"), `${tournament.pointsLimit} ${t("points")}`] as [string, string]] : []),
    ...(ba && (tournament.maxOrderDice || tournament.maxPlatoons) ? [[t("details.listLimits"), [
      tournament.maxOrderDice ? tb("limitDice", { n: tournament.maxOrderDice }) : null,
      tournament.maxPlatoons ? tb("limitPlatoons", { n: tournament.maxPlatoons }) : null,
    ].filter(Boolean).join(" · ")] as [string, string]] : []),
    ...(ba ? [
      [t("details.scoring"), secondary
        ? t("details.scoringTwoSlots", { scenario: tournament.settings.maxPrimaryPoints ?? "–", secondary: tournament.settings.maxSecondaryPoints ?? "–" })
        : t("details.scoringOneSlot", { max: tournament.settings.maxPrimaryPoints ?? "–" })] as [string, string],
      [t("details.tournamentPoints"), t("details.wdl", { w: tournament.settings.winPoints, d: tournament.settings.drawPoints, l: tournament.settings.lossPoints })] as [string, string],
      [t("details.listVisibility"), t(`form.listVisibilities.${tournament.listVisibility}`)] as [string, string],
    ] : []),
    ...(tournament.roundsPlanned ? [[t("details.rounds"), String(tournament.roundsPlanned)] as [string, string]] : []),
    ...(tournament.listDeadline ? [[t("details.listDeadline"), dt(tournament.listDeadline)] as [string, string]] : []),
    [t("organizer"), tournament.organizer.displayName],
  ];

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <RankBadge rank={tournament.rank} />
          <StatusBadge status={tournament.status} />
          {tournament.official && <OfficialBadge />}
          <span className="rounded-md border px-2 py-0.5 text-xs font-medium">{t(`system.${tournament.gameSystem}`)}</span>
          {leagues.map((l) => (
            <Link key={l.id} href={`/leagues/${l.id}`}
              className="rounded-md border px-2 py-0.5 text-xs font-medium hover:bg-accent">
              {t("inLeague", { name: l.name })}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="font-display text-3xl sm:text-4xl">{tournament.name}</h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`/api/tournaments/${id}/calendar.ics`} download>
                <CalendarPlus aria-hidden /> {t("addToCalendar")}
              </a>
            </Button>
            {tournament.canManage && (
              <Button variant="outline" asChild>
                <Link href={`/tournaments/${id}/manage`}>
                  <Settings aria-hidden /> {t("manage")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert>{notice}</Alert>}

      <div role="tablist" className="flex w-fit rounded-lg border bg-card p-1">
        {(["info", "rounds", "standings", ...(lists ? ["warbands" as const] : [])] as const).map((key) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cn("rounded-md px-3 py-1.5 text-sm", tab === key ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
            {key === "warbands" && ba ? tb("tab") : t(`viewTabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === "rounds" && (
        <div className="grid gap-6 [&>*]:min-w-0">
          {finalCard}
          {rounds.length === 0 && <p className="text-muted-foreground">{t("rounds.noRounds")}</p>}
          {rounds.some((r) => r.phase === "KNOCKOUT") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{t("rounds.bracket")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Bracket rounds={rounds} highlight={teamEvent ? myTeamId ?? undefined : me?.id} />
              </CardContent>
            </Card>
          )}
          {[...rounds].reverse().map((r) => (
            // Finished rounds start folded; a click on the title opens them.
            <CollapsibleCard key={r.number} defaultOpen={r.status !== "COMPLETED"} title={roundTitle(tr, r)}
              meta={<>
                <span>{t(`rounds.status.${r.status}`)}</span>
                {r.tableOrder && r.phase !== "KNOCKOUT" && <span>{t(`plan.tablesShort.${r.tableOrder}`)}</span>}
                {r.scenario && (
                  <span className="text-primary">{t("rounds.scenario", { name: scenarios.name(r.scenario) })}</span>
                )}
                {r.status === "IN_PROGRESS" && r.timer && <RoundTimer timer={r.timer} compact />}
              </>}>
                {r.teamMatches ? (
                  <ul className="grid gap-3">
                    {[...r.teamMatches]
                      .sort((x, y) => Number(y.teamA.id === myTeamId || y.teamB?.id === myTeamId)
                        - Number(x.teamA.id === myTeamId || x.teamB?.id === myTeamId))
                      .map((tm) => (
                        <TeamMatchCard key={tm.id} teamMatch={tm} myTeamId={myTeamId}
                          matches={r.matches.filter((m) => m.teamMatchId === tm.id).sort((a, b) => a.table - b.table)}
                          renderMatch={(m) => matchRow(r, m)}
                          onLineup={(teamId, order) => call("PUT", `team-matches/${tm.id}/lineup`, { teamId, order })} />
                      ))}
                  </ul>
                ) : (
                  <ul className="grid gap-2">
                    {[...r.matches]
                      .sort((x, y) => Number(y.canReport || y.canConfirm) - Number(x.canReport || x.canConfirm))
                      .map((m) => matchRow(r, m))}
                  </ul>
                )}
            </CollapsibleCard>
          ))}
        </div>
      )}

      {tab === "warbands" && !ba && warbands && <WarbandList tournamentId={id} items={warbands} />}
      {tab === "warbands" && ba && baLists && <BaListTable tournamentId={id} items={baLists} />}

      {tab === "standings" && teamEvent && teamStandings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("teams.standings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamStandingsTable rows={teamStandings} highlight={myTeamId} />
          </CardContent>
        </Card>
      )}
      {tab === "standings" && standings && (
        <Card>
          {teamEvent && (
            <CardHeader>
              <CardTitle className="text-xl">{t("teams.individualStandings")}</CardTitle>
            </CardHeader>
          )}
          <CardContent>
            <StandingsTable data={standings} highlight={me?.id} pointsFirst={ba} secondary={secondary} />
          </CardContent>
        </Card>
      )}

      {tab === "info" && finalCard}
      {tab === "info" && (
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-6">
          <Card>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                {facts.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          {tournament.roundPlans.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{t("plan.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="grid gap-1 text-sm">
                  {tournament.roundPlans.map((p) => (
                    <li key={p.number} className="flex flex-wrap gap-x-3 gap-y-0.5 border-b py-1.5 last:border-0">
                      <span className="w-20 font-medium">{t("rounds.round", { n: p.number })}</span>
                      <span>{p.scenarioCode ? scenarios.name(p.scenarioCode) : t("plan.noScenario")}</span>
                      {tournament.format === "SWISS" && (
                        <span className="text-muted-foreground">{t(`plan.method.${p.pairing ?? (p.number === 1 ? "RANDOM" : "SWISS")}`)}</span>
                      )}
                      {tournament.format !== "ELIMINATION" && (
                        <span className="text-muted-foreground">{t(`plan.tablesShort.${p.tableOrder}`)}</span>
                      )}
                      {p.durationMinutes != null && (
                        <span className="text-muted-foreground">{t("plan.minutes", { n: p.durationMinutes })}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
          {tournament.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{t("details.description")}</CardTitle>
              </CardHeader>
              {/* Plain text only: rendered as text, never as HTML. */}
              <CardContent className="whitespace-pre-wrap">{tournament.description}</CardContent>
            </Card>
          )}
        </div>

        <aside className="grid content-start gap-6">
          <Card>
            <CardContent className="grid gap-3">
              <p className="font-display text-2xl">
                {teamEvent ? teams?.teams.length ?? 0 : tournament.registeredCount}
                <span className="text-base text-muted-foreground">
                  {" "}/ {tournament.maxPlayers ?? "∞"} {teamEvent ? t("teams.teamsLower") : t("players").toLowerCase()}
                </span>
              </p>
              {teamEvent && (
                <p className="text-sm text-muted-foreground">{t("teams.eventInfo", { n: tournament.settings.teamSize ?? 0 })}</p>
              )}
              {tournament.myStatus === "REGISTERED" && <Alert variant="success">{t("joinedMsg")}</Alert>}
              {tournament.myStatus === "WAITLIST" && <Alert>{tournament.requireApproval ? t("pendingMsg") : t("waitlistMsg")}</Alert>}
              {!me ? (
                <Button asChild>
                  <Link href="/login">{t("loginToJoin")}</Link>
                </Button>
              ) : teamEvent ? null : tournament.myStatus ? (
                ["DRAFT", "PUBLISHED", "REGISTRATION_CLOSED"].includes(tournament.status) && (
                  <Button variant="outline" disabled={busy} onClick={() => act("DELETE")}>{t("leave")}</Button>
                )
              ) : (
                tournament.status === "PUBLISHED" && (
                  <Button disabled={busy} onClick={() => act("POST")}>{t("join")}</Button>
                )
              )}
            </CardContent>
          </Card>

          {me && tournament.myStatus && (ba
            ? <MyBaListCard tournamentId={id} reloadKey={me.id} />
            : <MyWarbandCard tournamentId={id} reloadKey={me.id} />)}

          {me && tournament.myStatus === "REGISTERED" && tournament.roundsCount === 0
            && (tournament.settings.challengesEnabled || challenges.length > 0)
            && ["PUBLISHED", "REGISTRATION_CLOSED"].includes(tournament.status) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{t("challenges.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ChallengesPanel meId={me.id} challenges={challenges} players={players}
                  onAction={(method, path, body) => call(method, path, body)} />
              </CardContent>
            </Card>
          )}

          {teamEvent && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{t("teams.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TeamsPanel tournamentId={id} meId={me?.id} status={tournament.status} onChanged={() => void load()} />
              </CardContent>
            </Card>
          )}

          {!teamEvent && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t("details.participants")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {registered.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("details.noParticipants")}</p>
              ) : (
                <ol className="grid list-decimal gap-1 pl-5 text-sm">
                  {registered.map((p) => (
                    <li key={p.id} className={cn(p.dropped && "text-muted-foreground line-through")}>
                      <Link href={`/players/${p.userId}`} className="hover:underline">{p.displayName}</Link>
                      {p.club && <span className="text-muted-foreground"> · {p.club}</span>}
                    </li>
                  ))}
                </ol>
              )}
              {waitlist.length > 0 && (
                <div className="grid gap-1">
                  <h3 className="text-sm font-medium">{tournament.requireApproval ? t("details.pending") : t("details.waitlist")}</h3>
                  <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
                    {waitlist.map((p) => (
                      <li key={p.id}>{p.displayName}</li>
                    ))}
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}
