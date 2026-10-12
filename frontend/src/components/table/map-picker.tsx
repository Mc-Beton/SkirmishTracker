"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { imageUrl, type MapScope, type MapSummary } from "@/lib/table/api";

/** Browse maps: official, shared by players, or own; search by map name or author. */
export function MapPicker({ selected, onSelect, actions }: {
  selected?: string | null;
  onSelect?: (m: MapSummary) => void;
  actions?: (m: MapSummary) => React.ReactNode;
}) {
  const t = useTranslations("table");
  const [scope, setScope] = useState<MapScope>("OFFICIAL");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [maps, setMaps] = useState<MapSummary[] | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ scope, ...(query ? { q: query } : {}) });
    api<MapSummary[]>("GET", `/api/table/maps?${params}`)
      .then((m) => active && setMaps(m))
      .catch(() => active && setMaps([]));
    return () => {
      active = false;
    };
  }, [scope, query]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {(["OFFICIAL", "PUBLIC", "MINE"] as MapScope[]).map((s) => (
          <Button key={s} size="sm" variant={scope === s ? "default" : "outline"} onClick={() => setScope(s)}>{t(`scope.${s}`)}</Button>
        ))}
        <form className="flex min-w-0 flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <Input value={q} maxLength={60} placeholder={t("searchMaps")} aria-label={t("searchMaps")} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" size="icon" variant="outline" aria-label={t("search")}><Search aria-hidden /></Button>
        </form>
      </div>
      {maps === null ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : maps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMaps")}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {maps.map((m) => (
            <li key={m.id}>
              <div className={`flex gap-3 rounded-lg border p-2 ${selected === m.id ? "border-primary ring-1 ring-primary" : ""}`}>
                {m.backgroundImageId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(m.backgroundImageId)} alt="" className="size-16 shrink-0 rounded object-cover" />
                )}
                <div className="grid min-w-0 flex-1 content-start gap-1">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {m.official && <Badge variant="success">{t("official")}</Badge>}
                    {!m.official && m.mine && <Badge variant="outline">{m.isPublic ? t("public") : t("private")}</Badge>}
                    <span>{m.author?.name}</span>
                    <span>· {t("piecesCount", { n: m.pieces })}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {onSelect && <Button size="sm" variant={selected === m.id ? "default" : "outline"} onClick={() => onSelect(m)}>{t("choose")}</Button>}
                    {actions?.(m)}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
