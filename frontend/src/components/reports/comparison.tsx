"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { change, downloadCsv, pct, pp, toCsv, type MetaReport, type Rate } from "@/lib/reports";

type Row = { key: string; label: string; before?: Rate; after?: Rate; pickBefore?: number; pickAfter?: number };

/** Before | after | change for factions, characters and items around a date (e.g. an errata). */
export function Comparison({ before, after, date, fName, unitName, itemName }: {
  before: MetaReport;
  after: MetaReport;
  date: string;
  fName: (c: string) => string;
  unitName: (c: string) => string;
  itemName: (c: string) => string;
}) {
  const t = useTranslations("reports.compare");
  const factions = useMemo(() => [...new Set([...before.factions, ...after.factions].map((f) => f.faction))], [before, after]);
  const [chosen, setChosen] = useState("");
  const faction = factions.includes(chosen) ? chosen : factions[0] ?? "";

  const factionRows: Row[] = factions.map((f) => ({
    key: f, label: fName(f),
    before: before.factions.find((x) => x.faction === f)?.rate, after: after.factions.find((x) => x.faction === f)?.rate,
    pickBefore: before.factions.find((x) => x.faction === f)?.share, pickAfter: after.factions.find((x) => x.faction === f)?.share,
  }));
  const unitCodes = [...new Set([...before.units, ...after.units].filter((u) => u.faction === faction).map((u) => u.unit))];
  const unitRows: Row[] = unitCodes.map((c) => {
    const b = before.units.find((u) => u.faction === faction && u.unit === c);
    const a = after.units.find((u) => u.faction === faction && u.unit === c);
    return { key: c, label: unitName(c), before: b?.with, after: a?.with, pickBefore: b?.pickRate, pickAfter: a?.pickRate };
  });
  const itemCodes = [...new Set([...before.items, ...after.items].filter((i) => i.faction === faction).map((i) => i.item))];
  const itemRows: Row[] = itemCodes.map((c) => {
    const b = before.items.find((i) => i.faction === faction && i.item === c);
    const a = after.items.find((i) => i.faction === faction && i.item === c);
    return { key: c, label: itemName(c), before: b?.with, after: a?.with, pickBefore: b?.pickRate, pickAfter: a?.pickRate };
  });
  const byChange = (rows: Row[]) => [...rows].sort((x, y) => Math.abs(change(y.before, y.after)?.delta ?? 0) - Math.abs(change(x.before, x.after)?.delta ?? 0));

  const exportCsv = () => {
    const line = (kind: string, r: Row) => {
      const c = change(r.before, r.after);
      return [kind, faction && kind !== "faction" ? faction : "", r.key, r.pickBefore ?? "", r.pickAfter ?? "", r.before?.n ?? "", r.before?.score ?? "",
        r.after?.n ?? "", r.after?.score ?? "", c?.delta ?? "", c?.signal ?? ""];
    };
    downloadCsv(`warbracket-compare-${date}.csv`, toCsv(
      ["kind", "faction", "code", "share_or_pick_before", "share_or_pick_after", "games_before", "score_before", "games_after", "score_after", "change", "signal"],
      [...factionRows.map((r) => line("faction", r)), ...unitRows.map((r) => line("unit", r)), ...itemRows.map((r) => line("item", r))]));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <CardTitle className="text-xl">{t("title", { date })}</CardTitle>
          <div className="text-sm text-muted-foreground">
            {t("lead", { before: before.summary.games, after: after.summary.games })}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download aria-hidden className="size-4" />CSV</Button>
      </CardHeader>
      <CardContent className="grid gap-6 [&>*]:min-w-0">
        <CompareTable title={t("factions")} rows={byChange(factionRows)} pickLabel={t("share")} t={t} />
        {factions.length > 0 && (
          <div className="grid max-w-xs gap-1.5">
            <Label className="text-xs" htmlFor="compare-faction">{t("faction")}</Label>
            <NativeSelect id="compare-faction" value={faction} onChange={(e) => setChosen(e.target.value)}>
              {factions.map((f) => <option key={f} value={f}>{fName(f)}</option>)}
            </NativeSelect>
          </div>
        )}
        <CompareTable title={t("units")} rows={byChange(unitRows)} pickLabel={t("pick")} t={t} />
        <CompareTable title={t("items")} rows={byChange(itemRows)} pickLabel={t("pick")} t={t} />
        <p className="text-xs text-muted-foreground">{t("howToRead")}</p>
      </CardContent>
    </Card>
  );
}

function CompareTable({ title, rows, pickLabel, t }: {
  title: string; rows: Row[]; pickLabel: string; t: ReturnType<typeof useTranslations<"reports.compare">>;
}) {
  if (rows.length === 0) return null;
  const cell = (r?: Rate) => (r ? <>{pct(r.score, 1)}<span className="block text-xs text-muted-foreground">n={r.n}</span></> : "–");
  return (
    <div className="grid gap-2">
      <h3 className="font-display text-lg">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{t("name")}</th>
              <th className="py-2 pr-3 text-right font-medium">{pickLabel}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("before")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("after")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("change")}</th>
              <th className="py-2 font-medium">{t("verdict")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = change(r.before, r.after);
              return (
                <tr key={r.key} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {r.pickBefore != null ? pct(r.pickBefore) : "–"} → {r.pickAfter != null ? pct(r.pickAfter) : "–"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{cell(r.before)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{cell(r.after)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c ? pp(c.delta) : "–"}</td>
                  <td className="py-2 text-xs">
                    {!c ? <span className="text-muted-foreground">{t("onlyOne")}</span>
                      : c.signal === "none" ? <span className="text-muted-foreground">{t("noChange")}</span>
                        : <span className="font-medium" style={{ color: c.signal === "up" ? "var(--diverge-pos)" : "var(--diverge-neg)" }}>
                          {c.signal === "up" ? `▲ ${t("up")}` : `▼ ${t("down")}`}
                        </span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
