"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";
import { listLabel, type ArmyListSummary } from "@/lib/army-lists";
import type { TableInvitation } from "@/lib/table/api";
import { useGameContent } from "@/lib/content";

/**
 * Opened from an invitation link (as the opponent with a list, the judge or an observer) or from an invitation by
 * name (`?table=<id>`, linked from the notification): accept with a list or decline.
 */
export function JoinTable() {
  const params = useSearchParams();
  const tableId = params.get("table");
  return tableId ? <AnswerInvitation tableId={tableId} /> : <JoinByLink />;
}

function AnswerInvitation({ tableId }: { tableId: string }) {
  const t = useTranslations("table");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const content = useGameContent();
  const { me, loading } = useAuth();
  const [invitation, setInvitation] = useState<TableInvitation | null>(null);
  const [lists, setLists] = useState<ArmyListSummary[] | null>(null);
  const [listId, setListId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => {
    if (!me) return;
    api<TableInvitation>("GET", `/api/tables/${tableId}/invitation`).then(setInvitation).catch((e) => setError(errorMessage(e)));
    api<ArmyListSummary[]>("GET", "/api/army-lists").then(setLists).catch(() => setLists([]));
  }, [me, tableId, errorMessage]);

  const act = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (accept) {
        const { id } = await api<{ id: string }>("POST", `/api/tables/${tableId}/accept`, { listId: listId || null });
        router.replace(`/tables/${id}`);
        return;
      }
      await api("POST", `/api/tables/${tableId}/decline`);
      setDeclined(true);
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  };

  const quest = invitation?.questCode ? content?.quests.find((q) => q.code === invitation.questCode)?.name ?? invitation.questCode : null;
  return (
    <div className="mx-auto max-w-lg p-4">
      <Card>
        <CardHeader><CardTitle>{t("invitationTitle")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {error && <Alert variant="destructive">{error}</Alert>}
          {declined ? (
            <>
              <Alert>{t("invitationDeclined")}</Alert>
              <Button asChild variant="outline"><Link href="/tables">{t("title")}</Link></Button>
            </>
          ) : invitation && (
            <>
              <p>{t("invitationFrom", { name: invitation.from.name })}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">{t("map")}</dt><dd>{invitation.mode === "SANDBOX" ? t("freeGame") : invitation.mapName}</dd>
                <dt className="text-muted-foreground">{t("quest")}</dt><dd>{quest ?? t("noQuest")}</dd>
                <dt className="text-muted-foreground">{t("deploymentZones")}</dt><dd>{t(`deploymentKind.${invitation.deployment}`)}</dd>
                <dt className="text-muted-foreground">{t("measureMode")}</dt><dd>{t(`measure.${invitation.measureMode}`)}</dd>
              </dl>
              {lists && lists.length === 0 ? (
                <p className="text-muted-foreground">{t.rich("noLists", { link: (c) => <Link className="underline" href="/lists">{c}</Link> })}</p>
              ) : (
                <NativeSelect value={listId} onChange={(e) => setListId(e.target.value)} aria-label={t("chooseList")}>
                  <option value="">{invitation.mode === "SANDBOX" ? t("noListFreeGame") : t("chooseList")}</option>
                  {(lists ?? []).map((l) => <option key={l.id} value={l.id}>{listLabel(l)} · {l.totalPoints} pkt</option>)}
                </NativeSelect>
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || (!listId && invitation.mode !== "SANDBOX")} onClick={() => void act(true)}>{t("acceptInvitation")}</Button>
                <Button variant="outline" disabled={busy} onClick={() => void act(false)}>{t("declineInvitation")}</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function JoinByLink() {
  const t = useTranslations("table");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const params = useSearchParams();
  const invite = params.get("invite") ?? "";
  const as = params.get("as") === "judge" ? "JUDGE" : params.get("as") === "watch" ? "WATCH" : "PLAYER";
  const { me, loading } = useAuth();
  const [lists, setLists] = useState<ArmyListSummary[] | null>(null);
  const [listId, setListId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => {
    if (me) api<ArmyListSummary[]>("GET", "/api/army-lists").then(setLists).catch(() => setLists([]));
  }, [me]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = as === "PLAYER"
        ? await api<{ id: string }>("POST", "/api/tables/join", { invite, listId: listId || null })
        : await api<{ id: string }>("POST", as === "JUDGE" ? "/api/tables/judge" : "/api/tables/watch", { invite });
      router.replace(`/tables/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg p-4">
      <Card>
        <CardHeader><CardTitle>{t(`joinAs.${as}`)}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {error && <Alert variant="destructive">{error}</Alert>}
          {!invite && <Alert variant="destructive">{t("noInvite")}</Alert>}
          {as !== "PLAYER" ? (
            <p className="text-sm text-muted-foreground">{t(`joinAsHelp.${as}`)}</p>
          ) : lists && lists.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.rich("noLists", { link: (c) => <Link className="underline" href="/lists">{c}</Link> })}</p>
          ) : (
            <NativeSelect value={listId} onChange={(e) => setListId(e.target.value)} aria-label={t("step2List")}>
              <option value="">{t("noListFreeGame")}</option>
              {(lists ?? []).map((l) => <option key={l.id} value={l.id}>{listLabel(l)} · {l.totalPoints} pkt</option>)}
            </NativeSelect>
          )}
          <Button disabled={busy || !invite} onClick={() => void join()}>{t(`joinButton.${as}`)}</Button>
          {as === "PLAYER" && !listId && <p className="text-xs text-muted-foreground">{t("noListHelp")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
