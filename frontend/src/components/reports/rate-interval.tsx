import type { Rate } from "@/lib/reports";
import { pct, signal } from "@/lib/reports";

/**
 * A result with its 95% interval on a horizontal scale: band = interval, dot = observed score,
 * tick = score the players' ELO predicted, dashed line = 50%. The dot is coloured only when the
 * interval excludes the reference (blue above, orange below) and the text next to it repeats that.
 */
export function RateInterval({ rate, reference = 0.5, min = 0.2, max = 0.8, label }: {
  rate: Rate;
  reference?: number;
  min?: number;
  max?: number;
  label: string;
}) {
  const x = (v: number) => `${((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100}%`;
  const s = signal(rate, reference);
  const color = s === "above" ? "var(--diverge-pos)" : s === "below" ? "var(--diverge-neg)" : "var(--foreground)";
  const title = `${label}: ${pct(rate.score, 1)} (95%: ${pct(rate.low, 1)}–${pct(rate.high, 1)}), n=${rate.n}`;
  return (
    <div className="relative h-5 min-w-24" role="img" aria-label={title} title={title}>
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <div className="absolute inset-y-0 border-l border-dashed border-muted-foreground/60" style={{ left: x(0.5) }} />
      <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted-foreground/35"
        style={{ left: x(rate.low), width: `calc(${x(rate.high)} - ${x(rate.low)})` }} />
      <div className="absolute top-0.5 h-4 w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground" style={{ left: x(rate.expected) }} />
      <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
        style={{ left: x(rate.score), background: color, opacity: rate.enough ? 1 : 0.55 }} />
    </div>
  );
}
