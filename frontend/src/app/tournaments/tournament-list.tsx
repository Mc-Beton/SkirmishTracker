"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { TournamentCard } from "@/components/tournaments/tournament-card";
import { api } from "@/lib/api";
import { RANKS, type Page, type TournamentSummary } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

type Tab = "UPCOMING" | "ONGOING" | "FINISHED" | "MINE";
type Mine = { organized: TournamentSummary[]; joined: TournamentSummary[] };

export function TournamentList() {
  const t = useTranslations("tournaments");
  const errorMessage = useErrorMessage();
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>("UPCOMING");
  const [city, setCity] = useState("");
  const [rank, setRank] = useState("");
  const [items, setItems] = useState<TournamentSummary[] | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const request =
        tab === "MINE"
          ? api<Mine>("GET", "/api/tournaments/mine").then((m) => active && setMine(m))
          : api<Page<TournamentSummary>>(
              "GET",
              `/api/tournaments?${new URLSearchParams({ tab, city, ...(rank ? { rank } : {}), size: "50" })}`,
            ).then((p) => active && setItems(p.items));
      request.then(() => active && setError(null)).catch((err) => active && setError(errorMessage(err)));
    }, 250); // debounce typing in the city filter
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tab, city, rank, errorMessage]);

  const tabs: Tab[] = me ? ["UPCOMING", "ONGOING", "FINISHED", "MINE"] : ["UPCOMING", "ONGOING", "FINISHED"];

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/calendar"><CalendarDays aria-hidden /> {t("calendar")}</Link>
          </Button>
          {me && (
            <Button asChild>
              <Link href="/tournaments/new">
                <Plus aria-hidden /> {t("create")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div role="tablist" className="flex rounded-lg border bg-card p-1">
          {tabs.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === key ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {t(`tabs.${key}`)}
            </button>
          ))}
        </div>
        {tab !== "MINE" && (
          <>
            <Input
              aria-label={t("filters.city")}
              placeholder={t("filters.city")}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-44"
            />
            <NativeSelect aria-label={t("filters.rank")} value={rank} onChange={(e) => setRank(e.target.value)}
              className="w-44">
              <option value="">{t("filters.rank")}: {t("filters.anyRank")}</option>
              {RANKS.map((r) => (
                <option key={r} value={r}>{t(`rank.${r}`)}</option>
              ))}
            </NativeSelect>
          </>
        )}
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {tab === "MINE" ? (
        mine && (
          <div className="grid gap-8">
            <Section title={t("organized")} items={mine.organized} empty={t("empty")} />
            <Section title={t("joined")} items={mine.joined} empty={t("empty")} />
          </div>
        )
      ) : (
        items && <Grid items={items} empty={t("empty")} />
      )}
    </div>
  );
}

function Section({ title, items, empty }: { title: string; items: TournamentSummary[]; empty: string }) {
  return (
    <section className="grid gap-3">
      <h2 className="font-display text-xl">{title}</h2>
      <Grid items={items} empty={empty} />
    </section>
  );
}

function Grid({ items, empty }: { items: TournamentSummary[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <TournamentCard key={item.id} tournament={item} />
      ))}
    </div>
  );
}
