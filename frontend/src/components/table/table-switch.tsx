"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GameTable } from "@/components/table/game/game-table";
import { TablePlay } from "@/components/table/table-play";
import { fetchEngine } from "@/lib/table/game-api";

/**
 * A table plays by one of two engines: the game engine (standard tables) or the first online table (free game
 * and tables started before). Which one decides the panel. When the question fails (no access, not signed in),
 * the first panel shows the reason as it always did.
 */
export function TableSwitch({ tableId }: { tableId: string }) {
  const t = useTranslations("gameTable");
  const [engine, setEngine] = useState<"LEGACY" | "GAME" | null>(null);
  useEffect(() => {
    let active = true;
    fetchEngine(tableId).then(
      (r) => {
        if (active) setEngine(r.engine);
      },
      () => {
        if (active) setEngine("LEGACY");
      },
    );
    return () => {
      active = false;
    };
  }, [tableId]);
  if (!engine) return <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>;
  return engine === "GAME" ? <GameTable tableId={tableId} /> : <TablePlay tableId={tableId} />;
}
