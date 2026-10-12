"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Crown, Plus, Trash2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { cardsFor, loc, useGameContent } from "@/lib/content";
import {
  factionName,
  itemCost,
  itemGroupsFor,
  MAX_EXTRA_POINTS,
  MAX_ITEMS_PER_UNIT,
  MAX_NOTES,
  MAX_UNITS,
  sourcesFor,
  type Armies,
  type WarbandInput,
} from "@/lib/warbands";
import { cn } from "@/lib/utils";

type ItemRow = { key: number; item: string; reduced: boolean };
type Row = { key: number; unit: string; extra: string; notes: string; leader: boolean; items: ItemRow[]; more: boolean };

/** What the builder starts from: a saved tournament list, a saved list from "My lists" or nothing. */
export type BuilderInitial = {
  faction: string;
  alliedFaction: string | null;
  leaderInt: number;
  units: { unit: string; extraPoints: number; notes: string | null; leader: boolean; items: { item: string; reduced: boolean }[] }[];
} | null;

let nextKey = 1;
const toRows = (initial: BuilderInitial): Row[] =>
  (initial?.units ?? []).map((u) => ({
    key: nextKey++,
    unit: u.unit,
    extra: u.extraPoints ? String(u.extraPoints) : "",
    notes: u.notes ?? "",
    leader: u.leader,
    items: (u.items ?? []).map((i) => ({ key: nextKey++, item: i.item, reduced: i.reduced })),
    more: !!u.extraPoints || !!u.notes,
  }));

/**
 * The list editor shared by tournament lists and "My lists": faction and ally, characters with upgrades,
 * leader and INT (not in a roster), points against an optional limit. Remount it (key) to load another list.
 */
export function ListBuilder({ armies, initial, roster, limit, rosterNote, onSave, onChange, aside, footer, saveHint, extraProblems = [] }: {
  armies: Armies;
  initial: BuilderInitial;
  roster: boolean;
  limit: number | null;
  /** Text shown instead of the leader INT field in roster mode. */
  rosterNote: string;
  onSave: (body: WarbandInput) => Promise<void>;
  /** Current content on every change (e.g. to compare with a saved list). */
  onChange?: (body: WarbandInput) => void;
  /** Extra fields at the top of the summary card (e.g. name and format of a saved list). */
  aside?: React.ReactNode;
  /** Below the save button. */
  footer?: React.ReactNode;
  saveHint?: string;
  extraProblems?: string[];
}) {
  const t = useTranslations("warbands");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const content = useGameContent();
  const playable = armies.factions.filter((f) => f.playable);
  const [faction, setFaction] = useState(initial?.faction ?? playable[0]?.code ?? "");
  const [allied, setAllied] = useState<string>(initial?.alliedFaction ?? "");
  const [leaderInt, setLeaderInt] = useState(initial && initial.leaderInt > 0 ? String(initial.leaderInt) : "");
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

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
  const problems: string[] = [...extraProblems];
  if (rows.length === 0) problems.push(t("problems.empty"));
  if (!roster && leaders !== 1) problems.push(t("problems.leader"));
  if (!roster && (intValue < 1 || intValue > 30)) problems.push(t("problems.int"));
  if (limit != null && total > limit) problems.push(t("problems.overLimit", { over: total - limit }));
  if (invalidUnits.length > 0) problems.push(t("problems.notAllowed", { n: invalidUnits.length }));
  if (rows.some((r) => extraOf(r) > MAX_EXTRA_POINTS)) problems.push(t("problems.extra", { max: MAX_EXTRA_POINTS }));
  const invalidItems = rows.reduce((n, r) => n + r.items.filter((i) => !allowedItems.has(i.item)).length, 0);
  if (invalidItems > 0) problems.push(t("problems.itemNotAllowed", { n: invalidItems }));

  const body: WarbandInput = {
    faction,
    alliedFaction: allied || null,
    leaderInt: roster ? 0 : intValue,
    units: rows.map((r) => ({
      unit: r.unit,
      extraPoints: extraOf(r),
      notes: r.notes.trim() || null,
      leader: !roster && r.leader,
      items: r.items.map((i) => ({ item: i.item, reduced: i.reduced })),
    })),
  };
  const bodyJson = JSON.stringify(body);
  useEffect(() => {
    onChange?.(JSON.parse(bodyJson) as WarbandInput);
  }, [bodyJson, onChange]);

  function update(key: number, patch: Partial<Row>) {
    setSaved(false);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function add(code: string) {
    setSaved(false);
    setRows((rs) => (rs.length >= MAX_UNITS ? rs : [...rs, { key: nextKey++, unit: code, extra: "", notes: "", leader: !roster && rs.length === 0, items: [], more: false }]));
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
    try {
      await onSave(body);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const pct = limit ? Math.min(100, Math.round((total / limit) * 100)) : 0;

  return (
    <>
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
                    {!roster && (
                      <label className="flex w-fit items-center gap-2 text-sm">
                        <input type="radio" name="leader" checked={r.leader}
                          onChange={() => { setSaved(false); setRows((rs) => rs.map((x) => ({ ...x, leader: x.key === r.key }))); }} />
                        <Crown className="size-4 text-amber-600" aria-hidden /> {t("leader")}
                      </label>
                    )}

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
              {aside}
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
              {roster ? (
                <p className="text-sm text-muted-foreground">{rosterNote}</p>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="wb-int">{t("leaderInt")}</Label>
                  <Input id="wb-int" type="number" inputMode="numeric" min={1} max={30} className="w-24" value={leaderInt}
                    onChange={(e) => { setSaved(false); setLeaderInt(e.target.value); }} />
                  <p className="text-xs text-muted-foreground">
                    {content && intValue >= 1 ? t("intHint", { n: cardsFor(content, intValue) }) : t("intHintEmpty")}
                  </p>
                </div>
              )}
              {problems.length > 0 && (
                <ul className="grid list-disc gap-1 pl-5 text-sm text-destructive">
                  {problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
              <Button type="button" disabled={busy || problems.length > 0} onClick={() => void save()}>
                {busy ? t("saving") : t("save")}
              </Button>
              {saveHint && <p className="text-xs text-muted-foreground">{saveHint}</p>}
              {footer}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
