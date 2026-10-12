"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Check, Flag, RotateCcw, Trash2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { QuestView } from "@/components/game/quest-view";
import { TurnGrid, withTurn } from "@/components/game/turn-grid";
import { api } from "@/lib/api";
import { useGameContent } from "@/lib/content";
import type { GameList, OwnGame } from "@/lib/games";
import { useLiveRefresh } from "@/lib/live";
import { pending, sendOrQueue, type OutboxItem } from "@/lib/offline-queue";
import { factionName, useArmies, type Armies } from "@/lib/warbands";

type TurnBody = { playerId: string; scenarioVp: number; schemeVp: number };

/** Applies turns still waiting on this device (entered offline). */
function withPending(game: OwnGame, base: string, items: OutboxItem[]): OwnGame {
  return items.reduce((g, item) => {
    const m = item.path.match(/\/turns\/(\d+)$/);
    if (!m || !item.path.startsWith(`${base}/`)) return g;
    const b = item.body as TurnBody;
    return withTurn(g, b.playerId, Number(m[1]), b.scenarioVp, b.schemeVp);
  }, game);
}

/**
 * An own game for its two players: points turn by turn (both phones, live, also offline), then "Finish game"
 * reports the totals and the other player confirms – the same flow as a tournament game.
 */
export function OwnGameTracker({ gameId }: { gameId: string }) {
  const t = useTranslations("games");
  const tg = useTranslations("game");
  const to = useTranslations("offline");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const content = useGameContent();
  const armies = useArmies();
  const { me, loading } = useAuth();
  const [game, setGame] = useState<OwnGame | null>(null);
  const [queued, setQueued] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/games/${gameId}`;
  const meId = me?.id;

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  const fetchGame = useCallback(async () => {
    const g = await api<OwnGame>("GET", base);
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
    if (!meId) return;
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
  }, [fetchGame, meId, errorMessage]);

  // The opponent enters points on their phone too: their changes arrive as a hint for this user.
  useLiveRefresh(null, () => void load().catch(() => undefined));

  const opponent = game?.players.find((p) => p.userId !== meId);

  /** Points and finishing work without a connection: kept on the device and sent once the network is back. */
  async function save(method: "POST" | "PUT", path: string, label: string, body?: unknown,
                      labelParams?: Record<string, string | number>, key = `${label}:${gameId}`) {
    if (!meId) return;
    setError(null);
    try {
      const res = await sendOrQueue({
        key, userId: meId, method, path: `${base}/${path}`, body, label,
        labelParams: { opponent: opponent?.displayName ?? "?", ...labelParams },
      });
      if (res.queued) setQueued((q) => [...q, label]);
      else await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function call(method: "POST" | "DELETE", path: string, after?: () => void) {
    setError(null);
    try {
      await api(method, path ? `${base}/${path}` : base);
      if (after) after();
      else await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function saveTurn(playerId: string, turn: number, scenarioVp: number, schemeVp: number) {
    setGame((g) => g && withTurn(g, playerId, turn, scenarioVp, schemeVp));
    await save("PUT", `turns/${turn}`, "ownTurn", { playerId, scenarioVp, schemeVp }, { turn },
      `own-turn:${gameId}:${turn}:${playerId}`);
  }

  const back = (
    <Link href="/games" className="flex w-fit items-center gap-1 text-sm text-primary hover:underline">
      <ArrowLeft className="size-4" aria-hidden /> {t("title")}
    </Link>
  );
  if (!game || !content || !meId) {
    return <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8">{back}{error && <Alert variant="destructive">{error}</Alert>}</div>;
  }

  const [pa, pb] = game.players;
  const quest = content.quests.find((q) => q.code === game.scenario);
  const live = game.status === "IN_PROGRESS";
  const hasTurns = game.players.some((p) => p.total > 0);
  const reporter = game.players.find((p) => p.userId === game.reportedBy);
  const finishing = queued.includes("ownFinish");

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 [&>*]:min-w-0">
      <div className="grid gap-2">
        {back}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{t("live.title", { opponent: opponent?.displayName ?? "?" })}</h1>
          <Badge variant={game.status === "CONFIRMED" ? "success" : game.status === "REJECTED" ? "destructive" : "warning"}>
            {t(`status.${game.status}`)}
          </Badge>
          {game.league && <Badge variant="outline">{game.league.name}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {format.dateTime(new Date(`${game.playedOn}T00:00:00`), { dateStyle: "medium" })}
          {quest && ` · ${quest.name}`}
        </p>
        <p className="text-lg">
          <span className="font-semibold">{pa.displayName}</span>
          <span className="px-2 font-display text-2xl tabular-nums">
            {live ? pa.total : game.smallA} : {live ? pb.total : game.smallB}
          </span>
          <span className="font-semibold">{pb.displayName}</span>
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}
      {queued.length > 0 && <Alert>{finishing ? to("finishQueued") : to("savedOffline")}</Alert>}

      {game.status === "PENDING" && (
        <Alert>
          <span>{t("live.reported", { player: reporter?.displayName ?? "?", a: game.smallA, b: game.smallB })}</span>
          <span className="mt-2 flex flex-wrap gap-2">
            {game.canConfirm && (
              <>
                <Button size="sm" onClick={() => void call("POST", "confirm")}><Check aria-hidden /> {t("confirm")}</Button>
                <Button size="sm" variant="outline" onClick={() => void call("POST", "reject")}><X aria-hidden /> {t("reject")}</Button>
              </>
            )}
            {game.canReopen && (
              <Button size="sm" variant="outline" onClick={() => void call("POST", "reopen")}><RotateCcw aria-hidden /> {t("live.reopen")}</Button>
            )}
            {game.canWithdraw && (
              <Button size="sm" variant="ghost"
                onClick={() => window.confirm(t("confirmWithdraw")) && void call("DELETE", "", () => router.push("/games"))}>
                <Trash2 aria-hidden /> {t("withdraw")}
              </Button>
            )}
          </span>
        </Alert>
      )}
      {game.status === "CONFIRMED" && <Alert variant="success">{t("live.confirmed", { a: game.smallA, b: game.smallB })}</Alert>}
      {game.status === "REJECTED" && <Alert variant="destructive">{t("live.rejected")}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="grid content-start gap-6 [&>*]:min-w-0">
          {(live || hasTurns) && <TurnGrid game={game} onSave={saveTurn} />}
          {!live && !hasTurns && <p className="text-sm text-muted-foreground">{t("live.noTurns")}</p>}
          {live && (
            <div className="flex flex-wrap gap-3">
              {game.canFinish && !finishing && (
                <Button size="lg" onClick={() => window.confirm(t("live.finishConfirm", { a: pa.total, b: pb.total }))
                  && void save("POST", "finish", "ownFinish")}>
                  <Flag aria-hidden /> {tg("finish", { a: pa.total, b: pb.total })}
                </Button>
              )}
              {game.canCancel && (
                <Button variant="ghost" onClick={() => window.confirm(t("live.abandonConfirm"))
                  && void call("DELETE", "", () => router.push("/games"))}>
                  <Trash2 aria-hidden /> {t("live.abandon")}
                </Button>
              )}
            </div>
          )}
          {live && <p className="text-xs text-muted-foreground">{t("live.finishHint")}</p>}
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle className="text-xl">{quest ? quest.name : tg("scenario")}</CardTitle></CardHeader>
            <CardContent>
              {quest ? <QuestView quest={quest} compact /> : <p className="text-sm text-muted-foreground">{tg("noScenario")}</p>}
            </CardContent>
          </Card>
          {game.players.some((p) => p.list || p.faction) && (
            <Card>
              <CardHeader><CardTitle className="text-xl">{t("list.show")}</CardTitle></CardHeader>
              <CardContent className="grid gap-4 text-sm">
                {game.players.map((p) => (
                  <PlayerList key={p.userId} name={p.displayName} faction={p.faction} list={p.list} armies={armies} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerList({ name, faction, list, armies }: { name: string; faction: string | null; list: GameList | null; armies: Armies | null }) {
  const t = useTranslations("games.list");
  const unitName = (c: string) => armies?.units.find((u) => u.code === c)?.name ?? c;
  const itemName = (c: string) => armies?.items.find((i) => i.code === c)?.name ?? c;
  return (
    <div className="grid gap-1">
      <p className="font-medium">
        {name}: {factionName(armies, list?.faction ?? faction) || "?"}
        {list?.alliedFaction && ` + ${factionName(armies, list.alliedFaction)}`}
        {list && <span className="font-normal text-muted-foreground"> · {t("total", { points: list.totalPoints })}</span>}
      </p>
      {list && (
        <ul className="grid gap-0.5 text-muted-foreground">
          {list.units.map((u, i) => (
            <li key={i}>
              {u.leader && "♛ "}{unitName(u.unit)}
              {u.items.length > 0 && <span className="text-xs"> ({u.items.map((x) => itemName(x.item)).join(", ")})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
