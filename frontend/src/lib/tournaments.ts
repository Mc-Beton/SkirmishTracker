export type TournamentRank = "LOCAL" | "MASTER" | "INTERNATIONAL";
export type TournamentFormat = "SWISS" | "ELIMINATION" | "ROUND_ROBIN";
export type TournamentStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "REGISTRATION_CLOSED"
  | "IN_PROGRESS"
  | "FINISHED"
  | "CANCELLED";
export type ParticipantStatus = "REGISTERED" | "WAITLIST";
export type ListStatus = "NOT_SUBMITTED" | "SUBMITTED" | "APPROVED" | "NEEDS_FIX";

export const RANKS: TournamentRank[] = ["LOCAL", "MASTER", "INTERNATIONAL"];
export const FORMATS: TournamentFormat[] = ["SWISS", "ELIMINATION", "ROUND_ROBIN"];
/** Formats with working pairing logic. */
export const AVAILABLE_FORMATS: TournamentFormat[] = ["SWISS", "ELIMINATION", "ROUND_ROBIN"];
/** Players advancing from Swiss / round robin into a single-elimination bracket (0 = none). */
export const TOP_CUTS = [0, 2, 4, 8, 16, 32] as const;
export type RoundPhase = "SWISS" | "ROUND_ROBIN" | "KNOCKOUT";
export type RoundPairing = "SWISS" | "RANDOM" | "ELO_STRONG_VS_STRONG" | "ELO_TOP_VS_BOTTOM";
export type TableOrder = "RANDOM" | "BY_STANDINGS";
export const TABLE_ORDERS: TableOrder[] = ["BY_STANDINGS", "RANDOM"];
/** Plan of one round; pairing / softPreferences null = default for that round. */
export type RoundPlan = {
  number: number;
  scenarioCode: string | null;
  pairing: RoundPairing | null;
  tableOrder: TableOrder;
  softPreferences: boolean | null;
  /** Round length for the timer (minutes), null = no timer. */
  durationMinutes: number | null;
};
export type FirstRoundMode = "RANDOM" | "ELO_STRONG_VS_STRONG" | "ELO_TOP_VS_BOTTOM";
export type ScoringMode = "WIN_DRAW_LOSS" | "SMALL_POINTS_MULTIPLIER" | "DIFFERENCE_TABLE";
export type DifferenceRow = { upTo: number | null; winner: number; loser: number };
export const FIRST_ROUND_MODES: FirstRoundMode[] = ["RANDOM", "ELO_STRONG_VS_STRONG", "ELO_TOP_VS_BOTTOM"];
export const SCORING_MODES: ScoringMode[] = ["WIN_DRAW_LOSS", "SMALL_POINTS_MULTIPLIER", "DIFFERENCE_TABLE"];

export type TournamentSettings = {
  firstRoundMode: FirstRoundMode;
  challengesEnabled: boolean;
  challengesPublic: boolean;
  avoidSameClub: boolean;
  avoidSameFaction: boolean;
  avoidSameCity: boolean;
  softPrefsFirstRound: boolean;
  scoringMode: ScoringMode;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  smallPointsMultiplier: number;
  byeBigPoints: number;
  byeSmallPoints: number;
  splitBigPoints: number;
  splitSmallPoints: number;
  differenceTable: DifferenceRow[];
  topCut: number;
  /** Players per team (2–5); null = individual tournament. */
  teamSize: number | null;
  teamUniqueFactions: boolean;
};

export const DEFAULT_SETTINGS: TournamentSettings = {
  firstRoundMode: "RANDOM",
  challengesEnabled: false,
  challengesPublic: true,
  avoidSameClub: false,
  avoidSameFaction: false,
  avoidSameCity: false,
  softPrefsFirstRound: false,
  scoringMode: "WIN_DRAW_LOSS",
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  smallPointsMultiplier: 2,
  byeBigPoints: 3,
  byeSmallPoints: 0,
  splitBigPoints: 1,
  splitSmallPoints: 0,
  differenceTable: [
    { upTo: 0, winner: 10, loser: 10 },
    { upTo: 2, winner: 11, loser: 9 },
    { upTo: 4, winner: 12, loser: 8 },
    { upTo: 6, winner: 13, loser: 7 },
    { upTo: 8, winner: 14, loser: 6 },
    { upTo: null, winner: 15, loser: 5 },
  ],
  topCut: 0,
  teamSize: null,
  teamUniqueFactions: false,
};

export type ChallengeStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "CANCELLED";
export type Challenge = {
  id: string;
  challengerId: string;
  challengerName: string;
  challengedId: string;
  challengedName: string;
  status: ChallengeStatus;
  organizerMade: boolean;
};

export type MatchStatus = "PENDING" | "REPORTED" | "DISPUTED" | "CONFIRMED";
export type RoundStatus = "PAIRED" | "IN_PROGRESS" | "COMPLETED";
export type PlayerRef = { id: string; displayName: string };
export type Match = {
  id: string;
  table: number;
  playerA: PlayerRef;
  playerB: PlayerRef | null;
  status: MatchStatus;
  resultType: "PLAYED" | "SPLIT" | "BYE" | null;
  smallA: number | null;
  smallB: number | null;
  bigA: number | null;
  bigB: number | null;
  reportedBy: string | null;
  rematch: boolean;
  canReport: boolean;
  canConfirm: boolean;
  /** Knockout only: bracket seeds and the player who advances once the result is confirmed. */
  seedA: number | null;
  seedB: number | null;
  advancing: string | null;
  /** An open judge call for this table. */
  judgeCalled: boolean;
  /** Team events: the team match this board belongs to. */
  teamMatchId: string | null;
};
/** remainingSeconds was computed at serverTime; while running the client counts down from there. */
export type RoundTimer = { totalSeconds: number; remainingSeconds: number; running: boolean; serverTime: string };
export type TeamRef = { id: string; name: string };
export type TeamMatch = {
  id: string;
  group: number;
  teamA: TeamRef;
  teamB: TeamRef | null;
  seedA: number | null;
  seedB: number | null;
  /** Board order; null while hidden (before the start only the team itself and the organizer see it). */
  lineupA: PlayerRef[] | null;
  lineupB: PlayerRef[] | null;
  gameWinsA: number;
  gameWinsB: number;
  bigA: number;
  bigB: number;
  smallA: number;
  smallB: number;
  complete: boolean;
  winner: string | null;
  canEditLineupA: boolean;
  canEditLineupB: boolean;
};
export type Round = {
  number: number;
  status: RoundStatus;
  byeBigPoints: number;
  byeSmallPoints: number;
  scenario: string | null;
  phase: RoundPhase;
  /** FINAL, SEMIFINAL, QUARTERFINAL, ROUND_OF_16… (knockout rounds only). */
  stage: string | null;
  tableOrder: TableOrder | null;
  timer: RoundTimer | null;
  matches: Match[];
  /** Team events only. */
  teamMatches: TeamMatch[] | null;
};

export type GameCard = { scheme: string; roll: number };
export type GameDraw = { faction: string; leaderInt: number; cards: GameCard[]; kept: string | null };
export type GameTurn = { turn: number; scenarioVp: number; schemeVp: number };
export type GamePlayer = {
  userId: string;
  displayName: string;
  draw: GameDraw | null;
  turns: GameTurn[];
  totalScenario: number;
  totalScheme: number;
  total: number;
  canEdit: boolean;
  /** Faction and leader INT from the player's warband; the scheme draw uses them when present. */
  warbandFaction: string | null;
  warbandLeaderInt: number | null;
};
export type GameView = {
  matchId: string;
  roundNumber: number;
  roundStatus: RoundStatus;
  table: number;
  status: MatchStatus;
  scenario: string | null;
  turns: number;
  players: GamePlayer[];
  bye: boolean;
  reportedA: number | null;
  reportedB: number | null;
  reportedBy: string | null;
  canFinish: boolean;
  canSetScenario: boolean;
  timer: RoundTimer | null;
  judgeCalled: boolean;
  canCallJudge: boolean;
};
export type StandingRow = {
  position: number;
  userId: string;
  displayName: string;
  wins: number;
  draws: number;
  losses: number;
  bigPoints: number;
  penaltyPoints: number;
  totalBigPoints: number;
  smallPoints: number;
  played: number;
  dropped: boolean;
  /** Reached the knockout bracket / already knocked out. */
  knockout: boolean;
  eliminated: boolean;
};
export type TeamStandingRow = {
  position: number;
  teamId: string;
  name: string;
  wins: number;
  draws: number;
  losses: number;
  gameWins: number;
  bigPoints: number;
  penaltyPoints: number;
  totalBigPoints: number;
  smallPoints: number;
  played: number;
  dropped: boolean;
  knockout: boolean;
  eliminated: boolean;
};
export type TeamMemberStatus = "INVITED" | "ACCEPTED";
export type TeamMember = { userId: string; displayName: string; status: TeamMemberStatus; position: number };
export type Team = {
  id: string;
  name: string;
  captainId: string;
  captainName: string;
  members: TeamMember[];
  complete: boolean;
  dropped: boolean;
  seed: number | null;
  canManage: boolean;
};
export type TeamInvitation = { teamId: string; teamName: string; captainName: string };
export type TeamsData = {
  teamSize: number | null;
  teams: Team[];
  invitations: TeamInvitation[];
  myTeamId: string | null;
  canCreate: boolean;
};
export type JudgeCall = {
  id: string;
  matchId: string;
  roundNumber: number;
  table: number;
  players: string;
  requestedBy: string;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
};
export const TEAM_SIZES = [2, 3, 4, 5] as const;
export type Penalty = { id: string; userId: string; displayName: string; bigPoints: number; reason: string };
export type StandingsData = { rows: StandingRow[]; penalties: Penalty[] };

export const LIST_STATUSES: ListStatus[] = ["NOT_SUBMITTED", "SUBMITTED", "APPROVED", "NEEDS_FIX"];

export type TournamentSummary = {
  id: string;
  name: string;
  startsAt: string;
  city: string;
  venueName: string | null;
  rank: TournamentRank;
  format: TournamentFormat;
  status: TournamentStatus;
  maxPlayers: number | null;
  registeredCount: number;
  pointsLimit: number | null;
  organizerName: string;
  /** Marked official by the publisher: counts towards season rankings. */
  official: boolean;
};

export type TournamentDetail = {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  address: string | null;
  city: string;
  country: string;
  entryFeeAmount: number | null;
  entryFeeCurrency: string | null;
  rank: TournamentRank;
  format: TournamentFormat;
  maxPlayers: number | null;
  pointsLimit: number | null;
  roundsPlanned: number | null;
  listDeadline: string | null;
  status: TournamentStatus;
  organizer: { id: string; displayName: string };
  registeredCount: number;
  waitlistCount: number;
  myStatus: ParticipantStatus | null;
  canManage: boolean;
  settings: TournamentSettings;
  roundsCount: number;
  roundPlans: RoundPlan[];
  official: boolean;
};

export type Participant = {
  id: string;
  userId: string;
  displayName: string;
  status: ParticipantStatus;
  registeredAt: string;
  paid: boolean | null;
  listStatus: ListStatus | null;
  club: string | null;
  city: string | null;
  dropped: boolean;
};

export type AuditItem = { at: string; actorName: string; action: string; details: string | null };

export type Page<T> = { items: T[]; page: number; size: number; total: number };

export type TournamentInput = TournamentSettings & {
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  address: string | null;
  city: string;
  country: string;
  entryFeeAmount: number | null;
  entryFeeCurrency: string | null;
  rank: TournamentRank;
  format: TournamentFormat;
  maxPlayers: number | null;
  pointsLimit: number | null;
  roundsPlanned: number | null;
  listDeadline: string | null;
  roundPlans: RoundPlan[];
};

/** ISO instant -> value for <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
