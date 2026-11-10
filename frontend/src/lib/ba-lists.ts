import type { ListStatus } from "@/lib/tournaments";

/** A Bolt Action tournament list (nation, declarations, list as text and/or PDF). */
export type BaList = {
  userId: string;
  displayName: string;
  nation: string;
  points: number;
  orderDice: number;
  platoons: number;
  text: string | null;
  pdfName: string | null;
  pdfSize: number | null;
  status: ListStatus;
  updatedAt: string;
  editable: boolean;
};

export type MyBaList = {
  list: BaList | null;
  editable: boolean;
  pointsLimit: number | null;
  maxOrderDice: number | null;
  maxPlatoons: number | null;
  listDeadline: string | null;
};

export type BaListSummary = {
  userId: string;
  displayName: string;
  nation: string;
  points: number;
  orderDice: number;
  platoons: number;
  hasPdf: boolean;
  hasText: boolean;
  status: ListStatus;
  updatedAt: string;
};

export type BaListInput = { nation: string; points: number; orderDice: number; platoons: number; text: string | null };

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_LIST_TEXT = 20_000;

/** Base path of one player's list ("me" for the caller's own list). */
export const baListPath = (tournamentId: string, who: string) => `/api/tournaments/${tournamentId}/ba-lists/${who}`;
