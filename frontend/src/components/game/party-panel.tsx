"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Crown, EyeOff, Lock, Users } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";
import { useLiveRefresh } from "@/lib/live";
import { sendOrQueue } from "@/lib/offline-queue";
import { selectionPoints, type PartyInput, type PartySide, type PartyView, type RosterEntry } from "@/lib/party";
import { cn } from "@/lib/utils";
import { factionName, useArmies } from "@/lib/warbands";

/**
 * Roster format: before the game (quest and opponent's faction known) each player picks a party from their
 * roster and its leader. The opponent only sees that you have chosen – the party stays hidden until the game
 * is over. Works offline: the choice is queued and sent once the network is back.
 */
export function PartyPanel({ tournamentId, matchId, meId, onSaved }: {
  tournamentId: string;
  matchId: string;
  meId: string | undefined;
  onSaved: () => void;
}) {
  const t = useTranslations("party");
  const errorMessage = useErrorMessage();
  const armies = useArmies();
  const [view, setView] = useState<PartyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const url = `/api/tournaments/${tournamentId}/matches/${matchId}/party`;

  const load = useCallback(() => api<PartyView>("GET", url), [url]);
  useEffect(() => {
    let active = true;
    load().then((v) => active && setView(v)).catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [load, errorMessage]);
  useLiveRefresh(tournamentId, () => void load().then(setView).catch(() => undefined));

  if (!view || !view.rosterFormat) return error ? <Alert variant="destructive">{error}</Alert> : null;
  const mine = view.sides.find((s) => s.userId === meId);
  const others = view.sides.filter((s) => s.userId !== meId);

  const save = async (input: PartyInput) => {
    setError(null);
    try {
      if (!meId) return;
      const res = await sendOrQueue({ key: `party:${matchId}`, userId: meId, method: "PUT", path: url, body: input,
        label: "party" });
      if (res.queued) {
        setQueued(true);
      } else {
        setQueued(false);
        setView(await load());
        onSaved();
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl"><Users className="size-5" aria-hidden />{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("lead", { party: view.partyLimit ?? "–", roster: view.rosterLimit ?? "–" })}
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        {error && <Alert variant="destructive">{error}</Alert>}
        {queued && <Alert>{t("queued")}</Alert>}
        {others.map((s) => (
          <OpponentSide key={s.userId} side={s} revealed={view.revealed} participant={!!mine}
            faction={factionName(armies, s.faction)} ally={s.alliedFaction ? factionName(armies, s.alliedFaction) : null} />
        ))}
        {mine && (mine.canEdit && mine.roster
          ? <PartyPicker key={mine.party?.updatedAt ?? "new"} side={mine} limit={view.partyLimit ?? Infinity} onSave={save} />
          : <PartySummary side={mine} title={t("yours")} />)}
      </CardContent>
    </Card>
  );
}

function OpponentSide({ side, revealed, participant, faction, ally }: {
  side: PartySide; revealed: boolean; participant: boolean; faction: string; ally: string | null;
}) {
  const t = useTranslations("party");
  return (
    <section className="grid gap-2 rounded-lg border p-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">{participant ? t("opponent", { name: side.displayName }) : side.displayName}</span>
        <span>{faction}{ally ? ` + ${ally}` : ""}</span>
        <span className={cn("rounded-md px-2 py-0.5 text-xs", side.chosen ? "bg-emerald-600/15 text-emerald-300" : "bg-muted text-muted-foreground")}>
          {side.chosen ? t("chosen") : t("notChosen")}
        </span>
      </p>
      {side.party ? <PartyList side={side} /> : side.chosen && !revealed && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><EyeOff className="size-3.5" aria-hidden />{t("hiddenUntilEnd")}</p>
      )}
      {!side.party && (side.roster ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("opponentRoster", { points: side.rosterPoints ?? 0 })}</summary>
          <ul className="mt-2 grid gap-1">
            {side.roster.map((r) => (
              <li key={r.slot}>{r.name}{r.items.length > 0 && <span className="text-muted-foreground"> · {r.items.map((i) => i.name).join(", ")}</span>}</li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="text-xs text-muted-foreground">{t("rosterHidden")}</p>
      ))}
    </section>
  );
}

function PartyList({ side }: { side: PartySide }) {
  const t = useTranslations("party");
  if (!side.party) return null;
  const roster = side.roster ?? [];
  return (
    <div className="grid gap-1 text-sm">
      <ul className="grid gap-1">
        {side.party.units.map((u) => {
          const entry = roster.find((r) => r.slot === u.slot);
          const items = entry ? entry.items.filter((i) => u.items.includes(i.index)).map((i) => i.name) : [];
          return (
            <li key={u.slot} className="flex flex-wrap items-center gap-1">
              {u.leader && <Crown className="size-4 text-amber-500" aria-label={t("leader")} />}
              <span className="font-medium">{u.name}</span>
              {items.length > 0 && <span className="text-muted-foreground">· {items.join(", ")}</span>}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t("summary", { points: side.party.totalPoints, int: side.party.leaderInt })}</p>
    </div>
  );
}

function PartySummary({ side, title }: { side: PartySide; title: string }) {
  const t = useTranslations("party");
  return (
    <section className="grid gap-2 rounded-lg border border-primary/40 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">{title}<Lock className="size-3.5 text-muted-foreground" aria-label={t("locked")} /></p>
      {side.party ? <PartyList side={side} /> : <p className="text-sm text-muted-foreground">{t("noneLocked")}</p>}
    </section>
  );
}

function PartyPicker({ side, limit, onSave }: { side: PartySide; limit: number; onSave: (input: PartyInput) => Promise<void> }) {
  const t = useTranslations("party");
  const roster: RosterEntry[] = side.roster ?? [];
  const [picked, setPicked] = useState<Map<number, Set<number>>>(() => new Map(
    (side.party?.units ?? []).map((u) => [u.slot, new Set(u.items)])));
  const [leader, setLeader] = useState<number | null>(side.party?.units.find((u) => u.leader)?.slot ?? null);
  const [leaderInt, setLeaderInt] = useState(side.party ? String(side.party.leaderInt) : "");
  const [busy, setBusy] = useState(false);
  const total = selectionPoints(roster, picked);
  const int = Number.parseInt(leaderInt || "0", 10) || 0;
  const problems: string[] = [];
  if (picked.size === 0) problems.push(t("problems.empty"));
  if (leader === null || !picked.has(leader)) problems.push(t("problems.leader"));
  if (int < 1 || int > 30) problems.push(t("problems.int"));
  if (total > limit) problems.push(t("problems.over", { over: total - limit }));

  const toggle = (e: RosterEntry) => setPicked((m) => {
    const next = new Map(m);
    if (next.has(e.slot)) {
      next.delete(e.slot);
      if (leader === e.slot) setLeader(null);
    } else {
      next.set(e.slot, new Set(e.items.map((i) => i.index)));
    }
    return next;
  });
  const toggleItem = (slot: number, index: number) => setPicked((m) => {
    const next = new Map(m);
    const items = new Set(next.get(slot));
    if (items.has(index)) items.delete(index); else items.add(index);
    next.set(slot, items);
    return next;
  });

  const submit = async () => {
    if (problems.length > 0 || leader === null) return;
    setBusy(true);
    await onSave({ units: [...picked].map(([slot, items]) => ({ slot, items: [...items].sort((a, b) => a - b) })), leaderSlot: leader, leaderInt: int });
    setBusy(false);
  };

  return (
    <section className="grid gap-3 rounded-lg border border-primary/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{t("pick")}</p>
        <p className={cn("font-display text-xl tabular-nums", total > limit && "text-destructive")} aria-live="polite">
          {total}<span className="text-sm text-muted-foreground"> / {Number.isFinite(limit) ? limit : "–"}</span>
        </p>
      </div>
      <ul className="grid gap-2">
        {roster.map((e) => {
          const on = picked.has(e.slot);
          return (
            <li key={e.slot} className={cn("grid gap-1.5 rounded-md border p-2", on ? "border-primary/50 bg-accent/30" : "opacity-80")}>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={on} onChange={() => toggle(e)} />
                  <span className="font-medium">{e.name}</span>
                  <span className="tabular-nums text-muted-foreground">{e.points + e.extraPoints} {t("pts")}</span>
                </label>
                {on && (
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="radio" name="party-leader" checked={leader === e.slot} onChange={() => setLeader(e.slot)} />
                    <Crown className="size-3.5 text-amber-500" aria-hidden />{t("leader")}
                  </label>
                )}
              </div>
              {on && e.items.length > 0 && (
                <ul className="grid gap-1 border-l-2 border-primary/30 pl-3">
                  {e.items.map((i) => (
                    <li key={i.index}>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" className="size-3.5 accent-[var(--primary)]" checked={picked.get(e.slot)?.has(i.index) ?? false}
                          onChange={() => toggleItem(e.slot, i.index)} />
                        {i.name} <span className="tabular-nums text-muted-foreground">{i.points} {t("pts")}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="party-int" className="text-xs">{t("leaderInt")}</Label>
          <Input id="party-int" type="number" inputMode="numeric" min={1} max={30} className="w-24" value={leaderInt}
            onChange={(e) => setLeaderInt(e.target.value)} />
        </div>
        <Button disabled={busy || problems.length > 0} onClick={submit}>{side.party ? t("update") : t("save")}</Button>
      </div>
      {problems.length > 0 && (
        <ul className="grid list-disc gap-1 pl-5 text-xs text-muted-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </section>
  );
}
