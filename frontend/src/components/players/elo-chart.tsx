"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { EloPoint } from "@/lib/players";

const W = 640;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 20, left: 40 };

/** ELO after each game: one 2px line, recessive grid, hover tooltip per game. */
export function EloChart({ points }: { points: EloPoint[] }) {
  const t = useTranslations("players");
  const format = useFormatter();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const values = points.map((p) => p.rating);
  const min = Math.min(1500, ...values) - 10;
  const max = Math.max(1500, ...values) + 10;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(" ");
  // Baseline 1500 plus the lowest / highest rating when they are far enough apart to label.
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const ticks = [1500, ...(Math.abs(lo - 1500) >= 15 ? [lo] : []), ...(Math.abs(hi - 1500) >= 15 && hi !== lo ? [hi] : [])];
  const h = hover == null ? null : points[hover];

  return (
    <figure className="relative grid gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("eloChart")}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="currentColor"
              className="text-border" strokeWidth={1} strokeDasharray={v === 1500 ? "4 4" : undefined} />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{v}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(points[hover].rating)} r={4} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />
          </>
        )}
        {points.map((p, i) => (
          <rect key={p.gameId} x={x(i) - (W / points.length) / 2} y={0} width={W / points.length} height={H}
            fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 rounded-md border bg-card px-2 py-1 text-xs shadow-sm"
          style={{ left: `${Math.min(80, (x(hover!) / W) * 100)}%` }}>
          <span className="font-semibold tabular-nums">{h.rating}</span>{" "}
          <span className="text-muted-foreground tabular-nums">({h.change > 0 ? "+" : ""}{h.change})</span>
          {h.at && <span className="block text-muted-foreground">{format.dateTime(new Date(h.at), { dateStyle: "medium" })}</span>}
        </div>
      )}
      <figcaption className="text-xs text-muted-foreground">{t("eloChartCaption", { n: points.length })}</figcaption>
    </figure>
  );
}
