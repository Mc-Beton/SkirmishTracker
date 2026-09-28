"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Check, ExternalLink, Gavel, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCard, CollapsibleSection } from "@/components/ui/collapsible-card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { StatusBadge } from "@/components/tournaments/status-badge";
import { TournamentForm } from "@/components/tournaments/tournament-form";
import { api } from "@/lib/api";
import { MatchRow } from "@/components/tournaments/match-row";
import { roundTitle } from "@/components/tournaments/round-title";
import { LeagueSubmit } from "@/components/leagues/league-submit";
import { StandingsTable } from "@/components/tournaments/standings-table";
import { useGameContent } from "@/lib/content";
import { RoundTimer } from "@/components/tournaments/round-timer";
import { TeamsPanel } from "@/components/tournaments/teams-panel";
import { TeamMatchCard } from "@/components/tournaments/team-match-card";
import { TeamStandingsTable } from "@/components/tournaments/team-standings-table";
import {
  LIST_STATUSES,
  type Challenge,
  type JudgeCall,
  type Match,
  type Round,
  type TeamStandingRow,
  type StandingsData,
  type AuditItem,
  type ListStatus,
  type Participant,
  type TournamentDetail,
  type TournamentInput,
} from "@/lib/tournaments";

type Data = {
  tournament: TournamentDetail;
  players: Participant[];
  audit: AuditItem[];
  challenges: Challenge[];
  rounds: Round[];
  standings: StandingsData;
  judgeCalls: JudgeCall[];
  teamStandings: TeamStandingRow[] | null;
};

export function ManageTournament({ id }: { id: string }) {
  const t = useTranslations("tournaments");
  const tr = useTranslations("tournaments.rounds");
  const tm = useTranslations("tournaments.manageView");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const justCreated = useSearchParams().get("created") === "1";
  const { me, loading } = useAuth();
  const content = useGameContent();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(justCreated ? t("form.created") : null);
  const [newPlayer, setNewPlayer] = useState("");
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [penalty, setPenalty] = useState({ userId: "", bigPoints: "1", reason: "" });
  const [formKey, setFormKey] = useState(0);

  const fetchAll = useCallback(async (): Promise<Data> => {
    const [tournament, players, audit, challenges, rounds, standings, judgeCalls, teamStandings] = await Promise.all([
      api<TournamentDetail>("GET", `/api/tournaments/${id}`),
      api<Participant[]>("GET", `/api/tournaments/${id}/participants`),
      api<AuditItem[]>("GET", `/api/tournaments/${id}/audit`),
      api<Challenge[]>("GET", `/api/tournaments/${id}/challenges`),
      api<Round[]>("GET", `/api/tournaments/${id}/rounds`),
      api<StandingsData>("GET", `/api/tournaments/${id}/standings`),
      api<JudgeCall[]>("GET", `/api/tournaments/${id}/judge-calls`).catch(() => []),
      api<TeamStandingRow[]>("GET", `/api/tournaments/${id}/team-standings`).catch(() => null),
    ]);
    return { tournament, players, audit, challenges, rounds, standings, judgeCalls, teamStandings };
  }, [id]);

  useEffect(() => {
    if (!loading && !me) {
      router.replace("/login");
      return;
    }
    if (!me) return;
    let active = true;
    fetchAll()
      .then((d) => active && setData(d))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [loading, me, router, fetchAll, errorMessage]);

  // Judge calls arrive while the organizer has this page open: refresh them every 20 s.
  const inProgress = data?.tournament.status === "IN_PROGRESS";
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api<JudgeCall[]>("GET", `/api/tournaments/${id}/judge-calls`)
        .then((calls) => setData((d) => d && { ...d, judgeCalls: calls }))
        .catch(() => undefined);
    }, 20_000);
    return () => clearInterval(timer);
  }, [inProgress, id]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      setData(await fetchAll());
      if (success) setNotice(success);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!data) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-10">{error && <Alert variant="destructive">{error}</Alert>}</div>;
  }

  const { tournament, players, audit, challenges, rounds, standings, judgeCalls, teamStandings } = data;
  const teamEvent = tournament.settings.teamSize != null;
  const openCalls = judgeCalls.filter((c) => !c.resolvedAt);
  const confirmed = players.filter((p) => p.status === "REGISTERED");
  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const nextNumber = rounds.length + 1;
  const canGenerate =
    (!lastRound || lastRound.status === "COMPLETED") &&
    (tournament.roundsPlanned == null || nextNumber <= tournament.roundsPlanned) &&
    ["PUBLISHED", "REGISTRATION_CLOSED", "IN_PROGRESS"].includes(tournament.status);
  const canFinish = tournament.status === "IN_PROGRESS" && lastRound?.status === "COMPLETED";
  const acceptedPairs = challenges.filter((c) => c.status === "ACCEPTED");
  const pairedIds = new Set(acceptedPairs.flatMap((c) => [c.challengerId, c.challengedId]));

  function pick(roundNumber: number, playerId: string) {
    if (!picked) {
      setPicked(playerId);
      return;
    }
    const first = picked;
    setPicked(null);
    if (first !== playerId) {
      void run(() => api("POST", `/api/tournaments/${id}/rounds/${roundNumber}/swap`, { playerX: first, playerY: playerId }));
    }
  }
  const pickedName = picked ? players.find((p) => p.userId === picked)?.displayName ?? "" : "";
  const status = tournament.status;
  const post = (path: string) => () => api("POST", `/api/tournaments/${id}/${path}`);
  const organizerRow = (r: Round, m: Match) => (
    <MatchRow key={m.id} match={m} gameHref={r.status !== "PAIRED" ? `/tournaments/${id}/matches/${m.id}` : undefined}
      onPickPlayer={r.status === "PAIRED" && r.phase === "SWISS" && !teamEvent ? (pid) => pick(r.number, pid) : undefined}
      pickedPlayer={picked} allowSplit={r.phase !== "KNOCKOUT" || teamEvent}
      onSetResult={r.status !== "PAIRED"
        ? (type, a, b) => run(() => api("PUT", `/api/tournaments/${id}/matches/${m.id}/result`,
            { type, smallA: a, smallB: b }))
        : undefined} />
  );

  async function saveDetails(input: TournamentInput) {
    // Let the form show validation errors itself; refresh everything on success.
    await api("PUT", `/api/tournaments/${id}`, input);
    setData(await fetchAll());
    setFormKey((k) => k + 1);
    setNotice(t("form.saved"));
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <p className="text-sm tracking-widest text-primary uppercase">{tm("title")}</p>
          <h1 className="font-display text-3xl">{tournament.name}</h1>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tournaments/${id}`}>
            <ExternalLink aria-hidden /> {tm("view")}
          </Link>
        </Button>
      </header>

      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">{tm("status")}:</span>
          <StatusBadge status={status} />
          <div className="ml-auto flex flex-wrap gap-2">
            {status === "DRAFT" && <Button onClick={() => run(post("publish"))}>{tm("publish")}</Button>}
            {status === "PUBLISHED" && (
              <Button variant="secondary" onClick={() => run(post("close-registration"))}>{tm("close")}</Button>
            )}
            {status === "REGISTRATION_CLOSED" && (
              <Button variant="secondary" onClick={() => run(post("publish"))}>{tm("reopen")}</Button>
            )}
            {status !== "FINISHED" && status !== "CANCELLED" && (
              <Button
                variant="destructive"
                onClick={() => window.confirm(tm("confirmCancel")) && run(post("cancel"))}
              >
                {tm("cancel")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {openCalls.length > 0 && (
        <Card className="border-amber-500/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl"><Gavel aria-hidden /> {tm("judgeCalls")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {openCalls.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2">
                  <span className="font-medium">{tr("round", { n: c.roundNumber })} · {tr("table")} {c.table}</span>
                  <span>{c.players}</span>
                  <span className="text-muted-foreground">
                    {tm("judgeCalledBy", { name: c.requestedBy })} · {format.relativeTime(new Date(c.createdAt), now)}
                  </span>
                  {c.note && <span className="basis-full italic">„{c.note}”</span>}
                  <Button size="sm" variant="outline" className="ml-auto"
                    onClick={() => run(post(`judge-calls/${c.id}/resolve`))}>
                    <Check aria-hidden /> {tm("judgeResolve")}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {teamEvent && (
        <CollapsibleCard title={t("teams.title")}>
            <TeamsPanel tournamentId={id} meId={me?.id} status={status} manage
              onChanged={() => void fetchAll().then(setData).catch(() => undefined)} />
        </CollapsibleCard>
      )}

      {tournament.format === "SWISS" && !teamEvent && tournament.roundsCount === 0 && ["DRAFT", "PUBLISHED", "REGISTRATION_CLOSED"].includes(tournament.status) && (
        <CollapsibleCard title={tm("fixedPairs")} meta={<span>{tm("fixedPairsHint")}</span>} contentClassName="grid gap-4">
            {acceptedPairs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("challenges.none")}</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {acceptedPairs.map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="flex-1">
                      {c.challengerName} ⚔ {c.challengedName}
                      {c.organizerMade && <span className="text-xs text-muted-foreground"> ({t("challenges.organizerMade")})</span>}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => run(() => api("DELETE", `/api/tournaments/${id}/challenges/${c.id}`))}>
                      {tm("removePair")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <form method="post" className="flex flex-wrap gap-2" onSubmit={(e) => {
              e.preventDefault();
              if (!pairA || !pairB) return;
              void run(async () => {
                await api("POST", `/api/tournaments/${id}/fixed-pairs`, { playerA: pairA, playerB: pairB });
                setPairA("");
                setPairB("");
              });
            }}>
              {[[pairA, setPairA], [pairB, setPairB]].map(([value, setter], i) => (
                <NativeSelect key={i} aria-label={i === 0 ? tm("playerA") : tm("playerB")} className="w-48"
                  value={value as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)}>
                  <option value="">{tm("selectPlayer")}</option>
                  {confirmed.filter((p) => !pairedIds.has(p.userId)).map((p) => (
                    <option key={p.userId} value={p.userId}>{p.displayName}</option>
                  ))}
                </NativeSelect>
              ))}
              <Button type="submit" variant="secondary">{tm("addPair")}</Button>
            </form>
        </CollapsibleCard>
      )}

      <CollapsibleCard title={tm("leagues")}>
          <LeagueSubmit tournamentId={id} />
      </CollapsibleCard>

      <CollapsibleCard title={tm("roundsTitle")} contentClassName="grid gap-6">
          <div className="flex flex-wrap gap-2">
            {canGenerate && (
              <Button onClick={() => run(() => api("POST", `/api/tournaments/${id}/rounds`))}>
                {tm("generate", { n: nextNumber })}
              </Button>
            )}
            {lastRound?.status === "PAIRED" && (
              <>
                <Button onClick={() => run(post(`rounds/${lastRound.number}/start`))}>{tm("start")}</Button>
                <Button variant="outline" onClick={() => run(() => api("DELETE", `/api/tournaments/${id}/rounds/${lastRound.number}`))}>
                  {tm("discard")}
                </Button>
              </>
            )}
            {lastRound?.status === "IN_PROGRESS" && (
              <Button onClick={() => run(post(`rounds/${lastRound.number}/complete`))}>{tm("complete")}</Button>
            )}
            {canFinish && (
              <Button variant="secondary" onClick={() => window.confirm(tm("confirmFinish")) && run(post("finish"))}>
                {tm("finish")}
              </Button>
            )}
          </div>
          {[...rounds].reverse().map((r) => (
            <CollapsibleSection key={r.number} defaultOpen={r.status !== "COMPLETED"}
              className="border-t pt-3 first-of-type:border-t-0"
              title={<span className="flex flex-wrap items-baseline gap-x-3">
                {roundTitle(tr, r)}
                <span className="font-sans text-sm text-muted-foreground">{t(`rounds.status.${r.status}`)}</span>
              </span>}>
                {content && (
                  <NativeSelect aria-label={tm("scenario")} className="h-8 w-full font-sans sm:w-56" value={r.scenario ?? ""}
                    disabled={r.status === "COMPLETED"}
                    onChange={(e) => run(() => api("PUT", `/api/tournaments/${id}/rounds/${r.number}/scenario`,
                      { scenarioCode: e.target.value || null }))}>
                    <option value="">{tm("noScenario")}</option>
                    {content.quests.map((q) => <option key={q.code} value={q.code}>{q.name}</option>)}
                  </NativeSelect>
                )}
              {r.status !== "COMPLETED" && (
                <RoundTimer timer={r.timer} controls={{
                  canSet: true,
                  canRun: r.status === "IN_PROGRESS",
                  onSet: (minutes) => run(() => api("PUT", `/api/tournaments/${id}/rounds/${r.number}/timer`, { minutes })),
                  onStart: () => run(post(`rounds/${r.number}/timer/start`)),
                  onPause: () => run(post(`rounds/${r.number}/timer/pause`)),
                  onAdd: (minutes) => run(() => api("POST", `/api/tournaments/${id}/rounds/${r.number}/timer/add`, { minutes })),
                }} />
              )}
              {r.status === "PAIRED" && (
                <p className="text-sm text-muted-foreground">
                  {teamEvent ? tm("lineupHint") : r.phase !== "SWISS" ? tm("swapSwissOnly")
                    : picked ? tm("swapSelected", { name: pickedName }) : tm("swapHint")}
                </p>
              )}
              {r.teamMatches ? (
                <ul className="grid gap-3">
                  {r.teamMatches.map((tmatch) => (
                    <TeamMatchCard key={tmatch.id} teamMatch={tmatch}
                      matches={r.matches.filter((m) => m.teamMatchId === tmatch.id).sort((a, b) => a.table - b.table)}
                      renderMatch={(m) => organizerRow(r, m)}
                      onLineup={(teamId, order) => run(() => api("PUT",
                        `/api/tournaments/${id}/team-matches/${tmatch.id}/lineup`, { teamId, order }))} />
                  ))}
                </ul>
              ) : (
                <ul className="grid gap-2">{r.matches.map((m) => organizerRow(r, m))}</ul>
              )}
            </CollapsibleSection>
          ))}
      </CollapsibleCard>

      {rounds.length > 0 && (
        <CollapsibleCard title={t("viewTabs.standings")} contentClassName="grid gap-4">
            {teamEvent && teamStandings && <TeamStandingsTable rows={teamStandings} />}
            <StandingsTable data={standings} showPenalties={false} />
            <form method="post" className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
              e.preventDefault();
              if (!penalty.userId || !penalty.reason.trim()) return;
              void run(async () => {
                await api("POST", `/api/tournaments/${id}/penalties`,
                  { userId: penalty.userId, bigPoints: Number(penalty.bigPoints), reason: penalty.reason });
                setPenalty({ userId: "", bigPoints: "1", reason: "" });
              });
            }}>
              <NativeSelect aria-label={tm("selectPlayer")} className="w-48" value={penalty.userId}
                onChange={(e) => setPenalty((p) => ({ ...p, userId: e.target.value }))}>
                <option value="">{tm("selectPlayer")}</option>
                {confirmed.map((p) => <option key={p.userId} value={p.userId}>{p.displayName}</option>)}
              </NativeSelect>
              <Input aria-label={tm("penaltyPoints")} type="number" min={1} max={1000} className="w-24"
                value={penalty.bigPoints} onChange={(e) => setPenalty((p) => ({ ...p, bigPoints: e.target.value }))} />
              <Input aria-label={tm("penaltyReason")} placeholder={tm("penaltyReason")} maxLength={300} className="w-64"
                value={penalty.reason} onChange={(e) => setPenalty((p) => ({ ...p, reason: e.target.value }))} />
              <Button type="submit" variant="secondary">{tm("penaltyAdd")}</Button>
            </form>
            {standings.penalties.length > 0 && (
              <ul className="grid gap-1 text-sm">
                {standings.penalties.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="flex-1">{p.displayName}: −{p.bigPoints} – {p.reason}</span>
                    <Button size="icon" variant="ghost" aria-label={tm("remove")}
                      onClick={() => run(() => api("DELETE", `/api/tournaments/${id}/penalties/${p.id}`))}>
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
        </CollapsibleCard>
      )}

      <CollapsibleCard title={<>{tm("players")} ({tournament.registeredCount}
            {tournament.maxPlayers ? ` / ${tournament.maxPlayers}` : ""}
            {tournament.waitlistCount ? ` + ${tournament.waitlistCount}` : ""})</>} contentClassName="grid gap-4">
          {teamEvent && <p className="text-sm text-muted-foreground">{tm("teamPlayersHint")}</p>}
          {!teamEvent && <form
            method="post"
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newPlayer.trim()) return;
              void run(async () => {
                await api("POST", `/api/tournaments/${id}/participants`, { displayName: newPlayer.trim() });
                setNewPlayer("");
              });
            }}
          >
            <Input aria-label={tm("addPlayer")} placeholder={tm("addPlayer")} value={newPlayer} maxLength={32}
              onChange={(e) => setNewPlayer(e.target.value)} className="max-w-xs" />
            <Button type="submit" variant="secondary">{tm("add")}</Button>
          </form>}

          <div>
            {/* Fixed layout so the list-status select shrinks to its column on phones. */}
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="w-8 py-2 pr-2 font-medium sm:w-12 sm:pr-3">#</th>
                  <th className="py-2 pr-2 font-medium sm:pr-3">{t("players")}</th>
                  <th className="hidden w-40 py-2 pr-3 font-medium sm:table-cell">{tm("registeredAt")}</th>
                  <th className="w-14 py-2 pr-2 font-medium sm:w-24 sm:pr-3">
                    <span className="sm:hidden">{tm("paidShort")}</span><span className="hidden sm:inline">{tm("paid")}</span>
                  </th>
                  <th className="w-28 py-2 pr-2 font-medium sm:w-44 sm:pr-3">{tm("list")}</th>
                  <th className="w-10 py-2" />
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 text-muted-foreground">
                      {p.status === "WAITLIST" ? `R${i + 1 - tournament.registeredCount}` : i + 1}
                    </td>
                    <td className="py-2 pr-2 [overflow-wrap:anywhere] sm:pr-3">
                      {p.displayName}
                      {p.listStatus && p.listStatus !== "NOT_SUBMITTED" && (
                        <Link href={`/tournaments/${id}/warbands/${p.userId}`} className="block text-xs text-primary hover:underline sm:ml-2 sm:inline">
                          {tm("showList")}
                        </Link>
                      )}
                      {p.status === "WAITLIST" && (
                        <span className="ml-2 text-xs text-muted-foreground">({t("details.waitlist")})</span>
                      )}
                      {p.dropped && <span className="ml-2 text-xs text-destructive">({tm("dropped")})</span>}
                    </td>
                    <td className="hidden py-2 pr-3 text-muted-foreground sm:table-cell">
                      {format.dateTime(new Date(p.registeredAt), { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        aria-label={`${tm("paid")}: ${p.displayName}`}
                        checked={!!p.paid}
                        onChange={(e) =>
                          run(() => api("PATCH", `/api/tournaments/${id}/participants/${p.id}`, { paid: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <NativeSelect
                        aria-label={`${tm("list")}: ${p.displayName}`}
                        value={p.listStatus ?? "NOT_SUBMITTED"}
                        className="h-8 w-full min-w-0 px-1 text-xs sm:px-3 sm:text-sm"
                        onChange={(e) =>
                          run(() =>
                            api("PATCH", `/api/tournaments/${id}/participants/${p.id}`, {
                              listStatus: e.target.value as ListStatus,
                            }),
                          )
                        }
                      >
                        {LIST_STATUSES.map((s) => (
                          <option key={s} value={s}>{t(`listStatus.${s}`)}</option>
                        ))}
                      </NativeSelect>
                    </td>
                    <td className="py-2 text-right">
                      {!teamEvent && <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${tm("remove")}: ${p.displayName}`}
                        onClick={() =>
                          window.confirm(tm("confirmRemove", { name: p.displayName })) &&
                          run(() => api("DELETE", `/api/tournaments/${id}/participants/${p.id}`))
                        }
                      >
                        <Trash2 aria-hidden />
                      </Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </CollapsibleCard>

      <CollapsibleCard title={tm("edit")}>
          <TournamentForm key={formKey} tournament={tournament} submitLabel={t("form.save")} onSubmit={saveDetails} collapsible />
      </CollapsibleCard>

      <CollapsibleCard title={tm("history")}>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tm("noHistory")}</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {audit.map((a, i) => (
                <li key={i} className="flex flex-wrap gap-x-3">
                  <span className="text-muted-foreground">
                    {format.dateTime(new Date(a.at), { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <span className="font-medium">{a.actorName}</span>
                  <span>
                    {t.has(`audit.${a.action}`) ? t(`audit.${a.action}`) : a.action}
                    {a.details && !a.action.startsWith("STATUS_") ? `: ${a.details}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </CollapsibleCard>
    </div>
  );
}
