"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, UserPlus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { InviteLink } from "@/components/table/invite-links";
import { PlayerSearch } from "@/components/table/player-search";
import type { SearchHit } from "@/lib/players";
import { api } from "@/lib/api";
import { inviteLink, type InviteKind, type TableView } from "@/lib/table/api";

/**
 * For the creator of the table: fresh links for the opponent (while the seat is free) and the judge
 * (until one joins), and observers on/off. Links are shown once – only their hashes are stored.
 */
export function TableSharing({ view, onChanged }: { view: TableView; onChanged: () => void }) {
  const t = useTranslations("table");
  const errorMessage = useErrorMessage();
  const [links, setLinks] = useState<Partial<Record<InviteKind, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<SearchHit | null>(null);
  /** The opponent's seat is free: a new table, or a free game still played alone. */
  const seatFree = view.status === "WAITING" || view.solo;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const fresh = (kind: InviteKind) => act(async () => {
    const { invite } = await api<{ invite: string }>("POST", `/api/tables/${view.id}/invites`, { kind });
    setLinks((l) => ({ ...l, [kind]: inviteLink(kind, invite) }));
  });

  const inviteUser = () => act(async () => {
    if (!player) return;
    await api("POST", `/api/tables/${view.id}/invite-user`, { userId: player.id });
    setPlayer(null);
    onChanged();
  });

  const cancelInvite = () => act(async () => {
    await api("DELETE", `/api/tables/${view.id}/invite-user`);
    onChanged();
  });

  const observers = (allowed: boolean) => act(async () => {
    const res = await api<{ invite?: string }>("POST", `/api/tables/${view.id}/observers`, { allowed });
    setLinks((l) => ({ ...l, WATCH: res.invite ? inviteLink("WATCH", res.invite) : undefined }));
    onChanged();
  });

  return (
    <CollapsibleCard title={t("sharing")} defaultOpen={seatFree}>
      <div className="grid gap-3 text-sm">
        {error && <Alert variant="destructive">{error}</Alert>}
        <p className="text-xs text-muted-foreground">{t("sharingHelp")}</p>
        {seatFree && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void fresh("PLAYER")}><Link2 aria-hidden /> {t("newInvite.PLAYER")}</Button>
        )}
        {links.PLAYER && <InviteLink kind="PLAYER" link={links.PLAYER} />}
        {seatFree && (
          <div className="grid gap-2 rounded-md border p-2">
            <span className="text-xs font-medium">{t("inviteByName")}</span>
            {view.invited && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span>{t("invitedPlayer", { name: view.invited.name })}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => void cancelInvite()}>{t("cancelInvitation")}</Button>
              </div>
            )}
            <PlayerSearch value={player} onChange={setPlayer} id="sharing-player" disabled={busy} />
            <Button size="sm" disabled={busy || !player} onClick={() => void inviteUser()}><UserPlus aria-hidden /> {t("sendInvitation")}</Button>
          </div>
        )}
        {view.judge ? (
          <p className="text-xs">{t("judgeIs", { name: view.judge.name })}</p>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void fresh("JUDGE")}><Link2 aria-hidden /> {t("newInvite.JUDGE")}</Button>
        )}
        {links.JUDGE && <InviteLink kind="JUDGE" link={links.JUDGE} />}
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={view.observersAllowed} disabled={busy}
            onChange={(e) => void observers(e.target.checked)} />
          <span>{t("observersAllowed")}<span className="block text-xs text-muted-foreground">{t("observersHelp")}</span></span>
        </label>
        {view.observersAllowed && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void fresh("WATCH")}><Link2 aria-hidden /> {t("newInvite.WATCH")}</Button>
        )}
        {links.WATCH && view.observersAllowed && <InviteLink kind="WATCH" link={links.WATCH} />}
      </div>
    </CollapsibleCard>
  );
}
