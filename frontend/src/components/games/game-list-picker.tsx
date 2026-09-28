"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Crown, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { loc } from "@/lib/content";
import type { GameList } from "@/lib/games";
import { factionName, itemCost, itemGroupsFor, sourcesFor, type Armies } from "@/lib/warbands";
import { cn } from "@/lib/utils";

export type ListDraft = Omit<GameList, "totalPoints">;

export const MAX_LIST_UNITS = 20;
export const MAX_LIST_ITEMS = 10;

/** Compact list builder for own games: faction, ally, characters with upgrades; shows the points total. */
export function GameListPicker({ id, label, armies, value, onChange }: {
  id: string;
  label: string;
  armies: Armies;
  value: ListDraft;
  onChange: (v: ListDraft) => void;
}) {
  const t = useTranslations("games.list");
  const tw = useTranslations("warbands");
  const locale = useLocale();
  const playable = armies.factions.filter((f) => f.playable);
  const faction = armies.factions.find((f) => f.code === value.faction);
  const unitsByCode = useMemo(() => new Map(armies.units.map((u) => [u.code, u])), [armies]);
  const itemsByCode = useMemo(() => new Map(armies.items.map((i) => [i.code, i])), [armies]);
  const itemGroups = itemGroupsFor(armies, value.faction);

  // Each character once, under the first list that offers it.
  const groups = useMemo(() => {
    const seen = new Set<string>();
    return sourcesFor(armies, value.faction, value.alliedFaction).map((s) => {
      const codes = (armies.lists[s] ?? []).filter((c) => !seen.has(c));
      codes.forEach((c) => seen.add(c));
      return { source: s, units: codes.map((c) => unitsByCode.get(c)!).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)) };
    });
  }, [armies, value.faction, value.alliedFaction, unitsByCode]);

  const total = value.units.reduce((sum, u) => sum + (unitsByCode.get(u.unit)?.points ?? 0)
    + u.items.reduce((s2, i) => s2 + itemCost(itemsByCode.get(i.item), i.reduced), 0), 0);

  const setUnits = (units: ListDraft["units"]) => onChange({ ...value, units });

  return (
    <fieldset className="grid gap-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-faction`} className="text-xs">{tw("faction")}</Label>
          <NativeSelect id={`${id}-faction`} value={value.faction}
            onChange={(e) => onChange({ faction: e.target.value, alliedFaction: null, units: [] })}>
            {playable.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
          </NativeSelect>
        </div>
        {faction && faction.optionalAllies.length > 0 && (
          <div className="grid gap-1">
            <Label htmlFor={`${id}-ally`} className="text-xs">{tw("ally")}</Label>
            <NativeSelect id={`${id}-ally`} value={value.alliedFaction ?? ""}
              onChange={(e) => {
                const allied = e.target.value || null;
                const allowed = new Set(sourcesFor(armies, value.faction, allied).flatMap((src) => armies.lists[src] ?? []));
                onChange({ ...value, alliedFaction: allied, units: value.units.filter((u) => allowed.has(u.unit)) });
              }}>
              <option value="">{tw("noAlly")}</option>
              {faction.optionalAllies.map((c) => <option key={c} value={c}>{factionName(armies, c)}</option>)}
            </NativeSelect>
          </div>
        )}
      </div>

      {value.units.length > 0 && (
        <ul className="grid gap-2">
          {value.units.map((u, idx) => {
            const unit = unitsByCode.get(u.unit);
            return (
              <li key={`${u.unit}-${idx}`} className="grid gap-1 rounded-md bg-muted/40 p-2 text-sm">
                <div className="flex items-center gap-2">
                  <button type="button" aria-pressed={u.leader} title={tw("leader")} aria-label={`${tw("leader")}: ${unit?.name ?? u.unit}`}
                    className={cn("rounded p-0.5", u.leader ? "text-amber-600" : "text-muted-foreground/50 hover:text-muted-foreground")}
                    onClick={() => setUnits(value.units.map((x, j) => ({ ...x, leader: j === idx ? !x.leader : false })))}>
                    <Crown className="size-4" aria-hidden />
                  </button>
                  <span className="font-medium">{unit?.name ?? u.unit}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">{unit?.points ?? 0}</span>
                  <button type="button" aria-label={tw("remove", { name: unit?.name ?? u.unit })}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setUnits(value.units.filter((_, j) => j !== idx))}>
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                {u.items.map((it, k) => {
                  const item = itemsByCode.get(it.item);
                  return (
                    <div key={`${it.item}-${k}`} className="flex flex-wrap items-center gap-2 pl-7 text-xs">
                      <span>{item?.name ?? it.item}</span>
                      {item?.reducedPoints != null && (
                        <label className="flex items-center gap-1 text-muted-foreground" title={loc(item.reducedNote, locale)}>
                          <input type="checkbox" checked={it.reduced}
                            onChange={(e) => setUnits(value.units.map((x, j) => j !== idx ? x
                              : { ...x, items: x.items.map((y, m) => m === k ? { ...y, reduced: e.target.checked } : y) }))} />
                          {t("reduced")}
                        </label>
                      )}
                      <span className="ml-auto tabular-nums text-muted-foreground">+{itemCost(item, it.reduced)}</span>
                      <button type="button" aria-label={tw("removeItem", { name: item?.name ?? it.item })}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setUnits(value.units.map((x, j) => j !== idx ? x : { ...x, items: x.items.filter((_, m) => m !== k) }))}>
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  );
                })}
                {itemGroups.length > 0 && u.items.length < MAX_LIST_ITEMS && (
                  <NativeSelect aria-label={tw("addItemFor", { name: unit?.name ?? u.unit })} value="" className="ml-7 h-7 w-auto max-w-[calc(100%-1.75rem)] text-xs"
                    onChange={(e) => e.target.value && setUnits(value.units.map((x, j) => j !== idx ? x
                      : { ...x, items: [...x.items, { item: e.target.value, reduced: false }] }))}>
                    <option value="">{tw("addItem")}</option>
                    {itemGroups.map((g) => (
                      <optgroup key={g.key} label={g.key === "NEUTRAL" ? tw("neutralItems") : factionName(armies, g.key)}>
                        {g.items.map((it) => <option key={it.code} value={it.code}>{it.name} ({it.points})</option>)}
                      </optgroup>
                    ))}
                  </NativeSelect>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {value.units.length < MAX_LIST_UNITS && (
          <NativeSelect aria-label={t("addUnit")} value="" className="w-auto min-w-0 flex-1"
            onChange={(e) => e.target.value && setUnits([...value.units,
              { unit: e.target.value, leader: value.units.length === 0, items: [] }])}>
            <option value="">{t("addUnit")}</option>
            {groups.map((g) => (
              <optgroup key={g.source} label={factionName(armies, g.source)}>
                {g.units.map((u) => <option key={u.code} value={u.code}>{u.name} ({u.points})</option>)}
              </optgroup>
            ))}
          </NativeSelect>
        )}
        <span className="text-sm tabular-nums">{t("total", { points: total })}</span>
      </div>
    </fieldset>
  );
}
