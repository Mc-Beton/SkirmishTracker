"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ListStatus } from "@/lib/tournaments";

const VARIANT: Record<ListStatus, "outline" | "secondary" | "success" | "warning"> = {
  NOT_SUBMITTED: "outline",
  SUBMITTED: "secondary",
  APPROVED: "success",
  NEEDS_FIX: "warning",
};

export function ListStatusBadge({ status }: { status: ListStatus }) {
  const t = useTranslations("tournaments.listStatus");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
