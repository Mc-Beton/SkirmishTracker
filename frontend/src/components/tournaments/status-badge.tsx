import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { TournamentRank, TournamentStatus } from "@/lib/tournaments";

const STATUS_VARIANT = {
  DRAFT: "outline",
  PUBLISHED: "success",
  REGISTRATION_CLOSED: "warning",
  IN_PROGRESS: "default",
  FINISHED: "secondary",
  CANCELLED: "destructive",
} as const;

export function StatusBadge({ status }: { status: TournamentStatus }) {
  const t = useTranslations("tournaments.status");
  return <Badge variant={STATUS_VARIANT[status]}>{t(status)}</Badge>;
}

export function RankBadge({ rank }: { rank: TournamentRank }) {
  const t = useTranslations("tournaments.rank");
  return <Badge variant={rank === "LOCAL" ? "secondary" : "default"}>{t(rank)}</Badge>;
}
