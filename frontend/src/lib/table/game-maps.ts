// Maps of the game for the online table: the built-in ones (lib/eld/maps.ts) and the ones an admin made in the
// map creator (stored by the backend). Each is a pair: played in 3D, or as the same map from above in 2D.

import { api } from "@/lib/api";
import type { Placement } from "@/lib/eld/maps.ts";

export type StoredGameMap = { id: string; name: string; base: string; items: Placement[]; published: boolean; updatedAt: string };
export type GameMapInput = { name: string; base: string; items: Placement[]; published: boolean };
export type GameMapChoice = { id: string; name: string };

/** At most this many elements with a model on one map (the rules service enforces it). */
export const MAX_MODELS = 12;

export const fetchGameMaps = (all = false) => api<StoredGameMap[]>("GET", `/api/table/game-maps${all ? "?all=true" : ""}`);
export const saveGameMap = (id: string | null, body: GameMapInput) =>
  id ? api<StoredGameMap>("PUT", `/api/admin/table/game-maps/${id}`, body) : api<StoredGameMap>("POST", "/api/admin/table/game-maps", body);
export const deleteGameMap = (id: string) => api<void>("DELETE", `/api/admin/table/game-maps/${id}`);

/**
 * What a player can pick for a table: the maps an admin published. The five maps that come with the game are not
 * offered (they stay in the engine, and the admin creator can still start a map from one of them).
 */
export const gameMapChoices = (stored: StoredGameMap[]): GameMapChoice[] => stored.filter((m) => m.published).map((m) => ({ id: m.id, name: m.name }));
