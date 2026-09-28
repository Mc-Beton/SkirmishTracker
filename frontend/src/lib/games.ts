/** Warband list attached to an own game (no points limit, leader optional). */
export type GameList = {
  faction: string;
  alliedFaction: string | null;
  units: { unit: string; leader: boolean; items: { item: string; reduced: boolean }[] }[];
  totalPoints: number;
};

export type FriendlyGameStatus = "PENDING" | "CONFIRMED" | "REJECTED";

export type FriendlyGame = {
  id: string;
  playerA: { id: string; displayName: string };
  playerB: { id: string; displayName: string };
  smallA: number;
  smallB: number;
  playedOn: string;
  scenario: string | null;
  factionA: string | null;
  factionB: string | null;
  league: { id: string; name: string } | null;
  notes: string | null;
  status: FriendlyGameStatus;
  reportedBy: string;
  canConfirm: boolean;
  canWithdraw: boolean;
  listA: GameList | null;
  listB: GameList | null;
};

export type GameReport = {
  opponentId: string;
  myScore: number;
  opponentScore: number;
  playedOn: string;
  scenarioCode: string | null;
  myFaction: string | null;
  opponentFaction: string | null;
  leagueId: string | null;
  notes: string | null;
  myList: Omit<GameList, "totalPoints"> | null;
  opponentList: Omit<GameList, "totalPoints"> | null;
};
