"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dices, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SchemeCard } from "@/components/game/scheme-card";
import { cardsFor, type GameContent } from "@/lib/content";
import type { GameDraw } from "@/lib/tournaments";

/**
 * One player's Schemes in a game (tournament or own): draw on the faction's table (cards by the Leader's INT), keep
 * one, reveal it when the time comes. Until then the opponent only sees how far the player is.
 *
 * `fixedInt`: a number = the Leader's INT comes from the list; null = the list knows no Leader yet (Roster: pick the
 * party first); undefined = the player types the INT.
 */
export function SchemesPanel({ player, content, faction, fixedInt, suggestedInt, isMe, onDraw, onKeep, onReveal }: {
  player: { userId: string; displayName: string; draw: GameDraw | null; canEdit: boolean };
  content: GameContent;
  faction: string | null;
  fixedInt?: number | null;
  suggestedInt?: number | null;
  isMe: boolean;
  onDraw: (faction: string | null, leaderInt: number | null) => Promise<void> | void;
  onKeep: (scheme: string) => Promise<void> | void;
  onReveal: () => Promise<void> | void;
}) {
  const t = useTranslations("game");
  const drawable = content.factions.filter((f) => f.schemeTable);
  const [pickedFaction, setPickedFaction] = useState(drawable[0]?.code ?? "");
  const [typedInt, setTypedInt] = useState<string | null>(null);
  const leaderInt = typedInt ?? String(suggestedInt ?? 13);
  const schemeOf = (code: string) => content.schemes.find((s) => s.code === code);
  const factionName = (code: string | null) => content.factions.find((f) => f.code === code)?.name ?? code ?? "";
  const d = player.draw;
  const intValue = fixedInt ?? (Number.parseInt(leaderInt || "0", 10) || 0);
  const hasTable = !!content.factions.find((f) => f.code === faction)?.schemeTable;
  const mayAct = player.canEdit && isMe;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("schemes")} – {player.displayName}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!d && !mayAct && <p className="text-sm text-muted-foreground">{t("notDrawn")}</p>}
        {!d && mayAct && (
          <form method="post" className="grid gap-3"
            onSubmit={(e) => { e.preventDefault(); void onDraw(faction ? null : pickedFaction, fixedInt !== undefined ? null : intValue); }}>
            {faction ? (
              <p className="text-sm">
                <span className="font-medium">{factionName(faction)}</span>
                {fixedInt != null && <span className="text-muted-foreground"> · {t("leaderInt")} {fixedInt}</span>}
              </p>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor={`faction-${player.userId}`}>{t("faction")}</Label>
                <NativeSelect id={`faction-${player.userId}`} value={pickedFaction} onChange={(e) => setPickedFaction(e.target.value)}>
                  {drawable.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
                </NativeSelect>
              </div>
            )}
            {fixedInt !== undefined && faction && <p className="text-xs text-muted-foreground">{t("fromWarband")}</p>}
            {fixedInt === undefined && (
              <div className="grid gap-2">
                <Label htmlFor={`int-${player.userId}`}>{t("leaderInt")}</Label>
                <Input id={`int-${player.userId}`} type="number" min={1} max={30} value={leaderInt}
                  onChange={(e) => setTypedInt(e.target.value)} className="w-24" />
                <p className="text-xs text-muted-foreground">{t("drawHint")}</p>
              </div>
            )}
            {fixedInt === null ? (
              <p className="text-sm text-muted-foreground">{t("partyFirst")}</p>
            ) : faction && !hasTable ? (
              <p className="text-sm text-muted-foreground">{t("noSchemeTable")}</p>
            ) : (
              <Button type="submit" className="justify-self-start" disabled={intValue < 1 || intValue > 30}>
                <Dices aria-hidden /> {t("draw", { n: cardsFor(content, intValue) })}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">{t("secretHint")}</p>
          </form>
        )}
        {d && d.hidden && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            {d.chosen ? t("hiddenChosen") : t("hiddenDrawn", { n: d.cardCount })}
          </p>
        )}
        {d && !d.hidden && (
          <>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{factionName(d.faction)} · {t("leaderInt")} {d.leaderInt}</span>
              {d.kept && (d.revealed
                ? <Badge variant="secondary"><Eye className="mr-1 size-3" aria-hidden />{t("revealed")}</Badge>
                : isMe && <Badge variant="outline"><EyeOff className="mr-1 size-3" aria-hidden />{t("secret")}</Badge>)}
            </p>
            {d.kept ? (
              schemeOf(d.kept) && (
                <SchemeCard scheme={schemeOf(d.kept)!} highlight
                  action={mayAct && !d.revealed ? (
                    <Button size="sm" variant="outline" className="justify-self-start"
                      onClick={() => window.confirm(t("revealConfirm")) && void onReveal()}>
                      <Eye aria-hidden /> {t("reveal")}
                    </Button>
                  ) : undefined} />
              )
            ) : (
              d.cards.map((c) => {
                const s = schemeOf(c.scheme);
                return s ? (
                  <SchemeCard key={c.scheme} scheme={s} roll={c.roll}
                    action={mayAct ? (
                      <Button size="sm" className="justify-self-start" onClick={() => void onKeep(c.scheme)}>{t("keep")}</Button>
                    ) : undefined} />
                ) : null;
              })
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
