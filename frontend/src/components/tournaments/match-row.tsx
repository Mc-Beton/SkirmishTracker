"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Gavel } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Match } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = {
  PENDING: "outline",
  REPORTED: "warning",
  DISPUTED: "destructive",
  CONFIRMED: "success",
} as const;

type Props = {
  match: Match;
  meId?: string;
  onReport?: (a: number, b: number) => Promise<void>;
  onConfirm?: () => Promise<void>;
  onDispute?: () => Promise<void>;
  /** Organizer controls. */
  onSetResult?: (type: "PLAYED" | "SPLIT", a?: number, b?: number) => Promise<void>;
  onPickPlayer?: (playerId: string) => void;
  pickedPlayer?: string | null;
  /** Link to the detailed game page. */
  gameHref?: string;
  /** SPLIT is not offered in knockout rounds. */
  allowSplit?: boolean;
  /** A player of this table asks the judge to come over (round in progress). */
  onCallJudge?: () => Promise<void>;
};

export function MatchRow({ match: m, meId, onReport, onConfirm, onDispute, onSetResult, onPickPlayer, pickedPlayer, gameHref, allowSplit = true, onCallJudge }: Props) {
  const t = useTranslations("tournaments.rounds");
  const tm = useTranslations("tournaments.manageView");
  const mine = !!meId && (m.playerA.id === meId || m.playerB?.id === meId);
  const [a, setA] = useState(m.smallA?.toString() ?? "");
  const [b, setB] = useState(m.smallB?.toString() ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const name = (id: string, label: string) =>
    onPickPlayer ? (
      <button type="button" onClick={() => onPickPlayer(id)}
        className={cn("rounded px-1 text-left underline-offset-2 hover:underline", pickedPlayer === id && "bg-primary text-primary-foreground")}>
        {label}
      </button>
    ) : (
      <span className={cn(id === meId && "font-semibold")}>{label}</span>
    );

  const score = (x: number | null, big: number | null) =>
    x == null ? "–" : big == null ? `${x}` : `${x} (${big})`;

  const scoreForm = (submit: () => Promise<void>, label: string) => (
    <form method="post" className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); void run(submit); }}>
      <Input aria-label={`${t("smallPoints")}: ${m.playerA.displayName}`} type="number" min={0} max={1000}
        value={a} onChange={(e) => setA(e.target.value)} className="h-8 w-16" required />
      <span>:</span>
      <Input aria-label={`${t("smallPoints")}: ${m.playerB?.displayName}`} type="number" min={0} max={1000}
        value={b} onChange={(e) => setB(e.target.value)} className="h-8 w-16" required />
      <Button type="submit" size="sm" disabled={busy}>{label}</Button>
    </form>
  );

  return (
    <li className={cn("grid gap-2 rounded-lg border p-3", mine && "border-primary/50 bg-accent/30")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="w-14 text-muted-foreground">{t("table")} {m.table}</span>
        <span className="min-w-[9rem] flex-1 break-words">
          {name(m.playerA.id, m.playerA.displayName)}
          <span className="px-2 text-muted-foreground">vs</span>
          {m.playerB ? name(m.playerB.id, m.playerB.displayName) : <span className="font-medium">{t("bye")}</span>}
        </span>
        {m.playerB && (
          <span className="tabular-nums">
            {m.resultType === "SPLIT" ? t("split") : `${score(m.smallA, m.bigA)} : ${score(m.smallB, m.bigB)}`}
          </span>
        )}
        {m.rematch && (
          <Badge variant="destructive"><AlertTriangle className="mr-1 size-3" aria-hidden />{t("rematch")}</Badge>
        )}
        {m.playerB && <Badge variant={STATUS_VARIANT[m.status]}>{t(`match.${m.status}`)}</Badge>}
        {m.judgeCalled && (
          <Badge variant="warning"><Gavel className="mr-1 size-3" aria-hidden />{t("judgeCalled")}</Badge>
        )}
        {gameHref && m.playerB && (
          <Link href={gameHref} className="text-xs text-primary hover:underline">
            {m.canReport ? t("openGame") : t("viewGame")}
          </Link>
        )}
      </div>

      {/* An organizer who also plays uses the organizer form below (final at once) instead of reporting. */}
      {m.canReport && onReport && !onSetResult && m.status !== "REPORTED" && scoreForm(() => onReport(Number(a), Number(b)), t("report"))}
      {m.canReport && onReport && !onSetResult && m.status === "REPORTED" && m.reportedBy === meId && (
        editing ? scoreForm(() => onReport(Number(a), Number(b)), t("report")) : (
          <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setEditing(true)}>{t("report")}</Button>
        )
      )}
      {onCallJudge && mine && m.playerB && !m.judgeCalled && (
        <Button size="sm" variant="outline" className="justify-self-start" disabled={busy}
          onClick={() => { if (window.confirm(t("callJudgeConfirm"))) void run(onCallJudge); }}>
          <Gavel aria-hidden /> {t("callJudge")}
        </Button>
      )}
      {m.canConfirm && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => onConfirm && run(onConfirm)}>{t("confirm")}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onDispute && run(onDispute)}>{t("dispute")}</Button>
        </div>
      )}

      {onSetResult && m.playerB && (
        editing ? (
          <div className="flex flex-wrap items-center gap-2">
            {scoreForm(() => onSetResult("PLAYED", Number(a), Number(b)), tm("save"))}
            {allowSplit && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => onSetResult("SPLIT"))}>{t("split")}</Button>
            )}
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setEditing(true)}>{tm("setResult")}</Button>
        )
      )}
    </li>
  );
}
