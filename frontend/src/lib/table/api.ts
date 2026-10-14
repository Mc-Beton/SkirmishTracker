// Online table: types of the backend views and small API helpers (docs/online-play.md).

import { api } from "@/lib/api";
import type { Env, Size, Vec } from "./geometry.ts";
import type { Area, Placement, Shape } from "./terrain.ts";

export const imageUrl = (id: string) => `/api/table/images/${id}`;

// ---------------------------------------------------------------- library

export type ImageInfo = { id: string; contentType: string; widthPx: number; heightPx: number };

export type Background = {
  id: string;
  name: string;
  imageId: string;
  widthIn: number;
  heightIn: number;
  areas: Area[];
  active: boolean;
};

export type TerrainCategory = "RUIN" | "BUILDING" | "TREE" | "FOREST" | "WATER" | "ROCK" | "WALL" | "OTHER";
export const TERRAIN_CATEGORIES: TerrainCategory[] = ["RUIN", "BUILDING", "TREE", "FOREST", "WATER", "ROCK", "WALL", "OTHER"];

export type TerrainPiece = {
  id: string;
  name: string;
  category: TerrainCategory;
  imageId: string;
  widthIn: number;
  heightIn: number;
  shapes: Shape[];
  active: boolean;
};

export type Author = { id: string; name: string };

export type MapScope = "OFFICIAL" | "PUBLIC" | "MINE";

export type MapSummary = {
  id: string;
  name: string;
  author: Author | null;
  official: boolean;
  isPublic: boolean;
  mine: boolean;
  backgroundId: string;
  backgroundImageId: string | null;
  pieces: number;
  updatedAt: string;
};

export type MapView = {
  id: string;
  name: string;
  author: Author | null;
  official: boolean;
  isPublic: boolean;
  mine: boolean;
  background: Background;
  placements: Placement[];
  deploymentDepth: number;
  terrain: TerrainPiece[];
};

export type MapInput = {
  name: string;
  backgroundId: string;
  placements: Placement[];
  deploymentDepth: number;
  isPublic: boolean;
  official: boolean;
};

/** Environments a map or piece area can have, in the order shown in editors. */
export const AREA_ENVS: Env[] = [
  "AQUATIC_SHALLOW", "AQUATIC_DEEP", "FOREST", "DIFFICULT", "MOUNTAINOUS", "DENSE", "HAZY", "DARK", "SWAMP",
  "DANGEROUS", "UNSCALABLE", "TOXIC", "FREEZING", "SCORCHING", "SACRED_GROUND", "PROFANE_MIASMA", "MANAGMATIC",
];

/** Uploads a picture as the raw request body (admin only); the server checks the bytes. */
export const uploadImage = (file: File) => api<ImageInfo>("POST", "/api/admin/table/images", file);

// ---------------------------------------------------------------- game

export type ModelState =
  | "BLEEDING" | "BLINDED" | "CONFUSED" | "CRIPPLED" | "CROUCHED" | "DEAD" | "ENGAGED" | "FATIGUED" | "FLYING"
  | "IMMOBILIZED" | "INCAPACITATED" | "PANICKED" | "POISONED" | "SHROUDED" | "SLOWED" | "WEAKENED";

/** States players toggle by hand (Incapacitated and Dead follow HP; Engaged also follows movement). */
export const MODEL_STATES: ModelState[] = [
  "CROUCHED", "FLYING", "ENGAGED", "BLEEDING", "POISONED", "BLINDED", "CONFUSED", "CRIPPLED", "SLOWED", "WEAKENED",
  "FATIGUED", "IMMOBILIZED", "PANICKED", "SHROUDED", "INCAPACITATED", "DEAD",
];

export type Stat = "STA" | "SPD" | "ARM" | "HP" | "OFF" | "DEF" | "ACC" | "INT" | "AG" | "T" | "M";
export const CARD_STATS: Stat[] = ["STA", "SPD", "ARM", "HP"];
export const ATTRIBUTES: Stat[] = ["OFF", "DEF", "ACC", "INT", "AG", "T", "M"];

export type TableModel = {
  id: string;
  side: 0 | 1;
  code: string;
  name: string;
  size: Size;
  baseMm: number;
  heightMm: number;
  mount: string | null;
  deployed: boolean;
  x: number | null;
  y: number | null;
  facing: number;
  hp: number;
  maxHp: number;
  ap: number;
  states: ModelState[];
  base: Record<Stat, number>;
  stats: Record<Stat, number>;
  keywords: string[];
  classes: string[];
  faction: string | null;
};

export type LogEntry = { seq: number; side: number; type: string; data: Record<string, unknown>; at: string; undone: boolean };

export type TokenKind = "INTRIGUE" | "CACHE" | "SIGIL" | "OBJECTIVE" | "TREASURE" | "MARKER";
export const TOKEN_KINDS: TokenKind[] = ["INTRIGUE", "CACHE", "SIGIL", "OBJECTIVE", "TREASURE", "MARKER"];

export type TableToken = { id: string; kind: TokenKind; x: number; y: number; label: string | null };
export type TableTemplate = {
  id: string; kind: "CIRCLE_S" | "CIRCLE_L" | "SPRAY_S" | "SPRAY_L"; x: number; y: number; rotation: number;
  modelId: string | null; label: string | null; side: number;
};
export type PartyView = {
  side: 0 | 1; faction: string; leaderInt: number; leaderId: string | null;
  drawn: { scheme: string; roll: number }[]; kept: string | null;
};

export type TableView = {
  id: string;
  status: "WAITING" | "SETUP" | "PLAYING" | "FINISHED";
  mapName: string;
  questCode: string | null;
  parties: PartyView[];
  tokens: TableToken[];
  templates: TableTemplate[];
  vp: { side: 0 | 1; round: number; scenario: number; scheme: number }[];
  vpTotal: [number, number];
  endProposedBy: 0 | 1 | null;
  reportedGameId: string | null;
  field: { widthIn: number; heightIn: number; deploymentDepth: number; deployment: "STANDARD" | "CORNER"; cornerRadius: number };
  background: { imageId: string; widthIn: number; heightIn: number };
  /** `id` names the piece (free game: move / remove it), `scale` is already applied to the size. */
  placements: { assetId: string; imageId: string | null; widthIn: number; heightIn: number; x: number; y: number; rotation: number;
    id: string; scale: number; name: string | null }[];
  terrain: { id: string; kind: "OBSTACLE" | "AREA"; points: Vec[]; height: number; envs: Env[] }[];
  players: { side: 0 | 1; userId: string; name: string }[];
  you: -1 | 0 | 1;
  game: {
    status: "SETUP" | "PLAYING" | "FINISHED";
    round: number;
    active: 0 | 1;
    turnInRound: number;
    firstPlayer: 0 | 1 | null;
    ready: [boolean, boolean];
    activation: { id: string; mode: "WALK" | "RUN" | null; spent: number; walk: number; run: number } | null;
    winner: number | null;
    endReason: string | null;
  };
  models: TableModel[];
  log: LogEntry[];
  canUndo: boolean;
  seq: number;
  measureMode: MeasureMode;
  role: TableRole;
  observersAllowed: boolean;
  judge: { side: number; userId: string; name: string } | null;
  /** The player who created the table manages links and observers. */
  creator: boolean;
  /** For the creator: the player invited by name while the seat is free. */
  invited: { side: number; userId: string; name: string } | null;
  /** STANDARD: map and lists up front; SANDBOX: a free game built during play. */
  mode: TableMode;
  /** Free game with no opponent yet: you play both sides. */
  solo: boolean;
  /** Free game: the chosen mat. */
  backgroundId: string | null;
};

/** Core Rules p.18 – what the players may pre-measure. */
export type MeasureMode = "ASSISTED" | "STANDARD" | "REALISM";
export const MEASURE_MODES: MeasureMode[] = ["ASSISTED", "STANDARD", "REALISM"];
export type TableRole = "PLAYER" | "JUDGE" | "OBSERVER" | "ADMIN";
export type InviteKind = "PLAYER" | "JUDGE" | "WATCH";

/** Side of the judge's steps in the log. */
export const JUDGE_SIDE = 2;

export type CreatedTable = { id: string; invite: string; judgeInvite: string | null; watchInvite: string | null };

/** Link for an invitation of the given kind. */
export function inviteLink(kind: InviteKind, token: string): string {
  const as = kind === "PLAYER" ? "" : `&as=${kind === "JUDGE" ? "judge" : "watch"}`;
  return `${window.location.origin}/tables/join?invite=${encodeURIComponent(token)}${as}`;
}

/** An invitation by name, as the invited player sees it before accepting. */
export type TableInvitation = {
  id: string;
  mapName: string;
  questCode: string | null;
  measureMode: MeasureMode;
  deployment: "STANDARD" | "CORNER";
  from: { side: number; userId: string; name: string };
  invitedAt: string;
  mode: TableMode;
};

export type TableMode = "STANDARD" | "SANDBOX";

/** A model profile for the free game's model list. */
export type ProfileView = { code: string; name: string; size: Size; factions: string[]; classes: string[] };

export type TableSummary = {
  id: string;
  status: TableView["status"];
  mapName: string;
  playerA: { side: number; userId: string; name: string };
  playerB: { side: number; userId: string; name: string } | null;
  yourSide: number;
  role: TableRole;
  updatedAt: string;
  mode: TableMode;
};

/** A command for POST /api/tables/{id}/commands (flat, `type` picks the command). */
export type TableCommand =
  | { type: "FIRST_PLAYER"; side: 0 | 1 }
  | { type: "DEPLOY"; id: string; x: number; y: number; facing: number }
  | { type: "READY" }
  | { type: "ACTIVATE"; id: string }
  | { type: "MOVE"; id: string; mode: "WALK" | "RUN"; waypoints: Vec[] }
  | { type: "FREE_MOVE"; id: string; x: number; y: number; facing: number }
  | { type: "ROTATE"; id: string; facing: number }
  | { type: "REACT"; id: string }
  | { type: "ROLL"; label?: string; id?: string; count: number; target?: number }
  | { type: "HP"; id: string; delta: number }
  | { type: "STATE"; id: string; state: ModelState; on: boolean }
  | { type: "AP"; id: string; ap: number }
  | { type: "END_ACTIVATION" }
  | { type: "END_TURN" }
  | { type: "UNDO"; toSeq?: number }
  | { type: "CONCEDE" }
  | { type: "DRAW_SCHEMES" }
  | { type: "KEEP_SCHEME"; scheme: string }
  | { type: "PLACE_TOKEN"; kind: TokenKind; x: number; y: number; label?: string }
  | { type: "MOVE_TOKEN"; id: string; x: number; y: number }
  | { type: "REMOVE_TOKEN"; id: string }
  | { type: "VP"; side: 0 | 1; round: number; vpScenario: number; vpScheme: number }
  | { type: "PLACE_TEMPLATE"; kind: TableTemplate["kind"]; x: number; y: number; facing: number; id?: string; label?: string }
  | { type: "REMOVE_TEMPLATE"; id: string }
  | { type: "END_GAME" }
  // free game
  | { type: "ADD_MODEL"; ref: string; side: 0 | 1; x: number; y: number; facing: number }
  | { type: "REMOVE_MODEL"; id: string }
  | { type: "SET_BACKGROUND"; ref: string }
  | { type: "PLACE_TERRAIN"; ref: string; x: number; y: number; facing: number; scale: number }
  | { type: "MOVE_TERRAIN"; id: string; x: number; y: number; facing: number; scale: number }
  | { type: "REMOVE_TERRAIN"; id: string }
  | { type: "SET_ROUND"; round: number }
  | { type: "SET_QUEST"; ref?: string }
  | { type: "PICK_SCHEME"; side: 0 | 1; scheme: string };

/** `asSide`: in a free game played alone, the side you act for (ignored otherwise). */
export const sendCommand = (tableId: string, cmd: TableCommand, asSide?: 0 | 1) =>
  api<TableView>("POST", `/api/tables/${tableId}/commands`, asSide == null ? cmd : { ...cmd, asSide });
