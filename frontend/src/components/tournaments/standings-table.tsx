"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { StandingsData } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

export function StandingsTable({ data, highlight, showPenalties = true }: { data: StandingsData; highlight?: string; showPenalties?: boolean }) {
  const t = useTranslations("tournaments.standings");
  if (data.rows.every((r) => r.played === 0)) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <div className="grid gap-4">
      {/* Mobile first: W/D/L, penalties and games fold into the name cell below the sm breakpoint. */}
      <div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-2 font-medium">{t("pos")}</th>
              <th className="py-2 pr-2 font-medium">{t("player")}</th>
              <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell" title="W">{t("wins")}</th>
              <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t("draws")}</th>
              <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t("losses")}</th>
              <th className="py-2 pr-2 text-right font-medium">{t("big")}</th>
              <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t("penalty")}</th>
              <th className="py-2 pr-2 text-right font-medium sm:pr-2">{t("small")}</th>
              <th className="hidden py-2 text-right font-medium sm:table-cell">{t("played")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.userId}
                className={cn("border-b last:border-0", r.userId === highlight && "bg-accent/60", r.dropped && "text-muted-foreground")}>
                <td className="py-2 pr-2">{r.position}</td>
                <td className="py-2 pr-2 font-medium">
                  <Link href={`/players/${r.userId}`} className="hover:underline">{r.displayName}</Link>
                  {r.knockout && (
                    <span className={cn("ml-2 rounded px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide",
                      r.eliminated ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary")}>
                      {r.eliminated ? t("eliminated") : t("knockout")}
                    </span>
                  )}
                  {r.dropped && <span className="ml-2 text-xs font-normal">({t("dropped")})</span>}
                  <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                    {t("wdlShort", { w: r.wins, d: r.draws, l: r.losses })} · {t("gamesShort", { n: r.played })}
                    {r.penaltyPoints > 0 && <span className="text-destructive"> · {t("penaltyShort", { n: r.penaltyPoints })}</span>}
                  </span>
                </td>
                <td className="hidden py-2 pr-2 text-right font-semibold sm:table-cell">{r.wins}</td>
                <td className="hidden py-2 pr-2 text-right sm:table-cell">{r.draws}</td>
                <td className="hidden py-2 pr-2 text-right sm:table-cell">{r.losses}</td>
                <td className="py-2 pr-2 text-right font-semibold">{r.totalBigPoints}</td>
                <td className="hidden py-2 pr-2 text-right text-destructive sm:table-cell">{r.penaltyPoints ? `−${r.penaltyPoints}` : ""}</td>
                <td className="py-2 text-right sm:pr-2">{r.smallPoints}</td>
                <td className="hidden py-2 text-right sm:table-cell">{r.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showPenalties && data.penalties.length > 0 && (
        <div className="grid gap-1 text-sm">
          <h3 className="font-medium">{t("penalties")}</h3>
          <ul className="grid gap-1 text-muted-foreground">
            {data.penalties.map((p) => (
              <li key={p.id}>{p.displayName}: −{p.bigPoints} – {p.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
