"use client";

import { useTranslations } from "next-intl";
import { useGameContent } from "@/lib/content";
import { BA_SCENARIOS, type GameSystem } from "@/lib/game-system";

export type ScenarioOption = { code: string; name: string };

/** Scenarios an organizer can plan for a round: Eldfall quests from the content, Bolt Action victory conditions. */
export function useScenarios(system: GameSystem): { list: ScenarioOption[]; name: (code: string) => string } {
  const t = useTranslations("boltAction.scenarios");
  const content = useGameContent();
  const list: ScenarioOption[] = system === "BOLT_ACTION"
    ? BA_SCENARIOS.map((code) => ({ code, name: t(code) }))
    : content?.quests.map((q) => ({ code: q.code, name: q.name })) ?? [];
  return { list, name: (code: string) => list.find((s) => s.code === code)?.name ?? code };
}
