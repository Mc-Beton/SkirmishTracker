"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Copy, Plus, Shuffle, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";
import type { ArmyList, ArmyListSummary } from "@/lib/army-lists";
import { factionName, useArmies } from "@/lib/warbands";

/** "My lists": number, name, faction, format and points of every saved list, with "Add new". */
export function MyLists() {
  const t = useTranslations("lists");
  const tw = useTranslations("warbands");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const armies = useArmies();
  const { me, loading } = useAuth();
  const [lists, setLists] = useState<ArmyListSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => {
    if (!me) return;
    let active = true;
    api<ArmyListSummary[]>("GET", "/api/army-lists")
      .then((l) => active && setLists(l))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [me, errorMessage]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      setLists(await api<ArmyListSummary[]>("GET", "/api/army-lists"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function copy(l: ArmyListSummary, as?: "ROSTER") {
    setError(null);
    try {
      const created = await api<ArmyList>("POST", `/api/army-lists/${l.id}/duplicate${as ? `?format=${as}` : ""}`);
      router.push(`/lists/${created.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-display text-3xl">{t("title")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("lead")}</p>
        </div>
        <Button asChild>
          <Link href="/lists/new"><Plus aria-hidden /> {t("add")}</Link>
        </Button>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}

      {lists && lists.length === 0 && (
        <Card>
          <CardContent className="grid justify-items-start gap-3">
            <p className="text-muted-foreground">{t("empty")}</p>
            <Button asChild variant="outline"><Link href="/lists/new"><Plus aria-hidden /> {t("add")}</Link></Button>
          </CardContent>
        </Card>
      )}

      {lists && lists.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto px-0 sm:px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 pl-4 font-medium sm:pl-0">{t("number")}</th>
                  <th className="py-2 pr-3 font-medium">{t("name")}</th>
                  <th className="py-2 pr-3 font-medium">{tw("faction")}</th>
                  <th className="py-2 pr-3 font-medium">{t("format")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("points")}</th>
                  <th className="py-2 pr-4 sm:pr-0"><span className="sr-only">{t("actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {lists.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 pl-4 font-display text-lg tabular-nums sm:pl-0">#{l.number}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/lists/${l.id}`} className="font-medium hover:underline">{l.name || t("unnamed")}</Link>
                      <span className="block text-xs text-muted-foreground">
                        {t("units", { n: l.units })} · {format.dateTime(new Date(l.updatedAt), { dateStyle: "medium" })}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {factionName(armies, l.faction)}
                      {l.alliedFaction && <span className="text-muted-foreground"> + {factionName(armies, l.alliedFaction)}</span>}
                    </td>
                    <td className="py-2 pr-3"><Badge variant={l.format === "ROSTER" ? "warning" : "outline"}>{t(`formats.${l.format}`)}</Badge></td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {l.totalPoints}
                      {l.pointsChanged && <span className="block text-xs text-amber-600">{t("pointsChanged")}</span>}
                    </td>
                    <td className="py-2 pr-4 sm:pr-0">
                      <span className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title={t("duplicate")} aria-label={`${t("duplicate")} #${l.number}`} onClick={() => void copy(l)}>
                          <Copy aria-hidden />
                        </Button>
                        {l.format === "CLASSIC" && (
                          <Button size="icon" variant="ghost" title={t("toRoster")} aria-label={`${t("toRoster")} #${l.number}`} onClick={() => void copy(l, "ROSTER")}>
                            <Shuffle aria-hidden />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" title={t("delete")} aria-label={`${t("delete")} #${l.number}`}
                          onClick={() => window.confirm(t("confirmDelete", { n: l.number })) && void run(() => api("DELETE", `/api/army-lists/${l.id}`))}>
                          <Trash2 aria-hidden />
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {lists && lists.length > 0 && <p className="text-xs text-muted-foreground">{t("copyHint")}</p>}
    </div>
  );
}
