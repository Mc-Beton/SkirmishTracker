"use client";

import { useState } from "react";
import type { MonthRow } from "@/lib/reports";

/** Games per month: one series (no legend – the title names it), thin bars from the baseline, value on hover. */
export function MonthBars({ months, title, format }: { months: MonthRow[]; title: string; format: (m: MonthRow) => string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...months.map((m) => m.games));
  const shown = months.find((m) => m.month === hover) ?? months[months.length - 1];
  return (
    <figure className="grid gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{title}</span>
        {shown && <span className="tabular-nums text-muted-foreground">{format(shown)}</span>}
      </figcaption>
      <div className="flex h-32 items-end gap-0.5 border-b border-border">
        {months.map((m) => (
          <div key={m.month} className="flex h-full min-w-0 flex-1 items-end"
            onMouseEnter={() => setHover(m.month)} onMouseLeave={() => setHover(null)} title={format(m)}>
            <div className="w-full rounded-t-[4px] transition-opacity"
              style={{ height: `${(m.games / max) * 100}%`, background: "var(--series-1)", opacity: hover && hover !== m.month ? 0.5 : 1 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{months[0]?.month}</span>
        <span>{months[months.length - 1]?.month}</span>
      </div>
    </figure>
  );
}
