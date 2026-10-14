"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Quest } from "@/lib/content";
import { deploymentZones, type Deployment } from "@/lib/table/deployment.ts";

const COLORS = ["217,180,90", "200,70,70"];

/** A small sketch of the quest's Deployment Zones (36″ × 36″) with the quest's own wording. */
export function DeploymentPreview({ quest, size = 88 }: { quest: Quest | null; size?: number }) {
  const t = useTranslations("table");
  const locale = useLocale();
  const kind: Deployment = quest?.deploymentType ?? "STANDARD";
  const zones = deploymentZones(36, 36, kind);
  const text = quest ? (locale === "pl" ? quest.deployment.pl : quest.deployment.en) : t("deploymentKind.STANDARD");
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <svg viewBox="0 0 36 36" width={size} height={size} role="img" aria-label={t(`deploymentKind.${kind}`)}
        className="shrink-0 rounded-sm border bg-muted/40">
        {zones.map((z) => (
          <polygon key={z.side} points={z.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={`rgba(${COLORS[z.side]},.35)`} stroke={`rgba(${COLORS[z.side]},.9)`} strokeWidth={0.4} strokeDasharray="1 1" />
        ))}
        <text x={kind === "CORNER" ? 3.5 : 18} y={kind === "CORNER" ? 33.5 : 34.5} textAnchor="middle" fontSize={3} fill="currentColor">1</text>
        <text x={kind === "CORNER" ? 32.5 : 18} y={kind === "CORNER" ? 4.5 : 4} textAnchor="middle" fontSize={3} fill="currentColor">2</text>
      </svg>
      <span>
        <span className="font-medium text-foreground">{t(`deploymentKind.${kind}`)}</span>
        <br />
        {text}
      </span>
    </div>
  );
}
