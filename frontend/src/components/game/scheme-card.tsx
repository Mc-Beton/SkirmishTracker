"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { loc, type Scheme } from "@/lib/content";
import { cn } from "@/lib/utils";

export function SchemeCard({ scheme, roll, highlight, action }: {
  scheme: Scheme; roll?: number; highlight?: boolean; action?: React.ReactNode;
}) {
  const t = useTranslations("game");
  const locale = useLocale();
  return (
    <div className={cn("grid gap-1.5 rounded-lg border bg-card p-3 text-sm", highlight && "border-primary ring-2 ring-primary/20")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{scheme.name}</span>
        <Badge variant="secondary">{t("maxVp", { n: scheme.maxVp })}</Badge>
        <span className="text-xs text-muted-foreground">{t(`timing.${scheme.timing}`)}</span>
        {roll != null && <span className="ml-auto text-xs text-muted-foreground">{t("roll", { roll })}</span>}
      </div>
      <p className="text-muted-foreground">{loc(scheme.text, locale)}</p>
      {action}
    </div>
  );
}
