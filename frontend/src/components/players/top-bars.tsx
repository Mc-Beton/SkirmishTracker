"use client";

import { useState } from "react";

export type Bar = { key: string; label: string; count: number };

/** Top-N horizontal bars: one hue, thin marks with rounded data ends, value labels in text colours. */
export function TopBars({ title, bars, empty, unit }: { title: string; bars: Bar[]; empty: string; unit: (n: number) => string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <figure className="grid min-w-0 content-start gap-3">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      {bars.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="grid gap-2">
          {bars.map((b) => (
            <li key={b.key} className="grid gap-1" onMouseEnter={() => setHover(b.key)} onMouseLeave={() => setHover(null)}
              title={`${b.label}: ${unit(b.count)}`}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{b.label}</span>
                <span className="tabular-nums text-muted-foreground">{unit(b.count)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-full rounded-full transition-opacity"
                  style={{ width: `${(b.count / max) * 100}%`, background: "var(--series-1)", opacity: hover && hover !== b.key ? 0.5 : 1 }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}
