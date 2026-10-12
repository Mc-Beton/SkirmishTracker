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

/** Opened from an invitation link: as the opponent (pick a list), the judge or an observer. */
export function JoinTable() {
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
        ? await api<{ id: string }>("POST", "/api/tables/join", { invite, listId })
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
              <option value="">{t("chooseList")}</option>
              {(lists ?? []).map((l) => <option key={l.id} value={l.id}>{listLabel(l)} · {l.totalPoints} pkt</option>)}
            </NativeSelect>
          )}
          <Button disabled={busy || !invite || (as === "PLAYER" && !listId)} onClick={() => void join()}>{t(`joinButton.${as}`)}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
