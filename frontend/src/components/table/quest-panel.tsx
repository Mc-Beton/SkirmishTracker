"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dices, Flag, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { QuestView } from "@/components/game/quest-view";
import { SchemeCard } from "@/components/game/scheme-card";
import { cardsFor, useGameContent } from "@/lib/content";
import type { TableCommand, TableView } from "@/lib/table/api";

type Props = {
  view: TableView;
  busy: boolean;
  run: (cmd: TableCommand, asSide?: 0 | 1) => Promise<boolean>;
};

/** Players (not the judge or observers) set the quest and Schemes of a free game. */
const canSet = (view: TableView) => view.role === "PLAYER";

const nameOf = (view: TableView, side: number) => view.players.find((p) => p.side === side)?.name ?? "?";

/** The quest's rules card (folded). In a free game the players pick or change the quest here. */
export function QuestCard({ view, busy, run }: { view: TableView; busy?: boolean; run?: Props["run"] }) {
  const t = useTranslations("table");
  const content = useGameContent();
  const quest = content?.quests.find((q) => q.code === view.questCode) ?? null;
  const editable = view.mode === "SANDBOX" && canSet(view) && view.status !== "FINISHED" && !!run;
  if (!quest && !editable) return null;
  return (
    <CollapsibleCard title={quest ? t("questTitle", { name: quest.name }) : t("quest")} defaultOpen={editable && !quest}
      contentClassName="grid gap-3">
      {editable && (
        <NativeSelect value={view.questCode ?? ""} disabled={busy} aria-label={t("quest")}
          onChange={(e) => void run!({ type: "SET_QUEST", ref: e.target.value || undefined })}>
          <option value="">{t("noQuest")}</option>
          {(content?.quests ?? []).map((q) => <option key={q.code} value={q.code}>{q.name}</option>)}
        </NativeSelect>
      )}
      {quest && <QuestView quest={quest} compact />}
    </CollapsibleCard>
  );
}

/** Free game: each side picks its Scheme from the list (alone you pick both). */
function SandboxSchemes({ view, busy, run }: Props) {
  const t = useTranslations("table");
  const content = useGameContent();
  const schemeOf = (code: string) => content?.schemes.find((s) => s.code === code);
  const name = (side: number) => view.players.find((p) => p.side === side)?.name ?? t("sideB");
  const keptOf = (side: number) => view.parties.find((p) => p.side === side)?.kept ?? null;
  const summary = [0, 1].map((s) => `${name(s)}: ${keptOf(s) ? schemeOf(keptOf(s)!)?.name ?? keptOf(s) : "—"}`).join(" · ");
  return (
    <CollapsibleCard title={t("schemes")} meta={summary} defaultOpen={false} contentClassName="grid gap-3 text-sm">
      {[0, 1].map((side) => {
        const kept = keptOf(side);
        const sc = kept ? schemeOf(kept) : null;
        const mayPick = canSet(view) && view.status !== "FINISHED" && (view.solo || view.you === side);
        return (
          <div key={side} className="grid gap-2">
            <span className="font-medium">{name(side)}</span>
            {mayPick && (
              <NativeSelect value={kept ?? ""} disabled={busy} aria-label={t("pickScheme")}
                onChange={(e) => e.target.value && void run({ type: "PICK_SCHEME", side: side as 0 | 1, scheme: e.target.value }, side as 0 | 1)}>
                <option value="">{t("pickScheme")}</option>
                {(content?.schemes ?? []).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </NativeSelect>
            )}
            {sc ? <SchemeCard scheme={sc} highlight /> : !mayPick && <span className="text-xs text-muted-foreground">{t("noSchemeYet")}</span>}
          </div>
        );
      })}
    </CollapsibleCard>
  );
}

/**
 * Scheme cards (drawn with server dice, one kept – public as in the rules). Folded once the player has kept one;
 * open while they still have to draw or choose.
 */
export function SchemesCard({ view, busy, run }: Props) {
  if (view.mode === "SANDBOX") return <SandboxSchemes view={view} busy={busy} run={run} />;
  return <DrawnSchemes view={view} busy={busy} run={run} />;
}

function DrawnSchemes({ view, busy, run }: Props) {
  const t = useTranslations("table");
  const content = useGameContent();
  const you = view.you;
  const name = (side: number) => nameOf(view, side);
  const schemeOf = (code: string) => content?.schemes.find((s) => s.code === code);
  const myParty = view.parties.find((p) => p.side === you);
  const canDraw = view.game.status === "SETUP" || (view.game.status === "PLAYING" && view.game.round <= 1);
  const summary = view.parties.map((p) => `${name(p.side)}: ${p.kept ? schemeOf(p.kept)?.name ?? p.kept : "—"}`).join(" · ");

  return (
    <CollapsibleCard title={t("schemes")} meta={summary} defaultOpen={!!myParty && !myParty.kept}
      contentClassName="grid gap-3 text-sm">
          {[0, 1].map((side) => {
            const party = view.parties.find((p) => p.side === side);
            if (!party) return null;
            const mine = side === you;
            const kept = party.kept ? schemeOf(party.kept) : null;
            return (
              <div key={side} className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{name(side)}</span>
                  <span className="text-xs text-muted-foreground">{t("leaderInt", { int: party.leaderInt })}
                    {content ? ` · ${t("cardsToDraw", { n: cardsFor(content, party.leaderInt) })}` : ""}</span>
                </div>
                {kept ? (
                  <SchemeCard scheme={kept} highlight />
                ) : party.drawn.length > 0 ? (
                  <div className="grid gap-2">
                    {party.drawn.map((c) => {
                      const sc = schemeOf(c.scheme);
                      return sc ? (
                        <SchemeCard key={c.scheme} scheme={sc} roll={c.roll} action={mine ? (
                          <Button size="sm" disabled={busy} onClick={() => void run({ type: "KEEP_SCHEME", scheme: c.scheme })}>{t("keepScheme")}</Button>
                        ) : undefined} />
                      ) : <span key={c.scheme}>{c.scheme}</span>;
                    })}
                  </div>
                ) : mine && canDraw ? (
                  <Button size="sm" disabled={busy} onClick={() => void run({ type: "DRAW_SCHEMES" })}><Dices aria-hidden /> {t("drawSchemes")}</Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("noSchemeYet")}</span>
                )}
              </div>
            );
          })}
    </CollapsibleCard>
  );
}

/** Victory Points per round for both players, ending the game together and reporting the result. */
export function VpCard({ view, busy, run, onReport }: Props & { onReport: () => Promise<void> }) {
  const t = useTranslations("table");
  const you = view.you;
  const judge = view.role === "JUDGE";
  /** Players and the judge enter Victory Points. */
  const canEdit = you >= 0 || judge;
  const name = (side: number) => nameOf(view, side);
  const rounds = Math.max(1, view.game.round || 1);
  const playing = view.game.status === "PLAYING";
  if (view.game.status === "SETUP") return null;

  return (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("victoryPoints")}</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs tabular-nums">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-normal">{t("roundShort")}</th>
                    {[0, 1].map((s) => <th key={s} className="font-normal" colSpan={2}>{name(s)}</th>)}
                  </tr>
                  <tr className="text-muted-foreground">
                    <th />
                    {[0, 1].map((s) => (
                      <SideHeads key={s} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.min(rounds, 10) }, (_, i) => i + 1).map((round) => (
                    <tr key={round}>
                      <td className="text-left">{round}</td>
                      {[0, 1].map((side) => {
                        const row = view.vp.find((r) => r.side === side && r.round === round);
                        return (
                          <VpCells key={side} disabled={busy || !playing || !canEdit} scenario={row?.scenario ?? 0} scheme={row?.scheme ?? 0}
                            onSave={(scenario, scheme) => void run({ type: "VP", side: side as 0 | 1, round, vpScenario: scenario, vpScheme: scheme })} />
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className="text-left">{t("total")}</td>
                    <td colSpan={2}>{view.vpTotal[0]}</td>
                    <td colSpan={2}>{view.vpTotal[1]}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {playing && judge && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ type: "END_GAME" })}><Flag aria-hidden /> {t("judgeEndGame")}</Button>
            )}
            {playing && view.solo && (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={async () => { if (await run({ type: "END_GAME" }, 0)) await run({ type: "END_GAME" }, 1); }}>
                <Flag aria-hidden /> {t("endGameSolo")}
              </Button>
            )}
            {playing && you >= 0 && !view.solo && (
              view.endProposedBy == null ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ type: "END_GAME" })}><Flag aria-hidden /> {t("proposeEnd")}</Button>
              ) : view.endProposedBy === you ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="warning">{t("endProposedByYou")}</Badge>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ type: "END_GAME" })}>{t("withdraw")}</Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="warning">{t("endProposedBy", { name: name(view.endProposedBy) })}</Badge>
                  <Button size="sm" disabled={busy} onClick={() => void run({ type: "END_GAME" })}>{t("acceptEnd")}</Button>
                </div>
              )
            )}

            {view.status === "FINISHED" && view.game.endReason === "FINISHED" && you >= 0 && view.mode !== "SANDBOX" && (
              view.reportedGameId ? (
                <p className="text-xs">{t.rich("reported", { link: (c) => <Link className="underline" href="/games">{c}</Link> })}</p>
              ) : (
                <ReportButton busy={busy} onReport={onReport} />
              )
            )}
          </CardContent>
        </Card>
  );
}

function SideHeads() {
  const t = useTranslations("table");
  return (
    <>
      <th className="font-normal" title={t("scenarioVp")}>{t("scenarioShort")}</th>
      <th className="font-normal" title={t("schemeVp")}>{t("schemeShort")}</th>
    </>
  );
}

/** Two small number inputs; saved when the field loses focus and the value changed. */
function VpCells({ scenario, scheme, disabled, onSave }: {
  scenario: number; scheme: number; disabled: boolean; onSave: (scenario: number, scheme: number) => void;
}) {
  const [a, setA] = useState(String(scenario));
  const [b, setB] = useState(String(scheme));
  const [seen, setSeen] = useState({ scenario, scheme });
  if (seen.scenario !== scenario || seen.scheme !== scheme) {
    // the server value changed (the opponent entered it): show it
    setSeen({ scenario, scheme });
    setA(String(scenario));
    setB(String(scheme));
  }
  const save = () => {
    const na = Math.max(0, Math.min(30, Number(a) || 0)), nb = Math.max(0, Math.min(30, Number(b) || 0));
    if (na !== scenario || nb !== scheme) onSave(na, nb);
  };
  const cls = "h-7 w-12 px-1 text-center text-xs";
  return (
    <>
      <td><Input type="number" min={0} max={30} className={cls} value={a} disabled={disabled} onChange={(e) => setA(e.target.value)} onBlur={save} /></td>
      <td><Input type="number" min={0} max={30} className={cls} value={b} disabled={disabled} onChange={(e) => setB(e.target.value)} onBlur={save} /></td>
    </>
  );
}

function ReportButton({ busy, onReport }: { busy: boolean; onReport: () => Promise<void> }) {
  const t = useTranslations("table");
  return (
    <div className="grid gap-1">
      <Button size="sm" disabled={busy} onClick={() => void onReport()}><Send aria-hidden /> {t("reportResult")}</Button>
      <p className="text-xs text-muted-foreground">{t("reportHelp")}</p>
    </div>
  );
}
