"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Crown, Lock, Plus, Trash2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";
import { cardsFor, loc, useGameContent } from "@/lib/content";
import type { TournamentDetail } from "@/lib/tournaments";
import {
  factionName,
  itemCost,
  itemGroupsFor,
  MAX_EXTRA_POINTS,
  MAX_ITEMS_PER_UNIT,
  MAX_NOTES,
  MAX_UNITS,
  sourcesFor,
  useArmies,
  type Armies,
  type MyWarband,
  type Warband,
  type WarbandInput,
} from "@/lib/warbands";
import { cn } from "@/lib/utils";
import { ListStatusBadge } from "./list-status-badge";

type ItemRow = { key: number; item: string; reduced: boolean };
type Row = { key: number; unit: string; extra: string; notes: string; leader: boolean; items: ItemRow[]; more: boolean };

let nextKey = 1;
const toRows = (w: Warband | null): Row[] =>
  (w?.units ?? []).map((u) => ({
    key: nextKey++,
    unit: u.unit,
    extra: u.extraPoints ? String(u.extraPoints) : "",
    notes: u.notes ?? "",
    leader: u.leader,
    items: (u.items ?? []).map((i) => ({ key: nextKey++, item: i.item, reduced: i.reduced })),
    more: !!u.extraPoints || !!u.notes,
  }));

type Loaded = { tournament: TournamentDetail; warband: Warband | null; editable: boolean; pointsLimit: number | null };

/**
 * Warband builder. Without `userId` it edits the caller's own list; with `userId` it shows another player's
 * list (read-only, or editable for the organizer).
 */
export function WarbandEditor({ tournamentId, userId }: { tournamentId: string; userId?: string }) {
  const t = useTranslations("warbands");
  const errorMessage = useErrorMessage();
  const { me } = useAuth();
  const armies = useArmies();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const detail = api<TournamentDetail>("GET", `/api/tournaments/${tournamentId}`);
    const list = userId
      ? api<Warband>("GET", `/api/tournaments/${tournamentId}/warbands/${userId}`).then((w) => ({
          warband: w, editable: w.editable, pointsLimit: w.pointsLimit,
        }))
      : api<MyWarband>("GET", `/api/tournaments/${tournamentId}/warbands/me`);
    Promise.all([detail, list])
      .then(([tournament, l]) => active && setData({ tournament, warband: l.warband, editable: l.editable, pointsLimit: l.pointsLimit }))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [tournamentId, userId, me?.id, errorMessage]);

  const back = (
    <Link href={`/tournaments/${tournamentId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> {data?.tournament.name ?? t("backToTournament")}
    </Link>
  );

  if (!data || !armies) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-10">
        {back}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      {back}
      <Builder data={data} armies={armies} tournamentId={tournamentId}
        userId={userId} onSaved={(w) => setData({ ...data, warband: w })} />
    </div>
  );
}

function Builder({ data, armies, tournamentId, userId, onSaved }: {
  data: Loaded;
  armies: Armies;
  tournamentId: string;
  userId?: string;
  onSaved: (w: Warband) => void;
}) {
  const t = useTranslations("warbands");
  const locale = useLocale();
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const content = useGameContent();
  const playable = armies.factions.filter((f) => f.playable);
  const initial = data.warband;
  const [faction, setFaction] = useState(initial?.faction ?? playable[0]?.code ?? "");
  const [allied, setAllied] = useState<string>(initial?.alliedFaction ?? "");
  const [leaderInt, setLeaderInt] = useState(initial ? String(initial.leaderInt) : "");
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const editable = data.editable;
  const limit = data.pointsLimit;
  const factionInfo = armies.factions.find((f) => f.code === faction);
  const sources = useMemo(() => sourcesFor(armies, faction, allied || null), [armies, faction, allied]);
  const unitsByCode = useMemo(() => new Map(armies.units.map((u) => [u.code, u])), [armies]);

  // Each character once, under the first list that offers it (own faction before the Guild).
  const groups = useMemo(() => {
    const seen = new Set<string>();
    return sources.map((s) => {
      const codes = (armies.lists[s] ?? []).filter((c) => !seen.has(c));
      codes.forEach((c) => seen.add(c));
      return { source: s, units: codes.map((c) => unitsByCode.get(c)!).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)) };
    });
  }, [armies, sources, unitsByCode]);
  const allowed = new Set(groups.flatMap((g) => g.units.map((u) => u.code)));
  const sourceOf = (code: string) => groups.find((g) => g.units.some((u) => u.code === code))?.source ?? null;

  const itemGroups = useMemo(() => itemGroupsFor(armies, faction), [armies, faction]);
  const itemsByCode = useMemo(() => new Map(armies.items.map((i) => [i.code, i])), [armies]);
  const allowedItems = new Set(itemGroups.flatMap((g) => g.items.map((i) => i.code)));

  const extraOf = (r: Row) => Math.max(0, Number.parseInt(r.extra || "0", 10) || 0);
  const rowTotal = (r: Row) =>
    (unitsByCode.get(r.unit)?.points ?? 0) + extraOf(r)
    + r.items.reduce((sum, i) => sum + itemCost(itemsByCode.get(i.item), i.reduced), 0);
  const total = rows.reduce((sum, r) => sum + rowTotal(r), 0);
  const intValue = Number.parseInt(leaderInt || "0", 10) || 0;
  const leaders = rows.filter((r) => r.leader).length;
  const invalidUnits = rows.filter((r) => !allowed.has(r.unit));
  const problems: string[] = [];
  if (rows.length === 0) problems.push(t("problems.empty"));
  if (leaders !== 1) problems.push(t("problems.leader"));
  if (intValue < 1 || intValue > 30) problems.push(t("problems.int"));
  if (limit != null && total > limit) problems.push(t("problems.overLimit", { over: total - limit }));
  if (invalidUnits.length > 0) problems.push(t("problems.notAllowed", { n: invalidUnits.length }));
  if (rows.some((r) => extraOf(r) > MAX_EXTRA_POINTS)) problems.push(t("problems.extra", { max: MAX_EXTRA_POINTS }));
  const invalidItems = rows.reduce((n, r) => n + r.items.filter((i) => !allowedItems.has(i.item)).length, 0);
  if (invalidItems > 0) problems.push(t("problems.itemNotAllowed", { n: invalidItems }));

  function update(key: number, patch: Partial<Row>) {
    setSaved(false);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function add(code: string) {
    setSaved(false);
    setRows((rs) => (rs.length >= MAX_UNITS ? rs : [...rs, { key: nextKey++, unit: code, extra: "", notes: "", leader: rs.length === 0, items: [], more: false }]));
  }
  function addItem(key: number, item: string) {
    setSaved(false);
    setRows((rs) => rs.map((r) => (r.key === key && r.items.length < MAX_ITEMS_PER_UNIT
      ? { ...r, items: [...r.items, { key: nextKey++, item, reduced: false }] } : r)));
  }
  function updateItem(key: number, itemKey: number, patch: Partial<ItemRow>) {
    setSaved(false);
    setRows((rs) => rs.map((r) => (r.key === key
      ? { ...r, items: r.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) } : r)));
  }
  function removeItem(key: number, itemKey: number) {
    setSaved(false);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, items: r.items.filter((i) => i.key !== itemKey) } : r)));
  }
  function remove(key: number) {
    setSaved(false);
    setRows((rs) => rs.filter((r) => r.key !== key));
  }
  function changeFaction(code: string) {
    setSaved(false);
    setFaction(code);
    setAllied("");
  }

  async function save() {
    setError(null);
    setBusy(true);
    const body: WarbandInput = {
      faction,
      alliedFaction: allied || null,
      leaderInt: intValue,
      units: rows.map((r) => ({
        unit: r.unit,
        extraPoints: extraOf(r),
        notes: r.notes.trim() || null,
        leader: r.leader,
        items: r.items.map((i) => ({ item: i.item, reduced: i.reduced })),
      })),
    };
    try {
      const path = userId ? `warbands/${userId}` : "warbands/me";
      const w = await api<Warband>("PUT", `/api/tournaments/${tournamentId}/${path}`, body);
      setSaved(true);
      onSaved(w);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const deadline = data.tournament.listDeadline;
  const owner = userId ? initial?.displayName ?? "" : null;
  const pct = limit ? Math.min(100, Math.round((total / limit) * 100)) : 0;

  const header = (
    <header className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-3xl">{owner ? t("titleOf", { name: owner }) : t("title")}</h1>
        {initial && <ListStatusBadge status={initial.listStatus} />}
      </div>
      {deadline && (
        <p className="text-sm text-muted-foreground">
          {t("deadline", { date: format.dateTime(new Date(deadline), { dateStyle: "medium", timeStyle: "short" }) })}
        </p>
      )}
      {!editable && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden /> {userId ? t("readOnly") : t("locked")}
        </p>
      )}
    </header>
  );

  const totalBar = (
    <div className="grid gap-1" aria-live="polite">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">{t("total")}</span>
        <span className={cn("font-display text-2xl tabular-nums", limit != null && total > limit && "text-destructive")}>
          {total}{limit != null && <span className="text-base text-muted-foreground"> / {limit}</span>}
        </span>
      </div>
      {limit != null && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", total > limit ? "bg-destructive" : "bg-primary")}
            style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );

  if (!editable) {
    if (!initial) {
      return (
        <>
          {header}
          <p className="text-muted-foreground">{t("none")}</p>
        </>
      );
    }
    return (
      <>
        {header}
        <Card>
          <CardContent className="grid gap-4">
            <p>
              <span className="font-medium">{factionName(armies, initial.faction)}</span>
              {initial.alliedFaction && <span className="text-muted-foreground"> + {factionName(armies, initial.alliedFaction)}</span>}
              <span className="text-muted-foreground"> · {t("leaderInt")} {initial.leaderInt}</span>
            </p>
            <ul className="grid gap-2">
              {initial.units.map((u, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2 last:border-0">
                  <span className="flex items-center gap-1 font-medium">
                    {u.leader && <Crown className="size-4 text-amber-600" aria-label={t("leader")} />}
                    {u.name}
                  </span>
                  {u.source && u.source !== initial.faction && <Badge variant="outline">{factionName(armies, u.source)}</Badge>}
                  {u.notes && <span className="text-sm text-muted-foreground">{u.notes}</span>}
                  <span className="ml-auto tabular-nums">{u.totalPoints ?? u.points}</span>
                  {(u.items?.length > 0 || u.extraPoints > 0) && (
                    <ul className="grid w-full gap-0.5 border-l-2 border-primary/30 pl-3 text-sm text-muted-foreground">
                      <li className="flex justify-between"><span>{u.name}</span><span className="tabular-nums">{u.points}</span></li>
                      {u.items.map((it, k) => (
                        <li key={k} className="flex justify-between"><span>{it.name}</span><span className="tabular-nums">+{it.points}</span></li>
                      ))}
                      {u.extraPoints > 0 && (
                        <li className="flex justify-between"><span>{t("otherPoints")}</span><span className="tabular-nums">+{u.extraPoints}</span></li>
                      )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>{t("total")}</span>
              <span className="tabular-nums">{initial.totalPoints}{initial.pointsLimit != null && ` / ${initial.pointsLimit}`}</span>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      {error && <Alert variant="destructive">{error}</Alert>}
      {saved && <Alert variant="success">{t("saved")}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="grid content-start gap-6 [&>*]:min-w-0">
          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="wb-faction">{t("faction")}</Label>
                <NativeSelect id="wb-faction" value={faction} onChange={(e) => changeFaction(e.target.value)}>
                  {playable.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
                </NativeSelect>
                {factionInfo && factionInfo.alwaysAvailable.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("alsoAvailable", { lists: factionInfo.alwaysAvailable.map((c) => factionName(armies, c)).join(", ") })}
                  </p>
                )}
              </div>
              {factionInfo && factionInfo.optionalAllies.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="wb-ally">{t("ally")}</Label>
                  <NativeSelect id="wb-ally" value={allied} onChange={(e) => { setSaved(false); setAllied(e.target.value); }}>
                    <option value="">{t("noAlly")}</option>
                    {factionInfo.optionalAllies.map((c) => <option key={c} value={c}>{factionName(armies, c)}</option>)}
                  </NativeSelect>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t("units", { n: rows.length, max: MAX_UNITS })}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>}
              {rows.map((r) => {
                const u = unitsByCode.get(r.unit);
                const src = sourceOf(r.unit);
                const bad = !allowed.has(r.unit);
                return (
                  <div key={r.key} className={cn("grid gap-2 rounded-lg border p-3", bad && "border-destructive")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{u?.name ?? r.unit}</span>
                      {src && src !== faction && <Badge variant="outline">{factionName(armies, src)}</Badge>}
                      {bad && <Badge variant="destructive">{t("notAllowed")}</Badge>}
                      <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                        {rowTotal(r) !== (u?.points ?? 0) && <span className="mr-1">{u?.points ?? 0} →</span>}
                        <span className="font-medium text-foreground">{rowTotal(r)}</span> {t("pts")}
                      </span>
                      <Button type="button" variant="ghost" size="icon" aria-label={t("remove", { name: u?.name ?? r.unit })}
                        onClick={() => remove(r.key)}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                    <label className="flex w-fit items-center gap-2 text-sm">
                      <input type="radio" name="leader" checked={r.leader}
                        onChange={() => { setSaved(false); setRows((rs) => rs.map((x) => ({ ...x, leader: x.key === r.key }))); }} />
                      <Crown className="size-4 text-amber-600" aria-hidden /> {t("leader")}
                    </label>

                    {r.items.length > 0 && (
                      <ul className="grid gap-1 border-l-2 border-primary/30 pl-3">
                        {r.items.map((i) => {
                          const item = itemsByCode.get(i.item);
                          const itemBad = !allowedItems.has(i.item);
                          return (
                            <li key={i.key} className="grid gap-0.5">
                              <div className="flex items-center gap-2 text-sm">
                                <span className={cn(itemBad && "text-destructive line-through")}>{item?.name ?? i.item}</span>
                                <span className="ml-auto tabular-nums text-muted-foreground">+{itemCost(item, i.reduced)}</span>
                                <Button type="button" variant="ghost" size="icon" className="size-7"
                                  aria-label={t("removeItem", { name: item?.name ?? i.item })} onClick={() => removeItem(r.key, i.key)}>
                                  <X aria-hidden />
                                </Button>
                              </div>
                              {item?.reducedPoints != null && (
                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <input type="checkbox" checked={i.reduced}
                                    onChange={(e) => updateItem(r.key, i.key, { reduced: e.target.checked })} />
                                  {t("reducedCost", { points: item.reducedPoints, when: loc(item.reducedNote, locale) })}
                                </label>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {itemGroups.length > 0 && (
                        <NativeSelect aria-label={t("addItemFor", { name: u?.name ?? r.unit })} value=""
                          disabled={r.items.length >= MAX_ITEMS_PER_UNIT}
                          onChange={(e) => e.target.value && addItem(r.key, e.target.value)} className="h-8 w-auto max-w-full text-xs">
                          <option value="">{t("addItem")}</option>
                          {itemGroups.map((g) => (
                            <optgroup key={g.key} label={g.key === "NEUTRAL" ? t("neutralItems") : factionName(armies, g.key)}>
                              {g.items.map((it) => (
                                <option key={it.code} value={it.code}>
                                  {it.name} ({it.reducedPoints != null ? `${it.points}/${it.reducedPoints}` : it.points} {t("pts")})
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </NativeSelect>
                      )}
                      {!r.more && (
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => update(r.key, { more: true })}>
                          {t("moreOptions")}
                        </Button>
                      )}
                    </div>

                    {r.more && (
                      <div className="grid gap-2 sm:grid-cols-[7rem_1fr]">
                        <Input type="number" inputMode="numeric" min={0} max={MAX_EXTRA_POINTS} placeholder={t("extraPlaceholder")}
                          aria-label={t("extra", { name: u?.name ?? r.unit })} value={r.extra}
                          onChange={(e) => update(r.key, { extra: e.target.value })} />
                        <Input maxLength={MAX_NOTES} placeholder={t("notesPlaceholder")}
                          aria-label={t("notes", { name: u?.name ?? r.unit })} value={r.notes}
                          onChange={(e) => update(r.key, { notes: e.target.value })} />
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">{t("extraHint")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t("recruit")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              {groups.map((g) => (
                <section key={g.source} className="grid gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground">{factionName(armies, g.source)}</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {g.units.map((u) => (
                      <Button key={u.code} type="button" variant="outline" className="h-auto justify-between py-2 whitespace-normal text-left"
                        disabled={rows.length >= MAX_UNITS} onClick={() => add(u.code)}>
                        <span className="flex items-center gap-2"><Plus aria-hidden /> {u.name}</span>
                        <span className="tabular-nums text-muted-foreground">{u.points}</span>
                      </Button>
                    ))}
                  </div>
                </section>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="grid content-start gap-4 lg:sticky lg:top-20">
          <Card>
            <CardContent className="grid gap-4">
              {totalBar}
              <div className="grid gap-2">
                <Label htmlFor="wb-int">{t("leaderInt")}</Label>
                <Input id="wb-int" type="number" inputMode="numeric" min={1} max={30} className="w-24" value={leaderInt}
                  onChange={(e) => { setSaved(false); setLeaderInt(e.target.value); }} />
                <p className="text-xs text-muted-foreground">
                  {content && intValue >= 1 ? t("intHint", { n: cardsFor(content, intValue) }) : t("intHintEmpty")}
                </p>
              </div>
              {problems.length > 0 && (
                <ul className="grid list-disc gap-1 pl-5 text-sm text-destructive">
                  {problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
              <Button type="button" disabled={busy || problems.length > 0} onClick={() => void save()}>
                {busy ? t("saving") : t("save")}
              </Button>
              {!userId && <p className="text-xs text-muted-foreground">{t("saveHint")}</p>}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
