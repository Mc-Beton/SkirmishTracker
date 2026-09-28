"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { factionName, useArmies, type WarbandSummary } from "@/lib/warbands";
import { ListStatusBadge } from "./list-status-badge";

/** All submitted lists of a tournament (organizer, or everyone once lists are public). */
export function WarbandList({ tournamentId, items }: { tournamentId: string; items: WarbandSummary[] }) {
  const t = useTranslations("warbands");
  const armies = useArmies();
  if (items.length === 0) return <p className="text-muted-foreground">{t("noLists")}</p>;
  return (
    <ul className="grid gap-2">
      {items.map((w) => (
        <li key={w.userId}>
          <Link href={`/tournaments/${tournamentId}/warbands/${w.userId}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-3 hover:bg-accent">
            <span className="font-medium">{w.displayName}</span>
            <span className="text-sm text-muted-foreground">
              {factionName(armies, w.faction)}{w.alliedFaction && ` + ${factionName(armies, w.alliedFaction)}`}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className="tabular-nums text-sm">{w.totalPoints} {t("pts")}</span>
              <ListStatusBadge status={w.listStatus} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
