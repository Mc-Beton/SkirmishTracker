"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { InviteLink } from "@/components/table/invite-links";
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

  const observers = (allowed: boolean) => act(async () => {
    const res = await api<{ invite?: string }>("POST", `/api/tables/${view.id}/observers`, { allowed });
    setLinks((l) => ({ ...l, WATCH: res.invite ? inviteLink("WATCH", res.invite) : undefined }));
    onChanged();
  });

  return (
    <CollapsibleCard title={t("sharing")} defaultOpen={false}>
      <div className="grid gap-3 text-sm">
        {error && <Alert variant="destructive">{error}</Alert>}
        <p className="text-xs text-muted-foreground">{t("sharingHelp")}</p>
        {view.status === "WAITING" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void fresh("PLAYER")}><Link2 aria-hidden /> {t("newInvite.PLAYER")}</Button>
        )}
        {links.PLAYER && <InviteLink kind="PLAYER" link={links.PLAYER} />}
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
