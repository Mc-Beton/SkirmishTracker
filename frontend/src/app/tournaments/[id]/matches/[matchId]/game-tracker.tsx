"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Dices, Gavel } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { QuestView } from "@/components/game/quest-view";
import { SchemeCard } from "@/components/game/scheme-card";
import { RoundTimer } from "@/components/tournaments/round-timer";
import { api } from "@/lib/api";
import { useLiveRefresh } from "@/lib/live";
import { pending, sendOrQueue, type OutboxItem } from "@/lib/offline-queue";
import { PartyPanel } from "@/components/game/party-panel";
import { cardsFor, useGameContent, type GameContent } from "@/lib/content";
import { TurnGrid, withTurn } from "@/components/game/turn-grid";
import type { GamePlayer, GameView } from "@/lib/tournaments";

type TurnBody = { playerId: string; scenarioVp: number; schemeVp: number };

/** Applies changes still waiting on this device, so the table shows what the players entered offline. */
function withPending(game: GameView, base: string, items: OutboxItem[]): GameView {
  return items.reduce((g, item) => {
    const m = item.path.match(/\/turns\/(\d+)$/);
    if (!m || !item.path.startsWith(`${base}/`)) return g;
    const b = item.body as TurnBody;
    return withTurn(g, b.playerId, Number(m[1]), b.scenarioVp, b.schemeVp);
  }, game);
}

export function GameTracker({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
  const t = useTranslations("game");
  const tr = useTranslations("tournaments.rounds");
  const errorMessage = useErrorMessage();
  const content = useGameContent();
  const { me } = useAuth();
  const [game, setGame] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<string[]>([]);
  const to = useTranslations("offline");
  const base = `/api/tournaments/${tournamentId}/matches/${matchId}`;
  const meId = me?.id;

  const fetchGame = useCallback(async () => {
    const g = await api<GameView>("GET", `${base}/game`);
    if (!meId) return { game: g, waiting: [] as string[] };
    const mine = (await pending(meId).catch(() => [])).filter((i) => i.path.startsWith(`${base}/`));
    return { game: withPending(g, base, mine), waiting: mine.map((i) => i.label) };
  }, [base, meId]);

  const load = useCallback(async () => {
    const { game: g, waiting } = await fetchGame();
    setGame(g);
    setQueued(waiting);
  }, [fetchGame]);

  useEffect(() => {
    let active = true;
    fetchGame()
      .then(({ game: g, waiting }) => {
        if (!active) return;
        setGame(g);
        setQueued(waiting);
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [fetchGame, errorMessage]);

  // The opponent enters points on their phone too: follow their changes live.
  useLiveRefresh(tournamentId, () => void load().catch(() => undefined));

  async function call(method: "POST" | "PUT", path: string, body?: unknown) {
    setError(null);
    try {
      await api(method, `${base}/${path}`, body);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  /**
   * Points, finishing and confirming work without a connection: stored on the device and sent in order once
   * the network is back. The table updates at once either way.
   */
  async function save(method: "POST" | "PUT", path: string, label: string, body?: unknown,
                      labelParams?: Record<string, string | number>, key = `${label}:${matchId}`) {
    if (!meId) return call(method, path, body);
    setError(null);
    try {
      const res = await sendOrQueue({
        key, userId: meId, method, path: `${base}/${path}`, body, label,
        labelParams: { table: game?.table ?? "–", ...labelParams },
      });
      if (res.queued) setQueued((q) => [...q, label]);
      else await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function saveTurn(playerId: string, turn: number, scenarioVp: number, schemeVp: number) {
    setGame((g) => g && withTurn(g, playerId, turn, scenarioVp, schemeVp));
    await save("PUT", `turns/${turn}`, "turn", { playerId, scenarioVp, schemeVp }, { turn },
      `turn:${matchId}:${turn}:${playerId}`);
  }

  if (!game || !content) {
    return <div className="mx-auto w-full max-w-6xl px-4 py-10">{error && <Alert variant="destructive">{error}</Alert>}</div>;
  }

  const quest = content.quests.find((q) => q.code === game.scenario);
  const [pa, pb] = game.players;
  const amOpponentOfReporter = !!me && game.status === "REPORTED" && game.reportedBy !== me.id
    && game.players.some((p) => p.userId === me.id);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 [&>*]:min-w-0">
      <div className="grid gap-2">
        <Link href={`/tournaments/${tournamentId}`} className="flex w-fit items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{t("title", { round: game.roundNumber, table: game.table })}</h1>
          <Badge variant={game.status === "CONFIRMED" ? "success" : game.status === "PENDING" ? "outline" : "warning"}>
            {tr(`match.${game.status}`)}
          </Badge>
          {game.roundStatus === "IN_PROGRESS" && game.timer && <RoundTimer timer={game.timer} />}
          {game.judgeCalled ? (
            <Badge variant="warning"><Gavel className="mr-1 size-3" aria-hidden />{tr("judgeCalled")}</Badge>
          ) : game.canCallJudge && (
            <Button size="sm" variant="outline"
              onClick={() => window.confirm(tr("callJudgeConfirm")) && call("POST", "judge", {})}>
              <Gavel aria-hidden /> {tr("callJudge")}
            </Button>
          )}
        </div>
        {pb && (
          <p className="text-lg">
            <span className="font-semibold">{pa.displayName}</span>
            <span className="px-2 font-display text-2xl tabular-nums">{pa.total} : {pb.total}</span>
            <span className="font-semibold">{pb.displayName}</span>
          </p>
        )}
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}
      {queued.length > 0 && (
        <Alert>{queued.includes("finish") ? to("finishQueued") : to("savedOffline")}</Alert>
      )}

      {game.status === "REPORTED" && game.reportedA != null && (
        <Alert>
          {t("reported", { a: game.reportedA, b: game.reportedB ?? 0 })}
          {amOpponentOfReporter && (
            <span className="ml-3 inline-flex gap-2">
              <Button size="sm" onClick={() => save("POST", "confirm", "decision")}>{tr("confirm")}</Button>
              <Button size="sm" variant="outline" onClick={() => save("POST", "dispute", "decision")}>{tr("dispute")}</Button>
            </span>
          )}
        </Alert>
      )}
      {game.status === "CONFIRMED" && game.reportedA != null && (
        <Alert variant="success">{t("confirmed", { a: game.reportedA, b: game.reportedB ?? 0 })}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="grid content-start gap-6 [&>*]:min-w-0">
          {pb && <PartyPanel tournamentId={tournamentId} matchId={matchId} meId={meId} onSaved={() => void load().catch(() => undefined)} />}
          {pb && <TurnGrid game={game} onSave={saveTurn} />}
          {game.canFinish && pb && !queued.includes("finish") && (
            <Button size="lg" className="w-full sm:w-auto sm:justify-self-start" onClick={() => save("POST", "finish", "finish")}>
              {t("finish", { a: pa.total, b: pb.total })}
            </Button>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {game.players.map((p) => (
              <SchemesPanel key={p.userId} player={p} content={content}
                onDraw={(faction, leaderInt) => call("POST", "schemes/draw", { faction, leaderInt })}
                onKeep={(scheme) => call("POST", "schemes/keep", { scheme })}
                isMe={p.userId === me?.id} />
            ))}
          </div>
        </div>

        <Card className="content-start">
          <CardHeader>
            <CardTitle className="text-xl">{quest ? quest.name : t("scenario")}</CardTitle>
          </CardHeader>
          <CardContent>
            {quest ? <QuestView quest={quest} compact /> : <p className="text-sm text-muted-foreground">{t("noScenario")}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SchemesPanel({ player, content, onDraw, onKeep, isMe }: {
  player: GamePlayer;
  content: GameContent;
  onDraw: (faction: string | null, leaderInt: number | null) => Promise<void>;
  onKeep: (scheme: string) => Promise<void>;
  isMe: boolean;
}) {
  const t = useTranslations("game");
  const drawable = content.factions.filter((f) => f.schemeTable);
  const [faction, setFaction] = useState(drawable[0]?.code ?? "");
  const [leaderInt, setLeaderInt] = useState("13");
  const schemeOf = (code: string) => content.schemes.find((s) => s.code === code);
  const d = player.draw;
  const intValue = Number.parseInt(leaderInt || "0", 10) || 0;
  const warbandHasTable = !!content.factions.find((f) => f.code === player.warbandFaction)?.schemeTable;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("schemes")} – {player.displayName}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!d && (player.canEdit && isMe && player.warbandFaction ? (
          <div className="grid gap-3">
            <p className="text-sm">
              <span className="font-medium">{content.factions.find((f) => f.code === player.warbandFaction)?.name ?? player.warbandFaction}</span>
              {player.warbandLeaderInt != null && <span className="text-muted-foreground"> · {t("leaderInt")} {player.warbandLeaderInt}</span>}
            </p>
            <p className="text-xs text-muted-foreground">{t("fromWarband")}</p>
            {player.warbandLeaderInt == null ? (
              <p className="text-sm text-muted-foreground">{t("partyFirst")}</p>
            ) : warbandHasTable ? (
              <Button type="button" className="justify-self-start" onClick={() => void onDraw(null, null)}>
                <Dices aria-hidden /> {t("draw", { n: cardsFor(content, player.warbandLeaderInt ?? 1) })}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noSchemeTable")}</p>
            )}
          </div>
        ) : player.canEdit && isMe ? (
          <form method="post" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void onDraw(faction, intValue); }}>
            <div className="grid gap-2">
              <Label htmlFor={`faction-${player.userId}`}>{t("faction")}</Label>
              <NativeSelect id={`faction-${player.userId}`} value={faction} onChange={(e) => setFaction(e.target.value)}>
                {drawable.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`int-${player.userId}`}>{t("leaderInt")}</Label>
              <Input id={`int-${player.userId}`} type="number" min={1} max={30} value={leaderInt}
                onChange={(e) => setLeaderInt(e.target.value)} className="w-24" />
              <p className="text-xs text-muted-foreground">{t("drawHint")}</p>
            </div>
            <Button type="submit" className="justify-self-start" disabled={intValue < 1}>
              <Dices aria-hidden /> {t("draw", { n: cardsFor(content, intValue) })}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{t("notDrawn")}</p>
        ))}
        {d && (
          <>
            <p className="text-xs text-muted-foreground">
              {content.factions.find((f) => f.code === d.faction)?.name} · {t("leaderInt")} {d.leaderInt}
            </p>
            {d.kept ? (
              schemeOf(d.kept) && <SchemeCard scheme={schemeOf(d.kept)!} highlight />
            ) : (
              d.cards.map((c) => {
                const s = schemeOf(c.scheme);
                return s ? (
                  <SchemeCard key={c.scheme} scheme={s} roll={c.roll}
                    action={player.canEdit && isMe ? (
                      <Button size="sm" className="justify-self-start" onClick={() => onKeep(c.scheme)}>{t("keep")}</Button>
                    ) : undefined} />
                ) : null;
              })
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
