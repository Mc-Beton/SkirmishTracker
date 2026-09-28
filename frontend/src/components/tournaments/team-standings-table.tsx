"use client";

import { useTranslations } from "next-intl";
import type { TeamStandingRow } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

/** Team standings: team match wins, then big points (minus penalties), then small points. */
export function TeamStandingsTable({ rows, highlight }: { rows: TeamStandingRow[]; highlight?: string | null }) {
  const t = useTranslations("tournaments.standings");
  const tt = useTranslations("tournaments.teams");
  if (rows.every((r) => r.played === 0)) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-2 font-medium">{t("pos")}</th>
            <th className="py-2 pr-2 font-medium">{tt("team")}</th>
            <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t("wins")}</th>
            <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t("draws")}</th>
            <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t("losses")}</th>
            <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell" title={tt("gameWinsTitle")}>{tt("gameWins")}</th>
            <th className="py-2 pr-2 text-right font-medium">{t("big")}</th>
            <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t("penalty")}</th>
            <th className="py-2 text-right font-medium sm:pr-2">{t("small")}</th>
            <th className="hidden py-2 text-right font-medium sm:table-cell">{tt("matches")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teamId} className={cn("border-b last:border-0", r.teamId === highlight && "bg-accent/60",
              r.dropped && "text-muted-foreground")}>
              <td className="py-2 pr-2">{r.position}</td>
              <td className="py-2 pr-2 font-medium">
                {r.name}
                {r.knockout && (
                  <span className={cn("ml-2 rounded px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide",
                    r.eliminated ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary")}>
                    {r.eliminated ? t("eliminated") : t("knockout")}
                  </span>
                )}
                {r.dropped && <span className="ml-2 text-xs font-normal">({t("dropped")})</span>}
                <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                  {t("wdlShort", { w: r.wins, d: r.draws, l: r.losses })} · {tt("gameWinsShort", { n: r.gameWins })}
                  {r.penaltyPoints > 0 && <span className="text-destructive"> · {t("penaltyShort", { n: r.penaltyPoints })}</span>}
                </span>
              </td>
              <td className="hidden py-2 pr-2 text-right font-semibold sm:table-cell">{r.wins}</td>
              <td className="hidden py-2 pr-2 text-right sm:table-cell">{r.draws}</td>
              <td className="hidden py-2 pr-2 text-right sm:table-cell">{r.losses}</td>
              <td className="hidden py-2 pr-2 text-right sm:table-cell">{r.gameWins}</td>
              <td className="py-2 pr-2 text-right font-semibold">{r.totalBigPoints}</td>
              <td className="hidden py-2 pr-2 text-right text-destructive sm:table-cell">{r.penaltyPoints ? `−${r.penaltyPoints}` : ""}</td>
              <td className="py-2 text-right sm:pr-2">{r.smallPoints}</td>
              <td className="hidden py-2 text-right sm:table-cell">{r.played}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
