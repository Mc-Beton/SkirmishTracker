"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { loc, type Quest } from "@/lib/content";

/** Summary of a scenario: setup, how to score, end conditions and special rules. */
export function QuestView({ quest, compact = false }: { quest: Quest; compact?: boolean }) {
  const t = useTranslations("game");
  const locale = useLocale();
  return (
    <div className="grid gap-4 text-sm">
      {!compact && <h3 className="font-display text-xl">{quest.name}</h3>}
      <Section title={t("results")} highlight>
        <ul className="grid gap-1.5">
          {quest.results.map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-2">
              {r.vp != null && <Badge>{r.vp} PZ</Badge>}
              <span>{loc(r.text, locale)}</span>
              {r.when && <span className="text-xs text-muted-foreground">({t(`when.${r.when}`)})</span>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t("setup")}>
        <ul className="grid list-disc gap-1 pl-5">
          <li>{loc(quest.deployment, locale)}</li>
          {quest.setup.map((s, i) => <li key={i}>{loc(s, locale)}</li>)}
        </ul>
        <p className="mt-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t("map")}</p>
      </Section>
      {quest.important.length > 0 && (
        <Section title={t("important")}>
          <ul className="grid list-disc gap-1 pl-5">{quest.important.map((s, i) => <li key={i}>{loc(s, locale)}</li>)}</ul>
        </Section>
      )}
      {quest.endConditions.length > 0 && (
        <Section title={t("endConditions")}>
          <ul className="grid list-disc gap-1 pl-5">{quest.endConditions.map((s, i) => <li key={i}>{loc(s, locale)}</li>)}</ul>
        </Section>
      )}
      <Section title={t("rules")}>
        <div className="grid gap-2">
          {quest.rules.map((r, i) => (
            <details key={i} className="rounded-md border px-3 py-2">
              <summary className="cursor-pointer font-medium">{loc(r.title, locale)}</summary>
              <p className="mt-1 text-muted-foreground">{loc(r.text, locale)}</p>
            </details>
          ))}
        </div>
      </Section>
      {quest.classBonus && (
        <Section title={t("classBonus")}>
          <p>{loc(quest.classBonus, locale)}</p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children, highlight }: { title: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <section className={highlight ? "rounded-lg bg-accent/40 p-3" : undefined}>
      <h4 className="mb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  );
}
