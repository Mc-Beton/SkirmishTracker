"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import { cardsFor, useGameContent, type GameContent } from "@/lib/content";
import type { GamePlayer, GameView } from "@/lib/tournaments";

export function GameTracker({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
  const t = useTranslations("game");
  const tr = useTranslations("tournaments.rounds");
  const errorMessage = useErrorMessage();
  const content = useGameContent();
  const { me } = useAuth();
  const [game, setGame] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/tournaments/${tournamentId}/matches/${matchId}`;

  const load = useCallback(async () => setGame(await api<GameView>("GET", `${base}/game`)), [base]);

  useEffect(() => {
    let active = true;
    api<GameView>("GET", `${base}/game`)
      .then((g) => active && setGame(g))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [base, me?.id, errorMessage]);

  async function call(method: "POST" | "PUT", path: string, body?: unknown) {
    setError(null);
    try {
      await api(method, `${base}/${path}`, body);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
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

      {game.status === "REPORTED" && game.reportedA != null && (
        <Alert>
          {t("reported", { a: game.reportedA, b: game.reportedB ?? 0 })}
          {amOpponentOfReporter && (
            <span className="ml-3 inline-flex gap-2">
              <Button size="sm" onClick={() => call("POST", "confirm")}>{tr("confirm")}</Button>
              <Button size="sm" variant="outline" onClick={() => call("POST", "dispute")}>{tr("dispute")}</Button>
            </span>
          )}
        </Alert>
      )}
      {game.status === "CONFIRMED" && game.reportedA != null && (
        <Alert variant="success">{t("confirmed", { a: game.reportedA, b: game.reportedB ?? 0 })}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="grid content-start gap-6 [&>*]:min-w-0">
          {pb && <TurnGrid game={game} onSave={(playerId, turn, sc, sh) =>
            call("PUT", `turns/${turn}`, { playerId, scenarioVp: sc, schemeVp: sh })} />}
          {game.canFinish && pb && (
            <Button size="lg" className="w-full sm:w-auto sm:justify-self-start" onClick={() => call("POST", "finish")}>
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

function TurnGrid({ game, onSave }: {
  game: GameView;
  onSave: (playerId: string, turn: number, scenarioVp: number, schemeVp: number) => Promise<void>;
}) {
  const t = useTranslations("game");
  const [pa, pb] = game.players;
  const players = [pa, pb];
  // Mobile first: a fixed grid (turn | player A: scenario, scheme | player B: scenario, scheme) that always
  // fits the screen width – no sideways scrolling while entering points at the table.
  const row = "grid grid-cols-[1.75rem_1fr_1fr] items-center gap-x-2 sm:grid-cols-[3rem_1fr_1fr] sm:gap-x-4";
  const pair = "grid grid-cols-2 gap-1 sm:gap-2";
  return (
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-xl">{t("turns")}</CardTitle>
        {players.some((p) => p.canEdit) && <p className="text-xs text-muted-foreground">{t("bothCanEdit")}</p>}
      </CardHeader>
      <CardContent className="grid gap-1 px-3 sm:px-6">
        <div className={cn(row, "text-sm font-medium")}>
          <span className="text-xs text-muted-foreground">{t("turn")}</span>
          {players.map((p) => <span key={p.userId} className="truncate text-center">{p.displayName}</span>)}
        </div>
        <div className={cn(row, "border-b pb-1 text-[11px] text-muted-foreground sm:text-xs")}>
          <span />
          {players.map((p) => (
            <span key={p.userId} className={cn(pair, "text-center")}>
              <span className="truncate">{t("scenarioVp")}</span>
              <span className="truncate">{t("schemeVp")}</span>
            </span>
          ))}
        </div>
        {Array.from({ length: game.turns }, (_, i) => i + 1).map((turn) => (
          <div key={turn} className={cn(row, "border-b py-1 last:border-0")}>
            <span className="text-center font-medium tabular-nums">{turn}</span>
            {players.map((p) => (
              <TurnCells key={p.userId} player={p} turn={turn} onSave={onSave} className={pair} />
            ))}
          </div>
        ))}
        <div className={cn(row, "pt-1 font-semibold")}>
          <span className="text-xs">{t("total")}</span>
          {players.map((p) => (
            <span key={p.userId} className="grid gap-0.5 text-center">
              <span className={cn(pair, "tabular-nums")}>
                <span>{p.totalScenario}</span>
                <span>{p.totalScheme}</span>
              </span>
              <span className="font-display text-xl tabular-nums">{p.total}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TurnCells({ player, turn, onSave, className }: {
  player: GamePlayer;
  turn: number;
  onSave: (playerId: string, turn: number, scenarioVp: number, schemeVp: number) => Promise<void>;
  className?: string;
}) {
  const current = player.turns.find((x) => x.turn === turn) ?? { turn, scenarioVp: 0, schemeVp: 0 };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [values, setValues] = useState({ sc: current.scenarioVp, sh: current.schemeVp });

  const change = (key: "sc" | "sh", raw: string) => {
    const n = Math.max(0, Math.min(100, Number.parseInt(raw || "0", 10) || 0));
    const next = { ...values, [key]: n };
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    // Debounced autosave so quick typing does not flood the API.
    timer.current = setTimeout(() => void onSave(player.userId, turn, next.sc, next.sh), 600);
  };

  const cell = (key: "sc" | "sh", label: string) => player.canEdit ? (
    <Input aria-label={label} type="number" inputMode="numeric" min={0} max={100} value={values[key]}
      onFocus={(e) => e.target.select()} onChange={(e) => change(key, e.target.value)}
      className="h-10 w-full min-w-0 appearance-none px-1 text-center tabular-nums [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
  ) : (
    <span className="py-2 text-center tabular-nums">{key === "sc" ? current.scenarioVp : current.schemeVp}</span>
  );
  return (
    <div className={className}>
      {cell("sc", `${player.displayName} T${turn} scenario`)}
      {cell("sh", `${player.displayName} T${turn} scheme`)}
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
              <span className="text-muted-foreground"> · {t("leaderInt")} {player.warbandLeaderInt}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t("fromWarband")}</p>
            {warbandHasTable ? (
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
