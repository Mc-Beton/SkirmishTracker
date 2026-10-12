// "My lists": saved lists (templates). Choosing one for a tournament or an own game copies it – later edits of
// the saved list never change games already played.

import type { GameList } from "@/lib/games";
import type { ListFormat } from "@/lib/tournaments";
import type { WarbandInput, WarbandUnit } from "@/lib/warbands";

export type ArmyListSummary = {
  id: string;
  number: number;
  name: string | null;
  format: ListFormat;
  faction: string;
  alliedFaction: string | null;
  /** With today's costs. */
  totalPoints: number;
  /** Costs changed since the list was saved (errata). */
  pointsChanged: boolean;
  units: number;
  updatedAt: string;
};

export type ArmyList = Omit<ArmyListSummary, "units"> & {
  leaderInt: number;
  units: WarbandUnit[];
};

export type ArmyListInput = { name: string | null; format: ListFormat; list: WarbandInput };

export const MAX_LIST_NAME = 80;

/** "#3 Helian pod scenariusze" or just "#3". */
export const listLabel = (l: { number: number; name: string | null }) => `#${l.number}${l.name ? ` ${l.name}` : ""}`;

/** The saved list as editor input (the shape tournament lists use). */
export function toWarbandInput(l: ArmyList): WarbandInput {
  return {
    faction: l.faction,
    alliedFaction: l.alliedFaction,
    leaderInt: l.leaderInt,
    units: l.units.map((u) => ({
      unit: u.unit,
      extraPoints: u.extraPoints,
      notes: u.notes,
      leader: u.leader,
      items: u.items.map((i) => ({ item: i.item, reduced: i.reduced })),
    })),
  };
}

/** The saved list for an own game (no extra points or notes there). */
export function toGameList(l: ArmyList): Omit<GameList, "totalPoints"> {
  return {
    faction: l.faction,
    alliedFaction: l.alliedFaction,
    units: l.units.map((u) => ({ unit: u.unit, leader: u.leader, items: u.items.map((i) => ({ item: i.item, reduced: i.reduced })) })),
  };
}

/** Same content (faction, ally, characters, upgrades, leader and its INT) – to tell "changed since #3". */
export function sameList(a: WarbandInput, b: WarbandInput, roster: boolean): boolean {
  const norm = (x: WarbandInput) => JSON.stringify({
    f: x.faction,
    a: x.alliedFaction || null,
    i: roster ? 0 : x.leaderInt,
    u: x.units.map((u) => [u.unit, u.extraPoints || 0, (u.notes ?? "").trim(), !roster && u.leader,
      u.items.map((i) => [i.item, !!i.reduced])]),
  });
  return norm(a) === norm(b);
}

/** Why a saved list cannot be used in a tournament (null = it can). */
export function unusableReason(l: ArmyListSummary, format: ListFormat, pointsLimit: number | null):
  { key: "format" } | { key: "points"; points: number; limit: number } | null {
  if (l.format !== format) return { key: "format" };
  if (pointsLimit != null && l.totalPoints > pointsLimit) return { key: "points", points: l.totalPoints, limit: pointsLimit };
  return null;
}
