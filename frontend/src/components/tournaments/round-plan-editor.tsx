"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/ui/native-select";
import type { GameContent } from "@/lib/content";
import { TABLE_ORDERS, type RoundPairing, type RoundPlan, type TournamentFormat } from "@/lib/tournaments";

export const MAX_PLAN_ROUNDS = 30;

const FIRST_ROUND: RoundPairing[] = ["RANDOM", "ELO_STRONG_VS_STRONG", "ELO_TOP_VS_BOTTOM"];
const LATER: RoundPairing[] = ["SWISS", "RANDOM", "ELO_STRONG_VS_STRONG", "ELO_TOP_VS_BOTTOM"];

export function defaultPlan(number: number): RoundPlan {
  return { number, scenarioCode: null, pairing: number === 1 ? "RANDOM" : "SWISS", tableOrder: "BY_STANDINGS", softPreferences: number !== 1, durationMinutes: null };
}

/**
 * One row per round: scenario, pairing method (Swiss only), table order and soft preferences.
 * Rounds that were already generated are read-only.
 */
export function RoundPlanEditor({ plans, onChange, format, content, lockedUpTo, softPrefsConfigured }: {
  plans: RoundPlan[];
  onChange: (plans: RoundPlan[]) => void;
  format: TournamentFormat;
  content: GameContent | null;
  /** Rounds 1..lockedUpTo are already generated. */
  lockedUpTo: number;
  /** At least one soft preference (club/faction/city) is switched on. */
  softPrefsConfigured: boolean;
}) {
  const t = useTranslations("tournaments.plan");
  const swiss = format === "SWISS";
  const cols = "sm:grid-cols-[2.5rem_minmax(0,1.8fr)_minmax(0,1.8fr)_minmax(0,1.6fr)_5.5rem_4rem] sm:gap-x-2";
  const update = (i: number, patch: Partial<RoundPlan>) => onChange(plans.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="grid gap-3">
      {plans.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {plans.length > 0 && (
        // Mobile first: one block per round (labelled fields in two columns); from sm up a table-like grid.
        <div className="grid text-sm">
          <div className={cn(cols, "hidden border-b py-2 text-left text-muted-foreground sm:grid")}>
            <span className="font-medium">{t("round")}</span>
            <span className="font-medium">{t("scenario")}</span>
            {swiss ? <span className="font-medium">{t("pairing")}</span> : <span />}
            {format !== "ELIMINATION" ? <span className="font-medium">{t("tables")}</span> : <span />}
            <span className="font-medium">{t("duration")}</span>
            {swiss && softPrefsConfigured ? <span className="font-medium">{t("softPrefs")}</span> : <span />}
          </div>
          {plans.map((p, i) => {
            const locked = p.number <= lockedUpTo;
            return (
              <div key={p.number} className={cn(cols, "grid grid-cols-2 gap-2 border-b py-3 last:border-0 sm:items-center sm:py-2")}>
                <span className="col-span-2 font-medium tabular-nums sm:col-span-1">
                  <span className="sm:hidden">{t("roundN", { n: p.number })}</span>
                  <span className="hidden sm:inline">{p.number}</span>
                </span>
                <Field label={t("scenario")} className="col-span-2 sm:col-span-1">
                  <NativeSelect aria-label={t("scenarioFor", { n: p.number })} value={p.scenarioCode ?? ""} disabled={locked}
                    onChange={(e) => update(i, { scenarioCode: e.target.value || null })}>
                    <option value="">{t("noScenario")}</option>
                    {content?.quests.map((q) => <option key={q.code} value={q.code}>{q.name}</option>)}
                  </NativeSelect>
                </Field>
                {swiss ? (
                  <Field label={t("pairing")} className="col-span-2 sm:col-span-1">
                    <NativeSelect aria-label={t("pairingFor", { n: p.number })} disabled={locked}
                      value={p.pairing ?? (p.number === 1 ? "RANDOM" : "SWISS")}
                      onChange={(e) => update(i, { pairing: e.target.value as RoundPairing })}>
                      {(p.number === 1 ? FIRST_ROUND : LATER).map((m) => (
                        <option key={m} value={m}>{t(`method.${m}`)}</option>
                      ))}
                    </NativeSelect>
                  </Field>
                ) : <span className="hidden sm:block" />}
                {format !== "ELIMINATION" ? (
                  <Field label={t("tables")}>
                    <NativeSelect aria-label={t("tablesFor", { n: p.number })} value={p.tableOrder} disabled={locked}
                      onChange={(e) => update(i, { tableOrder: e.target.value as RoundPlan["tableOrder"] })}>
                      {TABLE_ORDERS.map((o) => <option key={o} value={o}>{t(`tableOrder.${o}`)}</option>)}
                    </NativeSelect>
                  </Field>
                ) : <span className="hidden sm:block" />}
                <Field label={t("duration")}>
                  <Input type="number" inputMode="numeric" min={5} max={600} className="w-full sm:w-20"
                    aria-label={t("durationFor", { n: p.number })} disabled={locked}
                    placeholder="—" value={p.durationMinutes ?? ""}
                    onChange={(e) => update(i, { durationMinutes: e.target.value === "" ? null
                      : Math.max(5, Math.min(600, Number(e.target.value))) })} />
                </Field>
                {swiss && softPrefsConfigured ? (
                  <label className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:justify-center">
                    <input type="checkbox" aria-label={t("softPrefsFor", { n: p.number })} disabled={locked}
                      checked={p.softPreferences ?? p.number !== 1}
                      onChange={(e) => update(i, { softPreferences: e.target.checked })} />
                    <span className="text-xs text-muted-foreground sm:hidden">{t("softPrefs")}</span>
                  </label>
                ) : <span className="hidden sm:block" />}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={plans.length >= MAX_PLAN_ROUNDS}
          onClick={() => onChange([...plans, defaultPlan(plans.length + 1)])}>
          <Plus aria-hidden /> {t("add")}
        </Button>
        {plans.length > 0 && plans[plans.length - 1].number > lockedUpTo && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(plans.slice(0, -1))}>
            <Trash2 aria-hidden /> {t("removeLast")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t(`hint.${format}`)}</p>
      {lockedUpTo > 0 && <p className="text-xs text-muted-foreground">{t("lockedHint")}</p>}
    </div>
  );
}

/** A field with its label shown on phones only (the grid header names the column from sm up). */
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <span className="text-xs text-muted-foreground sm:hidden">{label}</span>
      {children}
    </div>
  );
}
