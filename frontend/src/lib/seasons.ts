// Official seasons (GET /api/seasons…) and their management by the publisher (/api/admin/seasons, /api/admin/official).
import type { TournamentRank, TournamentStatus } from "@/lib/tournaments";

export type SeasonSummary = { id: string; name: string; startsOn: string; endsOn: string; current: boolean };
export type SeasonSettings = {
  name: string;
  startsOn: string;
  endsOn: string;
  pointsLocal: number;
  pointsMaster: number;
  pointsInternational: number;
  bestResults: number;
};
export type SeasonTournament = {
  id: string;
  name: string;
  startsAt: string;
  city: string;
  country: string;
  rank: TournamentRank;
  players: number;
  organizerName: string;
  basePoints: number;
};
export type SeasonResult = { tournamentId: string; place: number; players: number; points: number; counted: boolean };
export type SeasonRankingRow = {
  position: number;
  userId: string;
  displayName: string;
  club: string | null;
  points: number;
  events: number;
  results: SeasonResult[];
};
export type SeasonOrganizer = { userId: string; displayName: string; events: number; players: number; countries: string[] };
export type SeasonView = {
  season: SeasonSummary;
  settings: SeasonSettings;
  ranking: SeasonRankingRow[];
  tournaments: SeasonTournament[];
  organizers: SeasonOrganizer[];
};
export type OfficialCandidate = {
  id: string;
  name: string;
  startsAt: string;
  city: string;
  country: string;
  rank: TournamentRank;
  status: TournamentStatus;
  players: number;
  organizerName: string;
  official: boolean;
  team: boolean;
};

export const DEFAULT_SEASON: SeasonSettings = {
  name: "",
  startsOn: "",
  endsOn: "",
  pointsLocal: 100,
  pointsMaster: 200,
  pointsInternational: 400,
  bestResults: 4,
};
