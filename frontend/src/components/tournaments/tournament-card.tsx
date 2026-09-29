"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { OfficialBadge, RankBadge, StatusBadge } from "@/components/tournaments/status-badge";
import type { TournamentSummary } from "@/lib/tournaments";

export function TournamentCard({ tournament: t }: { tournament: TournamentSummary }) {
  const tr = useTranslations("tournaments");
  const format = useFormatter();
  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="group grid gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <RankBadge rank={t.rank} />
        <StatusBadge status={t.status} />
        {t.official && <OfficialBadge />}
        <span className="text-xs text-muted-foreground">{tr(`format.${t.format}`)}</span>
      </div>
      <h3 className="font-display text-lg leading-snug group-hover:text-primary">{t.name}</h3>
      <div className="grid gap-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <CalendarDays className="size-4" aria-hidden />
          {format.dateTime(new Date(t.startsAt), { dateStyle: "medium", timeStyle: "short" })}
        </span>
        <span className="flex items-center gap-2">
          <MapPin className="size-4" aria-hidden />
          {t.venueName ? `${t.venueName}, ${t.city}` : t.city}
        </span>
        <span className="flex items-center gap-2">
          <Users className="size-4" aria-hidden />
          {t.registeredCount}
          {t.maxPlayers ? ` / ${t.maxPlayers}` : ""} · {t.pointsLimit ? `${t.pointsLimit} ${tr("points")} · ` : ""}
          {t.organizerName}
        </span>
      </div>
    </Link>
  );
}
