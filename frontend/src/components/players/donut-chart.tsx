"use client";

import { useState } from "react";
import { useFormatter } from "next-intl";
import { cn } from "@/lib/utils";

export type Slice = { key: string; label: string; count: number; color: string };

const R = 60;
const STROKE = 22;
const C = 2 * Math.PI * R;

/**
 * Part-to-whole donut. Slices keep a fixed colour per entity and a fixed order (so neighbours stay the validated
 * adjacent pairs), a 2px surface gap separates them, and the legend repeats every value – identity is never colour
 * alone.
 */
export function DonutChart({ title, slices, empty, centerLabel }: {
  title: string; slices: Slice[]; empty: string; centerLabel: string;
}) {
  const format = useFormatter();
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.count, 0);
  const pct = (n: number) => format.number(n / total, { style: "percent", maximumFractionDigits: 0 });
  // Start offset of each slice along the circle (cumulative sum of the previous slices).
  const offsets = slices.map((_, i) => slices.slice(0, i).reduce((sum, x) => sum + (x.count / (total || 1)) * C, 0));
  const active = slices.find((s) => s.key === hover);

  return (
    <figure className="grid min-w-0 content-start gap-3">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid min-w-0 justify-items-center gap-3">
          <svg viewBox="0 0 160 160" className="size-36 shrink-0" role="img"
            aria-label={`${title}: ${slices.map((s) => `${s.label} ${pct(s.count)}`).join(", ")}`}
            onMouseLeave={() => setHover(null)}>
            <g transform="rotate(-90 80 80)">
              {slices.map((s, i) => {
                const len = (s.count / total) * C;
                const dash = slices.length > 1 ? Math.max(len - 2, 0.5) : len;  // 2px surface gap
                return (
                  <circle key={s.key} cx={80} cy={80} r={R} fill="none" stroke={s.color}
                    strokeWidth={hover === s.key ? STROKE + 4 : STROKE}
                    strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offsets[i]}
                    className={cn("transition-[stroke-width,opacity]", hover && hover !== s.key && "opacity-50")}
                    onMouseEnter={() => setHover(s.key)} />
                );
              })}
            </g>
            <text x={80} y={76} textAnchor="middle" className="fill-foreground font-display text-[22px]">
              {active ? pct(active.count) : total}
            </text>
            <text x={80} y={96} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {active ? active.label.slice(0, 18) : centerLabel}
            </text>
          </svg>
          <ul className="grid w-full min-w-0 gap-1 text-sm">
            {slices.map((s) => (
              <li key={s.key} className={cn("flex items-center gap-2 rounded px-1", hover === s.key && "bg-accent")}
                onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
                <span className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="tabular-nums text-muted-foreground">{s.count}</span>
                <span className="w-10 text-right tabular-nums">{pct(s.count)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
