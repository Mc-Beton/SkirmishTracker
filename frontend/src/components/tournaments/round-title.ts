import type { Round } from "@/lib/tournaments";

type T = (key: string, values?: Record<string, string | number>) => string;

/** "Runda 3", or for knockout rounds "Półfinał" / "1/8 finału" (t = tournaments.rounds translator). */
export function roundTitle(t: T, r: Pick<Round, "number" | "phase" | "stage">): string {
  if (r.phase !== "KNOCKOUT" || !r.stage) return t("round", { n: r.number });
  if (r.stage.startsWith("ROUND_OF_")) return t("stage.ROUND_OF", { n: Number(r.stage.slice("ROUND_OF_".length)) / 2 });
  return t(`stage.${r.stage}`);
}
