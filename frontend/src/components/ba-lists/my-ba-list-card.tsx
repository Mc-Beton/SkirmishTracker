"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListStatusBadge } from "@/components/warbands/list-status-badge";
import { api } from "@/lib/api";
import type { MyBaList } from "@/lib/ba-lists";
import { useNationName } from "./nation-name";

/** Sidebar card on a Bolt Action tournament page: the caller's list status and a link to the form. */
export function MyBaListCard({ tournamentId, reloadKey }: { tournamentId: string; reloadKey?: unknown }) {
  const t = useTranslations("baLists");
  const nation = useNationName();
  const [mine, setMine] = useState<MyBaList | null>(null);

  useEffect(() => {
    let active = true;
    api<MyBaList>("GET", `/api/tournaments/${tournamentId}/ba-lists/me`)
      .then((m) => active && setMine(m))
      .catch(() => active && setMine(null));
    return () => {
      active = false;
    };
  }, [tournamentId, reloadKey]);

  if (!mine) return null;
  const l = mine.list;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
          {t("myList")}
          {l && <ListStatusBadge status={l.status} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {l ? (
          <p className="text-sm">
            {nation(l.nation)}
            <span className="text-muted-foreground">
              {" "}· {l.points}{mine.pointsLimit != null && ` / ${mine.pointsLimit}`} {t("pts")} · {t("diceN", { n: l.orderDice })}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{mine.editable ? t("notYet") : t("none")}</p>
        )}
        <Button variant={l ? "outline" : "default"} asChild>
          <Link href={`/tournaments/${tournamentId}/warband`}>
            <FileText aria-hidden /> {mine.editable ? (l ? t("edit") : t("add")) : t("view")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
