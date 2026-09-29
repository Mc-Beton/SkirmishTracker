"use client";

import { useState } from "react";
import type { ItemRow } from "@/lib/reports";
import { pp, pct, signal } from "@/lib/reports";

export type CostPoint = { row: ItemRow; cost: number; label: string };

const W = 640;
const H = 300;
const M = { top: 16, right: 16, bottom: 36, left: 52 };

/**
 * Cost vs effect: x = item cost in points, y = result above what the players' ELO predicted (percentage points),
 * area = pick rate. Filled blue / orange only when the 95% interval excludes the expected score (and those
 * points get a direct label); hollow = not enough data. Hover shows the full numbers.
 */
export function CostEffect({ points, xLabel, yLabel, empty, labels }: {
  points: CostPoint[];
  xLabel: string;
  yLabel: string;
  empty: string;
  labels: { pick: string; games: string; points: string };
}) {
  const [hover, setHover] = useState<string | null>(null);
  if (points.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const maxCost = Math.max(1, ...points.map((p) => p.cost)) + 1;
  const range = Math.max(0.1, ...points.map((p) => Math.abs(p.row.with.performance))) * 1.15;
  const x = (c: number) => M.left + (c / maxCost) * (W - M.left - M.right);
  const y = (v: number) => M.top + ((range - v) / (2 * range)) * (H - M.top - M.bottom);
  const r = (pick: number) => 4 + Math.sqrt(pick) * 16;
  const yTicks = [-range, -range / 2, 0, range / 2, range].map((v) => Math.round(v * 1000) / 1000);
  const xTicks = Array.from({ length: maxCost + 1 }, (_, i) => i);
  const shown = points.find((p) => p.row.item === hover);

  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${xLabel} / ${yLabel}`}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)"
              strokeDasharray={v === 0 ? undefined : "2 4"} strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{pp(v)}</text>
          </g>
        ))}
        {xTicks.map((c) => (
          <text key={c} x={x(c)} y={H - M.bottom + 16} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{c}</text>
        ))}
        <text x={(M.left + W - M.right) / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{xLabel}</text>
        {[...points].sort((a, b) => b.row.pickRate - a.row.pickRate).map((p) => {
          const s = signal(p.row.with, p.row.with.expected);
          const color = s === "above" ? "var(--diverge-pos)" : s === "below" ? "var(--diverge-neg)" : "var(--muted-foreground)";
          const cx = x(p.cost);
          const cy = y(p.row.with.performance);
          const active = hover === p.row.item;
          return (
            <g key={p.row.item} onMouseEnter={() => setHover(p.row.item)} onMouseLeave={() => setHover(null)}
              opacity={hover && !active ? 0.35 : 1}>
              <circle cx={cx} cy={cy} r={r(p.row.pickRate) + 6} fill="transparent" />
              <circle cx={cx} cy={cy} r={r(p.row.pickRate)} stroke="var(--card)" strokeWidth={2}
                fill={p.row.with.enough ? color : "transparent"} fillOpacity={s === "none" ? 0.45 : 0.9} />
              {!p.row.with.enough && <circle cx={cx} cy={cy} r={r(p.row.pickRate)} fill="none" stroke={color} strokeWidth={1.5} />}
              {(s !== "none" || active) && (
                <text x={cx + r(p.row.pickRate) + 4} y={cy} dy="0.32em" fontSize="11" fill="var(--foreground)">{p.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="min-h-5 text-xs text-muted-foreground">
        {shown
          ? `${shown.label}: ${shown.cost} ${labels.points} · ${labels.pick} ${pct(shown.row.pickRate)} · ${pp(shown.row.with.performance)} · ${labels.games} ${shown.row.with.n}`
          : yLabel}
      </figcaption>
    </figure>
  );
}
