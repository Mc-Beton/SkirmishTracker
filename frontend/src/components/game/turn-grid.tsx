"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** What the turn table needs from a game – tournament games and own games both have it. */
export type TurnPlayer = {
  userId: string;
  displayName: string;
  turns: { turn: number; scenarioVp: number; schemeVp: number }[];
  totalScenario: number;
  totalScheme: number;
  total: number;
  canEdit: boolean;
};
export type TurnGame = { turns: number; players: TurnPlayer[] };

/** Sets one turn of one player and recomputes the totals (same rule as the server: scenario + scheme). */
export function withTurn<G extends TurnGame>(game: G, playerId: string, turn: number, scenarioVp: number, schemeVp: number): G {
  return {
    ...game,
    players: game.players.map((p) => {
      if (p.userId !== playerId) return p;
      const turns = [...p.turns.filter((x) => x.turn !== turn), { turn, scenarioVp, schemeVp }]
        .sort((x, y) => x.turn - y.turn);
      const totalScenario = turns.reduce((sum, x) => sum + x.scenarioVp, 0);
      const totalScheme = turns.reduce((sum, x) => sum + x.schemeVp, 0);
      return { ...p, turns, totalScenario, totalScheme, total: totalScenario + totalScheme };
    }),
  };
}

export function TurnGrid({ game, onSave }: {
  game: TurnGame;
  onSave: (playerId: string, turn: number, scenarioVp: number, schemeVp: number) => Promise<void>;
}) {
  const t = useTranslations("game");
  const [pa, pb] = game.players;
  const players = [pa, pb];
  // Mobile first: a fixed grid (turn | player A: scenario, scheme | player B: scenario, scheme) that always
  // fits the screen width – no sideways scrolling while entering points at the table.
  const row = "grid grid-cols-[1.75rem_1fr_1fr] items-center gap-x-2 sm:grid-cols-[3rem_1fr_1fr] sm:gap-x-4";
  const pair = "grid grid-cols-2 gap-1 sm:gap-2";
  return (
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-xl">{t("turns")}</CardTitle>
        {players.some((p) => p.canEdit) && <p className="text-xs text-muted-foreground">{t("bothCanEdit")}</p>}
      </CardHeader>
      <CardContent className="grid gap-1 px-3 sm:px-6">
        <div className={cn(row, "text-sm font-medium")}>
          <span className="text-xs text-muted-foreground">{t("turn")}</span>
          {players.map((p) => <span key={p.userId} className="truncate text-center">{p.displayName}</span>)}
        </div>
        <div className={cn(row, "border-b pb-1 text-[11px] text-muted-foreground sm:text-xs")}>
          <span />
          {players.map((p) => (
            <span key={p.userId} className={cn(pair, "text-center")}>
              <span className="truncate">{t("scenarioVp")}</span>
              <span className="truncate">{t("schemeVp")}</span>
            </span>
          ))}
        </div>
        {Array.from({ length: game.turns }, (_, i) => i + 1).map((turn) => (
          <div key={turn} className={cn(row, "border-b py-1 last:border-0")}>
            <span className="text-center font-medium tabular-nums">{turn}</span>
            {players.map((p) => (
              <TurnCells key={p.userId} player={p} turn={turn} onSave={onSave} className={pair} />
            ))}
          </div>
        ))}
        <div className={cn(row, "pt-1 font-semibold")}>
          <span className="text-xs">{t("total")}</span>
          {players.map((p) => (
            <span key={p.userId} className="grid gap-0.5 text-center">
              <span className={cn(pair, "tabular-nums")}>
                <span>{p.totalScenario}</span>
                <span>{p.totalScheme}</span>
              </span>
              <span className="font-display text-xl tabular-nums">{p.total}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TurnCells({ player, turn, onSave, className }: {
  player: TurnPlayer;
  turn: number;
  onSave: (playerId: string, turn: number, scenarioVp: number, schemeVp: number) => Promise<void>;
  className?: string;
}) {
  const current = player.turns.find((x) => x.turn === turn) ?? { turn, scenarioVp: 0, schemeVp: 0 };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [values, setValues] = useState({ sc: current.scenarioVp, sh: current.schemeVp });
  const [focused, setFocused] = useState(false);
  // Values changed elsewhere (the opponent's phone, a live refresh) replace ours unless we are typing here.
  const server = `${current.scenarioVp}:${current.schemeVp}`;
  const [seen, setSeen] = useState(server);
  if (!focused && seen !== server) {
    setSeen(server);
    setValues({ sc: current.scenarioVp, sh: current.schemeVp });
  }

  const change = (key: "sc" | "sh", raw: string) => {
    const n = Math.max(0, Math.min(100, Number.parseInt(raw || "0", 10) || 0));
    const next = { ...values, [key]: n };
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    // Debounced autosave so quick typing does not flood the API.
    timer.current = setTimeout(() => void onSave(player.userId, turn, next.sc, next.sh), 600);
  };

  const cell = (key: "sc" | "sh", label: string) => player.canEdit ? (
    <Input aria-label={label} type="number" inputMode="numeric" min={0} max={100} value={values[key]}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={() => setFocused(false)} onChange={(e) => change(key, e.target.value)}
      className="h-10 w-full min-w-0 appearance-none px-1 text-center tabular-nums [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
  ) : (
    <span className="py-2 text-center tabular-nums">{key === "sc" ? current.scenarioVp : current.schemeVp}</span>
  );
  return (
    <div className={className}>
      {cell("sc", `${player.displayName} T${turn} scenario`)}
      {cell("sh", `${player.displayName} T${turn} scheme`)}
    </div>
  );
}

