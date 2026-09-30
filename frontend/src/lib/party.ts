// Roster format: the party one player picks from their roster for one game.

export type RosterItem = { index: number; item: string; name: string; points: number; reduced: boolean };
export type RosterEntry = { slot: number; unit: string; name: string; points: number; extraPoints: number; items: RosterItem[] };
export type PartyEntry = { slot: number; unit: string; name: string; leader: boolean; items: number[] };
export type PartyChoice = { units: PartyEntry[]; leaderInt: number; totalPoints: number; updatedAt: string };
export type PartySide = {
  userId: string;
  displayName: string;
  faction: string | null;
  alliedFaction: string | null;
  rosterPoints: number | null;
  /** null = hidden from you (hidden rosters) */
  roster: RosterEntry[] | null;
  chosen: boolean;
  /** null = not chosen yet, or hidden from you until the game is over */
  party: PartyChoice | null;
  canEdit: boolean;
};
export type PartyView = {
  rosterFormat: boolean;
  rosterLimit: number | null;
  partyLimit: number | null;
  scenario: string | null;
  revealed: boolean;
  sides: PartySide[];
};
export type PartyInput = { units: { slot: number; items: number[] }[]; leaderSlot: number; leaderInt: number };

/** Points of a selection: characters with their extra points plus the upgrades kept. */
export function selectionPoints(roster: RosterEntry[], picked: Map<number, Set<number>>): number {
  let total = 0;
  for (const [slot, items] of picked) {
    const e = roster.find((r) => r.slot === slot);
    if (!e) continue;
    total += e.points + e.extraPoints + e.items.filter((i) => items.has(i.index)).reduce((s, i) => s + i.points, 0);
  }
  return total;
}
