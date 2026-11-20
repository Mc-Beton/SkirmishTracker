// Tables that play by the game engine (frontend/src/lib/eld): what the backend sends and how commands go out.

import { api } from "@/lib/api";
import type { Command, GameEvent } from "@/lib/eld/types.ts";
import type { Env, Vec } from "./geometry.ts";
import type { TableRole } from "./api";

/** A player's Scheme cards. Only the owner gets them (both hands while playing alone). */
export type SchemeHand = { options: string[]; kept: string | null };
export type Hands = [SchemeHand | null, SchemeHand | null];

export type GamePlayer = { side: number; userId: string; name: string };

/** What the page needs besides the events: pictures of the map, who sits where, what the viewer is. */
export type GameMeta = {
  id: string;
  status: "WAITING" | "SETUP" | "PLAYING" | "FINISHED";
  mapName: string;
  /** WarBracket quest code (the engine runs some Quests itself, the rest is scored by hand). */
  questCode: string | null;
  deployment: "STANDARD" | "CORNER";
  deploymentDepth: number;
  background: { imageId: string | null; widthIn: number; heightIn: number };
  placements: { assetId: string; imageId: string | null; widthIn: number; heightIn: number; x: number; y: number; rotation: number;
    id: string; scale: number; name: string | null }[];
  /** Rules shapes of the map with all their Environments (the engine itself knows Shallow Water and Forest). */
  terrain: { id: string; kind: "OBSTACLE" | "AREA"; points: Vec[]; height: number; envs: Env[] }[];
  players: GamePlayer[];
  you: -1 | 0 | 1;
  role: TableRole;
  creator: boolean;
  invited: GamePlayer | null;
  observersAllowed: boolean;
  reportedGameId: string | null;
  /** 2D: a WarBracket map from above; 3D: a map of the game drawn with models (chosen when the table was created). */
  viewMode: "2D" | "3D";
  /** The table plays on a map of the game (built-in or made by an admin): its field, ground and models are in the
   *  state, not in the library. With viewMode "2D" it is the 2D version of that map only. */
  gameMap: string | null;
};

export type GameView = { meta: GameMeta; events: GameEvent[]; hands: Hands; seq: number };

export const fetchEngine = (tableId: string) => api<{ engine: "LEGACY" | "GAME" }>("GET", `/api/tables/${tableId}/engine`);

/** The table and its events after `after` (0: all of them). */
export const fetchGame = (tableId: string, after = 0) => api<GameView>("GET", `/api/tables/${tableId}/game?after=${after}`);

export const sendGameCommand = (tableId: string, cmd: Command) =>
  api<{ seq: number }>("POST", `/api/tables/${tableId}/game/commands`, cmd);
