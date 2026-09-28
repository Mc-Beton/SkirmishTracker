"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Plus, Trophy } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";
import type { LeagueSummary } from "@/lib/leagues";

export function LeagueList() {
  const t = useTranslations("leagues");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const { me } = useAuth();
  const [items, setItems] = useState<LeagueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<LeagueSummary[]>("GET", "/api/leagues")
      .then((l) => active && setItems(l))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [errorMessage]);

  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00`), { dateStyle: "medium" });

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-display text-3xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("lead")}</p>
        </div>
        {me && (
          <Button asChild>
            <Link href="/leagues/new"><Plus aria-hidden /> {t("create")}</Link>
          </Button>
        )}
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {items && items.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items?.map((l) => (
          <li key={l.id}>
            <Link href={`/leagues/${l.id}`} className="grid gap-2 rounded-xl border bg-card p-4 shadow-xs hover:bg-accent/40">
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-2 font-display text-xl">
                  <Trophy className="size-5 text-primary" aria-hidden /> {l.name}
                </span>
                {l.active ? <Badge variant="success">{t("active")}</Badge> : <Badge variant="outline">{t("inactive")}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {date(l.startsOn)} – {date(l.endsOn)}{l.city && ` · ${l.city}`}
              </p>
              <p className="text-sm">
                {t(`mode.${l.scoringMode}`)} · {t("membersCount", { n: l.members })} · {t("tournamentsCount", { n: l.tournaments })}
              </p>
              <p className="text-xs text-muted-foreground">{t("owner", { name: l.owner.displayName })}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
