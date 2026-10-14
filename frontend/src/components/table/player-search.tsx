"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
import { api } from "@/lib/api";
import type { SearchHit } from "@/lib/players";

/** Pick a registered player by name: the search starts after 2 letters (same endpoint as own games). */
export function PlayerSearch({ value, onChange, id = "player-search", disabled }: {
  value: SearchHit | null;
  onChange: (hit: SearchHit | null) => void;
  id?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("table");
  const { me } = useAuth();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || value) return;
    let active = true;
    const timer = setTimeout(() => {
      api<SearchHit[]>("GET", `/api/players/search?${new URLSearchParams({ q })}`)
        .then((h) => { if (active) { setHits(h.filter((x) => x.id !== me?.id)); setSearched(true); } })
        .catch(() => { if (active) { setHits([]); setSearched(true); } });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, value, me?.id]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
        <span className="font-medium">{value.displayName}</span>
        {value.club && <span className="text-muted-foreground">· {value.club}</span>}
        <button type="button" disabled={disabled} className="ml-auto text-muted-foreground hover:text-foreground" aria-label={t("changePlayer")}
          onClick={() => { onChange(null); setHits([]); setQuery(""); setSearched(false); }}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input id={id} autoComplete="off" placeholder={t("playerSearchPlaceholder")} value={query} disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length < 2) { setHits([]); setSearched(false); }
        }} />
      {hits.length > 0 ? (
        <ul className="absolute top-full z-10 mt-1 grid max-h-64 w-full overflow-auto rounded-md border bg-card shadow-md">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => { onChange(h); setHits([]); }}>
                {h.displayName}{h.club && <span className="text-muted-foreground"> · {h.club}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : searched && query.trim().length >= 2 ? (
        <p className="mt-1 text-xs text-muted-foreground">{t("noPlayersFound")}</p>
      ) : null}
    </div>
  );
}
