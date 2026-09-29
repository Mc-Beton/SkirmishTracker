"use client";

import { useState } from "react";
import type { Cell } from "@/lib/reports";
import { pct, signal } from "@/lib/reports";

/**
 * Row × column matrix of results from the row's point of view. Fill: diverging around 50% (blue = the row
 * wins more, orange = less, neutral card = even), stronger with distance; the value is always printed, and
 * cells whose 95% interval excludes 50% get a bold value, so colour is never the only carrier.
 */
export function HeatMatrix({ rows, cols, cells, rowLabel, colLabel, corner, diagonal, uncertain }: {
  rows: string[];
  cols: string[];
  cells: Cell[];
  rowLabel: (code: string) => string;
  colLabel: (code: string) => string;
  corner: string;
  /** Text for row === col (mirror), or undefined when rows and columns are different things. */
  diagonal?: string;
  uncertain: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const byKey = new Map(cells.map((c) => [`${c.row}|${c.col}`, c]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="p-1 text-left font-normal text-muted-foreground">{corner}</th>
            {cols.map((c) => (
              <th key={c} scope="col" className="max-w-20 p-1 text-center align-bottom font-medium">
                <span className="line-clamp-2">{colLabel(c)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row" className="whitespace-nowrap p-1 pr-2 text-left font-medium">{rowLabel(r)}</th>
              {cols.map((c) => {
                if (diagonal && r === c) {
                  return <td key={c} className="rounded-sm bg-muted/40 p-1.5 text-center text-muted-foreground">{diagonal}</td>;
                }
                const cell = byKey.get(`${r}|${c}`);
                if (!cell) return <td key={c} className="rounded-sm p-1.5 text-center text-muted-foreground">·</td>;
                const d = cell.rate.score - 0.5;
                const strength = Math.min(1, Math.abs(d) / 0.3) * (cell.rate.enough ? 70 : 35);
                const tone = d >= 0 ? "var(--diverge-pos)" : "var(--diverge-neg)";
                const s = signal(cell.rate, 0.5);
                const key = `${r}|${c}`;
                const title = `${rowLabel(r)} – ${colLabel(c)}: ${pct(cell.rate.score, 1)} (95%: ${pct(cell.rate.low, 0)}–${pct(cell.rate.high, 0)}), n=${cell.rate.n}${cell.rate.enough ? "" : ` · ${uncertain}`}`;
                return (
                  <td key={c} title={title}
                    onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}
                    className="rounded-sm p-1.5 text-center tabular-nums outline-offset-[-1px]"
                    style={{
                      background: `color-mix(in oklab, ${tone} ${strength}%, var(--card))`,
                      outline: hover === key ? "1px solid var(--foreground)" : undefined,
                    }}>
                    <span className={s === "none" ? undefined : "font-bold"}>{pct(cell.rate.score)}</span>
                    <span className="block text-[10px] text-muted-foreground">n={cell.rate.n}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
