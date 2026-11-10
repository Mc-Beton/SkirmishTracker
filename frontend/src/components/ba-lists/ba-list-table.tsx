"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileText, Paperclip } from "lucide-react";
import { ListStatusBadge } from "@/components/warbands/list-status-badge";
import type { BaListSummary } from "@/lib/ba-lists";
import { useNationName } from "./nation-name";

/** All Bolt Action lists of a tournament (organizer, or everyone once the organizer's setting allows). */
export function BaListTable({ tournamentId, items }: { tournamentId: string; items: BaListSummary[] }) {
  const t = useTranslations("baLists");
  const nation = useNationName();
  if (items.length === 0) return <p className="text-muted-foreground">{t("noLists")}</p>;
  return (
    <ul className="grid gap-2">
      {items.map((l) => (
        <li key={l.userId}>
          <Link href={`/tournaments/${tournamentId}/warbands/${l.userId}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-3 hover:bg-accent">
            <span className="font-medium">{l.displayName}</span>
            <span className="text-sm text-muted-foreground">{nation(l.nation)}</span>
            <span className="ml-auto flex flex-wrap items-center gap-2 text-sm tabular-nums">
              <span>{l.points} {t("pts")}</span>
              <span className="text-muted-foreground">{t("diceN", { n: l.orderDice })} · {t("platoonsN", { n: l.platoons })}</span>
              {l.hasText && <FileText aria-label={t("hasText")} className="size-4 text-muted-foreground" />}
              {l.hasPdf && <Paperclip aria-label={t("hasPdf")} className="size-4 text-muted-foreground" />}
              <ListStatusBadge status={l.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
