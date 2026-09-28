"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { QuestView } from "@/components/game/quest-view";
import { SchemeCard } from "@/components/game/scheme-card";
import { useGameContent } from "@/lib/content";
import { cn } from "@/lib/utils";

export function ScenarioBrowser() {
  const t = useTranslations("scenarios");
  const tg = useTranslations("game");
  const content = useGameContent();
  const [quest, setQuest] = useState<string | null>(null);
  const [faction, setFaction] = useState<string | null>(null);
  if (!content) return null;
  const selectedQuest = content.quests.find((q) => q.code === (quest ?? content.quests[0].code))!;
  const selectedFaction = content.factions.find((f) => f.code === (faction ?? content.factions[0].code))!;
  const table = selectedFaction.schemeTable ? content.schemeTables[selectedFaction.schemeTable] ?? [] : [];
  const schemeOf = (code: string) => content.schemes.find((s) => s.code === code)!;

  const pill = (active: boolean) =>
    cn("rounded-md border px-3 py-1.5 text-sm", active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent");

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10">
      <div className="grid gap-2">
        <h1 className="font-display text-3xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>
      </div>

      <section className="grid gap-4">
        <h2 className="font-display text-2xl">{t("quests")}</h2>
        <div className="flex flex-wrap gap-2">
          {content.quests.map((q) => (
            <button key={q.code} className={pill(q.code === selectedQuest.code)} onClick={() => setQuest(q.code)}>{q.name}</button>
          ))}
        </div>
        <Card>
          <CardContent>
            <QuestView quest={selectedQuest} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <h2 className="font-display text-2xl">{t("schemeTables")}</h2>
        <div className="flex flex-wrap gap-2">
          {content.factions.map((f) => (
            <button key={f.code} className={pill(f.code === selectedFaction.code)} onClick={() => setFaction(f.code)}>{f.name}</button>
          ))}
        </div>
        {table.length === 0 && <p className="text-sm text-muted-foreground">{tg("noSchemeTable")}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {table.map((row) => (
            <div key={row.from} className="grid grid-cols-[3.5rem_1fr] items-start gap-2">
              <span className="pt-3 text-right font-display text-lg tabular-nums text-primary">
                {row.from === row.to ? row.from : `${row.from}–${row.to}`}
              </span>
              <SchemeCard scheme={schemeOf(row.scheme)} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
