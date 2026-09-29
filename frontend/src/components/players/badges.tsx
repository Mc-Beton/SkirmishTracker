"use client";

import { useTranslations } from "next-intl";
import {
  BadgeCheck, CalendarCheck, Crown, Flame, Footprints, Globe, Medal, Shield, Shuffle, Star, Swords, Trophy, type LucideIcon,
} from "lucide-react";
import type { Badge, BadgeCode } from "@/lib/players";
import { cn } from "@/lib/utils";

const ICONS: Record<BadgeCode, LucideIcon> = {
  FIRST_GAME: Footprints,
  VETERAN: Shield,
  LEGEND: Star,
  WIN_STREAK: Flame,
  GIANT_SLAYER: Swords,
  TOURNAMENT_WINNER: Trophy,
  PODIUM: Medal,
  OFFICIAL_CHAMPION: Crown,
  GLOBETROTTER: Globe,
  FACTION_MASTER: BadgeCheck,
  ALL_ROUNDER: Shuffle,
  ORGANIZER: CalendarCheck,
};

/** Earned badges first (accent colour), locked ones muted with their progress. */
export function Badges({ badges }: { badges: Badge[] }) {
  const t = useTranslations("players.badges");
  const sorted = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned));
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {sorted.map((b) => {
        const Icon = ICONS[b.code];
        return (
          <li key={b.code} title={t(`${b.code}.hint`, { target: b.target })}
            className={cn("grid content-start gap-1.5 rounded-xl border p-3", b.earned ? "border-primary/50 bg-accent/40" : "bg-card opacity-70")}>
            <span className="flex items-center gap-2">
              <Icon aria-hidden className={cn("size-5 shrink-0", b.earned ? "text-primary" : "text-muted-foreground")} />
              <span className="text-sm font-medium leading-tight">{t(`${b.code}.name`)}</span>
            </span>
            <span className="text-xs text-muted-foreground">{t(`${b.code}.hint`, { target: b.target })}</span>
            {!b.earned && b.target > 1 && (
              <span className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
                <span className="h-1.5 flex-1 rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-muted-foreground/60" style={{ width: `${(b.progress / b.target) * 100}%` }} />
                </span>
                {b.progress}/{b.target}
              </span>
            )}
            <span className="sr-only">{b.earned ? t("earned") : t("locked")}</span>
          </li>
        );
      })}
    </ul>
  );
}
