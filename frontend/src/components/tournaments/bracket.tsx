"use client";

import { useTranslations } from "next-intl";
import type { Match, Round, TeamMatch } from "@/lib/tournaments";
import { cn } from "@/lib/utils";
import { roundTitle } from "./round-title";

/** Knockout bracket: one column per round, winners highlighted. */
export function Bracket({ rounds, highlight }: { rounds: Round[]; highlight?: string }) {
  const t = useTranslations("tournaments.rounds");
  const ko = rounds.filter((r) => r.phase === "KNOCKOUT");
  if (ko.length === 0) return null;
  return (
    <div className="sm:overflow-x-auto sm:pb-2">
      {/* Phones: one round under another; wider screens: the classic left-to-right bracket. */}
      <div className="grid gap-5 sm:flex sm:min-w-max sm:gap-6">
        {ko.map((r) => (
          <section key={r.number} className="flex flex-col gap-3 sm:w-56">
            <h3 className="text-sm font-medium text-muted-foreground">{roundTitle(t, r)}</h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {(r.teamMatches ? r.teamMatches.map(teamAsMatch) : [...r.matches]).sort((a, b) => a.table - b.table).map((m) => (
                <BracketMatch key={m.id} match={m} highlight={highlight} byeLabel={t("bye")} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** A team match drawn like a single game: team names, seeds and game wins. */
function teamAsMatch(tm: TeamMatch): Match {
  return {
    id: tm.id, table: tm.group, playerA: { id: tm.teamA.id, displayName: tm.teamA.name },
    playerB: tm.teamB ? { id: tm.teamB.id, displayName: tm.teamB.name } : null,
    status: tm.complete ? "CONFIRMED" : "PENDING", resultType: null,
    smallA: tm.teamB && (tm.complete || tm.gameWinsA + tm.gameWinsB > 0) ? tm.gameWinsA : null,
    smallB: tm.teamB && (tm.complete || tm.gameWinsA + tm.gameWinsB > 0) ? tm.gameWinsB : null,
    bigA: null, bigB: null, reportedBy: null, rematch: false, canReport: false, canConfirm: false,
    seedA: tm.seedA, seedB: tm.seedB, advancing: tm.winner, judgeCalled: false, teamMatchId: null,
  };
}

function BracketMatch({ match: m, highlight, byeLabel }: { match: Match; highlight?: string; byeLabel: string }) {
  const line = (id: string | null, name: string, seed: number | null, score: number | null) => {
    const won = !!id && m.advancing === id;
    const lost = !!m.advancing && !!id && m.advancing !== id;
    return (
      <div className={cn("flex items-center gap-2 px-3 py-1.5 text-sm", won && "font-semibold",
        lost && "text-muted-foreground", id === highlight && "bg-accent/60")}>
        <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{seed ?? ""}</span>
        <span className="flex-1 truncate">{name}</span>
        <span className="tabular-nums">{score ?? ""}</span>
      </div>
    );
  };
  const bye = !m.playerB;
  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs">
      {line(m.playerA.id, m.playerA.displayName, m.seedA, bye ? null : m.smallA)}
      {bye ? (
        <div className="px-3 py-1.5 pl-11 text-sm italic text-muted-foreground">{byeLabel}</div>
      ) : (
        line(m.playerB!.id, m.playerB!.displayName, m.seedB, m.smallB)
      )}
    </div>
  );
}
