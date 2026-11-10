"use client";

import { useEffect, useState } from "react";
import { WarbandEditor } from "@/components/warbands/warband-editor";
import { api } from "@/lib/api";
import type { GameSystem } from "@/lib/game-system";
import type { TournamentDetail } from "@/lib/tournaments";
import { BaListEditor } from "./ba-list-editor";

/** List page of a tournament: the Eldfall warband builder or the Bolt Action list form, by the tournament's system. */
export function TournamentListPage({ tournamentId, userId }: { tournamentId: string; userId?: string }) {
  const [system, setSystem] = useState<GameSystem | null>(null);
  useEffect(() => {
    let active = true;
    api<TournamentDetail>("GET", `/api/tournaments/${tournamentId}`)
      .then((d) => active && setSystem(d.gameSystem))
      // Errors (not found, draft) are shown by the editor itself.
      .catch(() => active && setSystem("ELDFALL"));
    return () => {
      active = false;
    };
  }, [tournamentId]);
  if (!system) return null;
  return system === "BOLT_ACTION"
    ? <BaListEditor tournamentId={tournamentId} userId={userId} />
    : <WarbandEditor tournamentId={tournamentId} userId={userId} />;
}
