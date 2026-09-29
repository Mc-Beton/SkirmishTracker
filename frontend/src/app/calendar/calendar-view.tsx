"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, Users } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { OfficialBadge, RankBadge } from "@/components/tournaments/status-badge";
import { api } from "@/lib/api";
import type { TournamentRank, TournamentStatus } from "@/lib/tournaments";

type CalendarEvent = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  city: string;
  country: string;
  rank: TournamentRank;
  status: TournamentStatus;
  official: boolean;
  registered: number;
  maxPlayers: number | null;
  team: boolean;
};

const MONTHS_SHOWN = 3;
const COUNTRIES = ["PL", "PT", "ES", "DE", "IT", "FR", "GB", "CZ"];

function monthStart(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const noSubscribe = () => () => {};

export function CalendarView() {
  const t = useTranslations("calendar");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const [offset, setOffset] = useState(0);
  const [country, setCountry] = useState("");
  const [official, setOfficial] = useState(false);
  const [result, setResult] = useState<{ key: string; events?: CalendarEvent[]; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const from = monthStart(offset);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + MONTHS_SHOWN, 0));
  const params = new URLSearchParams({ from: iso(from), to: iso(to) });
  if (country) params.set("country", country);
  if (official) params.set("official", "true");
  const key = params.toString();

  useEffect(() => {
    let active = true;
    api<CalendarEvent[]>("GET", `/api/calendar?${key}`)
      .then((events) => active && setResult({ key, events }))
      .catch((err) => active && setResult({ key, error: errorMessage(err) }));
    return () => {
      active = false;
    };
  }, [key, errorMessage]);

  const events = result?.key === key ? result.events : undefined;
  const feedParams = new URLSearchParams();
  if (country) feedParams.set("country", country);
  if (official) feedParams.set("official", "true");
  const feedPath = `/api/calendar.ics${feedParams.size ? `?${feedParams}` : ""}`;
  // The page's own origin (empty while rendering on the server, so hydration matches).
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const host = origin.replace(/^https?:\/\//, "");
  const httpsFeed = `${origin}${feedPath}`;

  // Group by month (UTC month of the start, like the query range).
  const months: { label: string; items: CalendarEvent[] }[] = [];
  for (let i = 0; i < MONTHS_SHOWN; i++) {
    const m = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    months.push({
      label: format.dateTime(m, { month: "long", year: "numeric", timeZone: "UTC" }),
      items: (events ?? []).filter((e) => {
        const d = new Date(e.startsAt);
        return d.getUTCFullYear() === m.getUTCFullYear() && d.getUTCMonth() === m.getUTCMonth();
      }),
    });
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h1 className="font-display text-3xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label={t("earlier")} onClick={() => setOffset((o) => o - MONTHS_SHOWN)}><ChevronLeft aria-hidden /></Button>
          <Button variant="outline" size="sm" onClick={() => setOffset(0)} disabled={offset === 0}>{t("today")}</Button>
          <Button variant="outline" size="icon" aria-label={t("later")} onClick={() => setOffset((o) => o + MONTHS_SHOWN)}><ChevronRight aria-hidden /></Button>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cal-country" className="text-xs">{t("country")}</Label>
          <NativeSelect id="cal-country" value={country} onChange={(e) => setCountry(e.target.value)} className="w-40">
            <option value="">{t("allCountries")}</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          {t("officialOnly")}
        </label>
      </div>

      {result?.key === key && result.error && <Alert variant="destructive">{result.error}</Alert>}
      {!events && !(result?.key === key && result.error) && <p className="text-sm text-muted-foreground">{t("loading")}</p>}

      {events && months.map((m) => (
        <section key={m.label} className="grid gap-3">
          <h2 className="font-display text-xl capitalize">{m.label}</h2>
          {m.items.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : (
            <ul className="grid gap-2">
              {m.items.map((e) => {
                const d = new Date(e.startsAt);
                return (
                  <li key={e.id} className="flex items-start gap-3 rounded-xl border bg-card p-3">
                    <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-muted py-1 text-center">
                      <span className="font-display text-xl leading-none">{format.dateTime(d, { day: "numeric" })}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">{format.dateTime(d, { weekday: "short" })}</span>
                    </div>
                    <div className="grid min-w-0 flex-1 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <RankBadge rank={e.rank} />
                        {e.official && <OfficialBadge />}
                        <Link href={`/tournaments/${e.id}`} className="font-medium hover:text-primary">{e.name}</Link>
                      </div>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{format.dateTime(d, { timeStyle: "short" })} · {e.venueName ? `${e.venueName}, ` : ""}{e.city}, {e.country}</span>
                        <span className="flex items-center gap-1"><Users className="size-3.5" aria-hidden />{e.registered}{e.maxPlayers ? ` / ${e.maxPlayers}` : ""}</span>
                        {e.team && <span>{t("team")}</span>}
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={`/api/tournaments/${e.id}/calendar.ics`} download aria-label={t("addOne", { name: e.name })}><CalendarPlus aria-hidden /></a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("subscribeTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("subscribeLead")}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <a href={host ? `webcal://${host}${feedPath}` : feedPath}><CalendarPlus aria-hidden /> {t("subscribe")}</a>
          </Button>
          <Button variant="outline" onClick={async () => {
            try {
              await navigator.clipboard.writeText(httpsFeed);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}>
            <Copy aria-hidden /> {copied ? t("copied") : t("copy")}
          </Button>
          <code className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{httpsFeed}</code>
        </CardContent>
      </Card>
    </div>
  );
}
