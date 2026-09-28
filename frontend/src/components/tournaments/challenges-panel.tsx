"use client";

import { useTranslations } from "next-intl";
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Challenge, Participant } from "@/lib/tournaments";

/** Player view of round 1 challenges. */
export function ChallengesPanel({
  meId,
  challenges,
  players,
  onAction,
}: {
  meId: string;
  challenges: Challenge[];
  players: Participant[];
  onAction: (method: "POST", path: string, body?: unknown) => Promise<void>;
}) {
  const t = useTranslations("tournaments.challenges");
  const accepted = challenges.filter((c) => c.status === "ACCEPTED");
  const myPair = accepted.find((c) => c.challengerId === meId || c.challengedId === meId);
  const incoming = challenges.filter((c) => c.status === "PENDING" && c.challengedId === meId);
  const outgoing = challenges.find((c) => c.status === "PENDING" && c.challengerId === meId);
  const busy = !!myPair || incoming.length > 0 || !!outgoing;
  const pairedIds = new Set(accepted.flatMap((c) => [c.challengerId, c.challengedId]));
  const candidates = players.filter((p) => p.status === "REGISTERED" && p.userId !== meId && !pairedIds.has(p.userId));

  return (
    <div className="grid gap-3 text-sm">
      {myPair && (
        <p className="font-medium">
          {t("pairedWith", { name: myPair.challengerId === meId ? myPair.challengedName : myPair.challengerName })}
        </p>
      )}
      {incoming.map((c) => (
        <div key={c.id} className="grid gap-2 rounded-md border p-2">
          <span>{t("incoming", { name: c.challengerName })}</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onAction("POST", `challenges/${c.id}/accept`)}>{t("accept")}</Button>
            <Button size="sm" variant="outline" onClick={() => onAction("POST", `challenges/${c.id}/reject`)}>{t("reject")}</Button>
          </div>
        </div>
      ))}
      {outgoing && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
          <span className="flex-1">{t("outgoing", { name: outgoing.challengedName })}</span>
          <Button size="sm" variant="outline" onClick={() => onAction("POST", `challenges/${outgoing.id}/withdraw`)}>{t("withdraw")}</Button>
        </div>
      )}
      {!myPair && (busy ? (
        !outgoing && incoming.length === 0 ? null : <p className="text-xs text-muted-foreground">{t("hintBusy")}</p>
      ) : (
        <ul className="grid gap-1">
          {candidates.map((p) => (
            <li key={p.userId} className="flex items-center justify-between gap-2">
              <span>{p.displayName}{p.club ? <span className="text-muted-foreground"> · {p.club}</span> : null}</span>
              <Button size="sm" variant="ghost"
                onClick={() => onAction("POST", "challenges", { challengedUserId: p.userId })}>
                <Swords aria-hidden /> {t("challenge")}
              </Button>
            </li>
          ))}
        </ul>
      ))}
      {accepted.length > 0 && (
        <div className="grid gap-1 border-t pt-2">
          <h4 className="font-medium">{t("paired")}</h4>
          <ul className="grid gap-1 text-muted-foreground">
            {accepted.map((c) => (
              <li key={c.id}>
                {c.challengerName} ⚔ {c.challengedName}
                {c.organizerMade && <span className="text-xs"> ({t("organizerMade")})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
