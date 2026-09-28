"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";
import type { LeagueSummary, OrganizerLink } from "@/lib/leagues";

const VARIANT = { PENDING: "warning", ACCEPTED: "success", REJECTED: "destructive" } as const;

/** Organizer panel: submit the tournament to a league and see the owner's decisions. */
export function LeagueSubmit({ tournamentId }: { tournamentId: string }) {
  const t = useTranslations("leagues");
  const errorMessage = useErrorMessage();
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [links, setLinks] = useState<OrganizerLink[]>([]);
  const [picked, setPicked] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLinks(await api<OrganizerLink[]>("GET", `/api/tournaments/${tournamentId}/league-links`));
  }, [tournamentId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<LeagueSummary[]>("GET", "/api/leagues"),
      api<OrganizerLink[]>("GET", `/api/tournaments/${tournamentId}/league-links`),
    ])
      .then(([l, k]) => {
        if (!active) return;
        setLeagues(l.filter((x) => x.active));
        setLinks(k);
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [tournamentId, errorMessage]);

  const linked = new Set(links.filter((l) => l.status !== "REJECTED").map((l) => l.leagueId));
  const options = leagues.filter((l) => !linked.has(l.id));

  async function submit() {
    if (!picked) return;
    setError(null);
    try {
      await api("POST", `/api/leagues/${picked}/tournaments`, { tournamentId });
      setPicked("");
      await loadLinks();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-3">
      {error && <Alert variant="destructive">{error}</Alert>}
      {links.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {links.map((l) => (
            <li key={l.leagueId} className="flex items-center gap-2">
              <Link href={`/leagues/${l.leagueId}`} className="hover:underline">{l.leagueName}</Link>
              <Badge variant={VARIANT[l.status]}>{t(`linkStatus.${l.status}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <NativeSelect aria-label={t("pickLeague")} value={picked} onChange={(e) => setPicked(e.target.value)} className="w-auto min-w-48 flex-1">
            <option value="">{t("pickLeague")}</option>
            {options.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </NativeSelect>
          <Button variant="outline" disabled={!picked} onClick={() => void submit()}>{t("submit")}</Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noActiveLeagues")}</p>
      )}
      <p className="text-xs text-muted-foreground">{t("submitHint")}</p>
    </div>
  );
}
