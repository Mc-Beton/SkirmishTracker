import type { LeagueScoringMode, LeagueStandingRow } from "@/lib/leagues";
import type { TournamentFormat, TournamentStatus } from "@/lib/tournaments";

export type PlayerStats = { elo: number; rank: number | null; games: number; wins: number; draws: number; losses: number };
export type EloPoint = { gameId: string; at: string | null; rating: number; change: number };

export type StatCount = { key: string; count: number };
export type PlayStats = {
  games: number;
  gamesWithFaction: number;
  gamesWithList: number;
  topUnits: StatCount[];
  topWinningUnits: StatCount[];
  nemesisUnits: StatCount[];
  factions: StatCount[];
  factionWins: StatCount[];
  factionLosses: StatCount[];
  opponentFactions: StatCount[];
  winsAgainst: StatCount[];
  lossesAgainst: StatCount[];
  gamesWithMission: number;
  missions: StatCount[];
  missionWins: StatCount[];
  missionLosses: StatCount[];
};

export type PlayerProfile = {
  id: string;
  displayName: string;
  club: string | null;
  city: string | null;
  memberSince: string;
  stats: PlayerStats;
  history: EloPoint[];
  tournaments: {
    id: string;
    name: string;
    startsAt: string;
    status: TournamentStatus;
    format: TournamentFormat;
    players: number;
    position: number | null;
  }[];
  leagues: { id: string; name: string; scoringMode: LeagueScoringMode; active: boolean; row: LeagueStandingRow; of: number }[];
  recentGames: {
    id: string;
    playedAt: string | null;
    opponent: { id: string; displayName: string };
    myScore: number;
    opponentScore: number;
    result: "W" | "D" | "L";
    eloChange: number;
    tournamentId: string | null;
    tournamentName: string | null;
  }[];
  factions: { faction: string; count: number }[];
  playStats: PlayStats;
  opponents: OpponentRow[];
  badges: Badge[];
};

export type OpponentRow = { opponent: { id: string; displayName: string }; games: number; wins: number; draws: number; losses: number };
export type Badge = { code: BadgeCode; earned: boolean; progress: number; target: number };
export type BadgeCode =
  | "FIRST_GAME" | "VETERAN" | "LEGEND" | "WIN_STREAK" | "GIANT_SLAYER" | "TOURNAMENT_WINNER" | "PODIUM"
  | "OFFICIAL_CHAMPION" | "GLOBETROTTER" | "FACTION_MASTER" | "ALL_ROUNDER" | "ORGANIZER";
export type Versus = {
  player: { id: string; displayName: string };
  opponent: { id: string; displayName: string };
  games: number;
  wins: number;
  draws: number;
  losses: number;
  recent: PlayerProfile["recentGames"];
};

export type RankingRow = {
  position: number;
  id: string;
  displayName: string;
  club: string | null;
  elo: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
};

export type SearchHit = { id: string; displayName: string; club: string | null };
