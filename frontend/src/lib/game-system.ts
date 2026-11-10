// Game systems of the app. The chosen one lives in a cookie (read by the root layout, so the theme is right
// on the first paint) and decides which tournaments, leagues and ranking the lists show.

export type GameSystem = "ELDFALL" | "BOLT_ACTION";
export const GAME_SYSTEMS: GameSystem[] = ["ELDFALL", "BOLT_ACTION"];
export const DEFAULT_SYSTEM: GameSystem = "ELDFALL";
export const SYSTEM_COOKIE = "WB_SYSTEM";

export function isGameSystem(value: string | undefined | null): value is GameSystem {
  return !!value && (GAME_SYSTEMS as string[]).includes(value);
}

/** Value of the html data-system attribute (CSS theme switch). */
export function themeOf(system: GameSystem): string {
  return system === "BOLT_ACTION" ? "bolt-action" : "eldfall";
}

/** Theme colour of the browser UI (PWA status bar). */
export function themeColorOf(system: GameSystem): string {
  return system === "BOLT_ACTION" ? "#f4f2ea" : "#0a0f1f";
}

/** Pages that exist only for Eldfall (information modules, online play, official program, own games). */
export const ELDFALL_ONLY_PATHS = ["/scenarios", "/seasons", "/games", "/lists", "/tables", "/maps", "/admin/table",
  "/admin/reports"];

export function isEldfallOnlyPath(pathname: string): boolean {
  return ELDFALL_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// ---------------------------------------------------------------- Bolt Action reference data

/** Nations with an "Armies of…" book or an official PDF list (codes match the backend). */
export const BA_NATIONS = [
  "GERMANY", "UNITED_STATES", "GREAT_BRITAIN", "BRITISH_COMMONWEALTH", "SOVIET_UNION", "IMPERIAL_JAPAN", "ITALY",
  "FRANCE", "POLAND", "FINLAND", "HUNGARY", "ROMANIA", "BULGARIA", "GREECE", "NORWAY", "BELGIUM", "NETHERLANDS",
  "PARTISANS", "OTHER",
] as const;
export type BaNation = (typeof BA_NATIONS)[number];

/** Victory conditions of the Third Edition scenario generator. */
export const BA_SCENARIOS = [
  "BA_SEEK_AND_DESTROY", "BA_KEY_POSITIONS", "BA_BREAKTHROUGH", "BA_TOP_SECRET", "BA_DEMOLITION",
  "BA_HOLD_UNTIL_RELIEVED",
] as const;

export type ListVisibility = "AFTER_DEADLINE" | "AFTER_FIRST_PAIRINGS" | "PUBLIC" | "HIDDEN";
export const LIST_VISIBILITIES: ListVisibility[] = ["AFTER_FIRST_PAIRINGS", "AFTER_DEADLINE", "PUBLIC", "HIDDEN"];
