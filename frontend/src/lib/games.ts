/** Warband list attached to an own game (no points limit, leader optional). */
export type GameList = {
  faction: string;
  alliedFaction: string | null;
  units: { unit: string; leader: boolean; items: { item: string; reduced: boolean }[] }[];
  totalPoints: number;
};

export type FriendlyGameStatus = "IN_PROGRESS" | "PENDING" | "CONFIRMED" | "REJECTED";

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
  /** Being played in the app and the viewer is one of the players. */
  canPlay: boolean;
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

/** Starting a game played in the app turn by turn (no score yet). */
export type GameStart = Omit<GameReport, "myScore" | "opponentScore">;

export type OwnTurn = { turn: number; scenarioVp: number; schemeVp: number };

export type OwnGamePlayer = {
  userId: string;
  displayName: string;
  faction: string | null;
  list: GameList | null;
  turns: OwnTurn[];
  totalScenario: number;
  totalScheme: number;
  total: number;
  canEdit: boolean;
};

/** One own game for its players (GET /api/games/{id}). */
export type OwnGame = {
  id: string;
  status: FriendlyGameStatus;
  playedOn: string;
  scenario: string | null;
  league: { id: string; name: string } | null;
  notes: string | null;
  turns: number;
  players: OwnGamePlayer[];
  reportedBy: string;
  smallA: number;
  smallB: number;
  canFinish: boolean;
  canReopen: boolean;
  canCancel: boolean;
  canConfirm: boolean;
  canWithdraw: boolean;
};
