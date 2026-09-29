"use client";

import { useState } from "react";

export type Column = { key: string; label: string; values: number[]; caption: string };

/**
 * Vertical columns from a common baseline. One series: slot-1 colour, no legend (the title names it).
 * Two series: stacked in fixed slot order with a 2px gap and a legend. Hover shows the column's caption.
 */
export function ColumnChart({ title, columns, series, height = 128 }: {
  title: string;
  columns: Column[];
  /** Series names in stacking order (bottom first); one name = single series. */
  series: string[];
  height?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const colors = ["var(--series-1)", "var(--series-3)"];
  const max = Math.max(1e-9, ...columns.map((c) => c.values.reduce((a, b) => a + b, 0)));
  const shown = columns.find((c) => c.key === hover);
  return (
    <figure className="grid gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{title}</span>
        {series.length > 1 && (
          <span className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {series.map((s, i) => (
              <span key={s} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: colors[i] }} />{s}</span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="flex items-end gap-2 border-b border-border" style={{ height }}>
        {columns.map((c) => {
          const total = c.values.reduce((a, b) => a + b, 0);
          return (
            <div key={c.key} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={c.caption}
              onMouseEnter={() => setHover(c.key)} onMouseLeave={() => setHover(null)}
              style={{ opacity: hover && hover !== c.key ? 0.5 : 1 }}>
              <div className="flex flex-col-reverse gap-[2px]" style={{ height: `${(total / max) * 100}%` }}>
                {c.values.map((v, i) => (
                  <div key={i} className={i === c.values.length - 1 ? "rounded-t-[4px]" : undefined}
                    style={{ flexGrow: v, flexBasis: 0, background: colors[i] }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 text-center text-[10px] text-muted-foreground">
        {columns.map((c) => <span key={c.key} className="min-w-0 flex-1 truncate">{c.label}</span>)}
      </div>
      <p className="min-h-4 text-xs text-muted-foreground">{shown?.caption ?? ""}</p>
    </figure>
  );
}
