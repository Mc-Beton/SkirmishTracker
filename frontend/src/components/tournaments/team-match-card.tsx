"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Match, PlayerRef, TeamMatch } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

/**
 * One team match: aggregate score (game wins, then big and small points), line-ups and the board games.
 * While the round is only paired a captain (or the organizer) can change the board order of their team.
 */
export function TeamMatchCard({ teamMatch: tm, matches, myTeamId, renderMatch, onLineup }: {
  teamMatch: TeamMatch;
  matches: Match[];
  myTeamId?: string | null;
  renderMatch: (m: Match) => React.ReactNode;
  onLineup?: (teamId: string, order: string[]) => Promise<void>;
}) {
  const t = useTranslations("tournaments.teams");
  const tr = useTranslations("tournaments.rounds");
  const started = matches.some((m) => m.status !== "PENDING") || tm.complete;
  const side = (ref: { id: string; name: string }, wins: number, big: number, small: number, seed: number | null) => (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2", tm.winner === ref.id && "font-semibold",
      ref.id === myTeamId && "text-primary")}>
      {seed != null && <span className="text-xs tabular-nums text-muted-foreground">#{seed}</span>}
      <span className="truncate">{ref.name}</span>
      {tm.winner === ref.id && <Trophy className="size-4 shrink-0 text-primary" aria-label={t("winner")} />}
      <span className="ml-auto shrink-0 text-right tabular-nums">
        <span className="text-lg">{wins}</span>
        <span className="ml-2 text-xs text-muted-foreground">{big} {tr("bigShort")} · {small} {tr("smallShort")}</span>
      </span>
    </div>
  );

  return (
    <li className="grid gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{t("group", { n: tm.group })}</Badge>
        {tm.complete && !tm.winner && tm.teamB && <Badge>{t("draw")}</Badge>}
        {!tm.complete && started && <Badge variant="warning">{t("inProgress")}</Badge>}
      </div>
      {tm.teamB ? (
        <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
          {side(tm.teamA, tm.gameWinsA, tm.bigA, tm.smallA, tm.seedA)}
          {side(tm.teamB, tm.gameWinsB, tm.bigB, tm.smallB, tm.seedB)}
        </div>
      ) : (
        <p className="text-sm"><span className="font-medium">{tm.teamA.name}</span> — {tr("bye")}</p>
      )}

      {(tm.canEditLineupA || tm.canEditLineupB) && onLineup && (
        <div className="grid gap-3 sm:grid-cols-2">
          {tm.canEditLineupA && tm.lineupA && (
            <LineupEditor key={`${tm.id}-a-${tm.lineupA.map((p) => p.id).join()}`} teamName={tm.teamA.name}
              lineup={tm.lineupA} onSave={(order) => onLineup(tm.teamA.id, order)} />
          )}
          {tm.canEditLineupB && tm.lineupB && tm.teamB && (
            <LineupEditor key={`${tm.id}-b-${tm.lineupB.map((p) => p.id).join()}`} teamName={tm.teamB.name}
              lineup={tm.lineupB} onSave={(order) => onLineup(tm.teamB!.id, order)} />
          )}
        </div>
      )}

      {matches.length > 0 ? (
        <ul className="grid gap-2">{matches.map(renderMatch)}</ul>
      ) : (
        tm.teamB && <p className="text-xs text-muted-foreground">{t("boardsHidden")}</p>
      )}
    </li>
  );
}

function LineupEditor({ teamName, lineup, onSave }: {
  teamName: string;
  lineup: PlayerRef[];
  onSave: (order: string[]) => Promise<void>;
}) {
  const t = useTranslations("tournaments.teams");
  const [order, setOrder] = useState(lineup);
  const [busy, setBusy] = useState(false);
  const changed = order.some((p, i) => p.id !== lineup[i]?.id);
  const move = (i: number, d: number) => setOrder((o) => {
    const n = [...o];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });

  return (
    <div className="grid gap-2 rounded-md border border-dashed p-2">
      <p className="text-sm font-medium">{t("lineupOf", { team: teamName })}</p>
      <ol className="grid gap-1 text-sm">
        {order.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="w-16 text-xs text-muted-foreground">{t("board", { n: i + 1 })}</span>
            <span className="min-w-0 flex-1 truncate">{p.displayName}</span>
            <Button size="icon" variant="ghost" className="size-7" disabled={i === 0}
              aria-label={t("moveUp", { name: p.displayName })} onClick={() => move(i, -1)}>
              <ArrowUp className="size-3.5" aria-hidden />
            </Button>
            <Button size="icon" variant="ghost" className="size-7" disabled={i === order.length - 1}
              aria-label={t("moveDown", { name: p.displayName })} onClick={() => move(i, 1)}>
              <ArrowDown className="size-3.5" aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      <Button size="sm" className="justify-self-start" disabled={!changed || busy} onClick={async () => {
        setBusy(true);
        try {
          await onSave(order.map((p) => p.id));
        } finally {
          setBusy(false);
        }
      }}>{t("saveLineup")}</Button>
    </div>
  );
}
