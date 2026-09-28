"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RoundTimer as RoundTimerData } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

/** Counts down from the server snapshot; remounted (by key) whenever a new snapshot arrives. */
function Countdown({ timer, compact, timeUp, paused }: {
  timer: RoundTimerData; compact: boolean; timeUp: string; paused: string;
}) {
  const [remaining, setRemaining] = useState(timer.remainingSeconds);
  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [timer.running]);
  const over = remaining === 0;
  const warn = remaining > 0 && remaining <= 300;
  return (
    <span role="timer" aria-live="off"
      className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono tabular-nums",
        compact ? "text-sm" : "text-lg", warn && "border-destructive/50 text-destructive",
        over && "border-destructive bg-destructive text-background")}>
      <Timer className="size-4" aria-hidden />
      {over ? timeUp : clock(remaining)}
      {!timer.running && !over && <span className="font-sans text-xs text-muted-foreground">({paused})</span>}
    </span>
  );
}

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

type Controls = {
  /** Round not completed yet: the organizer may set / change the length. */
  canSet: boolean;
  /** Round in progress: start / pause / add time. */
  canRun: boolean;
  onSet: (minutes: number) => Promise<void>;
  onStart: () => Promise<void>;
  onPause: () => Promise<void>;
  onAdd: (minutes: number) => Promise<void>;
};

/** Countdown of the round; red in the last 5 minutes. With controls: the organizer's panel. */
export function RoundTimer({ timer, controls, compact = false }: {
  timer: RoundTimerData | null;
  controls?: Controls;
  compact?: boolean;
}) {
  const t = useTranslations("tournaments.timer");
  const [minutes, setMinutes] = useState(() => String(timer ? Math.round(timer.totalSeconds / 60) : 90));
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (!timer && !controls) return null;
  const display = timer && (
    <Countdown key={`${timer.serverTime}|${timer.remainingSeconds}|${timer.running}`} timer={timer}
      compact={compact} timeUp={t("timeUp")} paused={t("paused")} />
  );

  if (!controls) return display || null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {display}
      {controls.canSet && (
        <form className="flex items-center gap-1" onSubmit={(e) => {
          e.preventDefault();
          const n = Number(minutes);
          if (n >= 1 && n <= 600) void run(() => controls.onSet(n));
        }}>
          <Input type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)}
            className="h-8 w-20" aria-label={t("minutes")} />
          <Button type="submit" size="sm" variant="outline" disabled={busy}>{timer ? t("change") : t("set")}</Button>
        </form>
      )}
      {controls.canRun && timer && (
        <>
          {timer.running ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(controls.onPause)}>
              <Pause aria-hidden /> {t("pause")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(controls.onStart)}>
              <Play aria-hidden /> {t("start")}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => controls.onAdd(5))}>+5 min</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => controls.onAdd(-5))}>−5 min</Button>
        </>
      )}
    </div>
  );
}
