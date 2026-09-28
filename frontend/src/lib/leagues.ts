import type { TournamentRank, TournamentStatus } from "@/lib/tournaments";

export type LeagueScoringMode = "PLACE_POINTS" | "BIG_POINTS" | "ELO";
export const LEAGUE_SCORING_MODES: LeagueScoringMode[] = ["PLACE_POINTS", "BIG_POINTS", "ELO"];
export type LeagueTournamentStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type Ref = { id: string; displayName: string };

export type LeagueSettings = {
  name: string;
  description: string | null;
  city: string | null;
  startsOn: string;
  endsOn: string;
  scoringMode: LeagueScoringMode;
  ownGamesAllowed: boolean;
  placePoints: number[];
  participationPoints: number;
  multiplierLocal: number;
  multiplierMaster: number;
  multiplierInternational: number;
  bigPointsMultiplier: number;
  gameWinPoints: number;
  gameDrawPoints: number;
  gameLossPoints: number;
};

export type LeagueSummary = {
  id: string;
  name: string;
  city: string | null;
  startsOn: string;
  endsOn: string;
  scoringMode: LeagueScoringMode;
  owner: Ref;
  members: number;
  tournaments: number;
  active: boolean;
};

export type LeagueTournamentLink = {
  id: string;
  name: string;
  startsAt: string;
  rank: TournamentRank;
  tournamentStatus: TournamentStatus;
  status: LeagueTournamentStatus;
  counted: boolean;
};

export type LeagueStandingRow = {
  position: number;
  userId: string;
  displayName: string;
  /** League points, or the rating in ELO mode. */
  points: number;
  tournaments: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  smallPoints: number;
};

export type LeagueDetail = {
  id: string;
  settings: LeagueSettings;
  owner: Ref;
  canManage: boolean;
  member: boolean;
  members: Ref[];
  tournaments: LeagueTournamentLink[];
  standings: LeagueStandingRow[];
};

export type OrganizerLink = { leagueId: string; leagueName: string; status: LeagueTournamentStatus };

export const DEFAULT_LEAGUE: LeagueSettings = {
  name: "",
  description: null,
  city: null,
  startsOn: "",
  endsOn: "",
  scoringMode: "BIG_POINTS",
  ownGamesAllowed: true,
  placePoints: [10, 8, 6, 5, 4, 3, 2, 1],
  participationPoints: 1,
  multiplierLocal: 1,
  multiplierMaster: 1.5,
  multiplierInternational: 2,
  bigPointsMultiplier: 1,
  gameWinPoints: 3,
  gameDrawPoints: 1,
  gameLossPoints: 0,
};
