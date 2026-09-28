"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { factionName, useArmies, type MyWarband } from "@/lib/warbands";
import { ListStatusBadge } from "./list-status-badge";

/** Sidebar card on the tournament page: the caller's list status and a link to the builder. */
export function MyWarbandCard({ tournamentId, reloadKey }: { tournamentId: string; reloadKey?: unknown }) {
  const t = useTranslations("warbands");
  const armies = useArmies();
  const [mine, setMine] = useState<MyWarband | null>(null);

  useEffect(() => {
    let active = true;
    api<MyWarband>("GET", `/api/tournaments/${tournamentId}/warbands/me`)
      .then((m) => active && setMine(m))
      .catch(() => active && setMine(null));
    return () => {
      active = false;
    };
  }, [tournamentId, reloadKey]);

  if (!mine) return null;
  const w = mine.warband;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
          {t("myList")}
          {w && <ListStatusBadge status={w.listStatus} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {w ? (
          <p className="text-sm">
            {factionName(armies, w.faction)}
            {w.alliedFaction && ` + ${factionName(armies, w.alliedFaction)}`}
            <span className="text-muted-foreground">
              {" "}· {w.totalPoints}{mine.pointsLimit != null && ` / ${mine.pointsLimit}`} {t("pts")}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{mine.editable ? t("notYet") : t("none")}</p>
        )}
        <Button variant={w ? "outline" : "default"} asChild>
          <Link href={`/tournaments/${tournamentId}/warband`}>
            <Swords aria-hidden /> {mine.editable ? (w ? t("edit") : t("build")) : t("view")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
