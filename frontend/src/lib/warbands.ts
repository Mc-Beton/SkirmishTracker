"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ListStatus } from "@/lib/tournaments";
import type { Localized } from "@/lib/content";

export type ArmyFaction = {
  code: string;
  name: string;
  playable: boolean;
  alwaysAvailable: string[];
  optionalAllies: string[];
};
export type ArmyUnit = { code: string; name: string; points: number };
export type ArmyItem = {
  code: string;
  name: string;
  points: number;
  reducedPoints: number | null;
  reducedNote: Localized | null;
};
export type Armies = {
  source: string;
  factions: ArmyFaction[];
  units: ArmyUnit[];
  lists: Record<string, string[]>;
  items: ArmyItem[];
  /** NEUTRAL: every faction; faction codes: only warbands of that faction. */
  itemLists: Record<string, string[]>;
};
export const NEUTRAL = "NEUTRAL";

export type WarbandItem = { item: string; name: string; points: number; reduced: boolean };

export type WarbandUnit = {
  unit: string;
  name: string;
  points: number;
  extraPoints: number;
  notes: string | null;
  leader: boolean;
  source: string | null;
  items: WarbandItem[];
  totalPoints: number;
};
export type Warband = {
  userId: string;
  displayName: string;
  faction: string;
  alliedFaction: string | null;
  leaderInt: number;
  totalPoints: number;
  pointsLimit: number | null;
  units: WarbandUnit[];
  listStatus: ListStatus;
  updatedAt: string;
  editable: boolean;
};
export type MyWarband = {
  warband: Warband | null;
  editable: boolean;
  pointsLimit: number | null;
  listDeadline: string | null;
};
export type WarbandSummary = {
  userId: string;
  displayName: string;
  faction: string;
  alliedFaction: string | null;
  totalPoints: number;
  listStatus: ListStatus;
  updatedAt: string;
};
export type WarbandInput = {
  faction: string;
  alliedFaction: string | null;
  leaderInt: number;
  units: {
    unit: string;
    extraPoints: number;
    notes: string | null;
    leader: boolean;
    items: { item: string; reduced: boolean }[];
  }[];
};

export const MAX_UNITS = 20;
export const MAX_EXTRA_POINTS = 200;
export const MAX_NOTES = 200;
export const MAX_ITEMS_PER_UNIT = 10;

/** Item groups a warband of this faction may buy from: neutral first, then the faction's own. */
export function itemGroupsFor(armies: Armies, faction: string): { key: string; items: ArmyItem[] }[] {
  const byCode = new Map(armies.items.map((i) => [i.code, i]));
  return [NEUTRAL, faction]
    .filter((k, i, all) => all.indexOf(k) === i && (armies.itemLists[k]?.length ?? 0) > 0)
    .map((key) => ({ key, items: armies.itemLists[key].map((c) => byCode.get(c)!).filter(Boolean) }));
}

export function itemCost(item: ArmyItem | undefined, reduced: boolean): number {
  if (!item) return 0;
  return reduced && item.reducedPoints != null ? item.reducedPoints : item.points;
}

let cache: Promise<Armies> | null = null;

/** Army lists imported from the units spreadsheet; fetched once per page load. */
export function useArmies(): Armies | null {
  const [armies, setArmies] = useState<Armies | null>(null);
  useEffect(() => {
    let active = true;
    if (!cache) cache = api<Armies>("GET", "/api/content/armies");
    cache.then((a) => active && setArmies(a)).catch(() => {
      cache = null;
    });
    return () => {
      active = false;
    };
  }, []);
  return armies;
}

/** Lists a faction can recruit from, in display order: own, always available (Adventurers Guild), ally. */
export function sourcesFor(armies: Armies, faction: string, allied: string | null): string[] {
  const f = armies.factions.find((x) => x.code === faction);
  if (!f) return [];
  return [f.code, ...f.alwaysAvailable, ...(allied && f.optionalAllies.includes(allied) ? [allied] : [])];
}

export function factionName(armies: Armies | null, code: string | null | undefined): string {
  if (!code) return "";
  return armies?.factions.find((f) => f.code === code)?.name ?? code;
}
