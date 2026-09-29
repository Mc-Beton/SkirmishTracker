// Publisher / operator reports (GET /api/admin/reports/meta). Aggregates only – see MetaStats on the backend.

export type Rate = {
  n: number;
  wins: number;
  draws: number;
  losses: number;
  /** (wins + draws / 2) / n, 0–1 */
  score: number;
  /** 95% Wilson interval */
  low: number;
  high: number;
  /** mean score the players' ELO predicted */
  expected: number;
  /** score − expected */
  performance: number;
  /** n ≥ thresholds.minSample */
  enough: boolean;
};

export type FactionRow = { faction: string; players: number; sides: number; share: number; avgElo: number; rate: Rate };
export type Cell = { row: string; col: string; players: number; rate: Rate };
export type UnitRow = { faction: string; unit: string; players: number; pickRate: number; with: Rate; without: Rate };
export type ItemRow = {
  faction: string;
  item: string;
  players: number;
  pickRate: number;
  avgCopies: number;
  reducedShare: number;
  leaderShare: number;
  topUnit: string | null;
  topUnitShare: number;
  with: Rate;
  without: Rate;
};
export type ItemCount = { faction: string; item: string; lists: number };
export type GearRow = { faction: string; lists: number; players: number; avgItems: number; avgItemShare: number };
/** Gear buckets by item copies per list: LIGHT 0–1, MEDIUM 2–3, HEAVY 4+. */
export const GEAR_LOADS = ["LIGHT", "MEDIUM", "HEAVY"] as const;
/** Below this pick rate an available item counts as (almost) never used. */
export const DEAD_ITEM_PICK = 0.02;
/** From this share of copies on one character the item's effect cannot be told apart from it. */
export const INSEPARABLE_SHARE = 0.8;

export type MissionRow = {
  mission: string;
  games: number;
  players: number;
  drawRate: number;
  avgWinnerVp: number;
  avgLoserVp: number;
  avgMargin: number;
};
export type TurnAvg = { turn: number; scenario: number; scheme: number };
export type Flow = {
  games: number;
  decided: number;
  turns: number;
  /** decidedBy[t-1]: decided games whose winner led from the end of turn t to the end */
  decidedBy: number[];
  comebacks: number;
  comebackTurn: number;
  byTurn: TurnAvg[];
};
export type FactionFlow = { faction: string; games: number; players: number; scenarioVp: number; schemeVp: number };
export type SchemeRow = { scheme: string; drawn: number; kept: number; players: number; keepRate: number; avgSchemeVp: number; rate: Rate };

export type MonthRow = { month: string; games: number; activePlayers: number; newPlayers: number; tournaments: number };

export type MetaReport = {
  summary: {
    games: number;
    players: number;
    tournaments: number;
    tournamentGames: number;
    ownGames: number;
    gamesWithFactions: number;
    gamesWithLists: number;
    gamesWithMission: number;
    mirrorGames: number;
    draws: number;
    first: string | null;
    last: string | null;
    hiddenRows: number;
  };
  factions: FactionRow[];
  matchups: Cell[];
  units: UnitRow[];
  items: ItemRow[];
  itemCounts: ItemCount[];
  gear: GearRow[];
  gearResults: Cell[];
  missions: MissionRow[];
  factionMissions: Cell[];
  flow: Flow;
  factionFlow: FactionFlow[];
  schemes: SchemeRow[];
  months: MonthRow[];
  thresholds: { minPlayers: number; minSample: number };
};

export type MetaResponse = {
  report: MetaReport;
  countries: string[];
  firstGame: string | null;
  lastGame: string | null;
  generatedAt: string;
};

export type ReportFilter = {
  from: string;
  to: string;
  source: "" | "TOURNAMENT" | "OWN";
  country: string;
  tier: "" | "LOCAL" | "MASTER" | "INTERNATIONAL";
  minElo: string;
};

export const EMPTY_FILTER: ReportFilter = { from: "", to: "", source: "", country: "", tier: "", minElo: "" };

export function reportRoles(roles: string[] | undefined): boolean {
  return !!roles?.some((r) => r === "ADMIN" || r === "PUBLISHER");
}

export function reportQuery(f: ReportFilter): string {
  const p = new URLSearchParams();
  (Object.keys(f) as (keyof ReportFilter)[]).forEach((k) => {
    if (f[k]) p.set(k, f[k]);
  });
  const s = p.toString();
  return `/api/admin/reports/meta${s ? `?${s}` : ""}`;
}

/** Signal of a rate against a reference (0.5 for raw results, expected for performance): only when the 95% interval excludes it. */
export function signal(rate: Rate, reference: number): "above" | "below" | "none" {
  if (rate.low > reference) return "above";
  if (rate.high < reference) return "below";
  return "none";
}

/**
 * Change of a score between two periods (after − before) and whether it is statistically significant
 * (two-proportion z-test at 95%); "none" when either period has no games.
 */
export function change(before: Rate | undefined, after: Rate | undefined): { delta: number; signal: "up" | "down" | "none" } | null {
  if (!before || !after || before.n === 0 || after.n === 0) return null;
  const delta = after.score - before.score;
  const se = Math.sqrt((before.score * (1 - before.score)) / before.n + (after.score * (1 - after.score)) / after.n);
  const significant = se > 0 ? Math.abs(delta) > 1.96 * se : delta !== 0;
  return { delta, signal: !significant ? "none" : delta > 0 ? "up" : "down" };
}

/** The day before an ISO date (yyyy-mm-dd), for "before the change" ranges. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
/** Percentage points with sign, e.g. +4,2 pp. */
export const pp = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v * 100).toFixed(1)} pp`;

// ------------------------------------------------------------------ CSV

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formulas (CSV injection) and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

export function downloadCsv(name: string, csv: string) {
  // BOM so Excel opens UTF-8 (Polish characters) correctly.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const rateCols = (r: Rate) => [r.n, r.wins, r.draws, r.losses, r.score, r.low, r.high, r.expected, r.performance];
const RATE_HEAD = ["games", "wins", "draws", "losses", "score", "ci_low", "ci_high", "elo_expected", "performance"];

/** One CSV per section, names in English (stable for spreadsheets). */
export function reportCsv(report: MetaReport, section: "factions" | "matchups" | "units" | "items" | "gear" | "flow" | "schemes" | "missions" | "factionMissions" | "months"): string {
  switch (section) {
    case "factions":
      return toCsv(["faction", "players", "sides", "share", "avg_elo", ...RATE_HEAD],
        report.factions.map((f) => [f.faction, f.players, f.sides, f.share, f.avgElo, ...rateCols(f.rate)]));
    case "matchups":
      return toCsv(["faction", "opponent", "players", ...RATE_HEAD],
        report.matchups.map((c) => [c.row, c.col, c.players, ...rateCols(c.rate)]));
    case "factionMissions":
      return toCsv(["faction", "mission", "players", ...RATE_HEAD],
        report.factionMissions.map((c) => [c.row, c.col, c.players, ...rateCols(c.rate)]));
    case "units":
      return toCsv(["faction", "unit", "players", "pick_rate", ...RATE_HEAD.map((h) => `with_${h}`), ...RATE_HEAD.map((h) => `without_${h}`)],
        report.units.map((u) => [u.faction, u.unit, u.players, u.pickRate, ...rateCols(u.with), ...rateCols(u.without)]));
    case "items":
      return toCsv(["faction", "item", "players", "pick_rate", "avg_copies", "reduced_share", "leader_share", "top_unit", "top_unit_share",
        ...RATE_HEAD.map((h) => `with_${h}`), ...RATE_HEAD.map((h) => `without_${h}`)],
        report.items.map((i) => [i.faction, i.item, i.players, i.pickRate, i.avgCopies, i.reducedShare, i.leaderShare, i.topUnit,
          i.topUnitShare, ...rateCols(i.with), ...rateCols(i.without)]));
    case "gear":
      return toCsv(["faction", "load", "players", ...RATE_HEAD, "lists", "avg_items", "avg_item_share"],
        report.gearResults.map((c) => {
          const g = report.gear.find((x) => x.faction === c.row);
          return [c.row, c.col, c.players, ...rateCols(c.rate), g?.lists, g?.avgItems, g?.avgItemShare];
        }));
    case "flow":
      return [
        toCsv(["turn", "avg_scenario_vp", "avg_scheme_vp", "games_decided_from_turn"],
          report.flow.byTurn.map((b) => [b.turn, b.scenario, b.scheme, report.flow.decidedBy[b.turn - 1] ?? 0])),
        "",
        toCsv(["faction", "games", "players", "avg_scenario_vp", "avg_scheme_vp"],
          report.factionFlow.map((f) => [f.faction, f.games, f.players, f.scenarioVp, f.schemeVp])),
      ].join("\n");
    case "schemes":
      return toCsv(["scheme", "drawn", "kept", "players", "keep_rate", "avg_scheme_vp", ...RATE_HEAD],
        report.schemes.map((x) => [x.scheme, x.drawn, x.kept, x.players, x.keepRate, x.avgSchemeVp, ...rateCols(x.rate)]));
    case "missions":
      return toCsv(["mission", "games", "players", "draw_rate", "avg_winner_vp", "avg_loser_vp", "avg_margin"],
        report.missions.map((m) => [m.mission, m.games, m.players, m.drawRate, m.avgWinnerVp, m.avgLoserVp, m.avgMargin]));
    case "months":
      return toCsv(["month", "games", "active_players", "new_players", "tournaments"],
        report.months.map((m) => [m.month, m.games, m.activePlayers, m.newPlayers, m.tournaments]));
  }
}
