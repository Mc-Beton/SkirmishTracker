"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Localized = { pl: string; en: string };
export type SchemeTimingCode = "END_OF_GAME" | "THIS_TURN" | "NEXT_STRATEGIC" | "ON_EVENT" | "START_OF_STRATEGIC";
export type Scheme = { code: string; name: string; maxVp: number; timing: SchemeTimingCode; text: Localized };
/** schemeTable is null while the faction's d20 table is not known yet. */
export type Faction = { code: string; name: string; schemeTable: string | null };
export type TableRow = { from: number; to: number; scheme: string };
export type QuestResult = { text: Localized; vp: number | null; when: string | null };
export type QuestRule = { title: Localized; text: Localized };
export type Quest = {
  code: string;
  name: string;
  deployment: Localized;
  setup: Localized[];
  results: QuestResult[];
  endConditions: Localized[];
  important: Localized[];
  rules: QuestRule[];
  classBonus: Localized | null;
};
export type GameContent = {
  version: string;
  turns: number;
  schemeDraw: { maxInt: number | null; cards: number }[];
  factions: Faction[];
  schemeTables: Record<string, TableRow[]>;
  schemes: Scheme[];
  quests: Quest[];
};

let cache: Promise<GameContent> | null = null;

/** Game reference data; fetched once per page load. */
export function useGameContent(): GameContent | null {
  const [content, setContent] = useState<GameContent | null>(null);
  useEffect(() => {
    let active = true;
    if (!cache) cache = api<GameContent>("GET", "/api/content");
    cache.then((c) => active && setContent(c)).catch(() => {
      cache = null;
    });
    return () => {
      active = false;
    };
  }, []);
  return content;
}

export function loc(text: Localized | null | undefined, locale: string): string {
  if (!text) return "";
  return locale === "en" ? text.en : text.pl;
}

export function cardsFor(content: GameContent, leaderInt: number): number {
  for (const rule of content.schemeDraw) {
    if (rule.maxInt == null || leaderInt <= rule.maxInt) return rule.cards;
  }
  return 1;
}
