"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { CollapsibleSection } from "@/components/ui/collapsible-card";
import { defaultPlan, RoundPlanEditor } from "@/components/tournaments/round-plan-editor";
import { useGameContent } from "@/lib/content";
import {
  DEFAULT_SETTINGS,
  SCORING_MODES,
  TOP_CUTS,
  TEAM_SIZES,
  type TournamentSettings,
  type DifferenceRow,
  FORMATS,
  RANKS,
  fromLocalInput,
  toLocalInput,
  type TournamentDetail,
  type TournamentFormat,
  type TournamentInput,
  type RoundPlan,
  type TournamentRank,
} from "@/lib/tournaments";

type FormState = {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  address: string;
  city: string;
  rank: TournamentRank;
  format: TournamentFormat;
  maxPlayers: string;
  pointsLimit: string;
  roundsPlanned: string;
  listDeadline: string;
  entryFeeAmount: string;
  entryFeeCurrency: string;
};

function initialState(t?: TournamentDetail): FormState {
  return {
    name: t?.name ?? "",
    description: t?.description ?? "",
    startsAt: toLocalInput(t?.startsAt ?? null),
    endsAt: toLocalInput(t?.endsAt ?? null),
    venueName: t?.venueName ?? "",
    address: t?.address ?? "",
    city: t?.city ?? "",
    rank: t?.rank ?? "LOCAL",
    format: t?.format ?? "SWISS",
    maxPlayers: t?.maxPlayers?.toString() ?? "",
    pointsLimit: t?.pointsLimit?.toString() ?? "",
    roundsPlanned: t?.roundsPlanned?.toString() ?? "",
    listDeadline: toLocalInput(t?.listDeadline ?? null),
    entryFeeAmount: t?.entryFeeAmount?.toString() ?? "",
    entryFeeCurrency: t?.entryFeeCurrency ?? "PLN",
  };
}

const int = (v: string) => (v.trim() === "" ? null : Number.parseInt(v, 10));

export function TournamentForm({
  tournament,
  submitLabel,
  onSubmit,
  collapsible = false,
}: {
  tournament?: TournamentDetail;
  /** Pairing, round plan and scoring fold away (organizer panel). */
  collapsible?: boolean;
  submitLabel: string;
  onSubmit: (input: TournamentInput) => Promise<void>;
}) {
  const t = useTranslations("tournaments");
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState<FormState>(() => initialState(tournament));
  const [settings, setSettings] = useState<TournamentSettings>(() => tournament?.settings ?? DEFAULT_SETTINGS);
  const flag = (key: keyof TournamentSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings((st) => ({ ...st, [key]: e.target.checked }));
  const num = (key: keyof TournamentSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings((st) => ({ ...st, [key]: e.target.value === "" ? 0 : Number.parseInt(e.target.value, 10) }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const content = useGameContent();
  const lockedUpTo = tournament?.roundsCount ?? 0;
  const [plans, setPlans] = useState<RoundPlan[]>(() => {
    if (tournament?.roundPlans?.length) return tournament.roundPlans;
    const n = tournament?.roundsPlanned ?? 0;
    return Array.from({ length: n }, (_, i) => defaultPlan(i + 1));
  });

  // Keep the Swiss plan as long as the number of rounds (new rows get defaults, extra rows go).
  function changeRounds(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setForm((f) => ({ ...f, roundsPlanned: value }));
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1 || n > 20) return;
    setPlans((ps) => {
      const kept = ps.filter((p) => p.number <= Math.max(n, lockedUpTo));
      for (let i = kept.length + 1; i <= n; i++) kept.push(defaultPlan(i));
      return kept;
    });
  }

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        ...settings,
        name: form.name,
        description: form.description || null,
        startsAt: fromLocalInput(form.startsAt) ?? "",
        endsAt: fromLocalInput(form.endsAt),
        venueName: form.venueName || null,
        address: form.address || null,
        city: form.city,
        country: "PL",
        entryFeeAmount: form.entryFeeAmount.trim() === "" ? null : Number(form.entryFeeAmount.replace(",", ".")),
        entryFeeCurrency: form.entryFeeAmount.trim() === "" ? null : form.entryFeeCurrency,
        rank: form.rank,
        format: form.format,
        maxPlayers: int(form.maxPlayers),
        pointsLimit: int(form.pointsLimit),
        roundsPlanned: int(form.roundsPlanned),
        listDeadline: fromLocalInput(form.listDeadline),
        roundPlans: plans,
        // Round 1 of the plan also drives the first-round settings (used when no plan row exists).
        ...(form.format === "SWISS" && plans[0] ? {
          firstRoundMode: plans[0].pairing && plans[0].pairing !== "SWISS" ? plans[0].pairing : settings.firstRoundMode,
          softPrefsFirstRound: plans[0].softPreferences ?? settings.softPrefsFirstRound,
        } : {}),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="grid gap-8">
      {error && <Alert variant="destructive">{error}</Alert>}

      <fieldset className="grid gap-4">
        <legend className="mb-2 font-display text-lg">{t("form.basics")}</legend>
        <Field id="name" label={t("form.name")}>
          <Input id="name" required minLength={3} maxLength={120} value={form.name} onChange={set("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="startsAt" label={t("form.startsAt")}>
            <Input id="startsAt" type="datetime-local" required value={form.startsAt} onChange={set("startsAt")} />
          </Field>
          <Field id="endsAt" label={t("form.endsAt")}>
            <Input id="endsAt" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="city" label={t("form.city")}>
            <Input id="city" required maxLength={80} value={form.city} onChange={set("city")} />
          </Field>
          <Field id="venueName" label={t("form.venueName")}>
            <Input id="venueName" maxLength={120} value={form.venueName} onChange={set("venueName")} />
          </Field>
          <Field id="address" label={t("form.address")}>
            <Input id="address" maxLength={200} value={form.address} onChange={set("address")} />
          </Field>
        </div>
        <Field id="description" label={t("form.description")} hint={t("form.descriptionHint")}>
          <Textarea id="description" rows={8} maxLength={10000} value={form.description}
            onChange={set("description")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 font-display text-lg">{t("form.rules")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="rank" label={t("form.rank")}>
            <NativeSelect id="rank" value={form.rank} onChange={set("rank")}>
              {RANKS.map((r) => (
                <option key={r} value={r}>{t(`rank.${r}`)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="format" label={t("form.format")}>
            <NativeSelect id="format" value={form.format} onChange={set("format")}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>{t(`format.${f}`)}</option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">{t(`form.formatHint.${form.format}`)}</p>
          </Field>
        </div>
        {form.format !== "ELIMINATION" && (
          <Field id="topCut" label={t("form.topCut")} hint={t("form.topCutHint")}>
            <NativeSelect id="topCut" value={settings.topCut}
              onChange={(e) => setSettings((st) => ({ ...st, topCut: Number(e.target.value) }))}>
              {TOP_CUTS.map((n) => (
                <option key={n} value={n}>{n === 0 ? t("form.noTopCut") : t("form.topN", { n })}</option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="teamSize" label={t("form.mode")} hint={settings.teamSize ? t("form.teamModeHint") : undefined}>
            <NativeSelect id="teamSize" value={settings.teamSize ?? ""}
              onChange={(e) => setSettings((st) => ({ ...st, teamSize: e.target.value ? Number(e.target.value) : null,
                teamUniqueFactions: e.target.value ? st.teamUniqueFactions : false }))}>
              <option value="">{t("form.individual")}</option>
              {TEAM_SIZES.map((n) => <option key={n} value={n}>{t("form.teamOf", { n })}</option>)}
            </NativeSelect>
          </Field>
          {settings.teamSize && (
            <Check id="teamUniqueFactions" checked={settings.teamUniqueFactions} onChange={flag("teamUniqueFactions")}
              label={t("form.teamUniqueFactions")} hint={t("form.teamUniqueFactionsHint")} className="self-end" />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="maxPlayers" label={settings.teamSize ? t("form.maxTeams") : t("form.maxPlayers")}
            hint={settings.teamSize ? undefined : t("form.maxPlayersHint")}>
            <Input id="maxPlayers" type="number" min={2} max={512} value={form.maxPlayers} onChange={set("maxPlayers")} />
          </Field>
          <Field id="pointsLimit" label={t("form.pointsLimit")}>
            <Input id="pointsLimit" type="number" min={1} max={10000} value={form.pointsLimit}
              onChange={set("pointsLimit")} />
          </Field>
          {form.format === "SWISS" ? (
            <Field id="roundsPlanned" label={t("form.roundsPlanned")}
              hint={settings.topCut > 0 ? t("form.roundsPlannedTopCut") : undefined}>
              <Input id="roundsPlanned" type="number" min={1} max={20} value={form.roundsPlanned}
                required={settings.topCut > 0} onChange={changeRounds} />
            </Field>
          ) : (
            <p className="self-end text-xs text-muted-foreground">{t(`form.roundsAuto.${form.format}`)}</p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="listDeadline" label={t("form.listDeadline")}>
            <Input id="listDeadline" type="datetime-local" value={form.listDeadline} onChange={set("listDeadline")} />
          </Field>
          <Field id="entryFeeAmount" label={`${t("form.fee")} – ${t("form.feeAmount")}`}>
            <Input id="entryFeeAmount" inputMode="decimal" value={form.entryFeeAmount} onChange={set("entryFeeAmount")} />
          </Field>
          <Field id="entryFeeCurrency" label={t("form.currency")}>
            <NativeSelect id="entryFeeCurrency" value={form.entryFeeCurrency} onChange={set("entryFeeCurrency")}>
              {["PLN", "EUR", "USD", "GBP", "CZK"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </fieldset>

      <Section title={t("form.pairing")} collapsible={collapsible}>
        {form.format !== "SWISS" && (
        <Field id="firstRoundMode" label={t("form.seeding")}
          hint={settings.firstRoundMode !== "RANDOM" ? t("form.eloHint") : undefined}>
          <NativeSelect id="firstRoundMode"
            value={settings.firstRoundMode !== "RANDOM" ? "ELO_STRONG_VS_STRONG" : "RANDOM"}
            onChange={(e) => setSettings((st) => ({ ...st, firstRoundMode: e.target.value as TournamentSettings["firstRoundMode"] }))}>
            <option value="RANDOM">{t("firstRoundMode.RANDOM")}</option>
            <option value="ELO_STRONG_VS_STRONG">{t("form.seedByElo")}</option>
          </NativeSelect>
        </Field>
        )}
        {form.format === "SWISS" && !settings.teamSize && (
          <>
            <Check id="challengesEnabled" checked={settings.challengesEnabled} onChange={flag("challengesEnabled")}
              label={t("form.challengesEnabled")} hint={t("form.challengesEnabledHint")} />
            {settings.challengesEnabled && (
              <Check id="challengesPublic" checked={settings.challengesPublic} onChange={flag("challengesPublic")}
                label={t("form.challengesPublic")} className="pl-7" />
            )}
            <p className="text-sm font-medium">{t("form.softPrefs")}</p>
            <div className="grid gap-2 pl-1">
              <Check id="avoidSameClub" checked={settings.avoidSameClub} onChange={flag("avoidSameClub")} label={t("form.avoidSameClub")} />
              <Check id="avoidSameFaction" checked={settings.avoidSameFaction} onChange={flag("avoidSameFaction")} label={t("form.avoidSameFaction")} />
              <Check id="avoidSameCity" checked={settings.avoidSameCity} onChange={flag("avoidSameCity")} label={t("form.avoidSameCity")} />
              <p className="text-xs text-muted-foreground">{t("form.softPrefsPerRound")}</p>
            </div>
          </>
        )}
      </Section>

      <Section title={t("plan.title")} collapsible={collapsible}>
        <RoundPlanEditor plans={plans} onChange={setPlans} format={form.format} content={content}
          lockedUpTo={lockedUpTo}
          softPrefsConfigured={!settings.teamSize && settings.avoidSameClub || settings.avoidSameFaction || settings.avoidSameCity} />
      </Section>

      <Section title={t("form.scoring")} collapsible={collapsible}>
        <Field id="scoringMode" label={t("form.scoringMode")}>
          <NativeSelect id="scoringMode" value={settings.scoringMode}
            onChange={(e) => setSettings((st) => ({ ...st, scoringMode: e.target.value as TournamentSettings["scoringMode"] }))}>
            {SCORING_MODES.map((m) => (
              <option key={m} value={m}>{t(`scoringMode.${m}`)}</option>
            ))}
          </NativeSelect>
        </Field>
        {settings.scoringMode === "WIN_DRAW_LOSS" ? (
          <div className="grid grid-cols-3 gap-4">
            <NumField id="winPoints" label={t("form.winPoints")} value={settings.winPoints} onChange={num("winPoints")} />
            <NumField id="drawPoints" label={t("form.drawPoints")} value={settings.drawPoints} onChange={num("drawPoints")} />
            <NumField id="lossPoints" label={t("form.lossPoints")} value={settings.lossPoints} onChange={num("lossPoints")} />
          </div>
        ) : settings.scoringMode === "SMALL_POINTS_MULTIPLIER" ? (
          <div className="grid grid-cols-3 gap-4">
            <NumField id="smallPointsMultiplier" label={t("form.multiplier")} value={settings.smallPointsMultiplier}
              min={1} onChange={num("smallPointsMultiplier")} />
          </div>
        ) : (
          <DifferenceTableEditor rows={settings.differenceTable}
            onChange={(rows) => setSettings((st) => ({ ...st, differenceTable: rows }))} />
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumField id="byeBigPoints" label={t("form.byeBig")} value={settings.byeBigPoints} onChange={num("byeBigPoints")} />
          <NumField id="byeSmallPoints" label={t("form.byeSmall")} value={settings.byeSmallPoints} onChange={num("byeSmallPoints")} />
          <NumField id="splitBigPoints" label={t("form.splitBig")} value={settings.splitBigPoints} onChange={num("splitBigPoints")} />
          <NumField id="splitSmallPoints" label={t("form.splitSmall")} value={settings.splitSmallPoints} onChange={num("splitSmallPoints")} />
        </div>
      </Section>

      <Button type="submit" disabled={busy} className="justify-self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Check({ id, label, hint, checked, onChange, className }: {
  id: string; label: string; hint?: string; checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="flex items-start gap-3 text-sm">
        <input id={id} type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={checked} onChange={onChange} />
        <span className="grid gap-1">
          <span>{label}</span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </span>
      </label>
    </div>
  );
}

function NumField({ id, label, value, onChange, min = 0 }: {
  id: string; label: string; value: number; min?: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={min} max={1000} value={value} onChange={onChange} />
    </div>
  );
}

function DifferenceTableEditor({ rows, onChange }: { rows: DifferenceRow[]; onChange: (rows: DifferenceRow[]) => void }) {
  const t = useTranslations("tournaments.form");
  const set = (i: number, key: keyof DifferenceRow, value: string) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [key]: value === "" ? 0 : Number.parseInt(value, 10) } : r));
    onChange(next);
  };
  const addRow = () => {
    // Insert a new threshold before the open-ended last row.
    const closed = rows.slice(0, -1);
    const last = rows[rows.length - 1];
    const prev = closed.length ? (closed[closed.length - 1].upTo ?? 0) : -1;
    onChange([...closed, { upTo: prev + 2, winner: last.winner, loser: last.loser }, last]);
  };
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{t("diffTable")}</p>
      <table className="w-full max-w-md text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">{t("diffUpTo")}</th>
            <th className="py-1 pr-2 font-medium">{t("diffWinner")}</th>
            <th className="py-1 pr-2 font-medium">{t("diffLoser")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-1 pr-2">
                {r.upTo == null ? (
                  <span className="text-muted-foreground">{t("diffAny")}</span>
                ) : (
                  <Input aria-label={`${t("diffUpTo")} ${i + 1}`} type="number" min={0} className="h-8 w-20"
                    value={r.upTo} onChange={(e) => set(i, "upTo", e.target.value)} />
                )}
              </td>
              <td className="py-1 pr-2">
                <Input aria-label={`${t("diffWinner")} ${i + 1}`} type="number" min={0} className="h-8 w-20"
                  value={r.winner} onChange={(e) => set(i, "winner", e.target.value)} />
              </td>
              <td className="py-1 pr-2">
                <Input aria-label={`${t("diffLoser")} ${i + 1}`} type="number" min={0} className="h-8 w-20"
                  value={r.loser} onChange={(e) => set(i, "loser", e.target.value)} />
              </td>
              <td className="py-1">
                {r.upTo != null && rows.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(i)}>✕</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>{t("diffAdd")}</Button>
        <p className="text-xs text-muted-foreground">{t("diffHint")}</p>
      </div>
    </div>
  );
}

/** A form section; in the organizer panel it folds away under its title. */
function Section({ title, collapsible, children }: { title: string; collapsible: boolean; children: React.ReactNode }) {
  if (collapsible) {
    return (
      <fieldset className="rounded-lg border px-3 py-2 sm:px-4">
        <CollapsibleSection title={title}>{children}</CollapsibleSection>
      </fieldset>
    );
  }
  return (
    <fieldset className="grid gap-4">
      <legend className="mb-2 font-display text-lg">{title}</legend>
      {children}
    </fieldset>
  );
}
