"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { ColumnChart } from "@/components/reports/column-chart";
import { Comparison } from "@/components/reports/comparison";
import { CostEffect } from "@/components/reports/cost-effect";
import { HeatMatrix } from "@/components/reports/heat-matrix";
import { MonthBars } from "@/components/reports/month-bars";
import { RateInterval } from "@/components/reports/rate-interval";
import { api } from "@/lib/api";
import { useGameContent } from "@/lib/content";
import {
  DEAD_ITEM_PICK, EMPTY_FILTER, dayBefore, GEAR_LOADS, INSEPARABLE_SHARE, downloadCsv, pct, pp, reportCsv, reportQuery, reportRoles, signal,
  type MetaReport, type MetaResponse, type Rate, type ReportFilter,
} from "@/lib/reports";
import { NEUTRAL, factionName, useArmies, type Armies } from "@/lib/warbands";

type Section = Parameters<typeof reportCsv>[1];

export function ReportsView() {
  const t = useTranslations("reports");
  const errorMessage = useErrorMessage();
  const { me, loading } = useAuth();
  const armies = useArmies();
  const content = useGameContent();
  const [filter, setFilter] = useState<ReportFilter>(EMPTY_FILTER);
  // The last answer and the query it belongs to: while they differ, a newer query is on its way.
  const [result, setResult] = useState<{ query: string; data?: MetaResponse; error?: string } | null>(null);
  const allowed = reportRoles(me?.roles);
  const query = reportQuery(filter);
  const busy = result?.query !== query;
  const data = result?.data ?? null;
  const error = result?.query === query ? result.error ?? null : null;

  // Before / after comparison around one date (e.g. an errata), with the same other filters.
  const [split, setSplit] = useState("");
  const beforeQuery = split ? reportQuery({ ...filter, to: filter.to && filter.to < split ? filter.to : dayBefore(split) }) : "";
  const afterQuery = split ? reportQuery({ ...filter, from: filter.from && filter.from > split ? filter.from : split }) : "";
  const compareKey = split ? `${beforeQuery}|${afterQuery}` : "";
  const [compared, setCompared] = useState<{ key: string; before: MetaReport; after: MetaReport } | null>(null);
  useEffect(() => {
    if (!allowed || !compareKey) return;
    let active = true;
    Promise.all([api<MetaResponse>("GET", beforeQuery), api<MetaResponse>("GET", afterQuery)])
      .then(([b, a]) => active && setCompared({ key: compareKey, before: b.report, after: a.report }))
      .catch(() => active && setCompared(null));
    return () => {
      active = false;
    };
  }, [allowed, compareKey, beforeQuery, afterQuery]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    api<MetaResponse>("GET", query)
      .then((r) => active && setResult({ query, data: r }))
      .catch((err) => active && setResult((prev) => ({ query, data: prev?.data, error: errorMessage(err) })));
    return () => {
      active = false;
    };
  }, [allowed, query, errorMessage]);

  if (loading) return null;
  if (!me) {
    return (
      <Shell t={t}>
        <Alert>{t("loginRequired")} <Link className="underline" href="/login">{t("login")}</Link></Alert>
      </Shell>
    );
  }
  if (!allowed) return <Shell t={t}><Alert variant="destructive">{t("forbidden")}</Alert></Shell>;

  const set = <K extends keyof ReportFilter>(k: K, v: ReportFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));
  const fName = (c: string) => factionName(armies, c);
  const questName = (c: string) => content?.quests.find((q) => q.code === c)?.name ?? c;
  const unitName = (c: string) => armies?.units.find((u) => u.code === c)?.name ?? c;
  const report = data?.report;
  const csv = (section: Section) => report && downloadCsv(`warbracket-${section}-${stamp(filter)}.csv`, reportCsv(report, section));

  return (
    <Shell t={t}>
      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
          <Field label={t("filter.from")}>
            <Input type="date" value={filter.from} min={data?.firstGame ?? undefined} max={filter.to || undefined}
              onChange={(e) => set("from", e.target.value)} />
          </Field>
          <Field label={t("filter.to")}>
            <Input type="date" value={filter.to} min={filter.from || undefined} max={data?.lastGame ?? undefined}
              onChange={(e) => set("to", e.target.value)} />
          </Field>
          <Field label={t("filter.source")}>
            <NativeSelect value={filter.source} onChange={(e) => set("source", e.target.value as ReportFilter["source"])}>
              <option value="">{t("filter.all")}</option>
              <option value="TOURNAMENT">{t("filter.tournament")}</option>
              <option value="OWN">{t("filter.own")}</option>
            </NativeSelect>
          </Field>
          <Field label={t("filter.country")}>
            <NativeSelect value={filter.country} onChange={(e) => set("country", e.target.value)}>
              <option value="">{t("filter.all")}</option>
              {data?.countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("filter.tier")}>
            <NativeSelect value={filter.tier} onChange={(e) => set("tier", e.target.value as ReportFilter["tier"])}>
              <option value="">{t("filter.all")}</option>
              <option value="LOCAL">{t("filter.LOCAL")}</option>
              <option value="MASTER">{t("filter.MASTER")}</option>
              <option value="INTERNATIONAL">{t("filter.INTERNATIONAL")}</option>
            </NativeSelect>
          </Field>
          <Field label={t("filter.minElo")}>
            <NativeSelect value={filter.minElo} onChange={(e) => set("minElo", e.target.value)}>
              <option value="">{t("filter.anyElo")}</option>
              {["1450", "1500", "1550", "1600"].map((v) => <option key={v} value={v}>{t("filter.eloAtLeast", { elo: v })}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("compare.split")}>
            <Input type="date" value={split} min={data?.firstGame ?? undefined} max={data?.lastGame ?? undefined}
              onChange={(e) => setSplit(e.target.value)} />
          </Field>
          <p className="self-end text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">{t("compare.splitHint")}</p>
          <p className="text-xs text-muted-foreground sm:col-span-3 lg:col-span-6">
            {t("filter.hint")}
            {(filter !== EMPTY_FILTER) && (
              <Button variant="link" size="sm" className="h-auto px-1 py-0 text-xs" onClick={() => setFilter(EMPTY_FILTER)}>
                {t("filter.reset")}
              </Button>
            )}
          </p>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}
      {!report && !error && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
      {report && (
        <div className={busy ? "grid gap-6 opacity-60 transition-opacity [&>*]:min-w-0" : "grid gap-6 [&>*]:min-w-0"} aria-busy={busy}>
          <Summary report={report} t={t} generatedAt={data?.generatedAt ?? ""} />
          {split && compared?.key === compareKey && (
            <Comparison before={compared.before} after={compared.after} date={split} fName={fName} unitName={unitName}
              itemName={(c) => armies?.items.find((i) => i.code === c)?.name ?? c} />
          )}
          {split && compared?.key !== compareKey && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {report.summary.games === 0 ? (
            <Alert>{t("empty")}</Alert>
          ) : (
            <>
              <Factions report={report} t={t} fName={fName} onCsv={() => csv("factions")} />
              <SectionCard title={t("matchups.title")} lead={t("matchups.lead")} onCsv={() => csv("matchups")} csvLabel={t("csv")}>
                <HeatMatrix rows={report.factions.map((f) => f.faction)} cols={report.factions.map((f) => f.faction)}
                  cells={report.matchups} rowLabel={fName} colLabel={fName} corner={t("matchups.corner")}
                  diagonal={t("matchups.mirror")} uncertain={t("uncertain")} />
              </SectionCard>
              <Units report={report} t={t} fName={fName} unitName={unitName} onCsv={() => csv("units")} />
              <Items report={report} t={t} armies={armies} fName={fName} unitName={unitName} onCsv={() => csv("items")} />
              <Gear report={report} t={t} fName={fName} onCsv={() => csv("gear")} />
              <Missions report={report} t={t} fName={fName} questName={questName}
                onCsv={() => csv("missions")} onCsvMatrix={() => csv("factionMissions")} />
              <GameFlow report={report} t={t} fName={fName} schemeName={(c) => content?.schemes.find((x) => x.code === c)?.name ?? c}
                onCsv={() => csv("flow")} onCsvSchemes={() => csv("schemes")} />
              <Activity report={report} t={t} onCsv={() => csv("months")} />
              <Method report={report} t={t} />
            </>
          )}
        </div>
      )}
    </Shell>
  );
}

type T = ReturnType<typeof useTranslations<"reports">>;

function stamp(f: ReportFilter): string {
  return [f.from || "start", f.to || "now", f.source, f.country, f.tier, f.minElo && `elo${f.minElo}`].filter(Boolean).join("_");
}

function Shell({ t, children }: { t: T; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h1 className="font-display text-3xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function SectionCard({ title, lead, onCsv, csvLabel, children }: {
  title: string; lead?: React.ReactNode; onCsv?: () => void; csvLabel?: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <CardTitle className="text-xl">{title}</CardTitle>
          {lead && <div className="text-sm text-muted-foreground">{lead}</div>}
        </div>
        {onCsv && (
          <Button variant="outline" size="sm" onClick={onCsv}><Download aria-hidden className="size-4" />{csvLabel}</Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 [&>*]:min-w-0">{children}</CardContent>
    </Card>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid content-start gap-0.5 rounded-lg border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-display text-2xl tabular-nums">{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

function Summary({ report, t, generatedAt }: { report: MetaReport; t: T; generatedAt: string }) {
  const s = report.summary;
  const share = (n: number) => (s.games ? pct(n / s.games) : "–");
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label={t("summary.games")} value={String(s.games)}
          note={t("summary.split", { tournament: s.tournamentGames, own: s.ownGames })} />
        <Tile label={t("summary.players")} value={String(s.players)} />
        <Tile label={t("summary.tournaments")} value={String(s.tournaments)} />
        <Tile label={t("summary.withLists")} value={share(s.gamesWithLists)} note={t("summary.withFactions", { v: share(s.gamesWithFactions) })} />
        <Tile label={t("summary.withMission")} value={share(s.gamesWithMission)} />
        <Tile label={t("summary.draws")} value={share(s.draws)} note={t("summary.mirrors", { n: s.mirrorGames })} />
      </div>
      <p className="text-xs text-muted-foreground">
        {s.first && s.last && t("summary.period", { first: s.first, last: s.last })}{" "}
        {t("summary.generated", { at: new Date(generatedAt).toLocaleString() })}
      </p>
    </div>
  );
}

function Signal({ rate, reference, t }: { rate: Rate; reference: number; t: T }) {
  const s = signal(rate, reference);
  if (!rate.enough) return <span className="text-xs text-muted-foreground">{t("uncertain")}</span>;
  if (s === "none") return <span className="text-xs text-muted-foreground">{t("withinNoise")}</span>;
  return (
    <span className="text-xs font-medium" style={{ color: s === "above" ? "var(--diverge-pos)" : "var(--diverge-neg)" }}>
      {s === "above" ? `▲ ${t("above")}` : `▼ ${t("below")}`}
    </span>
  );
}

function Legend({ t }: { t: T }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-foreground" />{t("legend.score")}</li>
      <li className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-muted-foreground/35" />{t("legend.interval")}</li>
      <li className="flex items-center gap-1.5"><span className="h-3.5 w-0.5 rounded-full bg-muted-foreground" />{t("legend.expected")}</li>
      <li className="flex items-center gap-1.5"><span className="h-3.5 border-l border-dashed border-muted-foreground" />50%</li>
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: "var(--diverge-pos)" }} />{t("above")}</li>
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: "var(--diverge-neg)" }} />{t("below")}</li>
    </ul>
  );
}

function Factions({ report, t, fName, onCsv }: { report: MetaReport; t: T; fName: (c: string) => string; onCsv: () => void }) {
  return (
    <SectionCard title={t("factions.title")} lead={t("factions.lead")} onCsv={onCsv} csvLabel={t("csv")}>
      <Legend t={t} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{t("factions.faction")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("factions.share")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("factions.games")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("factions.score")}</th>
              <th className="w-1/3 min-w-32 py-2 pr-3 font-medium">{t("factions.interval")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("factions.expected")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("factions.performance")}</th>
              <th className="py-2 font-medium">{t("factions.verdict")}</th>
            </tr>
          </thead>
          <tbody>
            {report.factions.map((f) => (
              <tr key={f.faction} className="border-b last:border-0">
                <td className="py-2 pr-3 font-medium">
                  {fName(f.faction)}
                  <span className="block text-xs font-normal text-muted-foreground">{t("factions.players", { n: f.players, elo: f.avgElo })}</span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(f.share)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{f.rate.n}<span className="block text-xs text-muted-foreground">{f.rate.wins}–{f.rate.draws}–{f.rate.losses}</span></td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(f.rate.score, 1)}</td>
                <td className="py-2 pr-3"><RateInterval rate={f.rate} label={fName(f.faction)} /></td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{pct(f.rate.expected, 1)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pp(f.rate.performance)}</td>
                <td className="py-2"><Signal rate={f.rate} reference={f.rate.expected} t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t("factions.howToRead")}</p>
    </SectionCard>
  );
}

function Units({ report, t, fName, unitName, onCsv }: {
  report: MetaReport; t: T; fName: (c: string) => string; unitName: (c: string) => string; onCsv: () => void;
}) {
  const factions = useMemo(() => [...new Set(report.units.map((u) => u.faction))], [report.units]);
  const [chosen, setChosen] = useState("");
  const faction = factions.includes(chosen) ? chosen : factions[0] ?? "";
  const rows = report.units.filter((u) => u.faction === faction);
  return (
    <SectionCard title={t("units.title")} lead={t("units.lead")} onCsv={onCsv} csvLabel={t("csv")}>
      {factions.length === 0 ? <p className="text-sm text-muted-foreground">{t("units.empty")}</p> : (
        <>
          <div className="grid max-w-xs gap-1.5">
            <Label className="text-xs" htmlFor="units-faction">{t("factions.faction")}</Label>
            <NativeSelect id="units-faction" value={faction} onChange={(e) => setChosen(e.target.value)}>
              {factions.map((f) => <option key={f} value={f}>{fName(f)}</option>)}
            </NativeSelect>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("units.unit")}</th>
                  <th className="w-1/5 min-w-24 py-2 pr-3 font-medium">{t("units.pick")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("units.with")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("units.without")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("units.difference")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("factions.performance")}</th>
                  <th className="py-2 font-medium">{t("factions.verdict")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.unit} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{unitName(u.unit)}
                      <span className="block text-xs font-normal text-muted-foreground">{t("units.lists", { n: u.with.n, players: u.players })}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: pct(u.pickRate), background: "var(--series-1)" }} />
                        </div>
                        <span className="w-10 text-right tabular-nums">{pct(u.pickRate)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(u.with.score, 1)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{u.without.n ? pct(u.without.score, 1) : "–"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{u.without.n ? pp(u.with.score - u.without.score) : "–"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pp(u.with.performance)}</td>
                    <td className="py-2"><Signal rate={u.with} reference={u.with.expected} t={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{t("units.howToRead")}</p>
        </>
      )}
    </SectionCard>
  );
}

function Items({ report, t, armies, fName, unitName, onCsv }: {
  report: MetaReport; t: T; armies: Armies | null; fName: (c: string) => string; unitName: (c: string) => string; onCsv: () => void;
}) {
  const factions = useMemo(() => [...new Set(report.gear.map((g) => g.faction))], [report.gear]);
  const [chosen, setChosen] = useState("");
  const faction = factions.includes(chosen) ? chosen : factions[0] ?? "";
  const rows = report.items.filter((i) => i.faction === faction);
  const item = (c: string) => armies?.items.find((i) => i.code === c);
  const itemName = (c: string) => item(c)?.name ?? c;
  const cost = (c: string) => item(c)?.points ?? 0;
  const costLabel = (c: string) => {
    const it = item(c);
    if (!it) return "–";
    return it.reducedPoints != null ? `${it.points} / ${it.reducedPoints}` : String(it.points);
  };
  // Available to the faction: neutral items + its own list. "Dead" = picked in fewer than 2% of its lists.
  const lists = report.gear.find((g) => g.faction === faction)?.lists ?? 0;
  const available = armies ? [...new Set([...(armies.itemLists[NEUTRAL] ?? []), ...(armies.itemLists[faction] ?? [])])] : [];
  const picks = (c: string) => report.itemCounts.find((x) => x.faction === faction && x.item === c)?.lists ?? 0;
  const dead = lists ? available.map((c) => ({ c, pick: picks(c) / lists })).filter((d) => d.pick < DEAD_ITEM_PICK)
    .sort((a, b) => a.pick - b.pick || itemName(a.c).localeCompare(itemName(b.c))) : [];

  return (
    <SectionCard title={t("items.title")} lead={t("items.lead")} onCsv={onCsv} csvLabel={t("csv")}>
      {factions.length === 0 ? <p className="text-sm text-muted-foreground">{t("items.empty")}</p> : (
        <>
          <div className="grid max-w-xs gap-1.5">
            <Label className="text-xs" htmlFor="items-faction">{t("factions.faction")}</Label>
            <NativeSelect id="items-faction" value={faction} onChange={(e) => setChosen(e.target.value)}>
              {factions.map((f) => <option key={f} value={f}>{fName(f)}</option>)}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <h3 className="font-display text-lg">{t("items.costEffect")}</h3>
            <p className="text-xs text-muted-foreground">{t("items.costEffectLead")}</p>
            <CostEffect points={rows.map((r) => ({ row: r, cost: cost(r.item), label: itemName(r.item) }))}
              xLabel={t("items.cost")} yLabel={t("items.axisY")} empty={t("items.emptyFaction")}
              labels={{ pick: t("items.pick"), games: t("factions.games"), points: t("items.points") }} />
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t("items.item")}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t("items.cost")}</th>
                    <th className="w-1/6 min-w-24 py-2 pr-3 font-medium">{t("items.pick")}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t("units.with")}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t("units.without")}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t("factions.performance")}</th>
                    <th className="py-2 font-medium">{t("factions.verdict")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.item} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">
                        {itemName(r.item)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t("items.carrier", { unit: r.topUnit ? unitName(r.topUnit) : "–", share: pct(r.topUnitShare) })}
                          {r.leaderShare > 0 && ` · ${t("items.onLeader", { share: pct(r.leaderShare) })}`}
                          {r.reducedShare > 0 && ` · ${t("items.reduced", { share: pct(r.reducedShare) })}`}
                          {r.avgCopies > 1.05 && ` · ${t("items.copies", { n: r.avgCopies.toFixed(1) })}`}
                        </span>
                        {r.topUnitShare >= INSEPARABLE_SHARE && (
                          <span className="block text-xs font-normal text-muted-foreground">⚠ {t("items.inseparable", { unit: r.topUnit ? unitName(r.topUnit) : "–" })}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{costLabel(r.item)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: pct(r.pickRate), background: "var(--series-1)" }} />
                          </div>
                          <span className="w-10 text-right tabular-nums">{pct(r.pickRate)}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(r.with.score, 1)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{r.without.n ? pct(r.without.score, 1) : "–"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pp(r.with.performance)}</td>
                      <td className="py-2"><Signal rate={r.with} reference={r.with.expected} t={t} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {lists > 0 && armies && (
            <div className="grid gap-2">
              <h3 className="font-display text-lg">{t("items.dead")}</h3>
              <p className="text-xs text-muted-foreground">{t("items.deadLead", { n: lists, share: pct(DEAD_ITEM_PICK) })}</p>
              {dead.length === 0 ? <p className="text-sm text-muted-foreground">{t("items.noDead")}</p> : (
                <ul className="flex flex-wrap gap-2">
                  {dead.map((d) => (
                    <li key={d.c} className="rounded-full border px-3 py-1 text-xs">
                      {itemName(d.c)} <span className="text-muted-foreground tabular-nums">· {costLabel(d.c)} {t("items.points")} · {pct(d.pick, 1)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("items.howToRead")}</p>
        </>
      )}
    </SectionCard>
  );
}

function Gear({ report, t, fName, onCsv }: { report: MetaReport; t: T; fName: (c: string) => string; onCsv: () => void }) {
  if (report.gear.length === 0) return null;
  return (
    <SectionCard title={t("gear.title")} lead={t("gear.lead")} onCsv={onCsv} csvLabel={t("csv")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{t("factions.faction")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("gear.lists")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("gear.avgItems")}</th>
              <th className="py-2 text-right font-medium">{t("gear.share")}</th>
            </tr>
          </thead>
          <tbody>
            {report.gear.map((g) => (
              <tr key={g.faction} className="border-b last:border-0">
                <td className="py-2 pr-3 font-medium">{fName(g.faction)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{g.lists}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{g.avgItems.toFixed(1)}</td>
                <td className="py-2 text-right tabular-nums">{pct(g.avgItemShare, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HeatMatrix rows={report.gear.map((g) => g.faction)} cols={[...GEAR_LOADS]} cells={report.gearResults}
        rowLabel={fName} colLabel={(c) => t(`gear.${c as (typeof GEAR_LOADS)[number]}`)} corner={t("gear.corner")} uncertain={t("uncertain")} />
    </SectionCard>
  );
}

function Missions({ report, t, fName, questName, onCsv, onCsvMatrix }: {
  report: MetaReport; t: T; fName: (c: string) => string; questName: (c: string) => string; onCsv: () => void; onCsvMatrix: () => void;
}) {
  const missions = report.missions.map((m) => m.mission);
  return (
    <>
      <SectionCard title={t("missions.title")} lead={t("missions.lead")} onCsv={onCsv} csvLabel={t("csv")}>
        {report.missions.length === 0 ? <p className="text-sm text-muted-foreground">{t("missions.empty")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("missions.mission")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("factions.games")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("missions.draws")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("missions.winnerVp")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("missions.loserVp")}</th>
                  <th className="py-2 text-right font-medium">{t("missions.margin")}</th>
                </tr>
              </thead>
              <tbody>
                {report.missions.map((m) => (
                  <tr key={m.mission} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{questName(m.mission)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{m.games}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(m.drawRate)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{m.avgWinnerVp.toFixed(1)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{m.avgLoserVp.toFixed(1)}</td>
                    <td className="py-2 text-right tabular-nums">{m.avgMargin.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      {report.factionMissions.length > 0 && (
        <SectionCard title={t("missions.matrixTitle")} lead={t("missions.matrixLead")} onCsv={onCsvMatrix} csvLabel={t("csv")}>
          <HeatMatrix rows={report.factions.map((f) => f.faction)} cols={missions} cells={report.factionMissions}
            rowLabel={fName} colLabel={questName} corner={t("missions.corner")} uncertain={t("uncertain")} />
        </SectionCard>
      )}
    </>
  );
}

function GameFlow({ report, t, fName, schemeName, onCsv, onCsvSchemes }: {
  report: MetaReport; t: T; fName: (c: string) => string; schemeName: (c: string) => string; onCsv: () => void; onCsvSchemes: () => void;
}) {
  const f = report.flow;
  if (f.games === 0) {
    return (
      <SectionCard title={t("flow.title")} lead={t("flow.lead")}>
        <p className="text-sm text-muted-foreground">{t("flow.empty")}</p>
      </SectionCard>
    );
  }
  const early = f.decidedBy.slice(0, 2).reduce((a, b) => a + b, 0);
  const avgTurn = f.decided ? f.decidedBy.reduce((a, n, i) => a + n * (i + 1), 0) / f.decided : 0;
  return (
    <>
      <SectionCard title={t("flow.title")} lead={t("flow.lead")} onCsv={onCsv} csvLabel={t("csv")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={t("flow.games")} value={String(f.games)} note={t("flow.gamesNote")} />
          <Tile label={t("flow.comebacks")} value={f.decided ? pct(f.comebacks / f.decided) : "–"}
            note={t("flow.comebacksNote", { turn: f.comebackTurn })} />
          <Tile label={t("flow.early")} value={f.decided ? pct(early / f.decided) : "–"} note={t("flow.earlyNote")} />
          <Tile label={t("flow.avgTurn")} value={avgTurn ? avgTurn.toFixed(1) : "–"} note={t("flow.avgTurnNote", { turns: f.turns })} />
        </div>
        <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
          <ColumnChart title={t("flow.decidedTitle")} series={[t("flow.decidedSeries")]}
            columns={f.decidedBy.map((n, i) => ({
              key: String(i + 1), label: t("flow.turn", { n: i + 1 }), values: [n],
              caption: t("flow.decidedCaption", { turn: i + 1, share: f.decided ? pct(n / f.decided) : "–", n }),
            }))} />
          <ColumnChart title={t("flow.vpTitle")} series={[t("flow.scenario"), t("flow.scheme")]}
            columns={f.byTurn.map((b) => ({
              key: String(b.turn), label: t("flow.turn", { n: b.turn }), values: [b.scenario, b.scheme],
              caption: t("flow.vpCaption", { turn: b.turn, scenario: b.scenario.toFixed(2), scheme: b.scheme.toFixed(2) }),
            }))} />
        </div>
        {report.factionFlow.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("factions.faction")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("factions.games")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("flow.scenarioVp")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("flow.schemeVp")}</th>
                  <th className="w-1/3 min-w-28 py-2 font-medium">{t("flow.split")}</th>
                </tr>
              </thead>
              <tbody>
                {report.factionFlow.map((x) => {
                  const total = x.scenarioVp + x.schemeVp || 1;
                  return (
                    <tr key={x.faction} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{fName(x.faction)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{x.games}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{x.scenarioVp.toFixed(1)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{x.schemeVp.toFixed(1)}</td>
                      <td className="py-2">
                        <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" title={`${pct(x.schemeVp / total)} ${t("flow.scheme")}`}>
                          <div style={{ flexGrow: x.scenarioVp, background: "var(--series-1)" }} />
                          <div style={{ flexGrow: x.schemeVp, background: "var(--series-3)" }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      {report.schemes.length > 0 && (
        <SectionCard title={t("schemes.title")} lead={t("schemes.lead")} onCsv={onCsvSchemes} csvLabel={t("csv")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("schemes.scheme")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("schemes.drawn")}</th>
                  <th className="w-1/5 min-w-24 py-2 pr-3 font-medium">{t("schemes.keepRate")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("schemes.vp")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("schemes.score")}</th>
                  <th className="py-2 font-medium">{t("factions.verdict")}</th>
                </tr>
              </thead>
              <tbody>
                {report.schemes.map((x) => (
                  <tr key={x.scheme} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{schemeName(x.scheme)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{x.drawn}<span className="block text-xs text-muted-foreground">{t("schemes.keptN", { n: x.kept })}</span></td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: pct(x.keepRate), background: "var(--series-1)" }} />
                        </div>
                        <span className="w-10 text-right tabular-nums">{pct(x.keepRate)}</span>
                      </div>
                    </td>
                    {x.rate.n > 0 ? (
                      <>
                        <td className="py-2 pr-3 text-right tabular-nums">{x.avgSchemeVp.toFixed(1)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{pct(x.rate.score, 1)}</td>
                        <td className="py-2"><Signal rate={x.rate} reference={x.rate.expected} t={t} /></td>
                      </>
                    ) : (
                      <td colSpan={3} className="py-2 text-xs text-muted-foreground">{t("schemes.hidden")}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{t("schemes.howToRead")}</p>
        </SectionCard>
      )}
    </>
  );
}

function Activity({ report, t, onCsv }: { report: MetaReport; t: T; onCsv: () => void }) {
  const months = report.months;
  const last = months[months.length - 1];
  const returning = months.slice(-3).reduce((a, m) => a + (m.activePlayers - m.newPlayers), 0);
  return (
    <SectionCard title={t("activity.title")} lead={t("activity.lead")} onCsv={onCsv} csvLabel={t("csv")}>
      <MonthBars months={months} title={t("activity.gamesPerMonth")}
        format={(m) => t("activity.monthLine", { month: m.month, games: m.games, active: m.activePlayers, fresh: m.newPlayers })} />
      {last && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={t("activity.activeLast", { month: last.month })} value={String(last.activePlayers)} />
          <Tile label={t("activity.newLast", { month: last.month })} value={String(last.newPlayers)} />
          <Tile label={t("activity.returning")} value={String(returning)} note={t("activity.returningNote")} />
          <Tile label={t("activity.tournamentsLast", { month: last.month })} value={String(last.tournaments)} />
        </div>
      )}
    </SectionCard>
  );
}

function Method({ report, t }: { report: MetaReport; t: T }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-xl">{t("method.title")}</CardTitle></CardHeader>
      <CardContent>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>{t("method.mirrors")}</li>
          <li>{t("method.interval", { n: report.thresholds.minSample })}</li>
          <li>{t("method.elo")}</li>
          <li>{t("method.privacy", { n: report.thresholds.minPlayers, hidden: report.summary.hiddenRows })}</li>
          <li>{t("method.sources")}</li>
        </ul>
      </CardContent>
    </Card>
  );
}
