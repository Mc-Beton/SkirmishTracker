"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";
import type { RankingRow } from "@/lib/players";
import { cn } from "@/lib/utils";

export function Ranking() {
  const t = useTranslations("players");
  const errorMessage = useErrorMessage();
  const { me } = useAuth();
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<RankingRow[]>("GET", "/api/ranking")
      .then((r) => active && setRows(r))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [errorMessage]);

  const q = filter.trim().toLowerCase();
  const shown = rows?.filter((r) => !q || r.displayName.toLowerCase().includes(q) || (r.club ?? "").toLowerCase().includes(q));

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h1 className="font-display text-3xl">{t("rankingTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("rankingLead")}</p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Input aria-label={t("filter")} placeholder={t("filter")} value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
      <Card>
        <CardContent>
          {shown && shown.length === 0 ? <p className="text-sm text-muted-foreground">{t("rankingEmpty")}</p> : (
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">#</th>
                    <th className="py-2 pr-2 font-medium">{t("player")}</th>
                    <th className="hidden py-2 pr-2 font-medium sm:table-cell">{t("club")}</th>
                    <th className="py-2 pr-2 text-right font-medium">{t("elo")}</th>
                    <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t("games")}</th>
                    <th className="py-2 text-right font-medium">{t("wdl")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown?.map((r) => (
                    <tr key={r.id} className={cn("border-b last:border-0", r.id === me?.id && "bg-accent/60")}>
                      <td className="py-2 pr-2">{r.position}</td>
                      <td className="py-2 pr-2 font-medium">
                        <Link href={`/players/${r.id}`} className="hover:underline">{r.displayName}</Link>
                        {r.club && <span className="block text-xs font-normal text-muted-foreground sm:hidden">{r.club}</span>}
                      </td>
                      <td className="hidden py-2 pr-2 text-muted-foreground sm:table-cell">{r.club}</td>
                      <td className="py-2 pr-2 text-right font-semibold tabular-nums">{r.elo}</td>
                      <td className="hidden py-2 pr-2 text-right tabular-nums sm:table-cell">{r.games}</td>
                      <td className="py-2 text-right tabular-nums">{r.wins}/{r.draws}/{r.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
