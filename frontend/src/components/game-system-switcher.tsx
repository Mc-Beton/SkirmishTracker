"use client";

import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { useGameSystem } from "@/components/game-system-provider";
import { GAME_SYSTEMS, type GameSystem } from "@/lib/game-system";

/** Compact system picker shown under the WarBracket logo. */
export function GameSystemSwitcher() {
  const t = useTranslations("system");
  const { system, switching, switchTo } = useGameSystem();
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t("label")}</span>
      <select value={system} title={t(`name.${system}`)} disabled={switching} onChange={(e) => switchTo(e.target.value as GameSystem)}
        className="h-4 max-w-[6.5rem] cursor-pointer truncate sm:h-5 sm:max-w-none appearance-none rounded border-0 bg-transparent py-0 pr-4 pl-0 text-[11px] leading-4 font-medium sm:leading-5 tracking-wide text-primary uppercase focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none">
        {GAME_SYSTEMS.map((s) => <option key={s} value={s} className="bg-card text-foreground normal-case">{t(`short.${s}`)}</option>)}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-0 size-3 text-primary" />
    </label>
  );
}
